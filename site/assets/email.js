import { html, columnChart, kpiStrip, compact, fmtInt, fmtPct, renderTable } from "./charts.js";
import { checkIcon, gbp, gbpExact, longDate, dayMonth, deltaPct, deltaPts } from "./common.js";
import { shell, reveal } from "./shell.js";

shell("email");
await document.fonts.ready;
const [facts, summary, guard] = await Promise.all([
  fetch("../data/report_week.json").then((r) => r.json()),
  fetch("./summary.json").then((r) => r.json()),
  fetch("../data/number_guard.json").then((r) => r.json()),
]);
const tw = facts.weeks.this_week, lw = facts.weeks.last_week, ly = facts.weeks.same_week_last_year;

const stamp = document.getElementById("stamp");
stamp.append("Report week ");
html("b", {}, stamp, `${dayMonth(tw.week_start)} – ${longDate(tw.week_end)}`);
html("br", {}, stamp);
stamp.append(`Checked ${longDate(facts.generated_at)}, ${facts.generated_at.slice(11, 16)} UTC`);

document.getElementById("subject").textContent = summary.subject;
document.getElementById("headline").textContent = summary.headline;
document.getElementById("sent").textContent = `week of ${dayMonth(tw.week_start)} – ${longDate(tw.week_end)}`;

kpiStrip(document.getElementById("kpis"), [
  { label: "Net revenue", value: gbp(tw.net_revenue), delta: deltaPct(tw.net_revenue, lw.net_revenue, true), vs: "on last week", lead: true },
  { label: "Orders", value: fmtInt(tw.orders), delta: deltaPct(tw.orders, lw.orders, true), vs: "on last week" },
  { label: "Average order", value: gbpExact(tw.avg_order_value), delta: deltaPct(tw.avg_order_value, lw.avg_order_value, true), vs: "on last week" },
  { label: "Return rate", value: fmtPct(tw.return_rate, 2), delta: deltaPts(tw.return_rate, lw.return_rate, false), vs: "on last week" },
]);
document.getElementById("kpi-note").textContent =
  `Same week last year (${dayMonth(ly.week_start)} – ${longDate(ly.week_end)}): ${gbp(ly.net_revenue)} net revenue from ${fmtInt(ly.orders)} orders.`;

for (const [id, items] of [["bullets", summary.bullets], ["watch", summary.watch]]) {
  const ul = document.getElementById(id);
  for (const t of items) html("li", {}, ul, t);
}

const drawDays = () => columnChart(document.getElementById("days"), {
  x: facts.days.map((d) => d.label),
  series: [{ name: "Net revenue", color: "var(--series-1)", values: facts.days.map((d) => d.this_week) }],
  format: (v) => compact(v, { prefix: "£" }),
  title: (i) => `${facts.days[i].label} ${longDate(facts.days[i].key)}`,
  height: 200, ariaLabel: "Net revenue by day",
});
drawDays();

const movers = [...facts.product_gainers.slice(0, 3), ...facts.product_decliners.slice(0, 3)];
renderTable(document.getElementById("movers"), {
  columns: [
    { key: "label", label: "Product" },
    { key: "last_week", label: "Last week", num: true, format: (v) => gbpExact(v, 0) },
    { key: "this_week", label: "This week", num: true, format: (v) => gbpExact(v, 0) },
    { key: "change", label: "Change", num: true, format: (v) => `${v >= 0 ? "+" : "−"}${gbpExact(Math.abs(v), 0)}` },
  ],
  rows: movers,
});

// the guard, as its own panel: the score, then every number with the fact it matched
const g = document.getElementById("guard");
const head = html("div", { class: "guard-head" }, g);
html("span", { class: `ic${guard.all_ok ? "" : " fail"}` }, head).append(checkIcon(guard.all_ok));
const hd = html("div", {}, head);
html("div", { class: "big" }, hd, `${guard.results.filter((r) => r.ok).length} of ${guard.numbers_checked}`);
html("div", { class: "small muted" }, hd, guard.all_ok ? "numbers traced to the warehouse" : "numbers traced; this email would not be sent");
html("h3", { style: "font-size:16px;margin:4px 0 4px" }, g, "Number guard");
html("p", { class: "small muted", style: "margin:0 0 12px" }, g, "Each figure in the email, and the warehouse fact it must equal after rounding.");
const t = html("table", { class: "data" }, html("div", { class: "table-wrap" }, g));
const hr = html("tr", {}, html("thead", {}, t));
html("th", { class: "num" }, hr, "In the text");
html("th", {}, hr, "Matches");
const tb = html("tbody", {}, t);
const pretty = (k) => k.replace(/_/g, " ").replace(/^this week\./, "this week: ").replace(/^last week\./, "last week: ")
  .replace(/^same week last year\./, "same week last year: ").replace(/^(products|product gainers|product decliners|countries|days)\./, "")
  .replace(/\.this week$/, ", this week").replace(/\.last week$/, ", last week").replace(/\.change$/, ", change");
const seen = new Set();
for (const r of guard.results) {
  if (seen.has(r.number)) continue;
  seen.add(r.number);
  const tr = html("tr", {}, tb);
  const n = html("td", { class: "num" }, tr);
  html("span", { class: "trace-num" }, n, r.number);
  const m = html("td", {}, tr);
  const st = html("span", { class: `status ${r.ok ? "ok" : "bad"}`, style: "margin-right:6px" }, m);
  st.append(checkIcon(r.ok));
  m.append(r.matched.length ? pretty(r.matched[0]) : "no matching fact");
}
document.getElementById("written-by").textContent = `This week's summary was written by ${summary.written_by}.`;
window.addEventListener("themechange", drawDays);
reveal();
