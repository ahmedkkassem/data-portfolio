"""Spreadsheet rescue: read three teams' messy sales files and produce one clean, typed table.

Each file only needs a few lines of config (its date order and number format). Everything else is found
and fixed by generic rules: locating the real header, mapping column names, dropping title/subtotal/blank
rows, parsing dates and numbers, normalising codes, customers and countries, flipping return signs and
removing pasted-twice rows. Every fix is counted, so the page can show exactly what was repaired.
"""
import csv
import datetime as dt
import json
import pathlib
import re
from collections import Counter
from decimal import Decimal, ROUND_HALF_UP

import pandas as pd
from openpyxl import load_workbook

IN = pathlib.Path("build/site/spreadsheets/files")
OUT = pathlib.Path("data/clean/sheets_clean.parquet")
REPORT = pathlib.Path("build/site/data/spreadsheets_report.json")

FILES = {
    "UK_sales_Nov-2011.xlsx": {"region": "United Kingdom", "day_first": True, "decimal_comma": False},
    "Europe_sales_Nov2011.xlsx": {"region": "Europe", "day_first": True, "decimal_comma": True},
    "RestOfWorld_sales_Nov2011.csv": {"region": "Rest of world", "day_first": False, "decimal_comma": False},
}

HEADER_ALIASES = {
    "invoice": {"inv no", "invoice", "invoice_no", "invoice number"},
    "line": {"line", "pos", "line no"},
    "invoiced_at": {"date", "invoice date", "invoice_datetime"},
    "stock_code": {"item code", "sku", "product_code", "stock code"},
    "description": {"item", "description", "product_name"},
    "quantity": {"qty", "quantity"},
    "unit_price": {"unit £", "price", "unit_price"},
    "line_total": {"line total £", "line total"},
    "customer_id": {"cust #", "customer", "customer_id"},
    "country": {"country"},
    "type": {"type"},
}
COUNTRY_ALIASES = {
    "UK": "United Kingdom", "U.K.": "United Kingdom", "Deutschland": "Germany", "Nederland": "Netherlands",
    "España": "Spain", "Schweiz": "Switzerland", "Belgique": "Belgium", "Österreich": "Austria",
    "Italia": "Italy", "Norge": "Norway", "Sverige": "Sweden", "Danmark": "Denmark", "Suomi": "Finland",
    "Polska": "Poland", "USA": "United States", "RSA": "South Africa", "Korea": "South Korea", "EIRE": "Ireland",
}
DATE_FORMATS = {True: ["%d/%m/%Y %H:%M", "%d.%m.%Y %H:%M"], False: ["%m/%d/%Y %I:%M %p"]}


def read_rows(path):
    if path.suffix == ".csv":
        with path.open(encoding="utf-8-sig", newline="") as f:
            return [row for row in csv.reader(f)]
    wb = load_workbook(path, read_only=True, data_only=True)
    return [list(r) for r in wb.worksheets[0].iter_rows(values_only=True)]


def find_header(rows):
    for i, row in enumerate(rows[:20]):
        names = [str(c).strip().lower() for c in row if c not in (None, "")]
        mapped = {canon for canon, aliases in HEADER_ALIASES.items() if any(n in aliases for n in names)}
        if {"invoice", "stock_code", "quantity", "unit_price"} <= mapped:
            return i
    raise ValueError("no header row found")


def to_minute(ts):
    return (ts + dt.timedelta(seconds=30)).replace(second=0, microsecond=0)


def parse_date(v, cfg, fixes):
    if isinstance(v, dt.datetime):
        return to_minute(v)
    for fmt in DATE_FORMATS[cfg["day_first"]]:
        try:
            parsed = dt.datetime.strptime(str(v).strip(), fmt)
            fixes["Dates stored as text, parsed with the team's date order"] += 1
            return parsed
        except ValueError:
            continue
    raise ValueError(f"unparseable date {v!r}")


def parse_price(v, cfg, fixes):
    if isinstance(v, (int, float)):
        d = Decimal(str(v))
    else:
        s = str(v).strip()
        if s.startswith("£"):
            fixes["Prices typed as text with a £ sign"] += 1
            s = s[1:]
        if cfg["decimal_comma"]:
            if "." in s:
                fixes["Thousands separators removed"] += 1
            s = s.replace(".", "").replace(",", ".")
            fixes["Decimal commas converted"] += 1
        d = Decimal(s)
    return d.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def parse_qty(v, fixes):
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v).strip()
    m = re.fullmatch(r"(-?\d+)\s*(pcs|pc|x)?", s, flags=re.I)
    if not m:
        raise ValueError(f"unparseable quantity {v!r}")
    if m.group(2):
        fixes['Quantities typed with units ("12 pcs")'] += 1
    return int(m.group(1))


