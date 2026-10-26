import {
  html, card, lineChart, barChart, heatmap, statTile, compact, fmtInt, fmtPct, initTheme, showTip, hideTip, renderTable,
} from "./charts.js";
import { checkIcon, chip, gbp, gbpExact, shortDate, longDate, monthLabel, deltaPct, deltaPts } from "./common.js";

initTheme(document.getElementById("theme"));
await document.fonts.ready; // measure labels with the real font, not the fallback
const data = await (await fetch("../data/retail.json")).json();
const PRESET_LABEL = { "4w": "previous 4 weeks", "13w": "previous 13 weeks", "52w": "previous 52 weeks" };
let preset = new URLSearchParams(location.search).get("period") || "13w";

// ---------- static header chips ----------
const chips = document.getElementById("chips");
const dbt = data.dbt, rec = data.reconciliation;
const recPassed = rec.checks.filter((c) => c.match).length;
chip(chips, `${dbt.tests_passed}/${dbt.tests_total} dbt tests passed`, dbt.tests_passed === dbt.tests_total ? "" : "bad");
chip(chips, `${recPassed}/${rec.checks.length} reconciliation checks match to the penny`, rec.all_match ? "" : "bad");
chip(chips, `Data through ${longDate(data.data_last_day)}`, null);
chip(chips, `Pipeline run ${longDate(data.generated_at.slice(0, 10))}`, null);

