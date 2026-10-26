import { html, card, lineChart, barChart, heatmap, kpiStrip, compact, fmtInt, fmtPct, hideTip, renderTable } from "./charts.js";
import { checkIcon, proof, gbp, gbpExact, shortDate, longDate, monthLabel, deltaPct, deltaPts } from "./common.js";
import { shell, reveal } from "./shell.js";

const { params } = shell("retail");
await document.fonts.ready; // measure labels with the real font, not the fallback
const data = await (await fetch("../data/retail.json")).json();
let preset = params.get("period") || "13w";

// ---------- stamp + proof line (static per build) ----------
const dbt = data.dbt, rec = data.reconciliation;
const recPassed = rec.checks.filter((c) => c.match).length;
const stamp = document.getElementById("stamp");
stamp.append("Data through ");
html("b", {}, stamp, longDate(data.data_last_day));
html("br", {}, stamp);
stamp.append(`Rebuilt ${longDate(data.generated_at)}, ${data.generated_at.slice(11, 16)} UTC`);
const pl = document.getElementById("proofline");
proof(pl, `${dbt.tests_passed} of ${dbt.tests_total} dbt tests passed`, dbt.tests_passed === dbt.tests_total);
proof(pl, `${recPassed} of ${rec.checks.length} figures match a separate re-calculation to the penny`, rec.all_match);
proof(pl, `${fmtInt(data.source.rows)} source rows accounted for`, true);

