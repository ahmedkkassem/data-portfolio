"""Weekly facts for the live shop's Monday email, read from the shop marts on DuckDB (CI) or BigQuery (the
demo), in the same shape as the static demo's report_week.json, so the same prompt and number guard apply.

The report week is the latest complete Monday-to-Sunday week. Also writes the daily anomaly check:
yesterday against the median of the same weekday over the previous eight weeks.

    python pipelines/shop/facts.py duckdb|bigquery OUT_DIR
"""
import datetime as dt
import decimal
import json
import os
import pathlib
import statistics
import sys

ENGINE, OUT = sys.argv[1], pathlib.Path(sys.argv[2])


def query(sql: str) -> list[dict]:
    if ENGINE == "bigquery":
        from google.cloud import bigquery
        client = bigquery.Client(project=os.environ["BQ_PROJECT"])
        rows = [dict(r) for r in client.query(sql.replace("{s}", f"`{os.environ['BQ_PROJECT']}.shop`")).result()]
    else:
        import duckdb
        rel = duckdb.connect("dbt/warehouse.duckdb", read_only=True).sql(sql.replace("{s}", "main"))
        rows = [dict(zip(rel.columns, r)) for r in rel.fetchall()]
    clean = lambda v: float(v) if isinstance(v, decimal.Decimal) else v.isoformat() if isinstance(v, (dt.date, dt.datetime)) else v
    return [{k: clean(v) for k, v in r.items()} for r in rows]


def r2(v):
    return None if v is None else round(v, 2)


def movers(rows: list[dict], key: str, label: str, this: str, last: str, dim: str) -> list[dict]:
    by = {}
    for r in rows:
        m = by.setdefault(r[key], {"dimension": dim, "key": r[key], "label": r[label], "this_week": 0.0, "last_week": 0.0})
        m["this_week" if r["week_start"] == this else "last_week"] += r["net_revenue"]
    for m in by.values():
        m["this_week"], m["last_week"] = r2(m["this_week"]), r2(m["last_week"])
        m["change"] = r2(m["this_week"] - m["last_week"])
    return list(by.values())


def main() -> int:
    weeks = query("select * from {s}.mart_shop_weekly order by week_start")
    complete = [w for w in weeks if w["is_complete_week"]]
    tw = complete[-1]
    by_start = {w["week_start"]: w for w in weeks}
    shift = lambda d, n: (dt.date.fromisoformat(d) + dt.timedelta(days=n)).isoformat()
    picked = {"this_week": tw, "last_week": by_start[shift(tw["week_start"], -7)],
              "same_week_last_year": by_start.get(shift(tw["week_start"], -364))}
    out_weeks = {}
    for name, w in picked.items():
        if w is None:
            continue
        keep = {k: w[k] for k in ["week_start", "week_end", "is_complete_week", "gross_sales", "returns", "net_revenue", "orders",
                                  "units", "active_customers", "new_customers", "sales_new_customers",
                                  "sales_returning_customers", "sales_guest", "avg_order_value", "return_rate"]}
        for k in ["gross_sales", "returns", "net_revenue", "sales_new_customers", "sales_returning_customers", "sales_guest"]:
            keep[k] = r2(keep[k])
        out_weeks[name] = {"comparison": name, **keep}

    this, last = tw["week_start"], shift(tw["week_start"], -7)
    # dates come back as ISO strings from query(), on both engines
    prods = movers(query(f"""select week_start, sku, product_title, net_revenue from {{s}}.mart_shop_products_weekly
                             where week_start in ('{this}', '{last}')"""), "sku", "product_title", this, last, "product")
    ctry = movers(query(f"""select week_start, country, net_revenue from {{s}}.mart_shop_countries_weekly
                            where week_start in ('{this}', '{last}')"""), "country", "country", this, last, "country")
    days = query(f"select day, net_revenue, orders from {{s}}.mart_shop_daily where day between '{this}' and '{tw['week_end']}' order by day")
    facts = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "shop": "Simulated live shop: a real UK gift shop's orders, replayed on a two-year loop",
        "weeks": out_weeks,
        "products": sorted(prods, key=lambda m: -m["this_week"])[:10],
        "product_gainers": sorted(prods, key=lambda m: -m["change"])[:5],
        "product_decliners": sorted(prods, key=lambda m: m["change"])[:5],
        "countries": sorted(ctry, key=lambda m: -m["this_week"])[:10],
        "days": [{"dimension": "day", "key": d["day"], "label": dt.date.fromisoformat(d["day"]).strftime("%A"),
                  "this_week": r2(d["net_revenue"]), "last_week": None, "change": None} for d in days],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "shop_week.json").write_text(json.dumps(facts, indent=1, default=str))

    # anomaly check: the latest day against the same weekday in the previous eight weeks
    daily = query("select day, orders, net_revenue from {s}.mart_shop_daily order by day")
    last_day = daily[-1]
    same = [d for d in daily[-57:-1] if dt.date.fromisoformat(d["day"]).weekday() == dt.date.fromisoformat(last_day["day"]).weekday()]
    checks = []
    for metric in ["orders", "net_revenue"]:
        usual = statistics.median(d[metric] for d in same) if same else 0
        ratio = last_day[metric] / usual if usual else None
        checks.append({"metric": metric, "value": r2(last_day[metric]), "usual": r2(usual), "ratio": r2(ratio),
                       "alert": ratio is not None and (ratio < 0.5 or ratio > 1.8)})
    anomaly = {"day": last_day["day"], "weekday": dt.date.fromisoformat(last_day["day"]).strftime("%A"),
               "compared_with": [d["day"] for d in same], "checks": checks, "alert": any(c["alert"] for c in checks)}
    (OUT / "shop_anomaly.json").write_text(json.dumps(anomaly, indent=1))
    print(f"report week {this} to {tw['week_end']}: net £{out_weeks['this_week']['net_revenue']:,}, "
          f"{out_weeks['this_week']['orders']} orders; last year present: {'same_week_last_year' in out_weeks}")
    print(f"anomaly check {anomaly['day']} ({anomaly['weekday']}): {json.dumps(checks)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