function render() {
  document.querySelectorAll("#presets button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.preset === preset)));
  const cur = data.periods[preset].current, prev = data.periods[preset].previous;
  document.getElementById("window-note").textContent =
    `${longDate(cur.start_date)} – ${longDate(cur.end_date)} · compared with the ${PRESET_LABEL[preset]} · weeks run Monday–Sunday`;
  renderKpis(cur, prev);
  renderRevenue(cur);
  renderProducts(cur);
  renderCustomers();
  renderQuality();
}

// ---------- KPI tiles ----------
function weeklyValues(key, n) {
  const complete = data.weekly.filter((w) => w.is_complete_week);
  return complete.slice(-n).map((w) => w[key]);
}
function renderKpis(cur, prev) {
  const el = document.getElementById("kpis");
  el.replaceChildren();
  const vs = ` vs ${PRESET_LABEL[preset]}`;
  const sparkN = Math.max(cur.weeks, 8);
  const tiles = [
    { label: "Net revenue", value: gbp(cur.net_revenue), delta: deltaPct(cur.net_revenue, prev.net_revenue, true), spark: weeklyValues("net_revenue", sparkN) },
    { label: "Orders", value: fmtInt(cur.orders), delta: deltaPct(cur.orders, prev.orders, true), spark: weeklyValues("orders", sparkN) },
    { label: "Average order value", value: gbpExact(cur.avg_order_value, 0), delta: deltaPct(cur.avg_order_value, prev.avg_order_value, true),
      spark: data.weekly.filter((w) => w.is_complete_week).slice(-sparkN).map((w) => w.gross_sales / w.orders) },
    { label: "Active customers", value: fmtInt(cur.active_customers), delta: deltaPct(cur.active_customers, prev.active_customers, true), spark: weeklyValues("active_customers", sparkN) },
    { label: "New customers", value: fmtInt(cur.new_customers),
      delta: prev.new_customers_reliable ? deltaPct(cur.new_customers, prev.new_customers, true) : { text: "No comparison", good: null },
      vsOverride: prev.new_customers_reliable ? null : " (no history before Dec 2009)", spark: weeklyValues("new_customers", sparkN) },
    { label: "Return rate", value: fmtPct(cur.return_rate, 1), delta: deltaPts(cur.return_rate, prev.return_rate, false),
      spark: data.weekly.filter((w) => w.is_complete_week).slice(-sparkN).map((w) => w.returns / w.gross_sales) },
  ];
  tiles.forEach((t) => statTile(el, { ...t, vs: t.vsOverride ?? vs }));
}

// ---------- revenue row ----------
function renderRevenue(cur) {
  const row = document.getElementById("row-revenue");
  row.replaceChildren();
  const weeks = data.weekly.filter((w) => w.is_complete_week);
  const thisYear = weeks.slice(-52), lastYear = weeks.slice(-104, -52);
  document.getElementById("rev-note").textContent = `Selected period shaded · ${fmtInt(weeks.length)} complete weeks of history`;

  const { plot } = card(row, {
    title: "Net revenue by week", sub: "Last 52 weeks vs the 52 weeks before, same week number", spanClass: "span-8",
    table: () => ({
      columns: [{ key: "w", label: "Week starting" }, { key: "a", label: "This year", num: true, format: gbpExact },
        { key: "b", label: "Year before", num: true, format: gbpExact }],
      rows: thisYear.map((w, i) => ({ w: longDate(w.week_start), a: w.net_revenue, b: lastYear[i]?.net_revenue })),
    }),
  });
  const shadeFrom = 52 - cur.weeks;
  lineChart(plot, {
    x: thisYear.map((w) => w.week_start),
    series: [
      { name: "This year", color: "var(--series-1)", values: thisYear.map((w) => w.net_revenue) },
      { name: "Year before", color: "var(--de-emphasis)", values: lastYear.map((w) => w.net_revenue), emphasis: false },
    ],
    yFormat: (v) => compact(v, { prefix: "£" }), tipFormat: gbpExact,
    xTick: (i) => shortDate(thisYear[i].week_start),
    title: (i) => `Week of ${longDate(thisYear[i].week_start)} (vs ${longDate(lastYear[i].week_start)})`,
    height: 280, ariaLabel: "Weekly net revenue, this year and last year",
    band: { from: shadeFrom, to: 51 },
  });

  // where the sales come from
  const sel = weeks.slice(-cur.weeks);
  const sum = (k) => sel.reduce((a, w) => a + w[k], 0);
  const parts = [
    { label: "Returning customers", value: sum("sales_returning_customers") },
    { label: "New customers", value: sum("sales_new_customers") },
    { label: "Guest checkout", value: sum("sales_guest") },
  ];
  const total = parts.reduce((a, p) => a + p.value, 0);
  const c2 = card(row, {
    title: "Who the sales come from", sub: "Gross sales in the selected period", spanClass: "span-4",
    table: { columns: [{ key: "label", label: "Customer type" }, { key: "value", label: "Gross sales", num: true, format: gbpExact },
      { key: "share", label: "Share", num: true, format: (v) => fmtPct(v, 1) }], rows: parts.map((p) => ({ ...p, share: p.value / total })) },
  });
  barChart(c2.plot, {
    items: parts, rowHeight: 44, format: (v) => `${fmtPct(v / total, 0)}`, valueName: "Share",
    tipRows: (d) => [{ name: "Gross sales", value: gbpExact(d.value) }, { name: "Share", value: fmtPct(d.value / total, 1) }],
  });
  const n = html("p", { class: "small muted", style: "margin:12px 0 0" }, c2.card);
  n.textContent = `Returning customers bought ${fmtPct(parts[0].value / total, 0)} of everything sold. "New" means a first-ever order in that week.`;
}

// ---------- products + countries ----------
function renderProducts(cur) {
  const row = document.getElementById("row-products");
  row.replaceChildren();
  const prods = data.products[preset];
  const p = card(row, {
    title: "Top 10 products", sub: "By net revenue", spanClass: "span-6",
    table: { columns: [{ key: "name", label: "Product" }, { key: "stock_code", label: "Code" },
      { key: "units", label: "Units", num: true, format: fmtInt }, { key: "net_revenue", label: "Net revenue", num: true, format: gbpExact },
      { key: "prev_net_revenue", label: "Previous period", num: true, format: gbpExact }], rows: prods },
  });
  barChart(p.plot, {
    items: prods.map((d) => ({ label: d.name, value: d.net_revenue, d })), format: (v) => compact(v, { prefix: "£" }),
    tipRows: ({ d }) => [
      { name: "Net revenue", value: gbpExact(d.net_revenue) },
      { name: "Units sold", value: fmtInt(d.units) },
      { name: "Orders", value: fmtInt(d.orders) },
      { name: `vs ${PRESET_LABEL[preset]}`, value: d.prev_net_revenue ? deltaPct(d.net_revenue, d.prev_net_revenue, true).text : "new" },
    ],
  });

  const all = data.countries[preset];
  const uk = all.find((c) => c.country === "United Kingdom");
  const totalNet = all.reduce((a, c) => a + c.net_revenue, 0);
  const intl = all.filter((c) => c.country !== "United Kingdom").slice(0, 10);
  const c = card(row, {
    title: "Top 10 markets outside the UK", sub: `UK: ${gbp(uk.net_revenue)}, ${fmtPct(uk.net_revenue / totalNet, 0)} of net revenue (left out so the rest stay readable)`,
    spanClass: "span-6",
    table: { columns: [{ key: "country", label: "Country" }, { key: "region", label: "Region" },
      { key: "customers", label: "Customers", num: true, format: fmtInt }, { key: "orders", label: "Orders", num: true, format: fmtInt },
      { key: "net_revenue", label: "Net revenue", num: true, format: gbpExact }], rows: all },
  });
  barChart(c.plot, {
    items: intl.map((d) => ({ label: d.country, value: d.net_revenue, d })), format: (v) => compact(v, { prefix: "£" }),
    tipRows: ({ d }) => [
      { name: "Net revenue", value: gbpExact(d.net_revenue) },
      { name: "Share of total", value: fmtPct(d.net_revenue / totalNet, 1) },
      { name: "Orders", value: fmtInt(d.orders) },
      { name: "Customers", value: fmtInt(d.customers) },
    ],
  });
}

// ---------- customers ----------
function renderCustomers() {
  const row = document.getElementById("row-customers");
  if (row.childElementCount) return; // not period-dependent
  const cohorts = data.cohorts;
  const months = [...new Set(cohorts.map((c) => c.cohort_month))];
  const maxOffset = 12;
  const lookup = new Map(cohorts.map((c) => [`${c.cohort_month}|${c.month_offset}`, c]));
  const sizes = new Map(cohorts.filter((c) => c.month_offset === 0).map((c) => [c.cohort_month, c.cohort_size]));
  const h = card(row, {
    title: "Customer retention by first-purchase month",
    sub: "Share of each month's new customers who ordered again 1–12 months later. December 2009 includes customers who bought before the data starts.",
    spanClass: "span-12",
    table: () => ({
      columns: [{ key: "m", label: "First purchase" }, { key: "n", label: "Customers", num: true, format: fmtInt },
        ...Array.from({ length: maxOffset }, (_, k) => ({ key: `o${k + 1}`, label: `M${k + 1}`, num: true, format: (v) => (v == null ? "—" : fmtPct(v, 0)) }))],
      rows: months.map((m) => {
        const r = { m: monthLabel(m), n: sizes.get(m) };
        for (let k = 1; k <= maxOffset; k++) r[`o${k}`] = lookup.get(`${m}|${k}`)?.retention ?? null;
        return r;
      }),
    }),
  });
  heatmap(h.plot, {
    rows: months.map((m) => `${monthLabel(m)} · ${fmtInt(sizes.get(m))}`),
    cols: Array.from({ length: maxOffset }, (_, k) => `M${k + 1}`),
    value: (r, c) => lookup.get(`${months[r]}|${c + 1}`)?.retention ?? null,
    format: (v) => fmtPct(v, 0), lowLabel: "0%", highLabel: "Higher retention",
    cellTitle: (r, c) => `${monthLabel(months[r])} customers, ${c + 1} month${c ? "s" : ""} later`,
    tipRows: (r, c) => {
      const d = lookup.get(`${months[r]}|${c + 1}`);
      return [{ name: "Ordered again", value: fmtPct(d.retention, 1) }, { name: "Customers", value: `${fmtInt(d.active_customers)} of ${fmtInt(d.cohort_size)}` }];
    },
    cellH: 24, ariaLabel: "Cohort retention heatmap",
  });

  // RFM segments as a compact table with inline share bars
  const seg = card(row, { title: "Customer segments", sub: `Recency and frequency as of ${longDate(data.data_last_day)}`, spanClass: "span-7" });
  const wrap = html("div", { class: "table-wrap" }, seg.card);
  seg.plot.remove();
  const t = html("table", { class: "data rfm" }, wrap);
  const hr = html("tr", {}, html("thead", {}, t));
  ["Segment", "Customers", "Share of customers vs share of revenue", "Revenue per customer", "Median days since last order"].forEach((h2, i) =>
    html("th", { class: i === 0 || i === 2 ? "" : "num" }, hr, h2));
  const tb = html("tbody", {}, t);
  const maxShare = Math.max(...data.rfm.flatMap((s) => [s.customer_share, s.revenue_share]));
  for (const s of data.rfm) {
    const tr = html("tr", {}, tb);
    html("strong", {}, html("td", {}, tr), s.segment);
    html("td", { class: "num" }, tr, fmtInt(s.customers));
    const cell = html("td", {}, tr);
    cell.append(shareBar(s.customer_share, maxShare, "var(--de-emphasis)", "customers"), shareBar(s.revenue_share, maxShare, "var(--series-1)", "revenue"));
    html("td", { class: "num" }, tr, gbpExact(s.revenue_per_customer, 0));
    html("td", { class: "num" }, tr, fmtInt(s.median_recency_days));
  }
  const legendP = html("div", { class: "legend", style: "margin-top:12px" }, seg.card);
  for (const [name, color] of [["Share of customers", "var(--de-emphasis)"], ["Share of revenue", "var(--series-1)"]]) {
    const s = html("span", {}, legendP); const i = html("i", {}, s); i.style.background = color; html("span", {}, s, name);
  }

  const rules = card(row, { title: "How segments are defined", sub: "Fixed thresholds, so every customer's segment can be explained", spanClass: "span-5" });
  rules.plot.remove();
  renderTable(html("div", { class: "table-wrap" }, rules.card), {
    columns: [{ key: "s", label: "Segment" }, { key: "r", label: "Rule" }],
    rows: [
      { s: "Champions", r: "Ordered in the last 90 days, 5+ orders" },
      { s: "Loyal", r: "Ordered in the last 180 days, 3+ orders" },
      { s: "Recent, low frequency", r: "Ordered in the last 90 days, 1–2 orders" },
      { s: "Needs attention", r: "Last order 91–180 days ago, 1–2 orders" },
      { s: "At risk", r: "No order for 180+ days, 3+ orders" },
      { s: "Hibernating", r: "No order for 180+ days, 1–2 orders" },
    ],
  });
}
function shareBar(v, max, color, what) {
  const row = html("div", { style: "display:flex;align-items:center;gap:8px;margin:2px 0" });
  const track = html("div", { style: "flex:1;min-width:60px;max-width:150px;height:8px;position:relative" }, row);
  const bar = html("div", { style: `position:absolute;left:0;top:0;height:8px;border-radius:0 4px 4px 0;width:${(v / max) * 100}%;background:${color}` }, track);
  bar.setAttribute("aria-hidden", "true");
  html("span", { style: "min-width:40px;text-align:right;color:var(--text-primary);font-weight:600;font-size:12px" }, row, fmtPct(v, 0));
  row.title = `${fmtPct(v, 1)} of ${what}`;
  return row;
}

// ---------- quality ----------
function renderQuality() {
  const row = document.getElementById("row-quality");
  if (row.childElementCount) return;
  const q = data.quality;
  const LABEL = {
    included: "Clean sales and returns lines (used for every number above)",
    overlap_copy: "Copies: 1–9 Dec 2010 appears in both yearly sheets",
    exact_duplicate: "Exact repeats of the same line (same invoice, product, quantity, price, minute)",
    non_product: "Not product sales: postage, fees, adjustments, discounts, samples, vouchers",
    zero_or_negative_price: "Zero or negative price (stock write-offs, corrections)",
    quantity_sign_mismatch: "Quantity sign contradicts the invoice type",
    zero_quantity: "Zero quantity",
  };
  const byOutcome = {};
  for (const r of q) {
    const o = byOutcome[r.outcome] ||= { outcome: r.outcome, rows: 0, amount: 0 };
    o.rows += r.source_rows; o.amount += r.amount;
  }
  const total = Object.values(byOutcome).reduce((a, r) => a + r.rows, 0);
  const order = ["included", "overlap_copy", "exact_duplicate", "non_product", "zero_or_negative_price", "quantity_sign_mismatch", "zero_quantity"];
  const c = card(row, { title: "Where every source row went", sub: `${fmtInt(total)} rows in the source workbook, accounted for exactly`, spanClass: "span-7" });
  c.plot.remove();
  renderTable(html("div", { class: "table-wrap" }, c.card), {
    columns: [{ key: "label", label: "Outcome" }, { key: "rows", label: "Rows", num: true, format: fmtInt },
      { key: "share", label: "Share", num: true, format: (v) => fmtPct(v, 1) }, { key: "amount", label: "Value (qty × price)", num: true, format: gbpExact }],
    rows: order.filter((o) => byOutcome[o]).map((o) => ({ label: LABEL[o] || o, rows: byOutcome[o].rows, share: byOutcome[o].rows / total, amount: byOutcome[o].amount })),
  });
  const np = q.filter((r) => r.outcome === "non_product");
  const npLine = html("p", { class: "small muted", style: "margin:12px 0 0" }, c.card);
  npLine.textContent = "Non-product lines by type: " + np.sort((a, b) => b.source_rows - a.source_rows)
    .map((r) => `${r.non_product_category.replace("_", " ")} ${fmtInt(r.source_rows)}`).join(" · ");

  const k = card(row, { title: "Checks on every run", sub: "If any check fails, the page is not published", spanClass: "span-5" });
  k.plot.remove();
  const list = html("div", { class: "checks" }, k.card);
  const named = {
    assert_retail_no_rows_lost: "No source row lost or double-counted",
    assert_retail_sheet_overlap_is_identical: "Dropped overlap rows exist, identically, in the other sheet",
    assert_retail_quality_ties_to_raw: "Row counts and £ values tie back to the raw file",
    assert_retail_sign_rules: "Sales positive, returns negative, prices above zero",
    assert_retail_weekly_ties_to_lines: "Weekly totals add up to the line items to the penny",
    assert_retail_cohort_month0_is_full: "Cohort maths sanity check (month 0 = 100%)",
  };
  for (const tst of dbt.tests.filter((x) => named[x.name])) checkRow(list, tst.status === "pass", named[tst.name]);
  const generic = dbt.tests.filter((x) => !named[x.name]);
  checkRow(list, generic.every((x) => x.status === "pass"), `${generic.filter((x) => x.status === "pass").length}/${generic.length} schema tests: unique keys, no nulls, valid values, valid product references`);
  checkRow(list, rec.all_match, `Independent re-calculation in pandas matches the warehouse on ${recPassed}/${rec.checks.length} figures, to the penny`);
}
function checkRow(list, ok, text) {
  const r = html("div", { class: "check" }, list);
  const ic = html("span", { class: `ic ${ok ? "pass" : "fail"}` }, r);
  ic.append(checkIcon(ok));
  html("span", {}, r, text);
}

document.getElementById("presets").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-preset]");
  if (!b) return;
  preset = b.dataset.preset;
  const u = new URL(location.href); u.searchParams.set("period", preset); history.replaceState(null, "", u);
  hideTip();
  render();
});
window.addEventListener("themechange", () => { document.getElementById("row-customers").replaceChildren(); render(); });
render();
void showTip;
