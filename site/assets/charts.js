// Small, dependency-free SVG chart kit.
// Rules it follows: thin marks, 2px lines, 4px rounded data-ends, 2px surface gaps/rings,
// hairline grid, one y-axis, legend for >= 2 series, a hover/focus layer on every chart,
// and a table view for every chart. Text never wears the series colour. Labels use textContent.

const SVG_NS = "http://www.w3.org/2000/svg";

export function svg(tag, attrs = {}, parent) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    // CSS custom properties are reliable as style values, not as SVG presentation attributes
    if ((k === "fill" || k === "stroke") && String(v).includes("var(")) n.style[k] = v; else n.setAttribute(k, v);
  }
  if (parent) parent.appendChild(n);
  return n;
}
export function html(tag, attrs = {}, parent, text) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === "class") n.className = v; else n.setAttribute(k, v);
  }
  if (text !== undefined) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}
function txt(parent, x, y, s, cls, anchor = "start", extra = {}) {
  const t = svg("text", { x, y, class: cls, "text-anchor": anchor, ...extra }, parent);
  t.textContent = s;
  return t;
}

// ---------- number formatting ----------
export function compact(v, { prefix = "", decimals } = {}) {
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  const d = (x, n) => x.toFixed(n).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
  if (a >= 1e9) return `${s}${prefix}${d(a / 1e9, decimals ?? 2)}B`;
  if (a >= 1e6) return `${s}${prefix}${d(a / 1e6, decimals ?? 2)}M`;
  if (a >= 1e4) return `${s}${prefix}${d(a / 1e3, decimals ?? 0)}K`;
  if (a >= 1e3) return `${s}${prefix}${d(a / 1e3, decimals ?? 1)}K`;
  return `${s}${prefix}${d(a, decimals ?? (a < 10 && a % 1 ? 1 : 0))}`;
}
export const fmtInt = (v) => Math.round(v).toLocaleString("en-GB");
export const fmtNum = (v, n = 1) => Number(v).toLocaleString("en-GB", { minimumFractionDigits: n, maximumFractionDigits: n });
export const fmtPct = (v, n = 1) => `${(v * 100).toFixed(n)}%`;

function niceStep(range, count) {
  const raw = range / Math.max(1, count), mag = 10 ** Math.floor(Math.log10(raw)), r = raw / mag;
  return (r >= 5 ? 10 : r >= 2 ? 5 : r >= 1 ? 2 : 1) * mag;
}
export function niceTicks(min, max, count = 4) {
  if (max === min) max = min + 1;
  const step = niceStep(max - min, count);
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(10));
  return out;
}

// ---------- tooltip (one shared instance) ----------
let tipEl;
function tip() {
  if (!tipEl) { tipEl = html("div", { class: "viz-tooltip", role: "status", "aria-live": "polite" }, document.body); }
  return tipEl;
}
export function showTip(title, rows, clientX, clientY) {
  const t = tip();
  t.replaceChildren();
  if (title) html("div", { class: "tt-title" }, t, title);
  for (const r of rows) {
    const row = html("div", { class: "tt-row" }, t);
    const key = html("span", { class: "tt-key" }, row);
    if (r.color) { const i = html("i", { class: r.box ? "box" : "" }, key); i.style.background = r.color; }
    html("span", {}, key, r.name);
    html("span", { class: "tt-val" }, row, r.value);
  }
  const pad = 14, w = t.offsetWidth || 180, h = t.offsetHeight || 60;
  let x = clientX + pad, y = clientY - h - pad;
  if (x + w > window.innerWidth - 8) x = clientX - w - pad;
  if (y < 8) y = clientY + pad;
  t.style.left = `${Math.max(8, x)}px`; t.style.top = `${y}px`;
  t.classList.add("show");
}
export function hideTip() { if (tipEl) tipEl.classList.remove("show"); }

