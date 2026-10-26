"""Export: read the retail marts and write the small JSON files the dashboard and email render from.
The browser never recomputes business logic; it only formats what the warehouse already decided."""
import datetime as dt
import json
import pathlib
import string

import duckdb

WAREHOUSE = "dbt/warehouse.duckdb"
OUT = pathlib.Path("build/site/data")


def nice(name: str) -> str:
    """'WHITE HANGING HEART T-LIGHT HOLDER' -> 'White Hanging Heart T-light Holder'."""
    return string.capwords(name.lower()) if name else name


def rows(con, sql):
    rel = con.sql(sql)
    cols = rel.columns
    out = []
    for r in rel.fetchall():
        rec = {}
        for c, v in zip(cols, r):
            if isinstance(v, (dt.date, dt.datetime)):
                v = v.isoformat()
            elif hasattr(v, "is_finite"):  # Decimal
                v = float(v)
            elif isinstance(v, float):
                v = round(v, 6)
            rec[c] = v
        out.append(rec)
    return out


def dbt_results() -> dict:
    path = pathlib.Path("dbt/target/run_results.json")
    if not path.exists():
        return {}
    res = json.loads(path.read_text())["results"]
    tests = [r for r in res if r["unique_id"].startswith("test.")]
    retail = [r for r in tests if "retail" in r["unique_id"]]
    return {
        "tests_total": len(retail),
        "tests_passed": sum(r["status"] == "pass" for r in retail),
        "tests": [{"name": r["unique_id"].split(".")[2], "status": r["status"]} for r in retail],
        "models_built": sum(r["unique_id"].startswith("model.") and "retail" in r["unique_id"] for r in res),
    }


def main() -> None:
    con = duckdb.connect(WAREHOUSE, read_only=True)
    OUT.mkdir(parents=True, exist_ok=True)

    periods = {}
    for r in rows(con, "select * from mart_retail_periods order by preset, period"):
        periods.setdefault(r["preset"], {})[r["period"]] = r

    countries = {}
    for preset in periods:
        top = rows(con, f"""
            select country, region, net_revenue, orders, customers
            from mart_retail_countries where preset = '{preset}' order by net_revenue desc""")
        countries[preset] = top

    products = {}
    for preset in periods:
        top = rows(con, f"""
            select cur.stock_code, cur.product_description as name, cur.net_revenue, cur.units, cur.orders,
                   coalesce(prev.net_revenue, 0) as prev_net_revenue
            from mart_retail_products cur
            left join mart_retail_products prev
              on prev.stock_code = cur.stock_code and prev.preset = cur.preset
             and prev.period = (case when cur.preset = '52w' then 'previous' else 'last_year' end)
            where cur.preset = '{preset}' and cur.period = 'current'
            order by cur.net_revenue desc limit 10""")
        for p in top:
            p["name"] = nice(p["name"])
        products[preset] = top

    manifest = json.loads(pathlib.Path("data/raw/retail/manifest.json").read_text())
    reconciliation = json.loads(pathlib.Path("build/checks/retail_reconciliation.json").read_text())
    bounds = con.sql("select min(order_date), max(order_date) from fct_retail_lines").fetchone()

    data = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": {"name": "UCI Online Retail II", "url": "https://archive.ics.uci.edu/dataset/502/online+retail+ii",
                   "license": "CC BY 4.0", **manifest},
        "data_first_day": bounds[0].isoformat(),
        "data_last_day": bounds[1].isoformat(),
        "periods": periods,
        "weekly": rows(con, "select * from mart_retail_weekly order by week_start"),
        "countries": countries,
        "products": products,
        "cohorts": rows(con, "select * from mart_retail_cohorts order by cohort_month, month_offset"),
        "rfm": rows(con, "select * from mart_retail_rfm order by segment_order"),
        "quality": rows(con, "select * from mart_retail_data_quality"),
        "dbt": dbt_results(),
        "reconciliation": reconciliation,
    }
    (OUT / "retail.json").write_text(json.dumps(data, separators=(",", ":")))

    week = {r["comparison"]: r for r in rows(con, "select * from mart_retail_report_week")}
    movers = rows(con, "select * from mart_retail_report_movers")
    for m in movers:
        if m["dimension"] == "product":
            m["label"] = nice(m["label"])
    report = {
        "generated_at": data["generated_at"],
        "weeks": week,
        "products": sorted([m for m in movers if m["dimension"] == "product"], key=lambda m: -m["this_week"])[:10],
        "product_gainers": sorted([m for m in movers if m["dimension"] == "product"], key=lambda m: -m["change"])[:5],
        "product_decliners": sorted([m for m in movers if m["dimension"] == "product"], key=lambda m: m["change"])[:5],
        "countries": sorted([m for m in movers if m["dimension"] == "country"], key=lambda m: -m["this_week"]),
        "days": sorted([m for m in movers if m["dimension"] == "day"], key=lambda m: m["key"]),
    }
    (OUT / "report_week.json").write_text(json.dumps(report, indent=1))
    print(f"exported retail.json ({(OUT / 'retail.json').stat().st_size // 1024} KB) and report_week.json")


if __name__ == "__main__":
    main()
