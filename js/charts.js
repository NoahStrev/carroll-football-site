/*
  Shared chart-rendering helpers for the Carroll Football Site dashboards.
  Vanilla JS, no dependencies. Renders into the CSS component classes defined in
  css/theme.css (.barchart/.barcol/.bar, .stacked/.stackcol/.stackbar, .linewrap
  svg, .kpi) so every dashboard page looks consistent without re-declaring styles.

  Per the dataviz skill: categorical color always comes from --cat-1..--cat-8 in
  that fixed order (never cycled/reassigned), sequential magnitude uses --seq-*,
  status states use --good/--warning/--serious/--critical, and every chart with
  >=2 series ships a legend plus a hover tooltip.
*/

const CAT_COLORS = ['--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5', '--cat-6', '--cat-7', '--cat-8'];

/** Returns a live `var(--x)` reference, not a resolved literal color -- every
 * call site only ever assigns the result to a CSS color property or an SVG
 * presentation attribute (fill/stroke/background), both of which re-evaluate
 * var() live, so a chart painted before a data-theme toggle repaints itself
 * automatically instead of staying stuck with the color from its last render.
 * Fixed 2026-08-01 (previously resolved via getComputedStyle, which froze the
 * literal color at render time -- catColor() below already did this correctly,
 * cssVar() was the inconsistent one). */
function cssVar(name) {
  return `var(${name})`;
}

function catColor(index) {
  return `var(${CAT_COLORS[index % CAT_COLORS.length]})`;
}

/** Stable color assignment for a set of category names -- same name always gets
 * the same slot across re-renders/filters (color follows the entity, never rank). */
function categoricalColorMap(names) {
  const sorted = [...names].sort();
  const map = {};
  sorted.forEach((n, i) => { map[n] = catColor(i); });
  return map;
}

