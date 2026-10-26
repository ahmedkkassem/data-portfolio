import { html, fmtInt, initTheme } from "./charts.js";
import { checkIcon, longDate } from "./common.js";

initTheme(document.getElementById("theme"));
const get = (p) => fetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const [retail, guard, recon, ops] = await Promise.all([
  get("data/retail.json"), get("data/number_guard.json"), get("data/spreadsheets_recon.json"), get("data/ops.json"),
]);

const projects = [
  {
    n: "01", href: "retail/", img: "shots/retail-cover.png", title: "Monday Report: e-commerce KPI dashboard",
    text: "One dashboard for a whole online store: revenue, products, markets, retention cohorts and customer segments, with a full audit of where every source row went.",
    tags: ["Python", "dbt", "DuckDB → BigQuery-ready", "Data quality", "Dashboard"],
    proof: retail && `${fmtInt(retail.source.rows)} source rows; ${retail.reconciliation.checks.length} figures independently reconciled to the penny`,
  },
  {
    n: "02", href: "email/", img: "shots/email-cover.png", title: "AI weekly email with a number guard",
    text: "Claude writes the Monday summary from warehouse facts; an automated guard checks every figure in the text before anything is sent.",
    tags: ["Claude API", "LLM guardrails", "Automation"],
    proof: guard && `${guard.numbers_checked}/${guard.numbers_checked} numbers in the email traced to the warehouse`,
  },
  {
    n: "03", href: "spreadsheets/", img: "shots/spreadsheets-cover.png", title: "Spreadsheet rescue",
    text: "Three teams' messy Excel and CSV files rebuilt into one clean table: text dates, decimal commas, subtotals, duplicates and flipped return signs fixed.",
    tags: ["Python", "Excel/CSV parsing", "dbt tests", "Reconciliation"],
    proof: recon && `${fmtInt(recon.rows.reduce((a, r) => a + r.rebuilt_lines, 0))} lines rebuilt; ${recon.mismatched_lines} differ from the source`,
  },
  {
    n: "04", href: "ops/", img: "shots/ops-cover.png", title: "Live ops pipeline on NYC 311 data",
    text: "Incremental loads from a live API every morning, upserts into a 90-day window, freshness and volume checks, and a run log, all on free GitHub Actions.",
    tags: ["Incremental ELT", "Scheduling", "dbt freshness", "Monitoring"],
    proof: ops && `Refreshed ${longDate(ops.generated_at)}; ${fmtInt(ops.quality.requests_in_window)} requests in the window`,
  },
];
const grid = document.getElementById("projects");
for (const p of projects) {
  const c = html("article", { class: "card project" }, grid);
  const a = html("a", { class: "shot", href: p.href, "aria-label": `Open ${p.title}` }, c);
  html("img", { src: p.img, alt: `Screenshot of ${p.title}`, loading: "lazy" }, a);
  const b = html("div", { class: "body" }, c);
  html("div", { class: "num" }, b, `Demo ${p.n}`);
  html("h2", {}, b, p.title);
  html("p", {}, b, p.text);
  if (p.proof) {
    const pr = html("div", { class: "proof" }, b);
    const ic = html("span", { style: "display:inline-flex;width:14px;height:14px" }, pr);
    ic.append(checkIcon(true));
    html("span", {}, pr, p.proof);
  }
  const t = html("div", { class: "tags" }, b);
  p.tags.forEach((x) => html("span", { class: "tag" }, t, x));
  const l = html("div", { class: "links" }, b);
  html("a", { href: p.href }, l, "Open demo →");
  html("a", { href: "https://github.com/ahmedkkassem/data-portfolio" }, l, "Code →");
}
