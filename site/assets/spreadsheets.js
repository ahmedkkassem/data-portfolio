import { html, barChart, fmtInt, initTheme, renderTable } from "./charts.js";
import { chip, checkIcon, gbpExact } from "./common.js";

initTheme(document.getElementById("theme"));
await document.fonts.ready; // measure labels with the real font, not the fallback
const [before, report, recon] = await Promise.all([
  fetch("../data/spreadsheets_before.json").then((r) => r.json()),
  fetch("../data/spreadsheets_report.json").then((r) => r.json()),
  fetch("../data/spreadsheets_recon.json").then((r) => r.json()),
]);

const chips = document.getElementById("chips");
chip(chips, recon.exact ? "Rebuild matches the source line for line" : "Rebuild does NOT match the source", recon.exact ? "" : "bad");
chip(chips, `${recon.tests_passed}/${recon.tests_total} dbt tests passed`, recon.tests_passed === recon.tests_total ? "" : "bad");
chip(chips, `${fmtInt(before.source_lines)} real lines from ${before.month}`, null);

// file cards
const files = document.getElementById("files");
for (const f of before.files) {
  const c = html("div", { class: "card file-card" }, files);
  html("div", { class: "fname" }, c, f.name);
  html("div", { class: "fmeta" }, c, `${f.team} · ${f.format} · ${fmtInt(f.rows_in_file)} rows · ${(f.bytes / 1024 / 1024).toFixed(1)} MB`);
  const issues = [...new Set(f.sample.map((s) => s.issue).filter(Boolean))];
  const ul = html("ul", { class: "small", style: "margin:10px 0 0;padding-left:18px;color:var(--text-secondary)" }, c);
  issues.forEach((i) => html("li", {}, ul, i));
  html("a", { class: "dl", href: `./files/${encodeURIComponent(f.name)}`, download: "" }, c, "Download ↓");
}

// sheet preview with tabs
const tabs = document.getElementById("tabs"), sheet = document.getElementById("sheet");
function showSheet(k) {
  [...tabs.children].forEach((b, i) => b.setAttribute("aria-selected", String(i === k)));
  sheet.replaceChildren();
  const f = before.files[k];
  const width = Math.max(...f.sample.map((r) => r.values.length));
  const t = html("table", {}, sheet);
  const hr = html("tr", {}, html("thead", {}, t));
  html("th", {}, hr, "");
  for (let j = 0; j < width; j++) html("th", {}, hr, String.fromCharCode(65 + j));
  html("th", {}, hr, "What's wrong");
  const tb = html("tbody", {}, t);
  let last = 0;
  for (const r of f.sample) {
    if (r.row > last + 1) {
      const gap = html("tr", {}, tb);
      html("td", { class: "rn" }, gap, "⋮");
      html("td", { colspan: width + 1, style: "color:var(--text-muted)" }, gap, `${fmtInt(r.row - last - 1)} rows`);
    }
    const tr = html("tr", { class: r.issue ? "flag" : "" }, tb);
    html("td", { class: "rn" }, tr, String(r.row));
    for (let j = 0; j < width; j++) html("td", {}, tr, r.values[j] ?? "");
    html("td", { class: "why" }, tr, r.issue || "");
    last = r.row;
  }
}
before.files.forEach((f, k) => {
  const b = html("button", { type: "button", role: "tab" }, tabs, f.team);
  b.addEventListener("click", () => showSheet(k));
});
showSheet(0);

// fixes
const fx = document.getElementById("fixes");
const head = html("div", { class: "card-head" }, fx);
const hl = html("div", {}, head);
html("h3", {}, hl, "Repairs made");
html("div", { class: "sub" }, hl, "Counted by the pipeline as it cleaned");
const fxPlot = html("div", { class: "viz" }, fx);
barChart(fxPlot, {
  items: report.fixes.filter((f) => f.count > 0).map((f) => ({ label: f.fix, value: f.count })),
  format: fmtInt, valueName: "Repairs", rowHeight: 28,
});

const pf = document.getElementById("perfile");
const ph = html("div", { class: "card-head" }, pf);
const pl = html("div", {}, ph);
html("h3", {}, pl, "Per file");
html("div", { class: "sub" }, pl, "Rows in the file vs clean lines out");
renderTable(html("div", { class: "table-wrap" }, pf), {
  columns: [
    { key: "region", label: "Team" },
    { key: "rows_in_file", label: "Rows in file", num: true, format: fmtInt },
    { key: "duplicates_removed", label: "Duplicates", num: true, format: fmtInt },
    { key: "clean_lines", label: "Clean lines", num: true, format: fmtInt },
  ],
  rows: report.files,
});

// proof
const proof = document.getElementById("proof");
const totalSource = recon.rows.reduce((a, r) => a + r.source_lines, 0);
const totalRebuilt = recon.rows.reduce((a, r) => a + r.rebuilt_lines, 0);
const netSource = recon.rows.reduce((a, r) => a + r.source_net_revenue, 0);
const netRebuilt = recon.rows.reduce((a, r) => a + r.rebuilt_net_revenue, 0);
for (const p of [
  { l: "Lines", a: fmtInt(totalSource), b: fmtInt(totalRebuilt), ok: totalSource === totalRebuilt },
  { l: "Net revenue", a: gbpExact(netSource), b: gbpExact(netRebuilt), ok: recon.rows.every((r) => r.matches) },
  { l: "Lines that differ in any field", a: "0 expected", b: fmtInt(recon.mismatched_lines), ok: recon.mismatched_lines === 0 },
]) {
  const c = html("div", { class: "card tile" }, proof);
  html("div", { class: "label" }, c, p.l);
  html("div", { class: "value" }, c, p.b);
  const d = html("div", { class: `delta ${p.ok ? "good" : "bad"}` }, c);
  const ic = html("span", { style: "display:inline-flex;width:14px;height:14px" }, d);
  ic.append(checkIcon(p.ok));
  html("span", {}, d, p.ok ? `matches the source (${p.a})` : `source: ${p.a}`);
}
const rc = document.getElementById("recon");
const rh = html("div", { class: "card-head" }, rc);
const rl = html("div", {}, rh);
html("h3", {}, rl, "Reconciliation by team");
html("div", { class: "sub" }, rl, "Source = the real lines; rebuilt = what the pipeline produced from the messy files");
renderTable(html("div", { class: "table-wrap" }, rc), {
  columns: [
    { key: "region", label: "Team" },
    { key: "source_lines", label: "Source lines", num: true, format: fmtInt },
    { key: "rebuilt_lines", label: "Rebuilt lines", num: true, format: fmtInt },
    { key: "source_net_revenue", label: "Source net revenue", num: true, format: gbpExact },
    { key: "rebuilt_net_revenue", label: "Rebuilt net revenue", num: true, format: gbpExact },
    { key: "matches", label: "Match", format: (v) => (v ? "✓" : "✗") },
  ],
  rows: recon.rows,
});
