// Shared chrome for the dashboard pages: top bar, footer, theme switch, entrances, screenshot positioning.
import { html } from "./charts.js";
import { CONTACT } from "../config.js";

const PAGES = [
  ["retail", "Monday Report"], ["email", "Weekly AI email"], ["spreadsheets", "Spreadsheet rescue"], ["ops", "NYC 311 pipeline"],
];
const ICONS = {
  moon: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13.2 10.1A5.5 5.5 0 0 1 5.9 2.8a5.5 5.5 0 1 0 7.3 7.3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  sun: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
};

export function isDark() {
  const t = document.documentElement.dataset.theme;
  return t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
}

export function shell(current) {
  document.documentElement.classList.add("js");
  const params = new URLSearchParams(location.search);
  const q = params.get("theme");
  let stored = null;
  try { stored = localStorage.getItem("theme"); } catch (_) { /* storage blocked */ }
  if (q === "dark" || q === "light") document.documentElement.dataset.theme = q; else if (stored) document.documentElement.dataset.theme = stored;

  const top = document.getElementById("topbar");
  const bar = html("header", { class: "topbar" }, top);
  const w = html("div", { class: "wrap" }, bar);
  html("a", { class: "brand", href: "../" }, w, "Ahmed Kassem");
  const nav = html("nav", { class: "topnav", "aria-label": "Demos" }, w);
  for (const [slug, label] of PAGES) html("a", { href: `../${slug}/`, ...(slug === current ? { "aria-current": "page" } : {}) }, nav, label);
  const btn = html("button", { class: "icon-btn", type: "button" }, w);
  const paint = () => { btn.innerHTML = isDark() ? ICONS.sun : ICONS.moon; btn.setAttribute("aria-label", isDark() ? "Switch to light theme" : "Switch to dark theme"); };
  paint();
  btn.addEventListener("click", () => {
    document.documentElement.dataset.theme = isDark() ? "light" : "dark";
    try { localStorage.setItem("theme", document.documentElement.dataset.theme); } catch (_) { /* ignore */ }
    paint();
    window.dispatchEvent(new Event("themechange"));
  });

  const foot = document.getElementById("footer");
  const f = html("footer", { class: "footer" }, foot);
  const fw = html("div", { class: "wrap" }, f);
  const left = html("span", {}, fw);
  left.append("Demo on public data by Ahmed Kassem. Not client work. ");
  if (CONTACT.upwork) { html("a", { href: CONTACT.upwork }, left, "Hire me on Upwork"); left.append(" · "); }
  if (CONTACT.email) { html("a", { href: `mailto:${CONTACT.email}` }, left, CONTACT.email); }
  const credit = document.getElementById("credit");
  if (credit) { const span = html("span", {}, fw); span.append(...credit.childNodes); credit.remove(); }
  return { params };
}

// Panels rise once as they scroll into view; called after a page has rendered its content.
export function reveal(selector = ".card, .kpi-strip, .proofline") {
  const els = [...document.querySelectorAll(selector)];
  if (!("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { rootMargin: "0px 0px -8% 0px" });
  els.forEach((el, i) => { el.classList.add("reveal"); el.style.transitionDelay = `${(i % 3) * 70}ms`; io.observe(el); });
  // headless screenshots: ?shot=<element id> scrolls there and shows everything at once
  const shot = new URLSearchParams(location.search).get("shot");
  if (shot) {
    els.forEach((el) => { el.classList.add("in"); el.style.transition = "none"; });
    document.documentElement.style.scrollBehavior = "auto";
    const target = document.getElementById(shot);
    if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 16, behavior: "instant" });
  }
}
