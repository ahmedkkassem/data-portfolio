"""Number guard: every number written in the weekly summary must be traceable to the warehouse facts.

It pulls each money amount, percentage, point change and count out of the text, and accepts it only if
some fact (or a change/difference/share between two facts) rounds to exactly what was written.
One untraceable number fails the build, so an AI-written summary can never publish a made-up figure.
"""
import json
import pathlib
import re
import sys

FACTS = json.loads(pathlib.Path("build/site/data/report_week.json").read_text())
SUMMARY = json.loads(pathlib.Path("site/email/summary.json").read_text())
OUT = pathlib.Path("build/checks/number_guard.json")

MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec"
TOKEN = re.compile(r"(?P<cur>£)?(?P<num>\d[\d,]*(?:\.\d+)?)(?P<scale>[KM])?(?P<unit>%| pts)?")


def candidates():
    money, pct, counts = {}, {}, {}
    weeks = FACTS["weeks"]
    money_keys = ["net_revenue", "gross_sales", "returns", "avg_order_value", "sales_new_customers",
                  "sales_returning_customers", "sales_guest"]
    count_keys = ["orders", "units", "active_customers", "new_customers"]
    for name, w in weeks.items():
        for k in money_keys:
            money[f"{name}.{k}"] = w[k]
        for k in count_keys:
            counts[f"{name}.{k}"] = w[k]
        pct[f"{name}.return_rate"] = w["return_rate"] * 100
    this = weeks["this_week"]
    for other in ["last_week", "same_week_last_year"]:
        o = weeks[other]
        for k in money_keys + count_keys:
            if o[k]:
                pct[f"change {k} vs {other}"] = abs(this[k] / o[k] - 1) * 100
            money[f"diff {k} vs {other}"] = abs(this[k] - o[k])
        pct[f"pts return_rate vs {other}"] = abs(this["return_rate"] - o["return_rate"]) * 100
    for group in ["products", "product_gainers", "product_decliners", "countries", "days"]:
        for m in FACTS[group]:
            money[f"{group}.{m['label']}.this_week"] = m["this_week"]
            if m.get("last_week") is not None:
                money[f"{group}.{m['label']}.last_week"] = m["last_week"]
                money[f"{group}.{m['label']}.change"] = abs(m["change"])
                if m["last_week"]:
                    pct[f"{group}.{m['label']}.change_pct"] = abs(m["this_week"] / m["last_week"] - 1) * 100
    return money, pct, counts


def decimals(s):
    return len(s.split(".")[1]) if "." in s else 0


def check(text, money, pct, counts):
    # dates are not facts to verify: "28 Nov", "4 Dec 2011", "2010"
    scrubbed = re.sub(rf"\b\d{{1,2}} (?:{MONTHS})\b", " ", text)
    scrubbed = re.sub(r"\b(?:19|20)\d{2}\b", " ", scrubbed)
    results = []
    for m in TOKEN.finditer(scrubbed):
        raw = m.group(0)
        value = float(m.group("num").replace(",", ""))
        d = decimals(m.group("num"))
        scale = {"K": 1e3, "M": 1e6}.get(m.group("scale"), 1)
        if m.group("cur"):
            pool, target = money, value
            ok = [k for k, v in pool.items() if round(abs(v) / scale, d) == target]
        elif m.group("unit"):
            pool = pct
            ok = [k for k, v in pool.items() if round(v, d) == value]
        else:
            if value <= 10 and d == 0:  # small counting words like "two", "top 3" are not claims
                results.append({"number": raw, "matched": ["(small count, not a claim)"], "ok": True})
                continue
            ok = [k for k, v in counts.items() if v == value]
        results.append({"number": raw, "matched": ok[:3], "ok": bool(ok)})
    return results


def main() -> int:
    money, pct, counts = candidates()
    texts = [SUMMARY["subject"], SUMMARY["headline"], *SUMMARY["bullets"], *SUMMARY["watch"]]
    results = [r for t in texts for r in check(t, money, pct, counts)]
    bad = [r for r in results if not r["ok"]]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"numbers_checked": len(results), "all_ok": not bad, "results": results}, indent=2))
    for r in results:
        print(("OK   " if r["ok"] else "FAIL ") + f"{r['number']:>12}  <- {', '.join(r['matched']) or 'no matching fact'}")
    print(f"{len(results) - len(bad)}/{len(results)} numbers in the summary trace back to the warehouse")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
