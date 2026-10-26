import { html, card, lineChart, barChart, kpiStrip, compact, fmtInt, fmtPct, fmtNum, renderTable } from "./charts.js";
import { proof, checkIcon, longDate, dayMonth, deltaPct, deltaPts } from "./common.js";
import { shell, reveal } from "./shell.js";

shell("ops");
await document.fonts.ready;
const d = await (await fetch("../data/ops.json")).json();

const AGENCY = {
  NYPD: "Police", HPD: "Housing", DSNY: "Sanitation", DOT: "Transportation", DEP: "Environmental Protection",
  DPR: "Parks", DOB: "Buildings", DOHMH: "Health", DHS: "Homeless Services", TLC: "Taxi and Limousine",
  DCWP: "Consumer and Worker Protection", EDC: "Economic Development", DOE: "Education", DFTA: "Aging", OTI: "Technology and Innovation",
};
const agencyName = (a) => (AGENCY[a] ? `${a} · ${AGENCY[a]}` : a);
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (m, p, c) => p + c.toUpperCase());

// stamp + proof line
const stamp = document.getElementById("stamp");
stamp.append("Last run ");
html("b", {}, stamp, `${longDate(d.generated_at)}, ${d.generated_at.slice(11, 16)} UTC`);
html("br", {}, stamp);
stamp.append(`Data current to ${longDate(d.bounds.data_current_to)}`);
const pl = document.getElementById("proofline");
const passed = d.tests.filter((t) => t.status === "pass").length;
proof(pl, `${passed} of ${d.tests.length} tests passed`, passed === d.tests.length);
if (d.freshness) proof(pl, `Source freshness ${d.freshness.status === "pass" ? "passed" : d.freshness.status}: newest change ${fmtNum(d.freshness.age_hours, 1)} hours old`, d.freshness.status === "pass");
proof(pl, `${fmtInt(d.quality.requests_in_window)} requests in the 90-day window`, true);

// KPIs
const cur = d.kpis.current, prev = d.kpis.previous;
kpiStrip(document.getElementById("kpis"), [
  { label: "Requests, last 7 days", value: fmtInt(cur.requests), delta: { ...deltaPct(cur.requests, prev.requests, true), good: null }, vs: "vs the 7 days before", lead: true },
  { label: "Closed within 24 hours", value: fmtPct(cur.closed_within_24h_rate, 1), delta: deltaPts(cur.closed_within_24h_rate, prev.closed_within_24h_rate, true), vs: "vs the 7 days before" },
  { label: "Median time to close", value: `${fmtNum(cur.median_hours_to_close, 1)} h`, delta: deltaPct(cur.median_hours_to_close, prev.median_hours_to_close, false), vs: "vs the 7 days before" },
  { label: "Open right now", value: fmtInt(cur.open_now), note: "of the requests opened in the last 90 days" },
]);

const daily = d.daily;
function charts() {
  // demand
  document.getElementById("demand-note").textContent = `${longDate(daily[0].day)} to ${longDate(d.bounds.last_complete_day)}; the newest day is left out until it is complete`;
  const rowD = document.getElementById("row-demand");
  rowD.replaceChildren();
  const c1 = card(rowD, {
    title: "Requests per day", sub: "Daily count and the 7-day average", spanClass: "span-8",
    table: () => ({ columns: [{ key: "day", label: "Day", format: longDate }, { key: "requests", label: "Requests", num: true, format: fmtInt },
      { key: "requests_7d_avg", label: "7-day average", num: true, format: (v) => (v == null ? "—" : fmtNum(v, 0)) }], rows: [...daily].reverse() }),
  });
  lineChart(c1.plot, {
    x: daily.map((x) => x.day),
    series: [
      { name: "Daily", color: "var(--de-emphasis)", values: daily.map((x) => x.requests), emphasis: false },
      { name: "7-day average", color: "var(--series-1)", values: daily.map((x) => x.requests_7d_avg) },
    ],
    yFormat: (v) => compact(v), tipFormat: (v) => fmtInt(v), xTick: (i) => dayMonth(daily[i].day), title: (i) => longDate(daily[i].day),
    height: 300, ariaLabel: "Requests per day",
  });
  const c2 = card(rowD, { title: "Busiest agencies", sub: "Requests in the last 28 days", spanClass: "span-4",
    table: { columns: [{ key: "agency", label: "Agency", format: agencyName }, { key: "requests_28d", label: "Requests", num: true, format: fmtInt }], rows: d.agencies } });
  barChart(c2.plot, { items: d.agencies.slice(0, 8).map((a) => ({ label: agencyName(a.agency), value: a.requests_28d })), format: compact, valueName: "Requests", rowHeight: 34 });

  // mix
  const rowM = document.getElementById("row-mix");
  rowM.replaceChildren();
  const c3 = card(rowM, { title: "Top 10 complaint types", sub: "Requests by type", spanClass: "span-5",
    table: { columns: [{ key: "complaint_type", label: "Type", format: titleCase }, { key: "requests", label: "Total", num: true, format: fmtInt },
      { key: "brooklyn", label: "Brooklyn", num: true, format: fmtInt }, { key: "queens", label: "Queens", num: true, format: fmtInt },
      { key: "bronx", label: "Bronx", num: true, format: fmtInt }, { key: "manhattan", label: "Manhattan", num: true, format: fmtInt },
      { key: "staten_island", label: "Staten Is.", num: true, format: fmtInt }], rows: d.complaints } });
  barChart(c3.plot, {
    items: d.complaints.map((c) => ({ label: titleCase(c.complaint_type), value: c.requests, c })), format: compact, rowHeight: 34,
    tipRows: ({ c }) => [{ name: "Requests", value: fmtInt(c.requests) },
      ...["brooklyn", "queens", "bronx", "manhattan", "staten_island"].map((b) => ({ name: titleCase(b.replace("_", " ")), value: fmtInt(c[b]) }))],
  });
  const c4 = card(rowM, { title: "Agency performance", sub: "Close times on mature days; open means not yet closed", spanClass: "span-7" });
  renderTable(html("div", { class: "table-wrap" }, c4.plot), {
    columns: [
      { key: "agency", label: "Agency", format: agencyName },
      { key: "requests_28d", label: "Requests", num: true, format: fmtInt },
      { key: "closed_within_24h_rate", label: "Closed in 24 h", num: true, format: (v) => (v == null ? "—" : fmtPct(v, 0)) },
      { key: "median_hours_to_close", label: "Median hours", num: true, format: (v) => (v == null ? "—" : v < 0.05 ? "under 0.1" : fmtNum(v, 1)) },
      { key: "open_now", label: "Open now", num: true, format: fmtInt },
    ],
    rows: d.agencies.slice(0, 10),
  });

  // speed
  const rowS = document.getElementById("row-speed");
  rowS.replaceChildren();
  const mature = daily.filter((x) => x.closed_within_24h_rate != null);
  const c5 = card(rowS, { id: "speed", title: "Share of requests closed within 24 hours", sub: "By the day the request was opened", spanClass: "span-12",
    table: () => ({ columns: [{ key: "day", label: "Opened", format: longDate }, { key: "closed_within_24h_rate", label: "Closed in 24 h", num: true, format: (v) => fmtPct(v, 1) }],
      rows: [...mature].reverse() }) });
  lineChart(c5.plot, {
    x: mature.map((x) => x.day), series: [{ name: "Closed within 24 hours", color: "var(--series-1)", values: mature.map((x) => x.closed_within_24h_rate) }],
    yFormat: (v) => fmtPct(v, 0), tipFormat: (v) => fmtPct(v, 1), xTick: (i) => dayMonth(mature[i].day), title: (i) => `Opened ${longDate(mature[i].day)}`,
    height: 240, area: true, yMin: 0, endLabels: false, ariaLabel: "24-hour close rate by day",
  });
}
charts();

