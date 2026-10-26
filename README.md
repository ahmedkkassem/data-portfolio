# Data engineering portfolio

**Live site: https://ahmedkkassem.github.io/data-portfolio/**

Four demos on real public data, rebuilt end to end every morning by GitHub Actions: extraction, dbt models,
tests, independent reconciliation, an AI-written summary with a number guard, and a static site on GitHub Pages.
Everything runs on free tooling.

| Demo | What it shows | Data |
|---|---|---|
| [Monday Report](https://ahmedkkassem.github.io/data-portfolio/retail/) | E-commerce KPI dashboard: revenue, products, markets, cohorts, RFM segments, data-quality audit | UCI Online Retail II (1,067,371 invoice lines) |
| [AI weekly email](https://ahmedkkassem.github.io/data-portfolio/email/) | Claude writes the weekly summary; `checks/number_guard.py` verifies every figure | Same |
| [Spreadsheet rescue](https://ahmedkkassem.github.io/data-portfolio/spreadsheets/) | Three messy team files (Excel + CSV) rebuilt into one table, proven exact line by line | November 2011 lines of the same data |
| [Live ops pipeline](https://ahmedkkassem.github.io/data-portfolio/ops/) | Incremental daily loads from a live API, upserts, freshness and volume checks, run log | NYC 311 Service Requests (NYC Open Data) |

## How it runs
`.github/workflows/build.yml`, daily at 06:15 UTC and on every push:

1. **Extract** retail data (cached) and NYC 311 changes since the last high-water mark (`pipelines/`)
2. **Transform + test** with dbt on DuckDB (`dbt/`): staging → intermediate → marts, schema tests and business-rule tests
3. **Reconcile** independently in pandas (`checks/reconcile_retail.py`): the build fails on a one-penny difference
4. **Spreadsheet rescue**: generate the messy files, clean them, prove the rebuild matches the source field for field
5. **Summarise** with Claude when an API key is configured, then the **number guard** checks every figure
6. **Publish** to GitHub Pages, with screenshots from headless Chrome

NYC 311 state (one Parquet file + a run log) is kept between runs as assets of the `pipeline-state` release.

## Layout
```
pipelines/   extract, load, spreadsheet generator/cleaner, AI summary, JSON exports
dbt/         models (retail, sheets, nyc311), seeds, tests
checks/      independent reconciliation and number guard
site/        static pages + a small dependency-free SVG chart kit
tools/       one-off profiling, screenshots
```

## Run it yourself
```bash
pip install -r requirements.txt
python pipelines/retail/extract.py
dbt build --project-dir dbt --profiles-dir dbt --exclude tag:sheets tag:nyc311
python checks/reconcile_retail.py
```
The models use only standard SQL plus a few DuckDB date functions, so they port to BigQuery or Snowflake with small changes.

## Data and licences
- Chen, D. (2019). *Online Retail II*. UCI Machine Learning Repository. CC BY 4.0. https://archive.ics.uci.edu/dataset/502/online+retail+ii
- NYC 311 Service Requests from 2010 to Present, NYC Open Data. https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2010-to-Present/erm2-nwe9

These are demos on public data, not client work. Not affiliated with the City of New York or UCI.
