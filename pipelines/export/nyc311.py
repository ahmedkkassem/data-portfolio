"""Export the NYC 311 marts, test results, freshness and run log for the live ops page."""
import datetime as dt
import decimal
import json
import pathlib

import duckdb

con = duckdb.connect("dbt/warehouse.duckdb", read_only=True)


def rows(sql):
    rel = con.sql(sql)
    out = []
    for r in rel.fetchall():
        rec = {}
        for c, v in zip(rel.columns, r):
            if isinstance(v, (dt.date, dt.datetime)):
                v = v.isoformat()
            elif isinstance(v, decimal.Decimal):
                v = float(v)
            elif isinstance(v, float):
                v = round(v, 6)
            rec[c] = v
        out.append(rec)
    return out


results = json.loads(pathlib.Path("build/checks/run_results_nyc311.json").read_text())["results"]
tests = [{"name": r["unique_id"].split(".")[2], "status": r["status"], "failures": r.get("failures")}
         for r in results if r["unique_id"].startswith("test.")]
fresh_path = pathlib.Path("build/checks/nyc311_sources.json")
freshness = None
if fresh_path.exists():
    f = json.loads(fresh_path.read_text())["results"][0]
    freshness = {"status": f["status"], "max_loaded_at": f.get("max_loaded_at"), "snapshotted_at": f.get("snapshotted_at"),
                 "age_hours": round((f.get("max_loaded_at_time_ago_in_s") or 0) / 3600, 1)}

data = {
    "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    "source": {"name": "NYC 311 Service Requests", "url": "https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2010-to-Present/erm2-nwe9",
               "publisher": "NYC Open Data"},
    "bounds": rows("select * from nyc311_bounds")[0],
    "kpis": {r["period"]: r for r in rows("select * from mart_nyc311_kpis")},
    "daily": rows("select * from mart_nyc311_daily order by day"),
    "agencies": rows("select * from mart_nyc311_agencies limit 12"),
    "complaints": rows("select * from mart_nyc311_complaints limit 10"),
    "quality": rows("select * from mart_nyc311_quality")[0],
    "runs": rows("select * from 'data/state/nyc311_runs.parquet' order by run_at desc limit 20"),
    "tests": tests,
    "freshness": freshness,
}
pathlib.Path("build/site/data/ops.json").write_text(json.dumps(data, separators=(",", ":")))
print(f"exported ops.json: {len(data['daily'])} days, {len(tests)} tests, freshness={freshness and freshness['status']}")