def parse_customer(v, fixes):
    if v in (None, ""):
        return None
    s = str(v).strip()
    if s.upper() in {"N/A", "NA", "-", "NONE"}:
        fixes['Missing customers written as "N/A" or "-"'] += 1
        return None
    digits = re.sub(r"\.0$", "", s)
    if not digits.isdigit():
        fixes['Customer IDs with prefixes ("C-12583")'] += 1
        digits = re.sub(r"\D", "", digits)
    return digits


def clean_file(name, cfg, fixes, stats):
    rows = read_rows(IN / name)
    h = find_header(rows)
    if h:
        fixes["Title rows above the header skipped"] += h
    header = [str(c).strip().lower() if c is not None else "" for c in rows[h]]
    col = {}
    for canon, aliases in HEADER_ALIASES.items():
        for j, name_ in enumerate(header):
            if name_ in aliases:
                col[canon] = j
    out = []
    for raw in rows[h + 1:]:
        get = lambda k: raw[col[k]] if k in col and col[k] < len(raw) else None  # noqa: E731
        if all(c in (None, "") for c in raw):
            fixes["Blank rows removed"] += 1
            continue
        code = get("stock_code")
        if code in (None, "") or str(code).strip() == "":
            fixes["Subtotal rows removed"] += 1
            continue
        code_clean = str(code).strip().upper()
        if code_clean != str(code):
            fixes["Product codes trimmed or upper-cased"] += 1
        qty = parse_qty(get("quantity"), fixes)
        if "type" in col and str(get("type")).strip().lower() == "return" and qty > 0:
            fixes["Returns stored as positive quantities, sign flipped"] += 1
            qty = -qty
        country = str(get("country")).strip()
        if country in COUNTRY_ALIASES:
            fixes["Country names standardised"] += 1
            country = COUNTRY_ALIASES[country]
        price = parse_price(get("unit_price"), cfg, fixes)
        rec = {
            "source_file": name,
            "region": cfg["region"],
            "invoice": str(get("invoice")).strip(),
            "line": int(get("line")),
            "invoiced_at": parse_date(get("invoiced_at"), cfg, fixes),
            "stock_code": code_clean,
            "quantity": qty,
            "unit_price": price,
            "customer_id": parse_customer(get("customer_id"), fixes),
            "country": country,
        }
        if "line_total" in col and get("line_total") not in (None, ""):
            stated = Decimal(str(get("line_total"))).quantize(Decimal("0.001"))
            if stated != (price * qty).quantize(Decimal("0.001")):
                fixes["Line totals that disagree with qty × price"] += 1
        out.append(rec)
    df = pd.DataFrame(out)
    key = ["invoice", "line", "invoiced_at", "stock_code", "quantity", "unit_price", "customer_id", "country"]
    dupes = int(df.duplicated(subset=key).sum())
    fixes["Rows pasted twice, removed"] += dupes
    df = df.drop_duplicates(subset=key)
    stats.append({"file": name, "region": cfg["region"], "rows_in_file": len(rows), "header_row": h + 1,
                  "clean_lines": len(df), "duplicates_removed": dupes,
                  "net_revenue": float(sum(df["unit_price"] * df["quantity"]))})
    return df


def main():
    fixes, stats, frames = Counter(), [], []
    for name, cfg in FILES.items():
        frames.append(clean_file(name, cfg, fixes, stats))
    df = pd.concat(frames, ignore_index=True)
    df["unit_price"] = df["unit_price"].astype(str)  # exact decimal text; dbt casts it back
    OUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT, index=False)
    REPORT.write_text(json.dumps({"files": stats, "fixes": [{"fix": k, "count": v} for k, v in fixes.most_common()],
                                  "clean_lines": len(df)}, indent=1))
    print(f"cleaned {len(df)} lines from {len(FILES)} files")
    for k, v in fixes.most_common():
        print(f"  {v:>7,}  {k}")


if __name__ == "__main__":
    main()
