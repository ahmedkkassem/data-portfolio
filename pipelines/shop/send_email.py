"""Send the live shop's Monday email (and any anomaly alert) through Gmail, then record it in the archive
the site shows. Rules: the weekly email goes only if the number guard passed, and each week and each
alert is sent once (the archive remembers). Without GMAIL_ADDRESS / GMAIL_APP_PASSWORD nothing is sent,
and the archive marks the entry as not sent.

    python pipelines/shop/send_email.py weekly FACTS SUMMARY GUARD STATE_DIR
    python pipelines/shop/send_email.py alert  ANOMALY STATE_DIR
"""
import datetime as dt
import html
import json
import os
import pathlib
import smtplib
import sys
from email.message import EmailMessage

SITE = "https://ahmedkkassem.github.io/data-portfolio/"


def load(path: pathlib.Path) -> list:
    return json.loads(path.read_text()) if path.exists() else []


def send(subject: str, text: str, html_body: str) -> bool:
    sender, password = os.environ.get("GMAIL_ADDRESS"), os.environ.get("GMAIL_APP_PASSWORD")
    if not (sender and password):
        print("no Gmail secrets: not sending")
        return False
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, f"Monday Report (demo) <{sender}>", sender
    msg.set_content(text)
    msg.add_alternative(html_body, subtype="html")
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=60) as smtp:
        smtp.login(sender, password)
        smtp.send_message(msg)
    print(f"sent: {subject}")
    return True


def pct(a, b):
    return "n/a" if not b else f"{'up' if a >= b else 'down'} {abs(a / b - 1) * 100:.1f}%"


def weekly(facts_p, summary_p, guard_p, state: pathlib.Path) -> int:
    facts, summary, guard = (json.loads(pathlib.Path(p).read_text()) for p in (facts_p, summary_p, guard_p))
    archive_p = state / "emails.json"
    archive = load(archive_p)
    w = facts["weeks"]["this_week"]
    if any(e["week_start"] == w["week_start"] for e in archive):
        print(f"week {w['week_start']} already in the archive: not sending again")
        return 0
    passed = guard["all_ok"]
    lw, ly = facts["weeks"]["last_week"], facts["weeks"].get("same_week_last_year")
    rows = [("Net revenue", f"£{w['net_revenue']:,.0f}", pct(w["net_revenue"], lw["net_revenue"]), pct(w["net_revenue"], ly["net_revenue"]) if ly else "n/a"),
            ("Orders", f"{w['orders']:,}", pct(w["orders"], lw["orders"]), pct(w["orders"], ly["orders"]) if ly else "n/a"),
            ("Average order", f"£{w['avg_order_value']:,.2f}", pct(w["avg_order_value"], lw["avg_order_value"]), pct(w["avg_order_value"], ly["avg_order_value"]) if ly else "n/a"),
            ("Return rate", f"{w['return_rate'] * 100:.2f}%", "", "")]
    checked = f"{sum(r['ok'] for r in guard['results'])} of {guard['numbers_checked']}"
    footer = (f"Every figure in this email was checked against the warehouse before sending ({checked} traced). "
              "Demo: a simulated shop replaying a real UK gift shop's orders. Built by Ahmed Kassem.")
    text = "\n".join([summary["headline"], "", *[f"{a}: {b} ({c} on last week, {d} on last year)" for a, b, c, d in rows], "",
                      "What happened:", *[f"- {b}" for b in summary["bullets"]], "", "Worth a look:", *[f"- {b}" for b in summary["watch"]],
                      "", footer, SITE])
    td = 'style="padding:6px 10px;border-bottom:1px solid #e3e6ec"'
    table = "".join(f"<tr><td {td}>{a}</td><td {td}><b>{b}</b></td><td {td}>{c}</td><td {td}>{d}</td></tr>" for a, b, c, d in rows)
    html_body = f"""<div style="font-family:Arial,sans-serif;color:#1f2b4d;max-width:640px">
<p style="font-size:18px;font-weight:bold">{html.escape(summary['headline'])}</p>
<table style="border-collapse:collapse;font-size:14px"><tr><th align="left" {td}></th><th align="left" {td}>This week</th>
<th align="left" {td}>vs last week</th><th align="left" {td}>vs same week last year</th></tr>{table}</table>
<h3>What happened</h3><ul>{''.join(f'<li>{html.escape(b)}</li>' for b in summary['bullets'])}</ul>
<h3>Worth a look this week</h3><ul>{''.join(f'<li>{html.escape(b)}</li>' for b in summary['watch'])}</ul>
<p style="font-size:12px;color:#5a6178">{html.escape(footer)} <a href="{SITE}">{SITE}</a></p></div>"""
    state.mkdir(parents=True, exist_ok=True)
    (state / "preview.html").write_text(html_body)
    sent = send(summary["subject"], text, html_body) if passed else False
    if not passed:
        print("number guard failed: the email is held back")
    elif not sent:
        print("not archived: nothing was sent, so the week stays open for the next run")
        return 0
    archive.append({"week_start": w["week_start"], "week_end": w["week_end"],
                    "sent_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds") if sent else None,
                    "sent": sent, "held_by_guard": not passed, "guard": checked, **summary, "kpis": rows})
    state.mkdir(parents=True, exist_ok=True)
    archive_p.write_text(json.dumps(archive, indent=1, ensure_ascii=False))
    return 0


def alert(anomaly_p, state: pathlib.Path) -> int:
    a = json.loads(pathlib.Path(anomaly_p).read_text())
    log_p = state / "alerts.json"
    log = load(log_p)
    if any(e["day"] == a["day"] for e in log):
        print(f"{a['day']} already checked")
        return 0
    sent = False
    if a["alert"]:
        lines = [f"{c['metric'].replace('_', ' ')}: {c['value']:,} against a usual {c['usual']:,} for a {a['weekday']} ({c['ratio']}x)"
                 for c in a["checks"] if c["alert"]]
        subject = f"Alert: {a['weekday']} {a['day']} is far from the usual"
        text = "\n".join([*lines, "", "Usual = the median of the same weekday over the previous eight weeks.", SITE])
        sent = send(subject, text, "<p>" + "<br>".join(html.escape(x) for x in lines) + "</p><p style='font-size:12px'>Usual = "
                    "the median of the same weekday over the previous eight weeks.</p>")
    log.append({**a, "sent": sent})
    state.mkdir(parents=True, exist_ok=True)
    log_p.write_text(json.dumps(log[-120:], indent=1))
    return 0


if __name__ == "__main__":
    mode, *args = sys.argv[1:]
    sys.exit(weekly(*args[:3], pathlib.Path(args[3])) if mode == "weekly" else alert(args[0], pathlib.Path(args[1])))
