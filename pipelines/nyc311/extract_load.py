"""Extract + load NYC 311 service requests incrementally from the NYC Open Data API (Socrata).

- First run (no saved state): backfills the last WINDOW_DAYS days of requests.
- Every later run: fetches only rows changed since the last high-water mark (:updated_at), so requests
  that get closed days after they were opened are updated, not missed. Rows are upserted by unique_key.
- The state (one Parquet file + a run log) lives between runs as a GitHub Release asset, restored and
  saved by the workflow, so the pipeline is stateful without a database server.
"""
import datetime as dt
import json
import pathlib
import time
import urllib.parse
import urllib.request

import duckdb

API = "https://data.cityofnewyork.us/resource/erm2-nwe9.json"
STATE = pathlib.Path("data/state")
REQUESTS = STATE / "nyc311_requests.parquet"
RUNS = STATE / "nyc311_runs.parquet"
WINDOW_DAYS = 90
PAGE = 50_000
FIELDS = ["unique_key", "created_date", "closed_date", "agency", "complaint_type", "borough", "status"]


def fetch(where: str) -> list[dict]:
    rows, offset = [], 0
    while True:
        params = {"$select": ":updated_at," + ",".join(FIELDS), "$where": where, "$order": ":id",
                  "$limit": PAGE, "$offset": offset}
        url = f"{API}?{urllib.parse.urlencode(params)}"
        for attempt in range(5):
            try:
                with urllib.request.urlopen(url, timeout=120) as resp:
                    page = json.loads(resp.read())
                break
            except Exception as exc:  # network hiccup or throttling: back off and retry
                if attempt == 4:
                    raise
                print(f"retry {attempt + 1} after {exc}")
                time.sleep(10 * (attempt + 1))
        rows.extend(page)
        print(f"  fetched {len(rows):,}")
        if len(page) < PAGE:
            return rows
        offset += PAGE


def main() -> None:
    started = time.time()
    run_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    window_start = (run_at - dt.timedelta(days=WINDOW_DAYS)).date()
    STATE.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute("""create table requests (unique_key varchar primary key, created_date timestamp,
        closed_date timestamp, agency varchar, complaint_type varchar, borough varchar, status varchar,
        source_updated_at timestamptz)""")

    if REQUESTS.exists():
        con.execute(f"insert into requests select * from '{REQUESTS}'")
        watermark = con.sql("select max(source_updated_at) from requests").fetchone()[0]
        since = (watermark - dt.timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S")
        mode, where = "incremental", f":updated_at > '{since}' AND created_date >= '{window_start}T00:00:00'"
    else:
        mode, where = "backfill", f"created_date >= '{window_start}T00:00:00'"
    print(f"{mode}: {where}")

    before = {k for (k,) in con.sql("select unique_key from requests").fetchall()}
    rows = fetch(where)
    if rows:
        tmp = STATE / "_batch.json"
        tmp.write_text("\n".join(json.dumps({
            "unique_key": r.get("unique_key"), "created_date": r.get("created_date"), "closed_date": r.get("closed_date"),
            "agency": r.get("agency"), "complaint_type": r.get("complaint_type"), "borough": r.get("borough"),
            "status": r.get("status"), "source_updated_at": r.get(":updated_at")}) for r in rows))
        con.execute(f"""insert or replace into requests
            select unique_key, cast(created_date as timestamp), cast(closed_date as timestamp), agency,
                   complaint_type, borough, status, cast(source_updated_at as timestamptz)
            from read_json('{tmp}', format='newline_delimited', columns={{
                unique_key: 'varchar', created_date: 'varchar', closed_date: 'varchar', agency: 'varchar',
                complaint_type: 'varchar', borough: 'varchar', status: 'varchar', source_updated_at: 'varchar'}})
            where unique_key is not null""")
        tmp.unlink()
    fetched_keys = {r["unique_key"] for r in rows if r.get("unique_key")}
    con.execute(f"delete from requests where created_date < timestamp '{window_start} 00:00:00'")
    total = con.sql("select count(*) from requests").fetchone()[0]
    con.execute(f"copy requests to '{REQUESTS}' (format parquet)")

    run = {
        "run_at": run_at.isoformat(), "mode": mode, "rows_fetched": len(rows),
        "rows_new": len(fetched_keys - before), "rows_updated": len(fetched_keys & before),
        "rows_in_window": total, "window_start": str(window_start),
        "max_created": str(con.sql("select max(created_date) from requests").fetchone()[0]),
        "max_source_updated": str(con.sql("select max(source_updated_at) from requests").fetchone()[0]),
        "duration_s": round(time.time() - started, 1),
    }
    runs = duckdb.connect()
    runs.execute("create table runs (run_at varchar, mode varchar, rows_fetched bigint, rows_new bigint, rows_updated bigint,"
                 " rows_in_window bigint, window_start varchar, max_created varchar, max_source_updated varchar, duration_s double)")
    if RUNS.exists():
        runs.execute(f"insert into runs select * from '{RUNS}'")
    runs.execute("insert into runs values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", list(run.values()))
    runs.execute(f"copy runs to '{RUNS}' (format parquet)")
    print(json.dumps(run, indent=1))


if __name__ == "__main__":
    main()
