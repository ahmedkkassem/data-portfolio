"""Extract + load NYC 311 service requests incrementally from the NYC Open Data API (Socrata).

- First run (no saved state): backfills the last WINDOW_DAYS days of requests.
- Every later run: fetches only rows changed since the last high-water mark (:updated_at), with a one-hour
  overlap so a batch still being written at the source is not missed. Rows are upserted by unique_key, and
  the run log counts what really changed: requests not seen before, and known requests whose source row
  is newer than the stored one. Re-reading the overlap changes nothing and is counted as nothing.
- The state (one Parquet file + a run log) lives between runs as a GitHub Release asset, restored and
  saved by the workflow, so the pipeline is stateful without a database server.
"""
import datetime as dt
import json
import os
import pathlib
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import duckdb

API = "https://data.cityofnewyork.us/resource/erm2-nwe9.json"
STATE = pathlib.Path("data/state")
REQUESTS = STATE / "nyc311_requests.parquet"
RUNS = STATE / "nyc311_runs.parquet"
WINDOW_DAYS = 90
PAGE = 50_000
FIELDS = ["unique_key", "created_date", "closed_date", "agency", "complaint_type", "borough", "status"]
TRIGGERS = {"schedule": "daily schedule", "push": "code change", "workflow_dispatch": "manual"}


def fetch_page(where: str, offset: int) -> list[dict]:
    params = {"$select": ":updated_at," + ",".join(FIELDS), "$where": where, "$order": ":id",
              "$limit": PAGE, "$offset": offset}
    url = f"{API}?{urllib.parse.urlencode(params)}"
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=90) as resp:
                return json.loads(resp.read())
        except Exception as exc:  # network hiccup or throttling: back off and retry
            if attempt == 4:
                raise
            print(f"retry {attempt + 1} after {exc}")
            time.sleep(10 * (attempt + 1))
    return []


def fetch_day(where: str, day: dt.date) -> list[dict]:
    nxt = day + dt.timedelta(days=1)
    day_where = f"({where}) AND created_date >= '{day}T00:00:00' AND created_date < '{nxt}T00:00:00'"
    rows, offset = [], 0
    while True:
        page = fetch_page(day_where, offset)
        rows.extend(page)
        if len(page) < PAGE:
            print(f"  {day}: {len(rows):,} rows", flush=True)
            return rows
        offset += PAGE


def fetch(where: str, window_start: dt.date, window_end: dt.date) -> list[dict]:
    """One small query per created day (about 10K rows each), six at a time, instead of deep offset
    paging, which the API serves slowly on large result sets."""
    days = [window_start + dt.timedelta(days=i) for i in range((window_end - window_start).days + 1)]
    with ThreadPoolExecutor(max_workers=6) as pool:
        per_day = list(pool.map(lambda d: fetch_day(where, d), days))
    rows = [r for day_rows in per_day for r in day_rows]
    print(f"  fetched {len(rows):,} rows over {len(days)} days")
    return rows


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
        mode, where = "incremental", f":updated_at > '{since}'"
    else:
        mode, where = "backfill", "created_date IS NOT NULL"
    print(f"{mode}: {where}")

    rows = fetch(where, window_start, run_at.date())
    rows_new = rows_changed = 0
    if rows:
        tmp = STATE / "_batch.json"
        tmp.write_text("\n".join(json.dumps({
            "unique_key": r.get("unique_key"), "created_date": r.get("created_date"), "closed_date": r.get("closed_date"),
            "agency": r.get("agency"), "complaint_type": r.get("complaint_type"), "borough": r.get("borough"),
            "status": r.get("status"), "source_updated_at": r.get(":updated_at")}) for r in rows))
        con.execute(f"""create temp table batch as
            select unique_key, cast(created_date as timestamp) as created_date, cast(closed_date as timestamp) as closed_date,
                   agency, complaint_type, borough, status, cast(source_updated_at as timestamptz) as source_updated_at
            from read_json('{tmp}', format='newline_delimited', columns={{
                unique_key: 'varchar', created_date: 'varchar', closed_date: 'varchar', agency: 'varchar',
                complaint_type: 'varchar', borough: 'varchar', status: 'varchar', source_updated_at: 'varchar'}})
            where unique_key is not null
            qualify row_number() over (partition by unique_key order by source_updated_at desc) = 1""")
        tmp.unlink()
        rows_new = con.sql("select count(*) from batch anti join requests using (unique_key)").fetchone()[0]
        rows_changed = con.sql("""select count(*) from batch b join requests r using (unique_key)
            where b.source_updated_at > r.source_updated_at""").fetchone()[0]
        con.execute("insert or replace into requests select * from batch")
    con.execute(f"delete from requests where created_date < timestamp '{window_start} 00:00:00'")
    total = con.sql("select count(*) from requests").fetchone()[0]
    con.execute(f"copy requests to '{REQUESTS}' (format parquet)")

    run = {
        "run_at": run_at.isoformat(), "mode": mode, "rows_fetched": len(rows),
        "rows_new": rows_new, "rows_updated": rows_changed,
        "rows_in_window": total, "window_start": str(window_start),
        "max_created": str(con.sql("select max(created_date) from requests").fetchone()[0]),
        "max_source_updated": str(con.sql("select max(source_updated_at) from requests").fetchone()[0]),
        "duration_s": round(time.time() - started, 1),
        "trigger": TRIGGERS.get(os.environ.get("GITHUB_EVENT_NAME", ""), "manual"),
    }
    runs = duckdb.connect()
    runs.execute("create table runs (run_at varchar, mode varchar, rows_fetched bigint, rows_new bigint, rows_updated bigint,"
                 " rows_in_window bigint, window_start varchar, max_created varchar, max_source_updated varchar, duration_s double,"
                 " trigger varchar)")
    if RUNS.exists():
        cols = [c for (c,) in runs.sql(f"select column_name from (describe select * from '{RUNS}')").fetchall()]
        if "trigger" in cols:
            runs.execute(f"insert into runs select * from '{RUNS}'")
        else:
            # logs written before triggers were recorded: all came from code changes, and they counted every
            # re-read row as updated. A run whose newest source change equals the previous run's changed nothing.
            runs.execute(f"""insert into runs select run_at, mode, rows_fetched, rows_new,
                case when mode = 'incremental'
                      and max_source_updated = lag(max_source_updated) over (order by run_at) then 0
                     else rows_updated end,
                rows_in_window, window_start, max_created, max_source_updated, duration_s, 'code change'
                from '{RUNS}'""")
    runs.execute(f"insert into runs values ({", ".join("?" * len(run))})", list(run.values()))
    runs.execute(f"copy runs to '{RUNS}' (format parquet)")
    print(json.dumps(run, indent=1))


if __name__ == "__main__":
    main()