function render() {
  document.querySelectorAll("#presets button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.preset === preset)));
  // sales are seasonal: compare with the same weeks a year earlier (for 52 weeks, that is the previous window)
  const cur = data.periods[preset].current, prev = data.periods[preset].last_year || data.periods[preset].previous;
  document.getElementById("window-note").textContent =
    `${longDate(cur.start_date)} to ${longDate(cur.end_date)}. Changes compare with the same weeks a year earlier, ${longDate(prev.start_date)} to ${longDate(prev.end_date)}.`;
  renderKpis(cur, prev);
  renderRevenue(cur);
  renderProducts();
}

// ---------- KPI strip ----------
function renderKpis(cur, prev) {
  const vs = "";
  kpiStrip(document.getElementById("kpis"), [
    { label: "Net revenue", value: gbp(cur.net_revenue), delta: deltaPct(cur.net_revenue, prev.net_revenue, true), vs, lead: true },
    { label: "Orders", value: fmtInt(cur.orders), delta: deltaPct(cur.orders, prev.orders, true), vs },
    { label: "Average order", value: gbpExact(cur.avg_order_value, 0), delta: deltaPct(cur.avg_order_value, prev.avg_order_value, true), vs },
    { label: "Active customers", value: fmtInt(cur.active_customers), delta: deltaPct(cur.active_customers, prev.active_customers, true), vs },
    prev.new_customers_reliable
      ? { label: "New customers", value: fmtInt(cur.new_customers), delta: deltaPct(cur.new_customers, prev.new_customers, true), vs }
      : { label: "New customers", value: fmtInt(cur.new_customers), note: "No earlier history to compare with" },
    { label: "Return rate", value: fmtPct(cur.return_rate, 1), delta: deltaPts(cur.return_rate, prev.return_rate, false), vs },
  ]);
}

// ---------- revenue ----------
function renderRevenue(cur) {
  const row = document.getElementById("row-revenue");
  row.replaceChildren();
  const weeks = data.weekly.filter((w) => w.is_complete_week);
  const thisYear = weeks.slice(-52), lastYear = weeks.slice(-104, -52);
  document.getElementById("rev-note").textContent = `The selected ${cur.weeks} weeks are shaded`;

  const { plot } = card(row, {
    title: "Net revenue by week", sub: "Last 52 weeks against the 52 weeks before, same week number", spanClass: "span-8",
    table: () => ({
      columns: [{ key: "w", label: "Week starting" }, { key: "a", label: "This year", num: true, format: gbpExact },
        { key: "b", label: "Year before", num: true, format: gbpExact }],
      rows: thisYear.map((w, i) => ({ w: longDate(w.week_start), a: w.net_revenue, b: lastYear[i]?.net_revenue })),
    }),
  });
  lineChart(plot, {
    x: thisYear.map((w) => w.week_start),
    series: [
      { name: "This year", color: "var(--series-1)", values: thisYear.map((w) => w.net_revenue) },
      { name: "Year before", color: "var(--de-emphasis)", values: lastYear.map((w) => w.net_revenue), emphasis: false },
    ],
    yFormat: (v) => compact(v, { prefix: "£" }), tipFormat: gbpExact,
    xTick: (i) => shortDate(thisYear[i].week_start),
    title: (i) => `Week of ${longDate(thisYear[i].week_start)} (vs ${longDate(lastYear[i].week_start)})`,
    height: 300, ariaLabel: "Weekly net revenue, this year and last year", band: { from: 52 - cur.weeks, to: 51 },
  });

  // share of gross sales by customer type: a 100% stacked bar with 2px seams, values in the table below it
  const sel = weeks.slice(-cur.weeks);
  const sum = (k) => sel.reduce((a, w) => a + w[k], 0);
  const parts = [
    { label: "Returning customers", value: sum("sales_returning_customers"), color: "var(--series-1)" },
    { label: "New customers", value: sum("sales_new_customers"), color: "var(--series-2)" },
    { label: "Guest checkout", value: sum("sales_guest"), color: "var(--series-3)" },
  ];
  const total = parts.reduce((a, p) => a + p.value, 0);
  const c2 = card(row, { title: "Who the sales come from", sub: "Share of gross sales in the selected period", spanClass: "span-4" });
  const bar = html("div", { style: "display:flex;gap:2px;height:14px;margin:6px 0 18px", role: "img",
    "aria-label": parts.map((p) => `${p.label} ${fmtPct(p.value / total, 0)}`).join(", ") }, c2.plot);
  parts.forEach((p, i) => {
    const seg = html("div", { style: `flex:${p.value} 1 0;background:${p.color};border-radius:${i === 0 ? "3px 0 0 3px" : i === parts.length - 1 ? "0 3px 3px 0" : "0"}` }, bar);
    seg.title = `${p.label}: ${fmtPct(p.value / total, 1)}`;
  });
  const t = html("table", { class: "data" }, html("div", { class: "table-wrap" }, c2.plot));
  const tb = html("tbody", {}, t);
  for (const p of parts) {
    const tr = html("tr", {}, tb);
    const name = html("td", {}, tr);
    const sw = html("i", { style: `display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:8px;background:${p.color}` }, name);
    sw.setAttribute("aria-hidden", "true");
    name.append(p.label);
    html("td", { class: "num" }, tr, gbp(p.value));
    html("strong", {}, html("td", { class: "num" }, tr), fmtPct(p.value / total, 0));
  }
  html("p", { class: "note" }, c2.card,
    `Returning customers bought ${fmtPct(parts[0].value / total, 0)} of everything sold. "New" means a first-ever order in that week.`);
}

// ---------- products + countries ----------
function renderProducts() {
  const row = document.getElementById("row-products");
  row.replaceChildren();
  const prods = data.products[preset];
  const p = card(row, {
    title: "Top 10 products", sub: "By net revenue", spanClass: "span-6",
    table: { columns: [{ key: "name", label: "Product" }, { key: "stock_code", label: "Code" },
      { key: "units", label: "Units", num: true, format: fmtInt }, { key: "net_revenue", label: "Net revenue", num: true, format: gbpExact },
      { key: "prev_net_revenue", label: "A year earlier", num: true, format: gbpExact }], rows: prods },
  });
  barChart(p.plot, {
    items: prods.map((d) => ({ label: d.name, value: d.net_revenue, d })), format: (v) => compact(v, { prefix: "£" }),
    tipRows: ({ d }) => [
      { name: "Net revenue", value: gbpExact(d.net_revenue) },
      { name: "Units sold", value: fmtInt(d.units) },
      { name: "Orders", value: fmtInt(d.orders) },
      { name: "vs a year earlier", value: d.prev_net_revenue ? deltaPct(d.net_revenue, d.prev_net_revenue, true).text : "new" },
    ],
  });

  const all = data.countries[preset];
  const uk = all.find((c) => c.country === "United Kingdom");
  const totalNet = all.reduce((a, c) => a + c.net_revenue, 0);
  const intl = all.filter((c) => c.country !== "United Kingdom").slice(0, 10);
  const c = card(row, {
    title: "Top 10 markets outside the UK",
    sub: `The UK is ${gbp(uk.net_revenue)}, ${fmtPct(uk.net_revenue / totalNet, 0)} of net revenue, so it is left out to keep the rest readable`,
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

// ---------- customers (not period-dependent) ----------
function renderCustomers() {
  const row = document.getElementById("row-customers");
  row.replaceChildren();
  const cohorts = data.cohorts;
  const months = [...new Set(cohorts.map((c) => c.cohort_month))];
  const maxOffset = 12;
  const lookup = new Map(cohorts.map((c) => [`${c.cohort_month}|${c.month_offset}`, c]));
  const sizes = new Map(cohorts.filter((c) => c.month_offset === 0).map((c) => [c.cohort_month, c.cohort_size]));
  const h = card(row, {
    id: "cohorts",
    title: "Customer retention by first-purchase month",
    sub: "Share of each month's new customers who ordered again 1 to 12 months later. December 2009 also holds customers who bought before the data starts.",
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
    format: (v) => fmtPct(v, 0), lowLabel: "Fewer returned", highLabel: "More returned",
    cellTitle: (r, c) => `${monthLabel(months[r])} customers, ${c + 1} month${c ? "s" : ""} later`,
    tipRows: (r, c) => {
      const d = lookup.get(`${months[r]}|${c + 1}`);
      return [{ name: "Ordered again", value: fmtPct(d.retention, 1) }, { name: "Customers", value: `${fmtInt(d.active_customers)} of ${fmtInt(d.cohort_size)}` }];
    },
    cellH: 24, ariaLabel: "Cohort retention heatmap",
  });

  const seg = card(row, { title: "Customer segments", sub: `By recency and number of orders, as of ${longDate(data.data_last_day)}`, spanClass: "span-7" });
  const t = html("table", { class: "data" }, html("div", { class: "table-wrap" }, seg.plot));
  const hr = html("tr", {}, html("thead", {}, t));
  [["Segment", ""], ["Customers", "num"], ["Share of customers / revenue", ""], ["Per customer", "num"], ["Median days since last order", "num"]]
    .forEach(([h2, cls]) => html("th", { class: cls }, hr, h2));
  const tb = html("tbody", {}, t);
  const maxShare = Math.max(...data.rfm.flatMap((s) => [s.customer_share, s.revenue_share]));
  for (const s of data.rfm) {
    const tr = html("tr", {}, tb);
    html("strong", {}, html("td", {}, tr), s.segment);
    html("td", { class: "num" }, tr, fmtInt(s.customers));
    const cell = html("td", { style: "min-width:150px" }, tr);
    cell.append(shareBar(s.customer_share, maxShare, "var(--de-emphasis)", "customers"), shareBar(s.revenue_share, maxShare, "var(--series-1)", "revenue"));
    html("td", { class: "num" }, tr, gbpExact(s.revenue_per_customer, 0));
    html("td", { class: "num" }, tr, fmtInt(s.median_recency_days));
  }
  const lg = html("div", { class: "legend", style: "margin:14px 0 0" }, seg.card);
  for (const [name, color] of [["Share of customers", "var(--de-emphasis)"], ["Share of revenue", "var(--series-1)"]]) {
    const sp = html("span", {}, lg); const i = html("i", {}, sp); i.style.background = color; html("span", {}, sp, name);
  }

  const rules = card(row, { title: "How the segments are defined", sub: "Fixed thresholds, so every customer's segment can be explained", spanClass: "span-5" });
  renderTable(html("div", { class: "table-wrap" }, rules.plot), {
    columns: [{ key: "s", label: "Segment" }, { key: "r", label: "Rule" }],
    rows: [
      { s: "Champions", r: "Ordered in the last 90 days, 5 or more orders" },
      { s: "Loyal", r: "Ordered in the last 180 days, 3 or more orders" },
      { s: "Recent, low frequency", r: "Ordered in the last 90 days, 1 or 2 orders" },
      { s: "Needs attention", r: "Last order 91 to 180 days ago, 1 or 2 orders" },
      { s: "At risk", r: "No order for 180+ days, 3 or more orders" },
      { s: "Hibernating", r: "No order for 180+ days, 1 or 2 orders" },
    ],
  });
}
function shareBar(v, max, color, what) {
  const row = html("div", { style: "display:flex;align-items:center;gap:8px;margin:3px 0" });
  const track = html("div", { style: "flex:1;max-width:140px;height:8px;position:relative", "aria-hidden": "true" }, row);
  html("div", { style: `position:absolute;left:0;top:0;height:8px;border-radius:0 3px 3px 0;width:${(v / max) * 100}%;background:${color}` }, track);
  html("span", { style: "min-width:36px;text-align:right;color:var(--text-primary);font-weight:600;font-size:13px;font-variant-numeric:tabular-nums" }, row, fmtPct(v, 0));
  row.title = `${fmtPct(v, 1)} of ${what}`;
  return row;
}

// ---------- data quality ----------
function renderQuality() {
  const row = document.getElementById("row-quality");
  row.replaceChildren();
  const LABEL = {
    included: "Clean sales and return lines (behind every number above)",
    overlap_copy: "Copies: 1–9 Dec 2010 is in both yearly sheets",
    exact_duplicate: "The same line repeated (invoice, product, quantity, price and minute)",
    non_product: "Not product sales: postage, fees, adjustments, discounts, samples, vouchers",
    zero_or_negative_price: "Zero or negative price (stock write-offs and corrections)",
    quantity_sign_mismatch: "Quantity sign contradicts the invoice type",
    zero_quantity: "Zero quantity",
  };
  const byOutcome = {};
  for (const r of data.quality) {
    const o = byOutcome[r.outcome] ||= { rows: 0, amount: 0 };
    o.rows += r.source_rows; o.amount += r.amount;
  }
  const total = Object.values(byOutcome).reduce((a, r) => a + r.rows, 0);
  const order = ["included", "overlap_copy", "exact_duplicate", "non_product", "zero_or_negative_price", "quantity_sign_mismatch", "zero_quantity"];
  const c = card(row, { title: "Where every source row went", sub: `${fmtInt(total)} rows in the source workbook, all accounted for`, spanClass: "span-7" });
  renderTable(html("div", { class: "table-wrap" }, c.plot), {
    columns: [{ key: "label", label: "Outcome" }, { key: "rows", label: "Rows", num: true, format: fmtInt },
      { key: "share", label: "Share", num: true, format: (v) => fmtPct(v, 1) }, { key: "amount", label: "Quantity × price", num: true, format: gbpExact }],
    rows: order.filter((o) => byOutcome[o]).map((o) => ({ label: LABEL[o] || o, rows: byOutcome[o].rows, share: byOutcome[o].rows / total, amount: byOutcome[o].amount })),
  });
  const np = data.quality.filter((r) => r.outcome === "non_product").sort((a, b) => b.source_rows - a.source_rows);
  html("p", { class: "note" }, c.card, "Non-product lines by type: " + np.map((r) => `${r.non_product_category.replace("_", " ")} ${fmtInt(r.source_rows)}`).join(", ") + ".");

  const k = card(row, { title: "Checks on every run", sub: "If any of these fails, the page is not published", spanClass: "span-5" });
  const list = html("div", { class: "checks" }, k.plot);
  const named = {
    assert_retail_no_rows_lost: "No source row lost or counted twice",
    assert_retail_sheet_overlap_is_identical: "Dropped overlap rows exist, identically, in the other sheet",
    assert_retail_quality_ties_to_raw: "Row counts and £ values tie back to the raw file",
    assert_retail_sign_rules: "Sales positive, returns negative, every price above zero",
    assert_retail_weekly_ties_to_lines: "Weekly totals add up to the line items to the penny",
    assert_retail_weekly_has_no_gaps: "One row for every week, including weeks with no sales",
    assert_retail_cohort_month0_is_full: "Cohort arithmetic check (month 0 is 100%)",
  };
  for (const tst of dbt.tests.filter((x) => named[x.name])) checkRow(list, tst.status === "pass", named[tst.name]);
  const generic = dbt.tests.filter((x) => !named[x.name]);
  checkRow(list, generic.every((x) => x.status === "pass"), `${generic.filter((x) => x.status === "pass").length} of ${generic.length} schema tests: unique keys, no nulls, valid values, valid product references`);
  checkRow(list, rec.all_match, `A separate pandas re-calculation matches the warehouse on ${recPassed} of ${rec.checks.length} figures, to the penny`);
}
function checkRow(list, ok, text) {
  const r = html("div", { class: "check" }, list);
  html("span", { class: `ic ${ok ? "pass" : "fail"}` }, r).append(checkIcon(ok));
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
window.addEventListener("themechange", () => { render(); renderCustomers(); });
render();
renderCustomers();
renderQuality();
reveal();
