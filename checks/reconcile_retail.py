"""Independent reconciliation: re-implements the cleaning rules in pandas (no SQL, no dbt) straight from
the raw file, then demands that the warehouse marts agree to the penny. Two implementations, one answer.

Money is compared in integer thousandths of a pound (prices have up to 3 decimals), so there is no
floating-point tolerance anywhere: the numbers either match exactly or the build fails.
"""
import json
import pathlib
import sys

import duckdb
import pandas as pd

RAW = "data/raw/retail/online_retail_ii.parquet"
WAREHOUSE = "dbt/warehouse.duckdb"
OUT = pathlib.Path("build/checks/retail_reconciliation.json")
NON_PRODUCT = {"POST", "DOT", "C2", "C3", "M", "ADJUST", "ADJUST2", "B", "PADS", "D", "S", "BANK CHARGES",
               "AMAZONFEE", "CRUK", "TEST001", "TEST002", "GIFT"}


def clean_lines() -> pd.DataFrame:
    df = pd.read_parquet(RAW)
    df["invoice"] = df["invoice"].str.strip()
    df["code_raw"] = df["stock_code"].str.strip()
    df["code"] = df["code_raw"].str.upper()
    df["desc"] = df["description"].str.strip().replace("", pd.NA).fillna("")
    df["country"] = df["country"].str.strip()
    df["price_m"] = (df["price"] * 1000).round().astype("int64")
    df["amount_m"] = df["price_m"] * df["quantity"]
    df["cust"] = df["customer_id"].fillna(-1).astype("int64")

    second_start = df.loc[df["source_sheet"] == "Year 2010-2011", "invoice_date"].min()
    overlap = (df["source_sheet"] == "Year 2009-2010") & (df["invoice_date"] >= second_start)
    df = df[~overlap].sort_values(["source_sheet", "source_row"])
    key = ["invoice", "code_raw", "desc", "quantity", "invoice_date", "price_m", "cust", "country"]
    df = df[~df.duplicated(subset=key, keep="first")]

    is_return = df["invoice"].str.startswith("C")
    keep = (
        ~df["code"].isin(NON_PRODUCT)
        & ~df["code"].str.startswith("GIFT_")
        & (df["price_m"] > 0)
        & (df["quantity"] != 0)
        & ~(is_return & (df["quantity"] > 0))
        & ~(~is_return & (df["quantity"] < 0))
    )
    out = df[keep].copy()
    out["kind"] = out["invoice"].str.startswith("C").map({True: "return", False: "sale"})
    out["day"] = out["invoice_date"].dt.normalize()
    return out


def window_metrics(lines: pd.DataFrame, start, end) -> dict:
    w = lines[(lines["day"] >= pd.Timestamp(start)) & (lines["day"] <= pd.Timestamp(end))]
    sales, returns = w[w["kind"] == "sale"], w[w["kind"] == "return"]
    return {
        "gross_sales_m": int(sales["amount_m"].sum()),
        "returns_m": int(-returns["amount_m"].sum()),
        "orders": int(sales["invoice"].nunique()),
        "active_customers": int(sales.loc[sales["cust"] >= 0, "cust"].nunique()),
        "units": int(sales["quantity"].sum()),
    }


def main() -> int:
    lines = clean_lines()
    con = duckdb.connect(WAREHOUSE, read_only=True)
    checks = []

    def compare(name, ours, theirs):
        checks.append({"check": name, "independent": ours, "warehouse": theirs, "match": ours == theirs})

    totals = con.sql("""
        select cast(round(sum(line_amount) * 1000) as bigint) as net_m, count(*) as n from fct_retail_lines
    """).fetchone()
    compare("Clean lines: row count", int(len(lines)), int(totals[1]))
    compare("Clean lines: net revenue (thousandths of £)", int(lines["amount_m"].sum()), int(totals[0]))

    periods = con.sql("""
        select preset, period, start_date, end_date,
               cast(round(gross_sales * 1000) as bigint) as gross_sales_m,
               cast(round(returns * 1000) as bigint) as returns_m,
               orders, active_customers, units
        from mart_retail_periods order by preset, period
    """).df()
    for row in periods.itertuples():
        ours = window_metrics(lines, row.start_date, row.end_date)
        for metric in ["gross_sales_m", "returns_m", "orders", "active_customers", "units"]:
            compare(f"{row.preset} {row.period}: {metric}", ours[metric], int(getattr(row, metric)))

    weekly = con.sql("select week_start, cast(round(net_revenue*1000) as bigint) net_m from mart_retail_weekly").df()
    lines["week"] = lines["day"] - pd.to_timedelta(lines["day"].dt.weekday, unit="D")
    ours_weekly = lines.groupby("week")["amount_m"].sum()
    mismatched = sum(int(ours_weekly.get(pd.Timestamp(r.week_start), 0)) != int(r.net_m) for r in weekly.itertuples())
    compare("Weekly net revenue: weeks that differ", 0, mismatched)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"checks": checks, "all_match": all(c["match"] for c in checks)}, indent=2, default=str))
    failed = [c for c in checks if not c["match"]]
    for c in checks:
        print(("PASS " if c["match"] else "FAIL ") + f"{c['check']}: {c['independent']} vs {c['warehouse']}")
    print(f"{len(checks) - len(failed)}/{len(checks)} reconciliation checks match")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