// ---------- card with table toggle ----------
// Returns { plot } where charts render. A "Table" button swaps in the accessible twin.
export function card(parent, { title, sub, table, spanClass = "span-12", id } = {}) {
  const c = html("section", { class: `card ${spanClass}`, id }, parent);
  const head = html("div", { class: "card-head" }, c);
  const left = html("div", {}, head);
  html("h3", {}, left, title);
  if (sub) html("div", { class: "sub" }, left, sub);
  const plot = html("div", { class: "viz" }, c);
  if (table) {
    const tools = html("div", { class: "card-tools" }, head);
    const btn = html("button", { class: "btn-ghost", type: "button", "aria-pressed": "false" }, tools, "Table");
    const wrap = html("div", { class: "table-wrap", hidden: "" }, c);
    btn.addEventListener("click", () => {
      const on = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", String(on));
      btn.textContent = on ? "Chart" : "Table";
      plot.hidden = on; wrap.hidden = !on;
      if (on) renderTable(wrap, typeof table === "function" ? table() : table);
    });
  }
  return { card: c, plot };
}
export function renderTable(wrap, { columns, rows }) {
  wrap.replaceChildren();
  const t = html("table", { class: "data" }, wrap);
  const tr = html("tr", {}, html("thead", {}, t));
  for (const col of columns) html("th", { class: col.num ? "num" : "" }, tr, col.label);
  const tb = html("tbody", {}, t);
  for (const r of rows) {
    const row = html("tr", {}, tb);
    for (const col of columns) {
      const v = r[col.key];
      html("td", { class: col.num ? "num" : "" }, row, col.format ? col.format(v) : v ?? "—");
    }
  }
}

export function legend(parent, items) {
  const l = html("div", { class: "legend" }, parent);
  for (const it of items) {
    const s = html("span", {}, l);
    const i = html("i", { class: it.type === "line" ? "line" : "" }, s);
    i.style.background = it.color;
    html("span", {}, s, it.name);
  }
  return l;
}

const cssVar = (name) => `var(${name})`;
function onResize(el, fn) {
  let w = 0;
  const ro = new ResizeObserver(() => { const nw = Math.round(el.clientWidth); if (nw && nw !== w) { w = nw; fn(nw); } });
  ro.observe(el);
}
function measure(parent, s, cls) {
  const t = txt(parent, -999, -999, s, cls);
  const w = t.getComputedTextLength ? t.getComputedTextLength() : s.length * 7;
  t.remove();
  return w;
}

