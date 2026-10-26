import { html, card, barChart, kpiStrip, fmtInt } from "./charts.js";
import { proof, checkIcon, gbpExact } from "./common.js";
import { shell, reveal } from "./shell.js";

shell("spreadsheets");
await document.fonts.ready;
const [before, report, recon] = await Promise.all([
  fetch("../data/spreadsheets_before.json").then((r) => r.json()),
  fetch("../data/spreadsheets_report.json").then((r) => r.json()),
  fetch("../data/spreadsheets_recon.json").then((r) => r.json()),
]);

const totalSource = recon.rows.reduce((a, r) => a + r.source_lines, 0);
const totalRebuilt = recon.rows.reduce((a, r) => a + r.rebuilt_lines, 0);
const netSource = recon.rows.reduce((a, r) => a + r.source_net_revenue, 0);
const netRebuilt = recon.rows.reduce((a, r) => a + r.rebuilt_net_revenue, 0);
const repairs = report.fixes.reduce((a, f) => a + f.count, 0);

const stamp = document.getElementById("stamp");
stamp.append("Source month ");
html("b", {}, stamp, before.month);
const pl = document.getElementById("proofline");
proof(pl, recon.exact ? "Rebuild matches the source line for line" : "Rebuild does not match the source", recon.exact);
proof(pl, `${recon.tests_passed} of ${recon.tests_total} dbt tests passed`, recon.tests_passed === recon.tests_total);

kpiStrip(document.getElementById("kpis"), [
  { label: "Lines rebuilt", value: fmtInt(totalRebuilt), note: `of ${fmtInt(totalSource)} real source lines`, lead: true },
  { label: "Lines that differ from the source", value: fmtInt(recon.mismatched_lines), note: "checked field by field, both directions" },
  { label: "Net revenue rebuilt", value: gbpExact(netRebuilt), note: netRebuilt.toFixed(2) === netSource.toFixed(2) ? "matches the source to the penny" : `source ${gbpExact(netSource)}` },
  { label: "Repairs made", value: fmtInt(repairs), note: `across ${report.fixes.length} kinds of problem` },
]);

// file cards: three peers in one row
const files = document.getElementById("files");
for (const f of before.files) {
  const c = html("div", { class: "card span-4" }, files);
  html("div", { class: "file-name" }, c, f.name);
  html("div", { class: "file-meta" }, c, `${f.team} · ${f.format} · ${fmtInt(f.rows_in_file)} rows · ${(f.bytes / 1024 / 1024).toFixed(1)} MB`);
  const issues = [...new Set(f.sample.map((s) => s.issue).filter(Boolean))];
  const ul = html("ul", { class: "file-issues" }, c);
  issues.forEach((i) => html("li", {}, ul, i));
  html("a", { class: "dl", href: `./files/${encodeURIComponent(f.name)}`, download: "" }, c, "Download the file");
}

// sheet preview with tabs
const tabs = document.getElementById("tabs"), sheet = document.getElementById("sheet");
const looksNumeric = (v) => /^-?[£$]?\d[\d.,]*( pcs)?$/.test(String(v).trim());
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
      const gap = html("tr", { class: "gap" }, tb);
      html("td", { class: "rn" }, gap, "…");
      html("td", { colspan: width + 1 }, gap, `${fmtInt(r.row - last - 1)} more rows`);
    }
    const tr = html("tr", { class: r.issue ? "flag" : "" }, tb);
    html("td", { class: "rn" }, tr, String(r.row));
    for (let j = 0; j < width; j++) { const v = r.values[j] ?? ""; html("td", { class: looksNumeric(v) ? "n" : "" }, tr, v); }
    html("td", { class: "why" }, tr, r.issue || "");
    last = r.row;
  }
}
before.files.forEach((f, k) => {
  const b = html("button", { type: "button", role: "tab" }, tabs, f.team);
  b.addEventListener("click", () => showSheet(k));
});
showSheet(0);

// repairs + reconciliation
const row = document.getElementById("row-fixes");
const fx = card(row, { title: "Repairs made", sub: "Counted by the pipeline as it cleaned", spanClass: "span-7",
  table: { columns: [{ key: "fix", label: "Repair" }, { key: "count", label: "Count", num: true, format: fmtInt }], rows: report.fixes } });
barChart(fx.plot, { items: report.fixes.filter((f) => f.count > 0).map((f) => ({ label: f.fix, value: f.count })), format: fmtInt, valueName: "Repairs", rowHeight: 30 });

const rc = card(row, { title: "Reconciliation by team", sub: "Real source lines against lines rebuilt from the messy files", spanClass: "span-5" });
const t = html("table", { class: "data" }, html("div", { class: "table-wrap" }, rc.plot));
const hr = html("tr", {}, html("thead", {}, t));
[["Team", ""], ["Lines", "num"], ["Net revenue", "num"], ["", ""]].forEach(([h, c]) => html("th", { class: c }, hr, h));
const tb = html("tbody", {}, t);
for (const r of recon.rows) {
  const tr = html("tr", {}, tb);
  html("strong", {}, html("td", {}, tr), r.region);
  html("td", { class: "num" }, tr, `${fmtInt(r.rebuilt_lines)} of ${fmtInt(r.source_lines)}`);
  html("td", { class: "num" }, tr, gbpExact(r.rebuilt_net_revenue));
  const st = html("span", { class: `status ${r.matches ? "ok" : "bad"}` }, html("td", {}, tr));
  st.append(checkIcon(r.matches));
  st.append(r.matches ? "match" : "differs");
}
const per = html("table", { class: "data", style: "margin-top:18px" }, html("div", { class: "table-wrap" }, rc.plot));
const phr = html("tr", {}, html("thead", {}, per));
[["File", ""], ["Rows in file", "num"], ["Pasted twice", "num"], ["Clean lines", "num"]].forEach(([h, c]) => html("th", { class: c }, phr, h));
const ptb = html("tbody", {}, per);
for (const f of report.files) {
  const tr = html("tr", {}, ptb);
  html("td", {}, tr, f.region);
  html("td", { class: "num" }, tr, fmtInt(f.rows_in_file));
  html("td", { class: "num" }, tr, fmtInt(f.duplicates_removed));
  html("td", { class: "num" }, tr, fmtInt(f.clean_lines));
}
reveal();
