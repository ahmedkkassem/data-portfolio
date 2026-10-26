import { html, columnChart, compact, fmtInt, fmtPct, initTheme, renderTable } from "./charts.js";
import { checkIcon, gbp, gbpExact, longDate, dayMonth, deltaPct, deltaPts } from "./common.js";

initTheme(document.getElementById("theme"));
const [facts, summary, guard] = await Promise.all([
  fetch("../data/report_week.json").then((r) => r.json()),
  fetch("./summary.json").then((r) => r.json()),
  fetch("../data/number_guard.json").then((r) => r.json()),
]);
const tw = facts.weeks.this_week, lw = facts.weeks.last_week, ly = facts.weeks.same_week_last_year;

document.getElementById("subject").textContent = summary.subject;
document.getElementById("headline").textContent = summary.headline;
document.getElementById("sent").textContent = `for the week ${dayMonth(tw.week_start)} – ${longDate(tw.week_end)}`;

const kpis = document.getElementById("kpis");
for (const k of [
  { l: "Net revenue", v: gbp(tw.net_revenue), d: deltaPct(tw.net_revenue, lw.net_revenue, true) },
  { l: "Orders", v: fmtInt(tw.orders), d: deltaPct(tw.orders, lw.orders, true) },
  { l: "Average order", v: gbpExact(tw.avg_order_value), d: deltaPct(tw.avg_order_value, lw.avg_order_value, true) },
  { l: "Return rate", v: fmtPct(tw.return_rate, 2), d: deltaPts(tw.return_rate, lw.return_rate, false) },
]) {
  const m = html("div", { class: "mini" }, kpis);
  html("div", { class: "l" }, m, k.l);
  html("div", { class: "v" }, m, k.v);
  html("div", { class: `d ${k.d.good === true ? "good" : k.d.good === false ? "bad" : "flat"}` }, m, `${k.d.text} vs last week`);
}
document.getElementById("kpi-note").textContent =
  `Same week last year: ${gbp(ly.net_revenue)} net revenue, ${fmtInt(ly.orders)} orders (${dayMonth(ly.week_start)} – ${longDate(ly.week_end)}).`;

for (const [id, items] of [["bullets", summary.bullets], ["watch", summary.watch]]) {
  const ul = document.getElementById(id);
  for (const t of items) html("li", {}, ul, t);
}

columnChart(document.getElementById("days"), {
  x: facts.days.map((d) => d.label),
  series: [{ name: "Net revenue", color: "var(--series-1)", values: facts.days.map((d) => d.this_week) }],
  format: (v) => compact(v, { prefix: "£" }),
  title: (i) => `${facts.days[i].label} ${longDate(facts.days[i].key)}`,
  height: 200, ariaLabel: "Net revenue by day",
});

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

const g = document.getElementById("guard");
const ic = html("span", { class: `ic${guard.all_ok ? "" : " fail"}` }, g);
ic.append(checkIcon(guard.all_ok));
const body = html("div", {}, g);
const p = html("div", {}, body);
html("b", {}, p, guard.all_ok ? `All ${guard.numbers_checked} numbers in this email trace back to the warehouse.` : "Number guard failed: this email would not be sent.");
html("span", {}, p, " The guard pulls every money amount, percentage, count and point change out of the text and matches it against the facts file.");
const det = html("details", { class: "trace" }, body);
html("summary", {}, det, "Show the trace");
renderTable(html("div", { class: "table-wrap", style: "margin-top:8px" }, det), {
  columns: [{ key: "number", label: "Number in the text" }, { key: "m", label: "Matches warehouse fact" }, { key: "s", label: "" }],
  rows: guard.results.map((r) => ({ number: r.number, m: r.matched.join(", ") || "no match", s: r.ok ? "✓" : "✗" })),
});
document.getElementById("written-by").textContent = `Summary written by ${summary.written_by}.`;
