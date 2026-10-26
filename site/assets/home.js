// Home page: the latest run's figures (shown final, never animated) and the contact buttons.
import { CONTACT } from "../config.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const longDate = (iso) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const int = (n) => Math.round(n).toLocaleString("en-GB");
const link = (href, text, cls) => Object.assign(document.createElement("a"), { href, textContent: text, className: cls });

// contact: the business email and Upwork when they are set; otherwise the code
const target = CONTACT.upwork || (CONTACT.email && `mailto:${CONTACT.email}?subject=${encodeURIComponent("Data project")}`);
if (target) {
  document.querySelectorAll("a.hire").forEach((a) => { a.href = target; if (CONTACT.upwork) a.target = "_blank"; });
  const box = document.getElementById("contact-actions");
  box.replaceChildren();
  if (CONTACT.upwork) box.append(link(CONTACT.upwork, "Hire me on Upwork", "btn"));
  if (CONTACT.email) box.append(link(`mailto:${CONTACT.email}`, CONTACT.email, CONTACT.upwork ? "btn btn-outline" : "btn"));
} else {
  // no contact details yet: hide "Hire me" rather than lead to a dead end
  document.querySelectorAll("a.hire").forEach((a) => { a.hidden = true; });
}

// the latest run, read from the same files the dashboards use
const get = (p) => fetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const [ops, retail, recon, guard] = await Promise.all([
  get("data/ops.json"), get("data/retail.json"), get("data/spreadsheets_recon.json"), get("data/number_guard.json"),
]);
const value = {
  nyc: ops && int(ops.runs[0]?.rows_fetched ?? 0),
  rec: retail && `${retail.reconciliation.checks.filter((c) => c.match).length} of ${retail.reconciliation.checks.length}`,
  sheets: recon && int(recon.mismatched_lines),
  guard: guard && `${guard.results.filter((r) => r.ok).length} of ${guard.numbers_checked}`,
};
for (const el of document.querySelectorAll("#figures dd[data-k]")) el.textContent = value[el.dataset.k] ?? "—";
if (ops) {
  const tests = ops.tests.filter((t) => t.status === "pass").length;
  document.getElementById("ran-at").textContent =
    `Every demo runs again each day at 06:15 UTC. Latest run: ${longDate(ops.generated_at)} at ${ops.generated_at.slice(11, 16)} UTC, ${tests} of ${ops.tests.length} pipeline tests passed.`;
}
