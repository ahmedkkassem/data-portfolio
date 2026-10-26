"""Extract: download the UCI Online Retail II workbook and land both sheets as one raw parquet file.

The raw layer keeps every source row untouched, plus where it came from (sheet + Excel row),
so any number on the dashboard can be traced back to a cell in the original file.
"""
import hashlib
import io
import json
import pathlib
import urllib.request
import zipfile

import pandas as pd

URL = "https://archive.ics.uci.edu/static/public/502/online+retail+ii.zip"
OUT_DIR = pathlib.Path("data/raw/retail")
OUT = OUT_DIR / "online_retail_ii.parquet"
MANIFEST = OUT_DIR / "manifest.json"

COLUMNS = {
    "Invoice": "invoice",
    "StockCode": "stock_code",
    "Description": "description",
    "Quantity": "quantity",
    "InvoiceDate": "invoice_date",
    "Price": "price",
    "Customer ID": "customer_id",
    "Country": "country",
}


def main() -> None:
    if OUT.exists() and MANIFEST.exists():
        print(f"raw file already landed: {json.loads(MANIFEST.read_text())}")
        return
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with urllib.request.urlopen(URL, timeout=180) as resp:
        blob = resp.read()
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        xlsx = zf.read("online_retail_II.xlsx")

    sheets = pd.read_excel(
        io.BytesIO(xlsx),
        sheet_name=None,
        engine="openpyxl",
        dtype={"Invoice": str, "StockCode": str, "Description": str, "Country": str},
    )
    frames = []
    for name, df in sheets.items():
        df = df.rename(columns=COLUMNS)[list(COLUMNS.values())]
        df.insert(0, "source_sheet", name)
        df.insert(1, "source_row", range(2, len(df) + 2))  # Excel row number; row 1 is the header
        frames.append(df)
    raw = pd.concat(frames, ignore_index=True)
    raw.to_parquet(OUT, index=False)

    manifest = {
        "url": URL,
        "zip_sha256": hashlib.sha256(blob).hexdigest(),
        "rows": int(len(raw)),
        "rows_per_sheet": {name: int(len(df)) for name, df in sheets.items()},
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2))
    print(f"landed {manifest}")


if __name__ == "__main__":
    main()
