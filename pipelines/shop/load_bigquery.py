"""Load the shop's order-line export into BigQuery, replacing the table in full. The free sandbox allows no
DML and expires tables after 60 days, so a full daily reload (a free load job) is the right fit here; a
client's paid project would append each day's lines instead."""
import json
import os
import pathlib

from google.cloud import bigquery

project, location = os.environ["BQ_PROJECT"], os.environ.get("BQ_LOCATION", "US")
client = bigquery.Client(project=project)
for name in ["shop_raw", "shop"]:
    client.create_dataset(bigquery.Dataset(f"{project}.{name}"), exists_ok=True)
job = client.load_table_from_file(
    open("data/shop/order_lines.parquet", "rb"), f"{project}.shop_raw.order_lines",
    job_config=bigquery.LoadJobConfig(source_format=bigquery.SourceFormat.PARQUET,
                                      write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE))
job.result()
table = client.get_table(f"{project}.shop_raw.order_lines")
manifest = json.loads(pathlib.Path("data/shop/manifest.json").read_text())
assert table.num_rows == manifest["lines"], f"loaded {table.num_rows} rows, export has {manifest['lines']}"
print(f"loaded {table.num_rows:,} lines into {project}.shop_raw.order_lines (location {location})")
