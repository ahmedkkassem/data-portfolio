"""The simulated live shop: the real UCI Online Retail II orders, replayed on a loop so that every
morning yesterday's orders "arrive". The output is the shop's order-line export up to the end of
yesterday, the file a client's store would hand the pipeline.

The loop: the 104 source weeks from Mon 7 Dec 2009 to Sun 4 Dec 2011 repeat every 728 days (whole weeks,
so weekdays are kept; the season drifts 2 days a loop). Mon 26 Oct 2026 receives Mon 24 Oct 2011's orders,
so the shop's history starts on Mon 9 Dec 2024 and year-on-year comparisons work from day one. In each new
loop the order and customer numbers get a loop prefix, so customers are new again and nothing collides.

Lines come from the independent cleaning rules in checks/reconcile_retail.py: product sales and product
returns only, at their real prices.

    python pipelines/shop/replay.py                  # export up to the end of yesterday (UTC)
    python pipelines/shop/replay.py --until 2026-11-30
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

SOURCE_FIRST = pd.Timestamp("2009-12-07")  # a Monday
LOOP_DAYS = 728                            # 104 weeks
SHOP_FIRST = pd.Timestamp("2024-12-09")    # a Monday: the shop's first day
OUT = pathlib.Path("data/shop")


def nice(name: str) -> str:
    return string.capwords(name.lower()) if name else name


def source_lines() -> pd.DataFrame:
    """One loop of clean source lines, with the product title the catalogue uses."""
    lines = clean_lines()
    lines = lines[(lines["invoice_date"] >= SOURCE_FIRST) & (lines["invoice_date"] < SOURCE_FIRST + pd.Timedelta(days=LOOP_DAYS))]
    named = lines[lines["desc"] != ""].assign(desc_u=lambda d: d["desc"].str.upper())
    spell = (named.groupby(["code", "desc_u"]).agg(uses=("desc_u", "size"), last=("invoice_date", "max")).reset_index()
             .sort_values(["code", "uses", "last", "desc_u"], ascending=[True, False, False, True]).drop_duplicates("code"))
    titles = dict(zip(spell["code"], spell["desc_u"].map(nice)))
    lines["title"] = lines["code"].map(titles).fillna("Product " + lines["code"])
    return lines


def export(until: dt.date) -> pd.DataFrame:
    """Every shop order line from the shop's first day to the end of `until`."""
    src = source_lines()
    end = pd.Timestamp(until) + pd.Timedelta(days=1)
    loops = range(0, (end - SHOP_FIRST).days // LOOP_DAYS + 1)
    parts = []
    for k in loops:
        p = src.copy()
        p["ordered_at"] = p["invoice_date"] - SOURCE_FIRST + SHOP_FIRST + pd.Timedelta(days=k * LOOP_DAYS)
        p = p[p["ordered_at"] < end]
        p["order_id"] = (f"{k}-" if k else "") + p["invoice"]
        p["customer_id"] = p["cust"].where(p["cust"] < 0, p["cust"] + k * 100_000)
        parts.append(p)
    lines = pd.concat(parts, ignore_index=True)
    # a store keeps clean country names (the source writes EIRE, RSA, USA...)
    names = pd.read_csv("dbt/seeds/retail_country_names.csv")
    lines["country"] = lines["country"].map(dict(zip(names.source_country, names.country))).fillna(lines["country"])
    out = pd.DataFrame({
        "order_id": lines["order_id"],
        "order_type": lines["kind"],
        "ordered_at": lines["ordered_at"],
        "sku": lines["code"],
        "product_title": lines["title"],
        "quantity": lines["quantity"].astype("int64"),
        "unit_price": lines["price_m"] / 1000,
        "line_total": lines["amount_m"] / 1000,
        "customer_id": lines["customer_id"].where(lines["customer_id"] >= 0).astype("Int64"),
        "country": lines["country"],
    }).sort_values(["ordered_at", "order_id", "sku"], kind="stable").reset_index(drop=True)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--until", default=(dt.datetime.now(dt.timezone.utc).date() - dt.timedelta(days=1)).isoformat())
    until = dt.date.fromisoformat(ap.parse_args().until)
    lines = export(until)
    OUT.mkdir(parents=True, exist_ok=True)
    lines.to_parquet(OUT / "order_lines.parquet", index=False)
    last_day = lines[lines["ordered_at"].dt.date == until]
    manifest = {
        "exported_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "through": until.isoformat(), "first_day": str(lines["ordered_at"].min().date()),
        "lines": len(lines), "orders": int(lines["order_id"].nunique()),
        "net_total": round(float(lines["line_total"].sum()), 2),
        "last_day": {"orders": int(last_day["order_id"].nunique()), "lines": len(last_day),
                     "net": round(float(last_day["line_total"].sum()), 2)},
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print(json.dumps(manifest, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