function mean(nums) {
  const vals = nums.filter((n) => n !== null && n !== undefined && !Number.isNaN(n));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Share of `rows` matching `pred`, or null for an empty set (never a fake 0%).
 * Hoisted 2026-08-01 -- was duplicated (as a predicate-based 2-arg version) in
 * Punter and Long Snapper verbatim; Kickoff Kicker had its own narrower
 * field-truthiness-only 2-arg version with the same name, now standardized on
 * this one (a predicate can express a field-truthiness check trivially, but not
 * the reverse). */
function rate(rows, pred) { return rows.length ? rows.filter(pred).length / rows.length : null; }

/* --------------------------------------------------------- money_unit rows -- */
// Shared by Placekicker and Short Snapper (both read DATA.units.money_unit).
// Hoisted 2026-08-01 -- was duplicated verbatim between the two pages.

function fgs(rows) { return rows.filter((r) => r.fg_exp === 'FG'); }
function pats(rows) { return rows.filter((r) => r.fg_exp === 'EXP'); }
function makes(rows) { return rows.filter((r) => r.make); }
function makeRate(rows) { return rate(rows, (r) => r.make); }

/* -------------------------------------------------------------- punt rows -- */
// Shared by Punter and Long Snapper (both read DATA.units.punt). Hoisted
// 2026-08-01 -- was duplicated verbatim between the two pages.

function netOf(r) { return r.total_distance !== null && r.return_length !== null ? r.total_distance - r.return_length : null; }
function avgNet(rows) { return mean(rows.map(netOf)); }
const PUNT_OUTCOMES = ['Downed', 'Fair Catch', 'Touchback', 'Out of Bounds', 'Return', 'Return Touchdown', 'Muff'];

/** FG distance buckets, used by every FG-make%-by-distance chart. Hoisted
 * 2026-08-01 -- was duplicated (identical logic) in special-teams-overview.html
 * (function-scoped) and placekicker.html (top-level). */
const FG_DIST_BUCKETS = ['0-29', '30-39', '40-49', '50+'];
function fgDistBucket(d) { return d < 30 ? '0-29' : d < 40 ? '30-39' : d < 50 ? '40-49' : '50+'; }

function fmt(n, decimals = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toFixed(decimals);
}

function pct(n, decimals = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(decimals)}%`;
}

/** Two-letter initials for an avatar circle, e.g. "Jacob Laurent" -> "JL".
 * Hoisted 2026-08-01 -- was duplicated verbatim in placekicker.html and
 * kickoff-kicker.html, will be needed again by the remaining position pages. */
function initials(name) { return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2); }

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/* ---------------------------------------------------------------- tooltip ----
   Enriched 2026-07-30 per the user ("tooltips need to be better, add more to
   it"): a structured title/rows/divider layout instead of one plain line, plus
   viewport-aware positioning so it never gets clipped off the right/bottom edge.
   Call sites build HTML with .tt-title (bold header), .tt-row (a labeled line --
   pass "<span>label</span><span>value</span>" for a two-column row), .tt-muted
   (de-emphasized caption/sample-size line), and .tt-divider (hairline separator)
   to get a consistent look without hand-rolling inline styles per chart. */

let tooltipEl = null;
let tooltipStyleInjected = false;
function ensureTooltip() {
  if (tooltipEl) return tooltipEl;
  if (!tooltipStyleInjected) {
    const style = document.createElement('style');
    style.textContent = `
      .chart-tooltip { position: fixed; pointer-events: none; z-index: 1000; display: none;
        background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px;
        padding: 9px 12px; font-size: 12px; color: var(--text-primary); line-height: 1.5;
        box-shadow: 0 8px 26px rgba(0,0,0,.20); max-width: 260px; }
      .chart-tooltip .tt-title { font-weight: 700; margin-bottom: 3px; white-space: nowrap; }
      .chart-tooltip .tt-row { display: flex; justify-content: space-between; gap: 14px; white-space: nowrap; }
      .chart-tooltip .tt-muted { color: var(--muted); font-size: 10.5px; margin-top: 3px; }
      .chart-tooltip .tt-divider { border-top: 1px solid var(--grid); margin: 5px 0; }
    `;
    document.head.appendChild(style);
    tooltipStyleInjected = true;
  }
  tooltipEl = el('div', 'chart-tooltip');
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}
function showTooltip(x, y, html) {
  const t = ensureTooltip();
  t.innerHTML = html;
  t.style.display = 'block';
  // Viewport-aware: flip to the left/above the cursor if the default
  // bottom-right placement would clip off the window edge.
  const vw = window.innerWidth, vh = window.innerHeight;
  const rect = t.getBoundingClientRect();
  let left = x + 14;
  let top = y + 14;
  if (left + rect.width > vw - 8) left = x - rect.width - 14;
  if (top + rect.height > vh - 8) top = y - rect.height - 14;
  t.style.left = `${Math.max(4, left)}px`;
  t.style.top = `${Math.max(4, top)}px`;
}
function hideTooltip() {
  if (tooltipEl) tooltipEl.style.display = 'none';
}

/* --------------------------------------------------------------- KPI tile --- */
// Hoisted here 2026-08-01 from special-teams-overview.html (was duplicated
// verbatim there) since every Phase 2 position page needs the same KPI-tile
// markup -- reuse instead of re-copying per page.

function kpiHTML(id, label, dotVar) {
  const dot = dotVar ? `<span class="statusdot" style="background:var(${dotVar})"></span>` : '';
  const accent = dotVar ? ` style="--kpi-accent:var(${dotVar})"` : '';
  return `<div class="kpi"${accent}><div class="label">${dot}${label}</div><div class="value" id="${id}-value">—</div><div class="foot" id="${id}-foot"></div></div>`;
}

function setKPI(id, value, foot) {
  document.getElementById(`${id}-value`).textContent = value;
  if (foot !== undefined) document.getElementById(`${id}-foot`).textContent = foot;
}

/* ------------------------------------------------------------- bar chart ---- */

/** categories: [name...]; values: [number...]; labelFmt(v): string for the cap.
 * colorFn(name, value, i): css color string. tooltipFmt(cat, value, i): full custom
 * tooltip HTML, overrides the default entirely if given. xlab2(cat, i): a sample-size
 * caption under the x-axis label -- also folded into the default tooltip automatically
 * (e.g. "n=85 punts") so hovering shows the same context as the caption. */
function renderBar(container, { categories, values, labelFmt = (v) => fmt(v, 1), colorFn, tooltipFmt, xlab2, seriesName }) {
  container.innerHTML = '';
  const wrap = el('div', 'barchart');
  const max = Math.max(1e-9, ...values.filter((v) => v !== null && !Number.isNaN(v)));
  const gridlines = el('div', 'gridlines');
  for (let i = 0; i < 4; i++) gridlines.appendChild(document.createElement('div'));
  wrap.appendChild(gridlines);

  function defaultTooltip(cat, v, i) {
    if (v === null || Number.isNaN(v)) return `<b>${cat}</b><br>No data`;
    const rows = [`<div class="tt-title">${cat}${seriesName ? ` — ${seriesName}` : ''}</div>`,
      `<div class="tt-row"><span>${labelFmt(v)}</span></div>`];
    if (xlab2) rows.push(`<div class="tt-row tt-muted">${xlab2(cat, i)}</div>`);
    return rows.join('');
  }

  categories.forEach((cat, i) => {
    const v = values[i];
    const col = el('div', 'barcol');
    const barH = v === null || Number.isNaN(v) ? 0 : Math.max(2, (v / max) * 100);
    const bar = el('div', 'bar');
    bar.style.height = `${barH}%`;
    if (colorFn) bar.style.background = colorFn(cat, v, i);
    if (v !== null && !Number.isNaN(v)) bar.appendChild(el('span', 'cap', labelFmt(v)));
    const tt = () => (tooltipFmt ? tooltipFmt(cat, v, i) : defaultTooltip(cat, v, i));
    bar.addEventListener('mouseenter', (e) => showTooltip(e.clientX, e.clientY, tt()));
    bar.addEventListener('mousemove', (e) => showTooltip(e.clientX, e.clientY, tt()));
    bar.addEventListener('mouseleave', hideTooltip);
    col.appendChild(bar);
    col.appendChild(el('div', 'xlab', cat));
    if (xlab2) col.appendChild(el('div', 'xlab2', xlab2(cat, i)));
    wrap.appendChild(col);
  });
  container.appendChild(wrap);
}

/* ------------------------------------------------------------ stacked bar --- */

/** categories: [name...]; series: {seriesName: [value per category]}; order matters
 * for stack order (first = bottom). colors: {seriesName: cssColor}. */
function renderStacked(container, { categories, series, order, colors, legend = true }) {
  container.innerHTML = '';
  if (legend) {
    const lg = el('div', 'legend');
    order.forEach((name) => {
      const sw = el('span', 'sw');
      const dot = el('span', 'dot');
      dot.style.background = colors[name];
      sw.appendChild(dot);
      sw.appendChild(document.createTextNode(name));
      lg.appendChild(sw);
    });
    container.appendChild(lg);
  }
  const wrap = el('div', 'stacked');
  const totals = categories.map((_, i) => order.reduce((s, name) => s + (series[name][i] || 0), 0));
  const max = Math.max(1e-9, ...totals);
  const gridlines = el('div', 'gridlines');
  for (let i = 0; i < 4; i++) gridlines.appendChild(document.createElement('div'));
  wrap.appendChild(gridlines);
  categories.forEach((cat, i) => {
    const col = el('div', 'stackcol');
    const total = totals[i];
    col.appendChild(el('div', 'cap', total ? String(total) : ''));
    const bar = el('div', 'stackbar');
    bar.style.height = `${Math.max(2, (total / max) * 100)}%`;
    order.forEach((name) => {
      const v = series[name][i] || 0;
      if (!v) return;
      const seg = el('div', 'seg');
      seg.style.background = colors[name];
      seg.style.height = `${(v / total) * 100}%`;
      const share = total ? v / total : 0;
      const tt = () => [
        `<div class="tt-title">${cat}</div>`,
        `<div class="tt-row"><span>${name}</span><span>${v}</span></div>`,
        `<div class="tt-muted">${pct(share, 0)} of ${total} in this group</div>`,
      ].join('');
      seg.addEventListener('mouseenter', (e) => showTooltip(e.clientX, e.clientY, tt()));
      seg.addEventListener('mousemove', (e) => showTooltip(e.clientX, e.clientY, tt()));
      seg.addEventListener('mouseleave', hideTooltip);
      bar.appendChild(seg);
    });
    col.appendChild(bar);
    col.appendChild(el('div', 'xlab', cat));
    wrap.appendChild(col);
  });
  container.appendChild(wrap);
}

/* ------------------------------------------------------------- scatter ------ */

/** points: [{x, y, group, label}]. colorMap: {group: cssColor}. */
function renderScatter(container, { points, xLabel, yLabel, colorMap, xDomain, yDomain }) {
  container.innerHTML = '';
  const W = 600, H = 150, PAD_L = 34, PAD_B = 18, PAD_T = 6, PAD_R = 6;
  const xs = points.map((p) => p.x).filter((v) => v !== null && v !== undefined);
  const ys = points.map((p) => p.y).filter((v) => v !== null && v !== undefined);
  if (!xs.length || !ys.length) {
    container.appendChild(el('div', 'foot', 'No data in current filters.'));
    return;
  }
  const [xMin, xMax] = xDomain || [Math.min(...xs), Math.max(...xs)];
  const [yMin, yMax] = yDomain || [Math.min(...ys), Math.max(...ys)];
  const sx = (v) => PAD_L + ((v - xMin) / (xMax - xMin || 1)) * (W - PAD_L - PAD_R);
  const sy = (v) => H - PAD_B - ((v - yMin) / (yMax - yMin || 1)) * (H - PAD_B - PAD_T);

  const svgns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.width = '100%';
  svg.style.height = `${H}px`;

  // gridlines (y-axis, 3 lines)
  for (let i = 0; i <= 2; i++) {
    const gy = PAD_T + (i * (H - PAD_B - PAD_T)) / 2;
    const line = document.createElementNS(svgns, 'line');
    line.setAttribute('x1', PAD_L); line.setAttribute('x2', W - PAD_R);
    line.setAttribute('y1', gy); line.setAttribute('y2', gy);
    line.setAttribute('stroke', cssVar('--grid')); line.setAttribute('stroke-width', '1');
    svg.appendChild(line);
    const label = document.createElementNS(svgns, 'text');
    label.setAttribute('x', PAD_L - 4); label.setAttribute('y', gy + 3);
    label.setAttribute('text-anchor', 'end'); label.setAttribute('font-size', '9');
    label.setAttribute('fill', cssVar('--muted'));
    label.textContent = fmt(yMax - (i * (yMax - yMin)) / 2, 0);
    svg.appendChild(label);
  }

  points.forEach((p) => {
    if (p.x === null || p.y === null || p.x === undefined || p.y === undefined) return;
    const c = document.createElementNS(svgns, 'circle');
    c.setAttribute('cx', sx(p.x)); c.setAttribute('cy', sy(p.y)); c.setAttribute('r', 4);
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke', (colorMap && colorMap[p.group]) || cssVar('--cat-1'));
    c.setAttribute('stroke-width', '1.6');
    c.style.cursor = 'pointer';
    const defaultTt = () => [
      p.group ? `<div class="tt-title">${p.group}</div>` : '',
      `<div class="tt-row"><span>${xLabel}</span><span>${fmt(p.x)}</span></div>`,
      `<div class="tt-row"><span>${yLabel}</span><span>${fmt(p.y)}</span></div>`,
    ].join('');
    const tt = () => p.label || defaultTt();
    c.addEventListener('mouseenter', (e) => showTooltip(e.clientX, e.clientY, tt()));
    c.addEventListener('mousemove', (e) => showTooltip(e.clientX, e.clientY, tt()));
    c.addEventListener('mouseleave', hideTooltip);
    svg.appendChild(c);
  });

  const wrap = el('div', 'linewrap');
  wrap.appendChild(svg);
  const axis = el('div', 'axis-x');
  axis.appendChild(el('span', null, xLabel));
  axis.appendChild(el('span', null, yLabel));
  container.appendChild(wrap);
  container.appendChild(axis);
}

/* ------------------------------------------------------------- heatmap ------ */

const SEQ_STEPS = ['--seq-100', '--seq-200', '--seq-300', '--seq-400', '--seq-500', '--seq-600'];

/** rowLabels/colLabels: [string...]. cellFor(row, col): {pct: 0..1, n, made} or
 * null/undefined for "no data in this cell" (rendered as a dash on --grid, not a
 * fabricated 0%). Sequential single-hue ramp per the dataviz skill -- magnitude
 * only, sorted rows/cols stay in the order given (caller's job, e.g. sortBuckets
 * for a distance bucket axis). */
function renderHeatmap(container, { rowLabels, colLabels, cellFor, title = (r, c) => `${r} × ${c}` }) {
  container.innerHTML = '';
  const grid = el('div', 'heat');
  grid.style.gridTemplateColumns = `130px repeat(${colLabels.length}, 1fr)`;
  grid.appendChild(el('div', 'rowlabel', ''));
  colLabels.forEach((c) => grid.appendChild(el('div', 'collabel', c)));
  rowLabels.forEach((r) => {
    grid.appendChild(el('div', 'rowlabel', r));
    colLabels.forEach((c) => {
      const cell = cellFor(r, c);
      const div = el('div', 'hcell');
      if (!cell || !cell.n) {
        div.style.background = cssVar('--grid');
        div.style.color = cssVar('--muted');
        div.textContent = '—';
      } else {
        const step = Math.min(SEQ_STEPS.length - 1, Math.floor(cell.pct * SEQ_STEPS.length));
        div.style.background = cssVar(SEQ_STEPS[step]);
        div.style.color = step >= 4 ? '#fff' : cssVar('--text-primary');
        div.innerHTML = `${pct(cell.pct, 0)}<span class="n">${cell.made}/${cell.n}</span>`;
        const html = `<div class="tt-title">${title(r, c)}</div><div class="tt-row"><span>${pct(cell.pct, 0)}</span><span>${cell.made}/${cell.n}</span></div>`;
        div.addEventListener('mouseenter', (e) => showTooltip(e.clientX, e.clientY, html));
        div.addEventListener('mousemove', (e) => showTooltip(e.clientX, e.clientY, html));
        div.addEventListener('mouseleave', hideTooltip);
        div.style.cursor = 'pointer';
      }
      grid.appendChild(div);
    });
  });
  container.appendChild(grid);
}

/* ------------------------------------------------------------ sparkline ----- */

/** values: [number...] (chronological); labels: [string...] same length. Colors
 * each segment green if it's rising toward/above the running average, red if
 * falling below -- matches the reference dashboards' red/green trend lines. */
function renderSparkline(container, { values, labels, unit = '' }) {
  container.innerHTML = '';
  const pts = values.map((v, i) => ({ v, l: labels[i] })).filter((p) => p.v !== null && p.v !== undefined);
  if (pts.length < 2) {
    container.appendChild(el('div', 'foot', 'Not enough data points.'));
    return;
  }
  const W = 560, H = 140, PAD = 8;
  const avg = mean(pts.map((p) => p.v));
  const vMin = Math.min(...pts.map((p) => p.v), avg);
  const vMax = Math.max(...pts.map((p) => p.v), avg);
  const sx = (i) => PAD + (i / (pts.length - 1)) * (W - PAD * 2);
  const sy = (v) => H - PAD - ((v - vMin) / (vMax - vMin || 1)) * (H - PAD * 2 - 14) - 6;

  const svgns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.width = '100%';
  svg.style.height = `${H}px`;

  const avgLine = document.createElementNS(svgns, 'line');
  avgLine.setAttribute('x1', PAD); avgLine.setAttribute('x2', W - PAD);
  avgLine.setAttribute('y1', sy(avg)); avgLine.setAttribute('y2', sy(avg));
  avgLine.setAttribute('stroke', cssVar('--baseline')); avgLine.setAttribute('stroke-width', '1');
  avgLine.setAttribute('stroke-dasharray', '3,3');
  svg.appendChild(avgLine);
  const avgLabel = document.createElementNS(svgns, 'text');
  avgLabel.setAttribute('x', PAD); avgLabel.setAttribute('y', sy(avg) - 4);
  avgLabel.setAttribute('font-size', '9'); avgLabel.setAttribute('fill', cssVar('--muted'));
  avgLabel.textContent = 'Average';
  svg.appendChild(avgLabel);

  for (let i = 1; i < pts.length; i++) {
    const seg = document.createElementNS(svgns, 'line');
    seg.setAttribute('x1', sx(i - 1)); seg.setAttribute('y1', sy(pts[i - 1].v));
    seg.setAttribute('x2', sx(i)); seg.setAttribute('y2', sy(pts[i].v));
    const rising = pts[i].v >= pts[i - 1].v;
    seg.setAttribute('stroke', rising ? cssVar('--good') : cssVar('--critical'));
    seg.setAttribute('stroke-width', '2');
    seg.setAttribute('stroke-linecap', 'round');
    svg.appendChild(seg);
  }
  pts.forEach((p, i) => {
    const c = document.createElementNS(svgns, 'circle');
    c.setAttribute('cx', sx(i)); c.setAttribute('cy', sy(p.v)); c.setAttribute('r', 3);
    c.setAttribute('fill', cssVar('--surface-1'));
    c.setAttribute('stroke', p.v >= avg ? cssVar('--good') : cssVar('--critical'));
    c.setAttribute('stroke-width', '2');
    c.style.cursor = 'pointer';
    const prev = i > 0 ? pts[i - 1].v : null;
    const delta = prev !== null ? p.v - prev : null;
    const vsAvg = p.v - avg;
    const html = () => [
      `<div class="tt-title">${p.l}</div>`,
      `<div class="tt-row"><span>Value</span><span>${fmt(p.v)}${unit}</span></div>`,
      delta !== null ? `<div class="tt-row"><span>Vs previous</span><span style="color:${delta >= 0 ? 'var(--delta-good)' : 'var(--critical)'}">${delta >= 0 ? '+' : ''}${fmt(delta)}${unit}</span></div>` : '',
      `<div class="tt-muted">${vsAvg >= 0 ? '+' : ''}${fmt(vsAvg)}${unit} vs average (${fmt(avg)}${unit})</div>`,
    ].join('');
    c.addEventListener('mouseenter', (e) => showTooltip(e.clientX, e.clientY, html()));
    c.addEventListener('mousemove', (e) => showTooltip(e.clientX, e.clientY, html()));
    c.addEventListener('mouseleave', hideTooltip);
    svg.appendChild(c);
  });

  const wrap = el('div', 'linewrap');
  wrap.appendChild(svg);
  container.appendChild(wrap);
  const axis = el('div', 'axis-x');
  axis.appendChild(el('span', null, pts[0].l));
  axis.appendChild(el('span', null, pts[pts.length - 1].l));
  container.appendChild(axis);
}

/* ---------------------------------------------------------------- two-line -- */

/** Small shared two-series line chart over a fixed category axis (e.g. seasons)
 * -- simpler than the Lifting Class Comparison chart since there's no career-
 * year realignment needed here, just a straight per-category plot. Hoisted
 * 2026-08-01 from placekicker.html into here since the Kickoff Kicker page
 * needs the identical thing. */
function renderTwoLine(svg, categories, valuesA, valuesB, colorA, colorB, nameA, nameB, labelFmt) {
  const svgns = 'http://www.w3.org/2000/svg';
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const W = 1180, H = 150, PAD = 10;
  const all = [...valuesA, ...valuesB].filter((v) => v !== null && v !== undefined);
  const vMin = all.length ? Math.min(...all, 0) : 0;
  const vMax = all.length ? Math.max(...all, 1) : 1;
  const sx = (i) => PAD + (i / Math.max(1, categories.length - 1)) * (W - PAD * 2);
  const sy = (v) => H - PAD - ((v - vMin) / (vMax - vMin || 1)) * (H - PAD * 2 - 16) - 10;

  function line(values, color, name) {
    for (let i = 1; i < values.length; i++) {
      if (values[i - 1] === null || values[i] === null) continue;
      const l = document.createElementNS(svgns, 'line');
      l.setAttribute('x1', sx(i - 1)); l.setAttribute('y1', sy(values[i - 1]));
      l.setAttribute('x2', sx(i)); l.setAttribute('y2', sy(values[i]));
      l.setAttribute('stroke', color); l.setAttribute('stroke-width', '2'); l.setAttribute('stroke-linecap', 'round');
      svg.appendChild(l);
    }
    values.forEach((v, i) => {
      if (v === null) return;
      const c = document.createElementNS(svgns, 'circle');
      c.setAttribute('cx', sx(i)); c.setAttribute('cy', sy(v)); c.setAttribute('r', 3.5);
      c.setAttribute('fill', color);
      c.style.cursor = 'pointer';
      const html = `<div class="tt-title">${name} — ${categories[i]}</div><div class="tt-row"><span>${labelFmt(v)}</span></div>`;
      c.addEventListener('mouseenter', (e) => showTooltip(e.clientX, e.clientY, html));
      c.addEventListener('mousemove', (e) => showTooltip(e.clientX, e.clientY, html));
      c.addEventListener('mouseleave', hideTooltip);
      svg.appendChild(c);
    });
  }
  line(valuesA, colorA, nameA);
  line(valuesB, colorB, nameB);
  categories.forEach((cat, i) => {
    const t = document.createElementNS(svgns, 'text');
    t.setAttribute('x', sx(i)); t.setAttribute('y', H - 2); t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', '10'); t.setAttribute('fill', cssVar('--muted'));
    t.textContent = cat;
    svg.appendChild(t);
  });
}

/** Snap Location's real scale, computed from the data instead of hardcoded --
 * per the user (2026-08-01), it's a snap-quality ranking that may end up 1-3 or
 * 1-5 depending on how it's charted going forward, so every position page reads
 * whatever distinct values actually exist (from the full unit, not the current
 * filter, so the axis stays stable as filters narrow) rather than assuming 3. */
function snapLocationScale(rows) {
  return [...new Set(rows.map((r) => r.snap_location).filter((v) => v !== null && v !== undefined))]
    .map(String).sort((a, b) => Number(a) - Number(b));
}

/* --------------------------------------------------------------- grouping --- */

function groupBy(rows, field) {
  const map = new Map();
  rows.forEach((r) => {
    const k = r[field];
    if (k === null || k === undefined) return;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  });
  return map;
}

/** Sorts field-position bucket labels ("0-10","11-20",...) in numeric order. */
function sortBuckets(labels) {
  return [...labels].sort((a, b) => parseInt(a) - parseInt(b));
}

/** Parses either "M/D/YYYY" (Special Teams data) or ISO "YYYY-MM-DD" (Game
 * Analysis data) into a sortable numeric key, without going through the Date
 * constructor's timezone-dependent parsing (an ISO string parses as UTC
 * midnight, which can shift a day in negative-UTC timezones). */
function parseGameDate(d) {
  const [a, b, c] = d.includes('-') ? d.split('-') : d.split('/').reverse();
  // includes('-') -> [YYYY, MM, DD]; else reversed "M/D/YYYY" -> [YYYY, D, M]
  return d.includes('-') ? Number(a) * 10000 + Number(b) * 100 + Number(c) : Number(a) * 10000 + Number(c) * 100 + Number(b);
}

function formatGameDateLabel(d) {
  if (d.includes('-')) {
    const [, m, day] = d.split('-');
    return `${Number(m)}/${Number(day)}`;
  }
  const [m, day] = d.split('/');
  return `${m}/${day}`;
}

/** Groups rows by (season, date) chronologically, averages `field`, returns
 * {values, labels} for renderSparkline -- games/weeks. Hoisted 2026-07-30
 * from special-teams-overview.html into here since Offense/Defense need the
 * identical thing. */
function gameTrend(rows, field) {
  const byGame = groupBy(rows.map((r) => ({ ...r, _gk: `${r.season}|${r.date}` })), '_gk');
  const games = [...byGame.keys()].sort((a, b) => parseGameDate(a.split('|')[1]) - parseGameDate(b.split('|')[1]));
  const values = games.map((g) => mean(byGame.get(g).map((r) => r[field])));
  const labels = games.map((g) => formatGameDateLabel(g.split('|')[1]));
  return { values, labels };
}

/** Card with a "Last Game" KPI + "Last vs Previous Game" delta + sparkline --
 * hoisted 2026-07-30 from special-teams-overview.html (was duplicated there
 * with the Offense/Defense build), same "Last Week vs Avg" semantics as the
 * original Tableau dashboards (comparing to the immediately-prior game, not
 * a season average). */
function renderTrendCard(container, rows, field, unit, title) {
  const { values, labels } = gameTrend(rows, field);
  const lastVal = values.length ? values[values.length - 1] : null;
  const prevVal = values.length > 1 ? values[values.length - 2] : null;
  const delta = lastVal !== null && prevVal !== null ? lastVal - prevVal : null;
  container.innerHTML = `
    <div class="card-head"><h3>${title}</h3></div>
    <div class="card-body trend-body">
      <div>
        <div class="kpi small" style="border:none; padding:0; background:none;">
          <div class="label">Last Game Avg</div>
          <div class="value">${fmt(lastVal)}${unit}</div>
        </div>
        <div class="kpi small" style="border:none; padding:0; background:none; margin-top:10px;">
          <div class="label">Last vs Previous Game</div>
          <div class="value" style="font-size:15px; color:${delta === null ? 'inherit' : (delta >= 0 ? 'var(--delta-good)' : 'var(--critical)')}">${delta === null ? '—' : (delta >= 0 ? '+' : '') + fmt(delta)}</div>
        </div>
      </div>
      <div class="trend-chart"></div>
    </div>`;
  renderSparkline(container.querySelector('.trend-chart'), { values, labels, unit });
}

/** Top N keys of a groupBy() Map, ordered by descending row count -- for
 * open-ended categorical fields (formation, personnel, defensive front,
 * coverage, play call, ...) that have no fixed canonical order the way
 * distance buckets or a season list do (Offense/Defense play-calling
 * tendencies charts, e.g. play_call has 260+ distinct real values). */
function topKeysByCount(map, n = 10) {
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, n).map(([k]) => k);
}

/* ============================================================================
   FILTER PANEL (rebuilt 2026-07-30, per the user: "filtering is not intuitive")
   ============================================================================
   Replaces the original native <select multiple> panels -- ctrl-click
   multi-select has no visible "what's currently selected" affordance and most
   people don't know the interaction exists at all. This is a checkbox-list
   panel instead (the same .fp-chk pattern the ORIGINAL Special Teams Data
   mockups already used, which this project's theme.css copied the CSS for but
   the dashboards never actually built with) -- every option visible with a
   real checkbox, All/None per group, a live count badge on the Filters button
   so you can tell at a glance whether anything is narrowed without opening the
   panel, and a search box on any group with more than 8 options.
*/

function buildFilterPanel(tabId, filterDefs, filterValues) {
  const groups = filterDefs.map(({ field, label }) => {
    const values = filterValues[field] || [];
    const searchable = values.length > 8;
    const rows = values.map((v) => `<label class="fp-chk"><input type="checkbox" data-field="${field}" value="${v}" checked>${v}</label>`).join('');
    return `
      <div class="fp-group" data-group="${field}">
        <div class="fp-label-row">
          <div class="fp-label">${label}</div>
          <div class="fp-quick">
            <button type="button" class="fp-quick-btn" data-all="${field}">All</button>
            <button type="button" class="fp-quick-btn" data-none="${field}">None</button>
          </div>
        </div>
        ${searchable ? `<input type="text" class="fp-search" placeholder="Search…" data-search="${field}">` : ''}
        <div class="fp-chk-list${searchable ? ' fp-chk-list-scroll' : ''}" data-list="${field}">${rows}</div>
      </div>`;
  }).join('');
  return `
    <div class="filters-control">
      <button class="filters-btn" id="${tabId}-filters-btn">Filters <span class="filter-badge" id="${tabId}-badge" hidden>0</span></button>
      <div class="filters-panel filters-panel-wide" id="${tabId}-filters-panel">
        <div class="fp-groups">${groups}</div>
        <div class="fp-actions"><button class="fp-reset" data-reset="${tabId}">Reset all filters</button></div>
      </div>
    </div>
    <span class="filters-summary" id="${tabId}-summary"></span>`;
}

function wireFilterPanel(tabId, filterDefs, onChange) {
  const btn = document.getElementById(`${tabId}-filters-btn`);
  const panel = document.getElementById(`${tabId}-filters-panel`);
  const badge = document.getElementById(`${tabId}-badge`);

  btn.addEventListener('click', () => panel.classList.toggle('open'));
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) panel.classList.remove('open');
  });

  function updateBadge() {
    let narrowed = 0;
    filterDefs.forEach(({ field }) => {
      const all = panel.querySelectorAll(`input[data-field="${field}"]`).length;
      const checked = panel.querySelectorAll(`input[data-field="${field}"]:checked`).length;
      if (checked < all) narrowed++;
    });
    if (narrowed) { badge.hidden = false; badge.textContent = String(narrowed); } else { badge.hidden = true; }
  }

  panel.querySelectorAll('input[type="checkbox"][data-field]').forEach((cb) => {
    cb.addEventListener('change', () => { onChange(); updateBadge(); });
  });
  panel.querySelectorAll('[data-all]').forEach((b) => b.addEventListener('click', () => {
    panel.querySelectorAll(`input[data-field="${b.dataset.all}"]`).forEach((cb) => { cb.checked = true; });
    onChange(); updateBadge();
  }));
  panel.querySelectorAll('[data-none]').forEach((b) => b.addEventListener('click', () => {
    panel.querySelectorAll(`input[data-field="${b.dataset.none}"]`).forEach((cb) => { cb.checked = false; });
    onChange(); updateBadge();
  }));
  panel.querySelectorAll('input[data-search]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const q = inp.value.toLowerCase();
      panel.querySelectorAll(`.fp-chk-list[data-list="${inp.dataset.search}"] .fp-chk`).forEach((label) => {
        label.style.display = label.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  });
  panel.querySelector('[data-reset]').addEventListener('click', () => {
    panel.querySelectorAll('input[type="checkbox"][data-field]').forEach((cb) => { cb.checked = true; });
    panel.querySelectorAll('input[data-search]').forEach((inp) => { inp.value = ''; });
    panel.querySelectorAll('.fp-chk').forEach((l) => { l.style.display = ''; });
    onChange(); updateBadge();
  });

  updateBadge();
}

function readFilterState(tabId, filterDefs) {
  const panel = document.getElementById(`${tabId}-filters-panel`);
  const state = {};
  filterDefs.forEach(({ field }) => {
    state[field] = new Set([...panel.querySelectorAll(`input[data-field="${field}"]:checked`)].map((cb) => cb.value));
  });
  return state;
}

function applyFilters(rows, state) {
  // A blank/null value on a row always passes every filter on that field -- "no
  // info charted for this dimension" isn't the same as "excluded by the user's
  // selection." (Real bug found and fixed 2026-07-29: the default, everything-
  // checked view must show every row, not silently drop the ones missing one field.)
  return rows.filter((r) => Object.entries(state).every(([field, set]) => {
    // An empty set means the user explicitly hit "None" on this group -- unlike
    // a normal narrowed selection, that should exclude everything on this field
    // (including blank/null rows), not fall through to "no filter applied."
    // Real bug found and fixed 2026-07-30: this used to `return true` here, so
    // clicking "None" silently showed every row instead of zero.
    if (!set.size) return false;
    const v = r[field];
    if (v === null || v === undefined || v === '') return true;
    return set.has(String(v));
  }));
}

/* ------------------------------------------------------- searchable combobox --- */

/** A single-select text input with a live-filtered dropdown list -- for choosing
 * one item out of a long list (e.g. 230+ athlete names) where a plain <select>
 * forces scrolling through everything alphabetically with no way to type-ahead. */
function makeSearchCombobox(container, { options, value, onChange, placeholder = 'Search…' }) {
  const wrap = el('div', 'combobox');
  const input = el('input', 'combobox-input');
  input.type = 'text';
  input.placeholder = placeholder;
  const list = el('div', 'combobox-list');
  wrap.appendChild(input);
  wrap.appendChild(list);
  container.innerHTML = '';
  container.appendChild(wrap);

  let current = value;
  function labelFor(v) { return (options.find((o) => o.value === v) || {}).label || ''; }
  input.value = labelFor(current);

  function renderList(query) {
    const q = (query || '').toLowerCase();
    const matches = options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 40);
    list.innerHTML = matches.map((o) => `<div class="combobox-item" data-value="${o.value}">${o.label}</div>`).join('');
    list.querySelectorAll('.combobox-item').forEach((item) => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        current = item.dataset.value;
        input.value = item.textContent;
        list.classList.remove('open');
        onChange(current);
      });
    });
    list.classList.toggle('open', matches.length > 0);
  }

  input.addEventListener('focus', () => renderList(''));
  input.addEventListener('input', () => renderList(input.value));
  input.addEventListener('blur', () => {
    setTimeout(() => {
      list.classList.remove('open');
      if (input.value !== labelFor(current)) input.value = labelFor(current); // revert if left mid-search
    }, 120);
  });

  return { get value() { return current; }, set value(v) { current = v; input.value = labelFor(v); } };
}
