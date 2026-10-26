// Formatting and small UI helpers shared by every demo page.
import { html, compact } from "./charts.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// ISO "YYYY-MM-DD" -> parts, without letting the browser shift it across time zones
const parts = (iso) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return { y, m, d }; };

export const longDate = (iso) => { const { y, m, d } = parts(iso); return `${d} ${MONTHS[m - 1]} ${y}`; };
export const shortDate = (iso) => { const { y, m } = parts(iso); return `${MONTHS[m - 1]} ${y}`; };
export const dayMonth = (iso) => { const { m, d } = parts(iso); return `${d} ${MONTHS[m - 1]}`; };
export const monthLabel = (iso) => { const { y, m } = parts(iso); return `${MONTHS[m - 1]} ${y}`; };

export const gbp = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return compact(v, { prefix: "£", decimals: 2 });
  if (a >= 1e4) return compact(v, { prefix: "£", decimals: 1 });
  return gbpExact(v, 0);
};
export const gbpExact = (v, d = 2) => (v == null ? "—" : `${v < 0 ? "−" : ""}£${Math.abs(v).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d })}`);

// Signed change vs a previous value. good = whether this direction is good news.
export function deltaPct(cur, prev, upIsGood = true) {
  if (!prev) return { text: "—", good: null };
  const ch = cur / prev - 1;
  if (Math.abs(ch) < 0.0005) return { text: "0.0%", good: null };
  return { text: `${ch > 0 ? "▲" : "▼"} ${Math.abs(ch * 100).toFixed(1)}%`, good: (ch > 0) === upIsGood };
}
export function deltaPts(cur, prev, upIsGood = true) {
  const ch = (cur - prev) * 100;
  if (Math.abs(ch) < 0.05) return { text: "0.0 pts", good: null };
  return { text: `${ch > 0 ? "▲" : "▼"} ${Math.abs(ch).toFixed(1)} pts`, good: (ch > 0) === upIsGood };
}

export function chip(parent, text, status) {
  const c = html("span", { class: `chip${status === "bad" ? " bad" : status === "warn" ? " warn" : ""}` }, parent);
  if (status !== null) html("span", { class: "dot", "aria-hidden": "true" }, c);
  html("span", {}, c, text);
  return c;
}

export function checkIcon(ok) {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  s.setAttribute("viewBox", "0 0 12 12");
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", ok ? "M2.5 6.2l2.3 2.3 4.7-5" : "M3 3l6 6M9 3l-6 6");
  p.setAttribute("fill", "none");
  p.setAttribute("stroke", "currentColor");
  p.setAttribute("stroke-width", "1.8");
  p.setAttribute("stroke-linecap", "round");
  p.setAttribute("stroke-linejoin", "round");
  s.appendChild(p);
  return s;
}