// the pipeline
const rowP = document.getElementById("row-pipeline");
const c6 = card(rowP, { title: "Run history", sub: "What each scheduled run fetched and how long it took", spanClass: "span-7" });
renderTable(html("div", { class: "table-wrap" }, c6.plot), {
  columns: [
    { key: "run_at", label: "Run (UTC)", format: (v) => `${dayMonth(v)}, ${v.slice(11, 16)}` },
    { key: "mode", label: "Mode" },
    { key: "rows_fetched", label: "Fetched", num: true, format: fmtInt },
    { key: "rows_new", label: "New", num: true, format: fmtInt },
    { key: "rows_updated", label: "Updated", num: true, format: fmtInt },
    { key: "rows_in_window", label: "In window", num: true, format: fmtInt },
    { key: "duration_s", label: "Seconds", num: true, format: (v) => fmtNum(v, 0) },
  ],
  rows: d.runs.slice(0, 10),
});
const c7 = card(rowP, { title: "Checks on this run", sub: "dbt tests and source freshness", spanClass: "span-5" });
const list = html("div", { class: "checks" }, c7.plot);
const NAMES = {
  unique_stg_nyc311__requests_unique_key: "Request IDs are unique (the upsert worked)",
  not_null_stg_nyc311__requests_unique_key: "Every row has a request ID",
  not_null_stg_nyc311__requests_created_at: "Every request has an opening time",
  assert_nyc311_window_is_complete: "80+ days in the window and no empty days",
  assert_nyc311_volume_is_normal: "Latest day's volume within 0.5 to 2 times the 28-day median",
  unique_mart_nyc311_daily_day: "One row per day in the daily table",
  not_null_mart_nyc311_daily_day: "No missing days in the daily table",
};
for (const t of d.tests) {
  const name = NAMES[t.name] || (t.name.startsWith("accepted_values") ? "Borough values are all known (warning only)" : t.name);
  const r = html("div", { class: "check" }, list);
  html("span", { class: `ic ${t.status === "pass" ? "pass" : t.status === "warn" ? "warn" : "fail"}` }, r).append(checkIcon(t.status === "pass"));
  html("span", {}, r, name);
}
if (d.freshness) {
  const r = html("div", { class: "check" }, list);
  const ok = d.freshness.status === "pass";
  html("span", { class: `ic ${ok ? "pass" : d.freshness.status === "warn" ? "warn" : "fail"}` }, r).append(checkIcon(ok));
  html("span", {}, r, `Source freshness: newest change ${fmtNum(d.freshness.age_hours, 1)} hours old (warning after 36 h, failure after 72 h)`);
}
const q = d.quality;
html("p", { class: "note" }, c7.card, `Data issues are reported, not hidden: ${fmtInt(q.impossible_close_dates)} requests closed before they were opened (left out of timing), ` +
  `${fmtInt(q.unspecified_borough)} with no borough, ${fmtInt(q.closed_without_close_date)} marked closed without a close time.`);

window.addEventListener("themechange", charts);
reveal();
