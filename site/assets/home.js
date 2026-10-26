// Home page: today's run receipt (the live part), the contact line, entrances.
import { CONTACT } from "../config.js";

document.documentElement.classList.add("js");
const ARROW = '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3 9h11M10 4.5 14.5 9 10 13.5" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg>';
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const longDate = (iso) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const int = (n) => Math.round(n).toLocaleString("en-GB");

// contact: the business email if set, else Upwork, else the code
const cta = document.getElementById("cta");
const line = document.getElementById("contact-line");
const ways = document.getElementById("ways");
const links = document.getElementById("contact-links");
const a = (href, text) => Object.assign(document.createElement("a"), { href, textContent: text });
if (CONTACT.upwork) {
  cta.href = CONTACT.upwork; cta.innerHTML = `Hire me on Upwork ${ARROW}`;
  ways.prepend(a(CONTACT.upwork, "Upwork"));
  links.prepend(a(CONTACT.upwork, "Upwork"));
}
if (CONTACT.email) {
  if (!CONTACT.upwork) { cta.href = `mailto:${CONTACT.email}`; cta.innerHTML = `Email me ${ARROW}`; }
  line.href = `mailto:${CONTACT.email}?subject=${encodeURIComponent("Data project")}`;
  line.textContent = CONTACT.email;
  ways.prepend(a(`mailto:${CONTACT.email}`, CONTACT.email));
} else if (CONTACT.upwork) {
  line.href = CONTACT.upwork; line.textContent = "Hire me on Upwork";
}

// entrances first, so nothing waits on the data: each part rises once as it enters; visible without script
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(location.search).has("shot");
const rise = [...document.querySelectorAll(".rise")];
let ledgerSeen = false;
const startCounters = () => document.querySelectorAll("#ledger b[data-target]").forEach((el) => { if (!el.dataset.done) { el.dataset.done = "1"; count(el); } });
if ("IntersectionObserver" in window && !reduce) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      if (e.target.closest("#ledger")) { ledgerSeen = true; startCounters(); }
      io.unobserve(e.target);
    }
  }, { rootMargin: "0px 0px -10% 0px" });
  rise.forEach((el) => {
    const sib = [...el.parentElement.children].filter((c) => c.classList.contains("rise"));
    el.style.transitionDelay = `${sib.indexOf(el) * 80}ms`;
    io.observe(el);
  });
} else {
  rise.forEach((el) => el.classList.add("in"));
}
function count(el) {
  const target = +el.dataset.target, t0 = performance.now(), dur = 1100;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - (1 - k) ** 3;
    el.textContent = el._fmt(k < 1 ? Math.floor(target * e) : target);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// today's run: read from the same JSON the dashboards use
const get = (p) => fetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const [ops, retail, recon, guard] = await Promise.all([
  get("data/ops.json"), get("data/retail.json"), get("data/spreadsheets_recon.json"), get("data/number_guard.json"),
]);
const values = {
  nyc: ops && { n: ops.runs[0]?.rows_fetched ?? 0, text: (v) => int(v) },
  rec: retail && { n: retail.reconciliation.checks.filter((c) => c.match).length, text: (v) => `${int(v)} of ${retail.reconciliation.checks.length}` },
  sheets: recon && { n: recon.mismatched_lines, text: (v) => int(v), sub: `of ${int(recon.rows.reduce((s, r) => s + r.rebuilt_lines, 0))} rebuilt spreadsheet lines differ from the source` },
  guard: guard && { n: guard.results.filter((r) => r.ok).length, text: (v) => `${int(v)} of ${guard.numbers_checked}` },
};
for (const el of document.querySelectorAll("#ledger b[data-k]")) {
  const v = values[el.dataset.k];
  if (!v) { el.textContent = "—"; continue; }
  if (v.sub) el.nextElementSibling.textContent = v.sub;
  if (reduce || v.n === 0) { el.textContent = v.text(v.n); continue; }
  // count up once when the receipt comes into view; the final figure is always the exact one
  el.textContent = v.text(0);
  el.dataset.target = v.n;
  el._fmt = v.text;
}
if (ops) {
  const r = ops.runs[0];
  const tests = ops.tests.filter((t) => t.status === "pass").length;
  document.getElementById("ran-at").textContent =
    `Last run ${longDate(ops.generated_at)} at ${ops.generated_at.slice(11, 16)} UTC, ${r.mode} mode, ${tests} of ${ops.tests.length} pipeline tests passed.`;
}
if (ledgerSeen || reduce || !("IntersectionObserver" in window)) document.querySelectorAll("#ledger b[data-target]").forEach((el) => (reduce ? (el.textContent = el._fmt(+el.dataset.target)) : count(el)));

// the stack band loops seamlessly: duplicate its names once
const track = document.getElementById("track");
track.append(...[...track.children].map((n) => n.cloneNode(true)));