// ---------- line chart (multi-series, crosshair + tooltip) ----------
// opts: { x: [labels], series: [{name, color, values, emphasis?}], yFormat, xTick(i), title(i),
//         height, area, endLabels, yMin }
export function lineChart(el, opts) {
  const { x, series, yFormat = compact, xTick = (i) => x[i], title = (i) => x[i], height = 260, area = false,
    endLabels = series.length <= 4, showLegend = series.length >= 2 } = opts;
  el.replaceChildren();
  if (showLegend) legend(el, series.map((s) => ({ name: s.name, color: s.color, type: "line" })));
  const host = html("div", {}, el);
  onResize(host, (W) => {
    host.replaceChildren();
    const all = series.flatMap((s) => s.values.filter((v) => v != null));
    const yMin = opts.yMin ?? Math.min(0, ...all), yMax = Math.max(...all);
    const ticks = niceTicks(yMin, yMax, 4);
    const root = svg("svg", { width: W, height, role: "img", "aria-label": opts.ariaLabel || "line chart" }, host);
    const ih = height - 10 - 26;
    const Y = (v) => 10 + ih - ((v - ticks[0]) / (ticks.at(-1) - ticks[0])) * ih;
    // end labels only when they don't collide; otherwise legend + tooltip carry identity and no space is reserved
    const endYs = series.map((s) => { const v = s.values.filter((u) => u != null).at(-1); return Y(v); }).sort((a, b) => a - b);
    const labelsFit = endLabels && !endYs.some((y, k) => k && y - endYs[k - 1] < 15);
    const leftPad = Math.max(...ticks.map((t) => measure(root, yFormat(t), "axis-label"))) + 10;
    const rightPad = labelsFit ? Math.min(150, Math.max(...series.map((s) => measure(root, s.name, "end-label"))) + 22) : 12;
    const m = { t: 10, r: rightPad, b: 26, l: leftPad };
    const iw = Math.max(10, W - m.l - m.r);
    const n = x.length;
    const X = (i) => m.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
    const g = svg("g", {}, root);
    for (const t of ticks) {
      svg("line", { x1: m.l, x2: m.l + iw, y1: Y(t), y2: Y(t), stroke: cssVar(t === 0 ? "--baseline" : "--grid"), "stroke-width": 1, "shape-rendering": "crispEdges" }, g);
      txt(g, m.l - 8, Y(t) + 4, yFormat(t), "axis-label", "end");
    }
    if (opts.band) {
      const half = n > 1 ? iw / (n - 1) / 2 : 0;
      const bx0 = Math.max(m.l, X(opts.band.from) - half), bx1 = Math.min(m.l + iw, X(opts.band.to) + half);
      svg("rect", { x: bx0, y: m.t, width: Math.max(0, bx1 - bx0), height: ih, fill: cssVar("--accent-wash"), rx: 4 }, g);
    }
    const tickEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 90))));
    for (let i = 0; i < n; i += tickEvery) txt(g, X(i), height - 6, xTick(i), "axis-label", i === 0 ? "start" : "middle");
    const order = [...series].sort((a, b) => (a.emphasis === false) - (b.emphasis === false)).reverse();
    for (const s of order) {
      let d = "", started = false;
      s.values.forEach((v, i) => {
        if (v == null) { started = false; return; }
        d += `${started ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; started = true;
      });
      if (area && series.length === 1) {
        const first = s.values.findIndex((v) => v != null), last = s.values.length - 1 - [...s.values].reverse().findIndex((v) => v != null);
        svg("path", { d: `${d}L${X(last)},${Y(Math.max(0, ticks[0]))}L${X(first)},${Y(Math.max(0, ticks[0]))}Z`, fill: s.color, "fill-opacity": 0.1 }, g);
      }
      svg("path", { d, fill: "none", stroke: s.color, "stroke-width": s.emphasis === false ? 1.5 : 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, g);
    }
    // end dots + labels (nudge-free: if two labels would collide, keep the legend + tooltip instead)
    const ends = series.map((s) => {
      const i = s.values.length - 1 - [...s.values].reverse().findIndex((v) => v != null);
      return { s, i, y: Y(s.values[i]) };
    });
    for (const e of ends) svg("circle", { cx: X(e.i), cy: e.y, r: 4, fill: e.s.color, stroke: cssVar("--surface-1"), "stroke-width": 2 }, g);
    if (labelsFit) for (const e of ends) txt(g, X(e.i) + 10, e.y + 4, e.s.name, "end-label");
    // crosshair layer
    const cross = svg("line", { y1: m.t, y2: m.t + ih, stroke: cssVar("--axis-muted"), "stroke-width": 1, opacity: 0, "shape-rendering": "crispEdges" }, g);
    const dots = series.map((s) => svg("circle", { r: 4, fill: s.color, stroke: cssVar("--surface-1"), "stroke-width": 2, opacity: 0 }, g));
    const hit = svg("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent", class: "viz-hit", tabindex: 0, "aria-label": "Use arrow keys to read values" }, root);
    let cur = n - 1;
    const show = (i, cx, cy) => {
      cur = i;
      cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.setAttribute("opacity", 1);
      series.forEach((s, k) => {
        const v = s.values[i];
        dots[k].setAttribute("opacity", v == null ? 0 : 1);
        if (v != null) { dots[k].setAttribute("cx", X(i)); dots[k].setAttribute("cy", Y(v)); }
      });
      const rows = series.map((s) => ({ name: s.name, color: s.color, value: s.values[i] == null ? "—" : (opts.tipFormat || yFormat)(s.values[i]) }));
      const r = root.getBoundingClientRect();
      showTip(title(i), rows, cx ?? r.left + X(i), cy ?? r.top + m.t + 20);
    };
    const leave = () => { cross.setAttribute("opacity", 0); dots.forEach((d) => d.setAttribute("opacity", 0)); hideTip(); };
    hit.addEventListener("pointermove", (ev) => {
      const r = root.getBoundingClientRect();
      const i = Math.max(0, Math.min(n - 1, Math.round(((ev.clientX - r.left - m.l) / iw) * (n - 1))));
      show(i, ev.clientX, ev.clientY);
    });
    hit.addEventListener("pointerleave", leave);
    hit.addEventListener("blur", leave);
    hit.addEventListener("focus", () => show(cur));
    hit.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowLeft") { show(Math.max(0, cur - 1)); ev.preventDefault(); }
      if (ev.key === "ArrowRight") { show(Math.min(n - 1, cur + 1)); ev.preventDefault(); }
    });
  });
}

// rounded data-end, square baseline
function hBarPath(x0, y, w, h, r = 4) {
  if (w <= 0) return "";
  r = Math.min(r, w, h / 2);
  return `M${x0},${y}H${x0 + w - r}Q${x0 + w},${y} ${x0 + w},${y + r}V${y + h - r}Q${x0 + w},${y + h} ${x0 + w - r},${y + h}H${x0}Z`;
}
function vBarPath(x, y0, w, h, r = 4, roundTop = true) {
  if (h <= 0) return "";
  r = roundTop ? Math.min(r, h, w / 2) : 0;
  return `M${x},${y0}V${y0 - h + r}Q${x},${y0 - h} ${x + r},${y0 - h}H${x + w - r}Q${x + w},${y0 - h} ${x + w},${y0 - h + r}V${y0}Z`;
}

// ---------- horizontal bar chart ----------
// opts: { items: [{label, value, sub?, color?}], format, color, rowHeight, maxLabel }
export function barChart(el, opts) {
  const { items, format = compact, color = cssVar("--series-1"), rowHeight = 30, tipRows } = opts;
  el.replaceChildren();
  const host = html("div", {}, el);
  onResize(host, (W) => {
    host.replaceChildren();
    const H = items.length * rowHeight + 4;
    const root = svg("svg", { width: W, height: H, role: "img", "aria-label": opts.ariaLabel || "bar chart" }, host);
    const labelW = Math.min(W * 0.42, Math.max(...items.map((d) => measure(root, d.label, "cat-label"))) + 12);
    const valW = Math.max(...items.map((d) => measure(root, format(d.value), "val-label"))) + 10;
    const x0 = labelW, iw = Math.max(40, W - labelW - valW);
    const max = Math.max(...items.map((d) => d.value), 0) || 1;
    const bh = Math.min(16, rowHeight - 12);
    svg("line", { x1: x0, x2: x0, y1: 0, y2: H, stroke: cssVar("--baseline"), "stroke-width": 1, "shape-rendering": "crispEdges" }, root);
    items.forEach((d, i) => {
      const y = i * rowHeight + (rowHeight - bh) / 2;
      const w = (Math.max(0, d.value) / max) * iw;
      const g = svg("g", { class: "mark", tabindex: 0 }, root);
      svg("rect", { x: 0, y: i * rowHeight, width: W, height: rowHeight, fill: "transparent" }, g);
      // shorten the label to the space it has (the tooltip and table keep the full name)
      let lbl = d.label;
      while (lbl.length > 4 && measure(root, lbl, "cat-label") > labelW - 12) lbl = lbl.slice(0, -2).trimEnd() + "…";
      txt(g, x0 - 10, y + bh / 2 + 4, lbl, "cat-label", "end");
      svg("path", { d: hBarPath(x0, y, Math.max(w, 1.5), bh), fill: d.color || color }, g);
      txt(g, x0 + w + 7, y + bh / 2 + 4, format(d.value), "val-label");
      const tipShow = (cx, cy) => showTip(d.label, tipRows ? tipRows(d) : [{ name: opts.valueName || "Value", value: format(d.value), color: d.color || color, box: true }], cx, cy);
      g.addEventListener("pointermove", (ev) => tipShow(ev.clientX, ev.clientY));
      g.addEventListener("pointerleave", hideTip);
      g.addEventListener("focus", () => { const r = g.getBoundingClientRect(); tipShow(r.left + x0 + w, r.top); });
      g.addEventListener("blur", hideTip);
    });
  });
}

// ---------- vertical (stacked) columns ----------
// opts: { x: [labels], series: [{name, color, values}], format, xTick(i), title(i), height }
export function columnChart(el, opts) {
  const { x, series, format = compact, xTick = (i) => x[i], title = (i) => x[i], height = 260 } = opts;
  el.replaceChildren();
  if (series.length >= 2) legend(el, series.map((s) => ({ name: s.name, color: s.color })));
  const host = html("div", {}, el);
  onResize(host, (W) => {
    host.replaceChildren();
    const totals = x.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] || 0), 0));
    const ticks = niceTicks(0, Math.max(...totals), 4);
    const root = svg("svg", { width: W, height, role: "img", "aria-label": opts.ariaLabel || "column chart" }, host);
    const leftPad = Math.max(...ticks.map((t) => measure(root, format(t), "axis-label"))) + 10;
    const m = { t: 10, r: 8, b: 26, l: leftPad };
    const iw = Math.max(10, W - m.l - m.r), ih = height - m.t - m.b, n = x.length;
    const band = iw / n, cw = Math.max(2, Math.min(24, band * 0.62));
    const Y = (v) => m.t + ih - (v / ticks.at(-1)) * ih;
    for (const t of ticks) {
      svg("line", { x1: m.l, x2: m.l + iw, y1: Y(t), y2: Y(t), stroke: cssVar(t === 0 ? "--baseline" : "--grid"), "stroke-width": 1, "shape-rendering": "crispEdges" }, root);
      txt(root, m.l - 8, Y(t) + 4, format(t), "axis-label", "end");
    }
    const tickEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 80))));
    for (let i = 0; i < n; i += tickEvery) txt(root, m.l + band * i + band / 2, height - 6, xTick(i), "axis-label", "middle");
    const gap = 2;
    x.forEach((_, i) => {
      const g = svg("g", { class: "mark", tabindex: 0 }, root);
      svg("rect", { x: m.l + band * i, y: m.t, width: band, height: ih, fill: "transparent" }, g);
      let acc = 0;
      const visible = series.map((s) => Math.max(0, s.values[i] || 0));
      const topIdx = visible.reduce((t, v, k) => (v > 0 ? k : t), -1);
      series.forEach((s, k) => {
        const v = visible[k];
        if (v <= 0) return;
        const y0 = Y(acc) - (acc > 0 ? gap : 0);
        const h = Y(0) - Y(v) - (acc > 0 ? 0 : 0);
        svg("path", { d: vBarPath(m.l + band * i + (band - cw) / 2, y0, cw, Math.max(1, h - (acc > 0 ? 0 : 0)), 4, k === topIdx), fill: s.color }, g);
        acc += v;
      });
      const tipShow = (cx, cy) => showTip(title(i), [
        ...series.map((s) => ({ name: s.name, color: s.color, box: true, value: format(s.values[i] || 0) })),
        ...(series.length > 1 ? [{ name: "Total", value: format(totals[i]) }] : []),
      ], cx, cy);
      g.addEventListener("pointermove", (ev) => tipShow(ev.clientX, ev.clientY));
      g.addEventListener("pointerleave", hideTip);
      g.addEventListener("focus", () => { const r = g.getBoundingClientRect(); tipShow(r.left + band / 2, r.top + 30); });
      g.addEventListener("blur", hideTip);
    });
  });
}

// ---------- heatmap (sequential, one hue) ----------
const RAMP = ["#e8f1fc", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
const RAMP_DARK = ["#16253a", "#173055", "#184f95", "#1c5cab", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"];
function isDark() {
  const t = document.documentElement.dataset.theme;
  return t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
}
function rampColor(t) {
  const r = isDark() ? RAMP_DARK : RAMP;
  return r[Math.max(0, Math.min(r.length - 1, Math.floor(t * r.length)))];
}
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
// opts: { rows:[label], cols:[label], value(r,c)->number|null, format, max, cellTitle(r,c), colTitle, rowTitle }
export function heatmap(el, opts) {
  const { rows, cols, value, format = (v) => fmtPct(v, 0), cellH = 26 } = opts;
  el.replaceChildren();
  const host = html("div", {}, el);
  onResize(host, (W) => {
    host.replaceChildren();
    const root = svg("svg", { width: W, height: rows.length * cellH + 30, role: "img", "aria-label": opts.ariaLabel || "heatmap" }, host);
    const labelW = Math.max(...rows.map((r) => measure(root, r, "cat-label"))) + 12;
    const cw = (W - labelW) / cols.length;
    let max = opts.max;
    if (max == null) { max = 0; rows.forEach((_, r) => cols.forEach((_, c) => { const v = value(r, c); if (v != null && v > max) max = v; })); }
    cols.forEach((c, j) => { if (cols.length <= 16 || j % 2 === 0) txt(root, labelW + cw * j + cw / 2, 14, c, "axis-label", "middle"); });
    rows.forEach((rl, r) => {
      const y = 22 + r * cellH;
      txt(root, labelW - 10, y + cellH / 2 + 4, rl, "cat-label", "end");
      cols.forEach((cl, c) => {
        const v = value(r, c);
        if (v == null) return;
        const fill = rampColor(max ? v / max : 0);
        const g = svg("g", { class: "mark", tabindex: -1 }, root);
        svg("rect", { x: labelW + cw * c + 1, y: y + 1, width: Math.max(1, cw - 2), height: cellH - 2, rx: 3, fill }, g);
        if (cw >= 34) {
          const t = txt(g, labelW + cw * c + cw / 2, y + cellH / 2 + 4, format(v), "axis-label", "middle");
          t.setAttribute("style", `fill:${lum(fill) > 0.35 ? "#0b0b0b" : "#ffffff"};font-size:11px`);
        }
        g.addEventListener("pointermove", (ev) => showTip(opts.cellTitle ? opts.cellTitle(r, c) : `${rl} · ${cl}`, opts.tipRows ? opts.tipRows(r, c) : [{ name: "Value", value: format(v) }], ev.clientX, ev.clientY));
        g.addEventListener("pointerleave", hideTip);
      });
    });
  });
  const sl = html("div", { class: "scale-legend" }, el);
  html("span", {}, sl, opts.lowLabel || "Low");
  const bar = html("span", { class: "bar" }, sl);
  bar.style.background = `linear-gradient(90deg, ${(isDark() ? RAMP_DARK : RAMP).join(",")})`;
  html("span", {}, sl, opts.highLabel || "High");
}

// ---------- stat tile ----------
// opts: { label, value, delta: {text, good: true|false|null}, vs, spark: [numbers], hero }
export function statTile(parent, opts) {
  const t = html("div", { class: `card tile${opts.hero ? " hero-tile" : ""}` }, parent);
  html("div", { class: "label" }, t, opts.label);
  html("div", { class: "value" }, t, opts.value);
  if (opts.delta) {
    const cls = opts.delta.good === true ? "good" : opts.delta.good === false ? "bad" : "flat";
    const d = html("div", { class: `delta ${cls}` }, t);
    html("span", {}, d, opts.delta.text);
    if (opts.vs) html("span", { class: "vs" }, d, opts.vs);
  }
  if (opts.spark && opts.spark.length > 1) {
    const vals = opts.spark, n = vals.length, W = 200, H = 30;
    const mn = Math.min(...vals), mx = Math.max(...vals), Y = (v) => H - 3 - ((v - mn) / (mx - mn || 1)) * (H - 6);
    const s = svg("svg", { class: "spark", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", "aria-hidden": "true" }, t);
    const d = vals.map((v, i) => `${i ? "L" : "M"}${((i * (W - 6)) / (n - 1) + 3).toFixed(1)},${Y(v).toFixed(1)}`).join("");
    svg("path", { d, fill: "none", stroke: cssVar("--de-emphasis"), "stroke-width": 1.5, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }, s);
    const lx = W - 3, ly = Y(vals[n - 1]);
    const prev = vals.slice(-2);
    svg("path", { d: `M${((n - 2) * (W - 6)) / (n - 1) + 3},${Y(prev[0])}L${lx},${ly}`, fill: "none", stroke: cssVar("--series-1"), "stroke-width": 2, "vector-effect": "non-scaling-stroke" }, s);
  }
  return t;
}

// ---------- theme toggle ----------
export function initTheme(button) {
  const root = document.documentElement;
  const q = new URLSearchParams(location.search).get("theme");
  let stored = null;
  try { stored = localStorage.getItem("theme"); } catch (_) { /* storage blocked */ }
  if (q === "dark" || q === "light") root.dataset.theme = q; else if (stored) root.dataset.theme = stored;
  if (!button) return;
  const paint = () => { button.textContent = isDark() ? "☀" : "☾"; button.setAttribute("aria-label", isDark() ? "Switch to light theme" : "Switch to dark theme"); };
  paint();
  button.addEventListener("click", () => {
    root.dataset.theme = isDark() ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch (_) { /* ignore */ }
    paint();
    window.dispatchEvent(new Event("themechange"));
  });
}
