"""Audit of the published Monday Report and weekly email: recompute in pandas, straight from the raw file,
the figures the reconciliation does not cover (new customers, sales by customer type, top products and
markets, cohorts, segments, the report week) and compare them with the JSON the live site serves.
Prints one line per check and a markdown summary of anything that differs."""
import json
import os
import sys
import urllib.request

import pandas as pd

sys.path.insert(0, "checks")
from reconcile_retail import clean_lines  # noqa: E402  the same independent cleaning rules

SITE = os.environ.get("SITE", "https://ahmedkkassem.github.io/data-portfolio")
results = []


def get(path):
    with urllib.request.urlopen(f"{SITE}/{path}?audit=1", timeout=60) as r:
        return json.loads(r.read())


def check(name, ours, theirs):
    ok = ours == theirs
    results.append(ok)
    print(f"{'ok  ' if ok else 'DIFF'} {name}: ours={ours} site={theirs}")


def pence(m):  # thousandths of a pound -> pounds rounded to the penny
    return round(int(m) / 1000, 2)


retail, week = get("data/retail.json"), get("data/report_week.json")
lines = clean_lines()
seed = pd.read_csv("dbt/seeds/retail_country_names.csv")
lines["country_name"] = lines["country"].map(dict(zip(seed.source_country, seed.country))).fillna(lines["country"])
sales = lines[lines["kind"] == "sale"]
known = sales[sales["cust"] >= 0]
first = known.groupby("cust")["day"].min()
lines["week"] = lines["day"] - pd.to_timedelta(lines["day"].dt.weekday, unit="D")

print("\n## Saturday trading")
sat = lines[lines["day"].dt.weekday == 5]
print(f"clean lines on a Saturday: {len(sat)} on {sat['day'].nunique()} days: {sorted(sat['day'].dt.date.astype(str).unique())[:10]}")

print("\n## Customers")
check("customers with at least one sale", int(known["cust"].nunique()), sum(s["customers"] for s in retail["rfm"]))
print(f"identified customers incl. returns-only: {lines.loc[lines['cust'] >= 0, 'cust'].nunique()}")

print("\n## Periods: new customers")
for preset, periods in retail["periods"].items():
    for period, p in periods.items():
        a, b = pd.Timestamp(p["start_date"]), pd.Timestamp(p["end_date"])
        check(f"{preset} {period} new customers", int(((first >= a) & (first <= b)).sum()), p["new_customers"])

print("\n## Weekly sales by customer type (gross sales lines)")
s = sales.copy()
s["first_week"] = s["cust"].map(first)
s["first_week"] = s["first_week"] - pd.to_timedelta(s["first_week"].dt.weekday, unit="D")
s["week"] = s["day"] - pd.to_timedelta(s["day"].dt.weekday, unit="D")
s["type"] = "returning"
s.loc[s["cust"] < 0, "type"] = "guest"
s.loc[(s["cust"] >= 0) & (s["first_week"] == s["week"]), "type"] = "new"
by = s.groupby(["week", "type"])["amount_m"].sum().unstack(fill_value=0)
bad = 0
for w in retail["weekly"]:
    k = pd.Timestamp(w["week_start"])
    row = by.loc[k] if k in by.index else pd.Series({"new": 0, "returning": 0, "guest": 0})
    for col, key in [("new", "sales_new_customers"), ("returning", "sales_returning_customers"), ("guest", "sales_guest")]:
        if abs(pence(row.get(col, 0)) - w[key]) > 0.005:
            bad += 1
            print(f"   week {w['week_start']} {key}: ours={pence(row.get(col, 0))} site={w[key]}")
check("weekly customer-type cells that differ", 0, bad)
newc = known.groupby("cust")["day"].min()
for w in retail["weekly"][-3:]:
    a = pd.Timestamp(w["week_start"])
    check(f"week {w['week_start']} new customers", int(((newc >= a) & (newc <= a + pd.Timedelta(days=6))).sum()), w["new_customers"])

print("\n## Top products and markets (current window)")
for preset, prods in retail["products"].items():
    p = retail["periods"][preset]
    cmp = p.get("last_year") or p["previous"]
    a, b = pd.Timestamp(p["current"]["start_date"]), pd.Timestamp(p["current"]["end_date"])
    win = lines[(lines["day"] >= a) & (lines["day"] <= b)]
    top = win.groupby("code")["amount_m"].sum().sort_values(ascending=False).head(10)
    check(f"{preset} top-10 product codes", [c for c in top.index], [x["stock_code"].upper() for x in prods])
    check(f"{preset} top-10 product revenue", [pence(v) for v in top.values], [x["net_revenue"] for x in prods])
    ca, cb = pd.Timestamp(cmp["start_date"]), pd.Timestamp(cmp["end_date"])
    prev = lines[(lines["day"] >= ca) & (lines["day"] <= cb)].groupby("code")["amount_m"].sum()
    check(f"{preset} top-10 comparison revenue", [pence(prev.get(c, 0)) for c in top.index], [x["prev_net_revenue"] for x in prods])
    ctry = win.groupby("country_name")["amount_m"].sum().sort_values(ascending=False).head(11)
    site = sorted(retail["countries"][preset], key=lambda x: -x["net_revenue"])[:11]
    check(f"{preset} top-11 markets", [(c, pence(v)) for c, v in ctry.items()], [(x["country"], x["net_revenue"]) for x in site])

