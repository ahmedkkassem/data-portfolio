"""Export the spreadsheet-rescue reconciliation for the web page."""
import json
import pathlib

import duckdb

con = duckdb.connect("dbt/warehouse.duckdb", read_only=True)
rows = [dict(zip(["region", "source_lines", "rebuilt_lines", "source_net_revenue", "rebuilt_net_revenue", "matches"], r))
        for r in con.sql("select region, source_lines, rebuilt_lines, source_net_revenue, rebuilt_net_revenue, matches "
                         "from mart_sheets_reconciliation").fetchall()]
for r in rows:
    r["source_net_revenue"] = float(r["source_net_revenue"])
    r["rebuilt_net_revenue"] = float(r["rebuilt_net_revenue"])
results = json.loads(pathlib.Path("build/checks/run_results_sheets.json").read_text())["results"]
tests = [r for r in results if r["unique_id"].startswith("test.")]
exact = next(r for r in tests if "assert_sheets_rebuild_is_exact" in r["unique_id"])
out = {
    "rows": rows,
    "tests_total": len(tests),
    "tests_passed": sum(r["status"] == "pass" for r in tests),
    "mismatched_lines": int(exact.get("failures") or 0),
    "exact": exact["status"] == "pass" and all(r["matches"] for r in rows),
}
pathlib.Path("build/site/data/spreadsheets_recon.json").write_text(json.dumps(out, indent=1))
print(out)
