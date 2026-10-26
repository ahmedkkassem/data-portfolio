"""Replay plan for the demo Shopify store: the real UCI Online Retail II orders, moved forward exactly
835 weeks (5,845 days), so each order lands on the same weekday and the Christmas peak lines up
(Mon 25 Oct 2010 -> Mon 26 Oct 2026).

The plan reuses the independent cleaning rules from checks/reconcile_retail.py, so the store receives
only clean product lines: one Shopify order per invoice, at the invoice's real line prices, with the
anonymous customer number and the original invoice number as tags. Returns (C invoices) become refunds
against the customer's latest earlier order that holds the same product; a return with no such order
cannot be represented in Shopify and is counted, not hidden.

    python pipelines/shop/replay.py --dry-run            # stats + a sample of today's orders
    python pipelines/shop/replay.py --dry-run --day 2026-11-28
"""
import argparse
import datetime as dt
import json
import pathlib
import string
import sys

import pandas as pd

sys.path.insert(0, "checks")
from reconcile_retail import clean_lines  # noqa: E402

SHIFT = pd.Timedelta(days=5845)  # 835 weeks: weekdays are kept
OUT = pathlib.Path("build/shop")


def nice(name: str) -> str:
    return string.capwords(name.lower()) if name else name


def plan() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Products, sale lines and return lines, with store dates already shifted."""
    lines = clean_lines()
    lines["store_at"] = lines["invoice_date"] + SHIFT

    # product catalogue: the most used spelling (ties: the most recent), the most used price as list price
    named = lines[lines["desc"] != ""].assign(desc_u=lambda d: d["desc"].str.upper())
    spell = (named.groupby(["code", "desc_u"]).agg(uses=("desc_u", "size"), last=("invoice_date", "max"))
             .reset_index().sort_values(["code", "uses", "last", "desc_u"], ascending=[True, False, False, True])
             .drop_duplicates("code"))
    price = (lines[lines["kind"] == "sale"].groupby(["code", "price_m"]).size().reset_index(name="n")
             .sort_values(["code", "n", "price_m"], ascending=[True, False, False]).drop_duplicates("code"))
    products = pd.DataFrame({"sku": sorted(lines["code"].unique())})
    products = products.merge(spell[["code", "desc_u"]], left_on="sku", right_on="code", how="left").drop(columns="code")
    products = products.merge(price[["code", "price_m"]], left_on="sku", right_on="code", how="left").drop(columns="code")
    products["title"] = products["desc_u"].fillna("").map(nice).where(products["desc_u"].notna(), "Product " + products["sku"])
    products["price"] = (products["price_m"].fillna(0) / 1000).round(2)
    products = products[["sku", "title", "price"]]

    cols = ["invoice", "store_at", "invoice_date", "code", "quantity", "price_m", "amount_m", "cust", "country"]
    sales = lines.loc[lines["kind"] == "sale", cols].copy()
    returns = lines.loc[lines["kind"] == "return", cols].copy()
    return products, sales, returns


def match_returns(sales: pd.DataFrame, returns: pd.DataFrame) -> pd.DataFrame:
    """For each return line, the invoice of the customer's latest earlier order holding that product."""
    known = sales[sales["cust"] >= 0][["cust", "code", "invoice", "invoice_date"]].sort_values("invoice_date")
    r = returns.sort_values("invoice_date").copy()
    r["row"] = range(len(r))
    m = pd.merge_asof(r[r["cust"] >= 0], known.rename(columns={"invoice": "refund_of", "invoice_date": "sold_at"}),
                      left_on="invoice_date", right_on="sold_at", by=["cust", "code"], direction="backward",
                      allow_exact_matches=False)
    r = r.merge(m[["row", "refund_of", "sold_at"]], on="row", how="left").drop(columns="row")
    return r


def orders_for(sales: pd.DataFrame, day: dt.date) -> list[dict]:
    d = sales[sales["store_at"].dt.date == day]
    out = []
    for inv, g in d.groupby("invoice", sort=False):
        first = g.iloc[0]
        out.append({
            "invoice": inv,
            "processed_at": first["store_at"].strftime("%Y-%m-%dT%H:%M:%S") + "Z",
            "customer": None if first["cust"] < 0 else int(first["cust"]),
            "country": first["country"],
            "lines": [{"sku": r.code, "quantity": int(r.quantity), "price": round(r.price_m / 1000, 3)} for r in g.itertuples()],
            "total": round(int(g["amount_m"].sum()) / 1000, 2),
        })
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--day", default=dt.date.today().isoformat())
    args = ap.parse_args()
    day = dt.date.fromisoformat(args.day)

    products, sales, returns = plan()
    r = match_returns(sales, returns)
    per_order = sales.groupby("invoice").agg(day=("store_at", lambda s: s.iloc[0].date()), lines=("code", "size"))
    per_day = per_order.groupby("day").size()
    OUT.mkdir(parents=True, exist_ok=True)

    stats = {
        "shift_days": SHIFT.days,
        "source_first_day": str(sales["invoice_date"].min().date()), "source_last_day": str(sales["invoice_date"].max().date()),
        "store_first_day": str(sales["store_at"].min().date()), "store_last_day": str(sales["store_at"].max().date()),
        "products": len(products), "products_without_name": int((products["title"].str.startswith("Product ")).sum()),
        "products_price_zero": int((products["price"] <= 0).sum()),
        "orders": int(per_order.shape[0]), "sale_lines": int(len(sales)),
        "orders_per_trading_day": {"mean": round(float(per_day.mean()), 1), "p95": int(per_day.quantile(0.95)), "max": int(per_day.max())},
        "lines_per_order": {"median": int(per_order["lines"].median()), "p99": int(per_order["lines"].quantile(0.99)),
                            "max": int(per_order["lines"].max()), "orders_over_250_lines": int((per_order["lines"] > 250).sum())},
        "minutes_at_5_orders_per_min": {"mean_day": round(float(per_day.mean()) / 5), "max_day": round(int(per_day.max()) / 5)},
        "return_lines": int(len(r)), "return_lines_matched_to_an_order": int(r["refund_of"].notna().sum()),
        "return_lines_guest": int((r["cust"] < 0).sum()),
        "return_value_unmatched_gbp": round(-int(r.loc[r["refund_of"].isna(), "amount_m"].sum()) / 1000, 2),
        "guest_orders": int(sales.groupby("invoice")["cust"].first().lt(0).sum()),
        "store_days_from_today": {
            "orders_from_" + str(day): int(per_day.get(day, 0)),
            "backfill_13_weeks_orders": int(per_day[(per_day.index >= day - dt.timedelta(weeks=13)) & (per_day.index < day)].sum()),
            "backfill_52_weeks_orders": int(per_day[(per_day.index >= day - dt.timedelta(weeks=52)) & (per_day.index < day)].sum()),
            "orders_left_after_today": int(per_day[per_day.index > day].sum()),
        },
    }
    print(json.dumps(stats, indent=1))
    sample = orders_for(sales, day)
    (OUT / "plan_stats.json").write_text(json.dumps(stats, indent=1))
    (OUT / f"orders_{day}.json").write_text(json.dumps(sample, indent=1))
    products.head(50).to_json(OUT / "products_sample.json", orient="records", indent=1)
    print(f"{len(sample)} orders planned for {day}; first: {json.dumps(sample[0])[:400] if sample else 'none'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