print("\n## Cohorts (complete months only)")
act = known.copy()
act["month"] = act["day"].dt.to_period("M")
coh = first.dt.to_period("M")
last_month = (lines["day"].max() + pd.Timedelta(days=1)).to_period("M") - 1
act = act[act["month"] <= last_month][["cust", "month"]].drop_duplicates()
act["cohort"] = act["cust"].map(coh)
act["k"] = (act["month"] - act["cohort"]).apply(lambda x: x.n)
cells = act.groupby(["cohort", "k"])["cust"].nunique()
sizes = coh.value_counts()
bad = 0
for c in retail["cohorts"]:
    key = (pd.Period(c["cohort_month"][:7], "M"), c["month_offset"])
    if cells.get(key, 0) != c["active_customers"] or sizes.get(key[0], 0) != c["cohort_size"]:
        bad += 1
        print(f"   {key}: ours={cells.get(key, 0)}/{sizes.get(key[0], 0)} site={c['active_customers']}/{c['cohort_size']}")
check("cohort cells that differ", 0, bad)
check("cohort cells published", int((cells.index.get_level_values(0) <= last_month).sum()), len(retail["cohorts"]))

print("\n## Segments")
as_of = lines["day"].max()
cust = pd.DataFrame({
    "last": known.groupby("cust")["day"].max(),
    "orders": known.groupby("cust")["invoice"].nunique(),
    "net": lines[lines["cust"] >= 0].groupby("cust")["amount_m"].sum(),
}).dropna(subset=["last"])
rd = (as_of - cust["last"]).dt.days
r = pd.cut(rd, [-1, 30, 90, 180, 365, 10**6], labels=[5, 4, 3, 2, 1]).astype(int)
f = pd.cut(cust["orders"], [0, 1, 2, 4, 9, 10**6], labels=[1, 2, 3, 4, 5]).astype(int)
seg = pd.Series("Hibernating", index=cust.index)
seg[(f >= 3) & (r <= 2)] = "At risk"
seg[(r == 3) & (f <= 2)] = "Needs attention"
seg[(r >= 4) & (f <= 2)] = "Recent, low frequency"
seg[(r >= 3) & (f >= 3)] = "Loyal"
seg[(r >= 4) & (f >= 4)] = "Champions"
for row in retail["rfm"]:
    m = seg == row["segment"]
    check(f"{row['segment']}: customers", int(m.sum()), row["customers"])
    check(f"{row['segment']}: net revenue", pence(cust.loc[m, "net"].sum()), round(row["net_revenue"], 2))
    check(f"{row['segment']}: median days", float(rd[m].median()), row["median_recency_days"])

print("\n## Report week (the AI email facts)")
for name, wk in week["weeks"].items():
    a = pd.Timestamp(wk["week_start"])
    w = lines[(lines["day"] >= a) & (lines["day"] <= a + pd.Timedelta(days=6))]
    ws = w[w["kind"] == "sale"]
    gross, ret = int(ws["amount_m"].sum()), int(-w.loc[w["kind"] == "return", "amount_m"].sum())
    check(f"{name} net revenue", pence(gross - ret), round(wk["net_revenue"], 2))
    check(f"{name} orders", int(ws["invoice"].nunique()), wk["orders"])
    check(f"{name} customers ordering", int(ws.loc[ws["cust"] >= 0, "cust"].nunique()), wk["active_customers"])
    check(f"{name} new customers", int(((first >= a) & (first <= a + pd.Timedelta(days=6))).sum()), wk["new_customers"])
    check(f"{name} return rate (4 dp)", round(ret / gross, 4), round(wk["return_rate"], 4))
tw = pd.Timestamp(week["weeks"]["this_week"]["week_start"])
this = lines[(lines["day"] >= tw) & (lines["day"] <= tw + pd.Timedelta(days=6))]
days = this.groupby(this["day"].dt.day_name())["amount_m"].sum()
for d in week["days"]:
    check(f"{d['label']} net revenue", pence(days.get(d["label"], 0)), d["this_week"] or 0)
lw = lines[(lines["day"] >= tw - pd.Timedelta(days=7)) & (lines["day"] < tw)]
for kind, items in [("product_gainers", week["product_gainers"]), ("product_decliners", week["product_decliners"])]:
    for it in items[:3]:
        t = pence(this.loc[this["code"] == it["key"].upper(), "amount_m"].sum())
        l = pence(lw.loc[lw["code"] == it["key"].upper(), "amount_m"].sum())
        check(f"{kind} {it['label']}", (t, l), (it["this_week"], it["last_week"] or 0))
chg = (this.groupby("code")["amount_m"].sum().sub(lw.groupby("code")["amount_m"].sum(), fill_value=0)).sort_values()
check("biggest gainer code", chg.index[-1], week["product_gainers"][0]["key"].upper())
check("biggest decliner code", chg.index[0], week["product_decliners"][0]["key"].upper())
for c in week["countries"]:
    t = pence(this.loc[this["country_name"] == c["key"], "amount_m"].sum())
    check(f"country {c['key']} this week", t, c["this_week"])

print(f"\nRESULT: {sum(results)} of {len(results)} checks agree")
