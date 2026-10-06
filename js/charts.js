/*
  Shared library for every dashboard: formatting and grouping helpers, the tooltip, the KPI
  tile, the glossary, chart renderers, the checkbox filter panel, and the searchable combobox.
  Vanilla JS, no dependencies; loaded before js/shell.js and the page's views.
  Renders into the CSS classes in css/theme.css.

  Contents (search for the banner):
    helpers          colors, mean/rate, fmt/pct, el(), printPage
    domain           special-teams row helpers, FG/hash buckets, down/distance buckets
    tooltip          showTooltip / hideTooltip
    glossary         GLOSSARY definitions + the inline "?" hints, kpiHTML / setKPI
    charts           renderBar, renderStacked, renderScatter, renderHeatmap, renderSparkline,
                     renderGroupedBar, renderTrendCard
    grouping         groupBy, uniqueByKey, topKeysByCount, gameTrend, bestByGroup
    filter panel     buildFilterPanel / wireFilterPanel / readFilterState / applyFilters
    combobox         makeSearchCombobox

  Categorical color always comes from --cat-1..--cat-8 in that fixed order (never cycled or
  reassigned), sequential magnitude uses --seq-*, status uses --good/--warning/--serious/--critical,
  and every chart with >=2 series ships a legend plus a hover tooltip.
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

/** Share of `rows` matching `pred`, or null for an empty set (never a fake 0%). */
function rate(rows, pred) { return rows.length ? rows.filter(pred).length / rows.length : null; }

/* ------------------------------------------------------ domain: special teams -- */
// money_unit (PAT/FG) rows -- used by the Money Unit tab and the Placekicker/Short Snapper views.

function fgs(rows) { return rows.filter((r) => r.fg_exp === 'FG'); }
function pats(rows) { return rows.filter((r) => r.fg_exp === 'EXP'); }
function makes(rows) { return rows.filter((r) => r.make); }
function makeRate(rows) { return rate(rows, (r) => r.make); }

// punt rows -- used by the Punt tab and the Punter/Long Snapper views.

function netOf(r) { return r.total_distance !== null && r.return_length !== null ? r.total_distance - r.return_length : null; }
function avgNet(rows) { return mean(rows.map(netOf)); }
const PUNT_OUTCOMES = ['Downed', 'Fair Catch', 'Touchback', 'Out of Bounds', 'Return', 'Return Touchdown', 'Muff'];

/** FG distance buckets, used by every FG-make%-by-distance chart. */
const FG_DIST_BUCKETS = ['0-29', '30-39', '40-49', '50+'];
function fgDistBucket(d) { return d < 30 ? '0-29' : d < 40 ? '30-39' : d < 50 ? '40-49' : '50+'; }

/** Hash-mark category order for kick-location charts (5 values; charted offense/defense plays only ever use L/M/R). */
const HASH_ORDER = ['L', 'LM', 'M', 'RM', 'R'];

function fmt(n, decimals = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toFixed(decimals);
}

function pct(n, decimals = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(decimals)}%`;
}

/** "50 real Carroll games, 2021–2025" computed from game-data.json's own `games` array, so
 * footer notes never go stale when a new game is charted. */
function gameCoverageText(games) {
  const seasons = games.map((g) => Number(g.season)).filter((s) => !Number.isNaN(s));
  if (!seasons.length) return '0 real Carroll games';
  const min = Math.min(...seasons), max = Math.max(...seasons);
  return `${games.length} real Carroll games, ${min}${min === max ? '' : `–${max}`}`;
}

/** Two-letter initials for an avatar circle, e.g. "Jacob Laurent" -> "JL". */
function initials(name) { return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2); }

/** Print the page with a specific document title (restored after printing) so the browser's
 * "Save as PDF" filename matches the content, not the page's own <title>. */
function printPage(filenameTitle) {
  const prevTitle = document.title;
  document.title = filenameTitle;
  window.print();
  document.title = prevTitle;
}

/** HTML-escapes data-derived text (also exposed as Site.esc). */
function escapeHTML(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** "#3 of 9" for a rank, tagged green in the top 3 and red in the bottom 3 (Rankings + Home). */
function rankTag(rank, outOf) {
  if (rank <= 3) return `<span class="tag good">#${rank} of ${outOf}</span>`;
  if (outOf - rank < 3) return `<span class="tag crit">#${rank} of ${outOf}</span>`;
  return `#${rank} of ${outOf}`;
}

/** Record Watch status for one entry (Players & Records + Home). `e.leaderboard` is the record
 * book's list for the statistic; "close" (highlighted) means within 10% of the target rank's value.
 * Someone ALREADY inside the list shows their distance to the next BETTER rank directly above
 * them, by name, not a generic "already in the Top 5". */
function recordWatchStatusHTML(e) {
  const lb = e.leaderboard;
  if (!lb.length) return '—';
  const gapText = (g) => fmt(g, Number.isInteger(g) ? 0 : 1);
  // Index of the best leaderboard entry the player already matches or beats.
  const i = lb.findIndex((r) => e.current_value >= r.value_numeric);
  if (i === -1) {
    const target = lb[lb.length - 1];
    const gap = target.value_numeric - e.current_value;
    const close = gap <= target.value_numeric * 0.1;
    return `<span class="${close ? 'watch-gap-crit' : ''}">${gapText(gap)} from the current #${target.rank}</span>`;
  }
  if (i === 0) {
    return e.current_value > lb[0].value_numeric
      ? '<span class="watch-gap-good">Ahead of the current #1</span>'
      : `<span class="watch-gap-good">Tied with the current #1 (${escapeHTML(lb[0].player)})</span>`;
  }
  const target = lb[i - 1];
  const gap = target.value_numeric - e.current_value;
  return gap === 0
    ? `<span class="watch-gap-good">Tied with #${target.rank} (${escapeHTML(target.player)})</span>`
    : `<span class="watch-gap-good">${gapText(gap)} from #${target.rank} (${escapeHTML(target.player)})</span>`;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/* ---------------------------------------------------------------- tooltip ----
   A structured title/rows/divider layout with viewport-aware positioning (never clipped off
   the right/bottom edge). Call sites build HTML with .tt-title (bold header), .tt-row (a
   labeled line -- "<span>label</span><span>value</span>" for two columns), .tt-muted (caption /
   sample-size line), and .tt-divider (hairline). */

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

/* ------------------------------------------------------- glossary + KPI tile --- */
// Term -> plain-language definition. The single source of truth for both the Glossary page
// (js/views/glossary.js) and the inline "?" hover hints on KPI tiles -- add a term here once and
// it's usable from either place.
const GLOSSARY = {
  'Explosive Play': 'A run gaining 10+ yards or a pass gaining 15+ yards — the "big play" threshold used across every efficiency chart on this site.',
  'Success Rate': 'Share of plays that gained enough yardage relative to down and distance: at least 50% of yards-to-go on 1st down, 70% on 2nd down, or a full conversion on 3rd/4th down.',
  'Stuffed': 'A play efficiency result meaning 0 or negative yards gained.',
  'Play Efficiency': 'A play is classified Explosive, Successful, Unsuccessful, or Stuffed based on yards gained relative to down and distance — see the Explosive Play / Success Rate / Stuffed entries for the exact thresholds.',
  'Money Down': '3rd or 4th down — the down where the offense must convert or give up the ball.',
  'Passing Down': '2nd down with 7 or more yards to go — a situation where a pass is statistically much more likely than a run.',
  'Standard Down': "Any down/distance that isn't a Money Down or Passing Down — the \"expected\" play-calling situation.",
  'Field Zone': 'Backed Up / Own Territory / Midfield / Opponent Territory / Red Zone — five buckets of distance-to-the-end-zone used to group plays by field position.',
  'Red Zone': "Inside the opponent's own 20-yard line — the highest-value scoring area of the field.",
  'Points / Drive (approx.)': "A simplified estimate: 6 points for a touchdown, 3 for a made field goal, 0 otherwise — doesn't add PAT/two-point value on top, so it's always a slight underestimate of real points per drive.",
  'Turnover Rate': "Share of Carroll's own offensive plays that ended in a turnover (interception or lost fumble) — a giveaway.",
  'Takeaway Rate': "Share of the opponent's offensive plays, while Carroll is on defense, that ended in a turnover — a Carroll takeaway.",
  'Drive Result Mix': "How Carroll's offensive drives actually ended (Touchdown, Punt, Turnover, etc.), counted once per real drive — not once per play.",
  'Play Outcome': 'The specific charted result of a play (Touchdown, Interception, Sack, Complete, Incomplete, Fumble, etc.), shown exactly as charted — including compound results like "Rush, TD" when more than one thing happened on the same play.',
  'Value / Score': "A \"points added over expectation\" metric computed for every Special Teams unit — how many points better or worse than an average Carroll attempt that play was, rescaled to a 0–100 Score for easy comparison across units.",
  'Snap Location': "A hand-charted snap-quality rating (scale still being finalized by the coaching staff, currently 1-3 or 1-5) — which end of the scale means \"better\" isn't confirmed yet.",
  'Net Punt': "Gross punt distance minus the returner's return yardage — the real field-position value of a punt.",
  'Inside-20 (I20)': "A punt that pins the opponent inside their own 20-yard line — a strong special teams outcome.",
  'Inside-25 (I25)': "A kickoff that pins the opponent inside their own 25-yard line.",
  'Touchback': 'A kick that goes into (or is downed in) the end zone, giving the receiving team the ball at a fixed spot with no return.',
  'Operation Time': "The full snap-to-kick sequence, split into Snap → Catch (snapper to holder/punter) and Catch → Kick (holder/punter to the kick itself) — hand-charted from 2023 onward.",
  'Hash': "Which hash mark the ball was snapped from or kicked to: Left, Middle, or Right (Special Teams' kick-landing tracking also uses Left-Middle/Right-Middle).",
  'Personnel': 'The grouping of running backs/tight ends/wide receivers on the field for a play (e.g. "11 personnel" = 1 RB, 1 TE, 3 WR).',
  'Coverage': "The pass defense scheme (e.g. Cover 1, Cover 3) the opponent's defense showed against Carroll's offense.",
  'Coverage Shell': 'The deep-safety alignment behind a coverage call (e.g. "2 High" = two deep safeties) — shown for what opponents display against Carroll\'s offense.',
  'Direction': 'Which side of the field a run or pass play attacked: Left, Middle, or Right.',
  'Pass Depth': 'Short or Deep — how far downfield a pass was thrown.',
  'CCIW': "College Conference of Illinois & Wisconsin, Carroll's conference — CCIW rankings compare Carroll against the other ~9-10 teams in the conference.",
  'National (NCAA D3) Rankings': "Carroll's rank among all ~200+ NCAA Division III football programs nationally, via NCAA.com.",
  'Strength Score / Athleticism Score': "Team-scope percentile scores computed by the Lifting Data project — a composite z-score across an athlete's lift or testing numbers, rescaled to 0-100.",
  'Pro Agility': 'A timed change-of-direction sprint (the 5-10-5 shuttle) — the one metric on the Lifting & Strength page where a *lower* time is better.',
};

/** Small "?" marker that shows a term's GLOSSARY definition on hover/focus, via the same tooltip as
 * every chart. One delegated listener (below) handles every marker, so re-rendered content needs no re-wiring. */
function glossaryMarker(term) {
  return `<span class="glossary-hint" data-glossary-term="${term}" tabindex="0">?</span>`;
}
document.addEventListener('mouseover', (e) => {
  const hint = e.target.closest('.glossary-hint');
  if (!hint) return;
  const term = hint.dataset.glossaryTerm;
  const def = GLOSSARY[term];
  if (!def) return;
  const r = hint.getBoundingClientRect();
  showTooltip(r.left, r.bottom + 4, `<div class="tt-title">${term}</div><div class="tt-muted" style="color:var(--text-primary); font-size:12px; margin-top:2px;">${def}</div>`);
});
document.addEventListener('mouseout', (e) => {
  if (e.target.closest('.glossary-hint')) hideTooltip();
});
document.addEventListener('focusin', (e) => {
  const hint = e.target.closest('.glossary-hint');
  if (!hint) return;
  const term = hint.dataset.glossaryTerm;
  const def = GLOSSARY[term];
  if (!def) return;
  const r = hint.getBoundingClientRect();
  showTooltip(r.left, r.bottom + 4, `<div class="tt-title">${term}</div><div class="tt-muted" style="color:var(--text-primary); font-size:12px; margin-top:2px;">${def}</div>`);
});
document.addEventListener('focusout', (e) => {
  if (e.target.closest('.glossary-hint')) hideTooltip();
});

function kpiHTML(id, label, dotVar, glossaryTerm) {
  const dot = dotVar ? `<span class="statusdot" style="background:var(${dotVar})"></span>` : '';
  const accent = dotVar ? ` style="--kpi-accent:var(${dotVar})"` : '';
  const hint = glossaryTerm ? glossaryMarker(glossaryTerm) : '';
  return `<div class="kpi"${accent}><div class="label">${dot}${label}${hint}</div><div class="value" id="${id}-value">—</div><div class="foot" id="${id}-foot"></div></div>`;
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
/** compact: true shrinks the plot to the 110px/14px-pad size used for the small
 * per-person charts on H2H tabs (FG makes by distance, Outcome mix) -- pass it
 * instead of wrapping the target container in its own static .barchart/.gridlines
 * markup. Real bug found 2026-07-31: those H2H mini-charts used to nest a static
 * .barchart shell around the container renderBar renders into, and renderBar
 * builds its own .barchart/.gridlines inside that -- same double-nested-class
 * bug as the heatmap fix earlier this session, and it left .barcol sized to its
 * own content (~50px) instead of stretching to the card, stuck at the left edge
 * with blank space to the right. */
/** scroll: true stops categories flex-shrinking to fit the card (which
 * squeezes every bar unreadably once there are more than ~8-10, e.g.
 * Opponent Scouting's "by opponent" charts across 10-15 real opponents) --
 * each .barcol gets a fixed colWidth instead, and the chart scrolls
 * horizontally within its own card once the columns overflow it. */
function renderBar(container, { categories, values, labelFmt = (v) => fmt(v, 1), colorFn, tooltipFmt, xlab2, tooltipExtra, seriesName, compact = false, scroll = false, colWidth = 78 }) {
  container.innerHTML = '';
  const wrap = el('div', 'barchart');
  if (compact) { wrap.style.height = '110px'; wrap.style.paddingTop = '14px'; }
  if (scroll) wrap.style.overflowX = 'auto';
  const max = Math.max(1e-9, ...values.filter((v) => v !== null && !Number.isNaN(v)));
  const gridlines = el('div', 'gridlines');
  for (let i = 0; i < 4; i++) gridlines.appendChild(document.createElement('div'));
  wrap.appendChild(gridlines);

  // xlab2 is a second, always-visible caption line under the bar (e.g. "avg 5.2 yds").
  // tooltipExtra is hover-only supplementary context (e.g. sample size) that doesn't
  // deserve permanent on-chart real estate -- shown in the tooltip alongside the value.
  function defaultTooltip(cat, v, i) {
    if (v === null || Number.isNaN(v)) return `<b>${cat}</b><br>No data`;
    const rows = [`<div class="tt-title">${cat}${seriesName ? ` — ${seriesName}` : ''}</div>`,
      `<div class="tt-row"><span>${labelFmt(v)}</span></div>`];
    if (xlab2) rows.push(`<div class="tt-row tt-muted">${xlab2(cat, i)}</div>`);
    if (tooltipExtra) rows.push(`<div class="tt-row tt-muted">${tooltipExtra(cat, i)}</div>`);
    return rows.join('');
  }

  categories.forEach((cat, i) => {
    const v = values[i];
    const col = el('div', 'barcol');
    if (scroll) col.style.flex = `0 0 ${colWidth}px`;
    const plot = el('div', 'barplot');
    const barH = v === null || Number.isNaN(v) ? 0 : Math.max(2, (v / max) * 100);
    const bar = el('div', 'bar');
    bar.style.height = `${barH}%`;
    if (colorFn) bar.style.background = colorFn(cat, v, i);
    if (v !== null && !Number.isNaN(v)) bar.appendChild(el('span', 'cap', labelFmt(v)));
    const tt = () => (tooltipFmt ? tooltipFmt(cat, v, i) : defaultTooltip(cat, v, i));
    bar.addEventListener('mouseenter', (e) => showTooltip(e.clientX, e.clientY, tt()));
    bar.addEventListener('mousemove', (e) => showTooltip(e.clientX, e.clientY, tt()));
    bar.addEventListener('mouseleave', hideTooltip);
    plot.appendChild(bar);
    col.appendChild(plot);
    const xlabEl = el('div', 'xlab', cat);
    xlabEl.title = cat;
    col.appendChild(xlabEl);
    if (xlab2) {
      const xlab2Text = xlab2(cat, i);
      const xlab2El = el('div', 'xlab2', xlab2Text);
      xlab2El.title = xlab2Text;
      col.appendChild(xlab2El);
    }
    wrap.appendChild(col);
  });
  container.appendChild(wrap);
  // Real bug found 2026-08-05, per the user ("when i scroll to the right on
  // some of the vizes in the by opponent section the lines disappear"):
  // .gridlines is `position: absolute; inset: 20px 0 34px 0` (theme.css) --
  // `right: 0` resolves against .barchart's own CSS width (its visible
  // viewport, unchanged by scrolling), not the full scrollable content width
  // once `scroll: true` makes .barchart's content wider than the box itself.
  // So the gridlines only ever spanned the columns visible at scroll
  // position 0 -- scroll right past that and you're looking at bars with no
  // reference lines behind them at all. Fixed by giving gridlines an
  // explicit width matching wrap's actual rendered content width (read via
  // scrollWidth -- measured only now that `wrap` is attached to `container`,
  // since a detached element's scrollWidth isn't reliable; recomputing from
  // colWidth * count instead would also undercount by ignoring .barchart's
  // own flex `gap`) and clearing `right` so the explicit width wins over the
  // inset shorthand's `right: 0`. Measured before gridlines itself has a
  // width, so it can't inflate its own measurement.
  if (scroll) {
    gridlines.style.right = 'auto';
    gridlines.style.width = `${wrap.scrollWidth}px`;
  }
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
    const plot = el('div', 'stackplot');
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
    plot.appendChild(bar);
    col.appendChild(plot);
    const xlabEl = el('div', 'xlab', cat);
    xlabEl.title = cat;
    col.appendChild(xlabEl);
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
  container.classList.add('heat-scroll');
  const grid = el('div', 'heat');
  // Real bug found 2026-07-31: 1fr stretched every data column to fill
  // whatever's left of the card's width -- fine for a 5-season heatmap on a
  // half-width card, but on a full-width card with only 4 columns (Offense/
  // Defense's Down x Distance grid) each cell ballooned to ~280px wide for a
  // 3-4 character value. minmax() sizes columns to their actual content
  // instead; .heat's justify-content:center (theme.css) keeps the now-
  // compact grid from sitting left-stuck with empty space to its right.
  grid.style.gridTemplateColumns = `minmax(70px, 130px) repeat(${colLabels.length}, minmax(46px, 100px))`;
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
function renderSparkline(container, { values, labels, unit = '', seasons, opponents }) {
  container.innerHTML = '';
  const pts = values.map((v, i) => ({ v, l: labels[i], season: seasons && seasons[i], opponent: opponents && opponents[i] })).filter((p) => p.v !== null && p.v !== undefined);
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
      `<div class="tt-title">${p.l}${p.season ? `, ${p.season}` : ''}</div>`,
      p.opponent ? `<div class="tt-row"><span>Opponent</span><span>${p.opponent}</span></div>` : '',
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

/* ------------------------------------------------------------ grouped bar -- */

/** Grouped (paired) bar chart -- two bars per category, for direct two-person
 * comparison. Replaces the old two-line season trend chart (renderTwoLine,
 * removed 2026-07-31 per the user): with only a handful of high-school-career
 * seasons per person, a connected line implies a continuous trend that isn't
 * really there, and two overlaid lines whose active seasons don't overlap
 * read as more directly comparable than they are. Side-by-side bars per
 * season compare the same thing without that implication -- a season one
 * person didn't play just shows an empty slot instead of a misleading gap
 * in a line. */
function renderGroupedBar(container, { categories, valuesA, valuesB, colorA, colorB, nameA, nameB, labelFmt = (v) => fmt(v, 1), countsA, countsB }) {
  container.innerHTML = '';
  const wrap = el('div', 'barchart');
  const all = [...valuesA, ...valuesB].filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  const max = Math.max(1e-9, ...all);
  const gridlines = el('div', 'gridlines');
  for (let i = 0; i < 4; i++) gridlines.appendChild(document.createElement('div'));
  wrap.appendChild(gridlines);

  function tooltip(name, v, n) {
    if (v === null || v === undefined || Number.isNaN(v)) return `<div class="tt-title">${name}</div><div class="tt-row tt-muted">No data</div>`;
    const nRow = n !== undefined && n !== null ? `<div class="tt-muted">n=${n}</div>` : '';
    return `<div class="tt-title">${name}</div><div class="tt-row"><span>${labelFmt(v)}</span></div>${nRow}`;
  }

  categories.forEach((cat, i) => {
    const col = el('div', 'barcol');
    const plot = el('div', 'barplot');
    plot.style.gap = '6px';
    [[valuesA[i], colorA, nameA, countsA], [valuesB[i], colorB, nameB, countsB]].forEach(([v, color, name, counts]) => {
      const bar = el('div', 'bar');
      const h = v === null || v === undefined || Number.isNaN(v) ? 0 : Math.max(2, (v / max) * 100);
      bar.style.height = `${h}%`;
      bar.style.background = color;
      if (v !== null && v !== undefined && !Number.isNaN(v)) bar.appendChild(el('span', 'cap', labelFmt(v)));
      const html = tooltip(name, v, counts ? counts[i] : undefined);
      bar.addEventListener('mouseenter', (e) => showTooltip(e.clientX, e.clientY, html));
      bar.addEventListener('mousemove', (e) => showTooltip(e.clientX, e.clientY, html));
      bar.addEventListener('mouseleave', hideTooltip);
      plot.appendChild(bar);
    });
    col.appendChild(plot);
    const xlabEl = el('div', 'xlab', cat);
    xlabEl.title = cat;
    col.appendChild(xlabEl);
    wrap.appendChild(col);
  });
  container.appendChild(wrap);
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

/** Collapses rows to one representative per key (first occurrence wins).
 * Real bug found 2026-07-31: Offense/Defense's official play-by-play repeats
 * per-drive fields (drive_result) on every play row of that drive, so a plain
 * row count over-weights long drives -- a 15-play touchdown drive counted 15x
 * while a 3-and-out punt counted 3x, making "Drive Result Mix" show Touchdown
 * as the top category (1046 rows, 34%) when Punt is actually the most common
 * real drive outcome (244/607 distinct drives, 40% vs Touchdown's 173/607,
 * 28%). Use this to count distinct drives instead of play-rows whenever a
 * per-drive field is being tallied. */
function uniqueByKey(rows, keyFn) {
  const seen = new Set();
  const out = [];
  rows.forEach((r) => {
    const k = keyFn(r);
    if (!seen.has(k)) { seen.add(k); out.push(r); }
  });
  return out;
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
 * {values, labels, seasons, opponents} for renderSparkline. The on-chart label is day/month only
 * ("9/5"), so `seasons` and `opponents` ride along for the tooltip to disambiguate games. */
function gameTrend(rows, field) {
  const byGame = groupBy(rows.map((r) => ({ ...r, _gk: `${r.season}|${r.date}` })), '_gk');
  const games = [...byGame.keys()].sort((a, b) => parseGameDate(a.split('|')[1]) - parseGameDate(b.split('|')[1]));
  const values = games.map((g) => mean(byGame.get(g).map((r) => r[field])));
  const labels = games.map((g) => formatGameDateLabel(g.split('|')[1]));
  const seasons = games.map((g) => g.split('|')[0]);
  const opponents = games.map((g) => byGame.get(g)[0].opponent || null);
  return { values, labels, seasons, opponents };
}

/** Card with a "Last Game" KPI + "Last vs Previous Game" delta + sparkline (compares to the
 * immediately-prior game, not a season average). `container` becomes the whole card. */
function renderTrendCard(container, rows, field, unit, title) {
  const { values, labels, seasons, opponents } = gameTrend(rows, field);
  const lastVal = values.length ? values[values.length - 1] : null;
  const prevVal = values.length > 1 ? values[values.length - 2] : null;
  const delta = lastVal !== null && prevVal !== null ? lastVal - prevVal : null;
  container.innerHTML = `
    <div class="card-head"><h3>${title}</h3></div>
    <div class="card-body trend-body">
      <div>
        <div class="kpi small kpi-plain" style="border:none; padding:0; background:none;">
          <div class="label">Last Game Avg</div>
          <div class="value">${fmt(lastVal)}${unit}</div>
        </div>
        <div class="kpi small kpi-plain" style="border:none; padding:0; background:none; margin-top:10px;">
          <div class="label">Last vs Previous Game</div>
          <div class="value" style="font-size:15px; color:${delta === null ? 'inherit' : (delta >= 0 ? 'var(--delta-good)' : 'var(--critical)')}">${delta === null ? '—' : (delta >= 0 ? '+' : '') + fmt(delta)}</div>
        </div>
      </div>
      <div class="trend-chart"></div>
    </div>`;
  renderSparkline(container.querySelector('.trend-chart'), { values, labels, unit, seasons, opponents });
}

/** Best-scoring key in a groupBy() Map by a metric function, gated on a minimum sample size
 * (powers the "Best Quarter" KPIs). Returns {key, value}; value is null if nothing meets minN. */
function bestByGroup(byGroupMap, metricFn, minN = 3) {
  let bestKey = null, bestVal = -Infinity;
  byGroupMap.forEach((g, k) => {
    const v = metricFn(g);
    if (g.length >= minN && v !== null && v > bestVal) { bestVal = v; bestKey = k; }
  });
  return { key: bestKey, value: bestKey !== null ? bestVal : null };
}

/* ------------------------------------------ domain: offense/defense play data -- */

function distanceBucket(d) {
  if (d === null || d === undefined) return null;
  return d <= 3 ? '1-3' : d <= 6 ? '4-6' : d <= 9 ? '7-9' : '10+';
}
const DIST_BUCKETS = ['1-3', '4-6', '7-9', '10+'];
const DOWNS = [1, 2, 3, 4];
const SITUATIONS = ['Standard Down', 'Passing Down', 'Money Down'];
const FIELD_ZONES = ['Backed Up', 'Own Territory', 'Midfield', 'Opponent Territory', 'Red Zone'];
function isSuccess(eff) { return eff === 'Successful' || eff === 'Explosive'; }

/** turnover_type/play_outcome are comma-space-joined tag strings on the hand-charted Plays sheet
 * (e.g. "Turnover, Turnover on Downs", "Fumble, Sack"); these test for one specific tag, not an
 * exact-string match. */
function isTakeaway(turnoverType) { return !!turnoverType && turnoverType.split(', ').includes('Turnover'); }
function isSack(playOutcome) { return !!playOutcome && playOutcome.split(', ').includes('Sack'); }

/** Top N keys of a groupBy() Map, ordered by descending row count -- for
 * open-ended categorical fields (formation, personnel, defensive front,
 * coverage, play call, ...) that have no fixed canonical order the way
 * distance buckets or a season list do (Offense/Defense play-calling
 * tendencies charts, e.g. play_call has 260+ distinct real values). */
function topKeysByCount(map, n = 10) {
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, n).map(([k]) => k);
}

/* ============================================================================
   FILTER PANEL
   ============================================================================
   A checkbox-list panel: every option is visible with a real checkbox (no hidden ctrl-click
   multi-select), All/None per group, a live count badge on the Filters button showing how many
   groups are narrowed, and a search box on any group with more than 8 options.
   Filter state is a plain object {field: Set(selected values)}; applyFilters() applies it.
*/

function buildFilterPanel(tabId, filterDefs, filterValues) {
  const groups = filterDefs.map(({ field, label, defaultLatestOnly }) => {
    const values = filterValues[field] || [];
    const searchable = values.length > 8;
    // defaultLatestOnly (2026-07-31, per the user: "all dashboards should be
    // preset with the most recent year selected") -- every other field still
    // defaults to fully checked; only a field opting into this (every page's
    // `season` filter def) starts pre-narrowed to its single highest value.
    // Sorted fresh rather than trusting incoming order, since it only needs
    // to hold for 4-digit year strings, which sort correctly as plain strings.
    const latestValue = defaultLatestOnly && values.length ? [...values].sort().at(-1) : null;
    const rows = values.map((v) => `<label class="fp-chk"><input type="checkbox" data-field="${field}" value="${v}"${defaultLatestOnly ? (v === latestValue ? ' checked' : '') : ' checked'}>${v}</label>`).join('');
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

/** Re-applies every filter in `state` except forces the Season group open to the full
 * `allSeasons` list -- for "X x season" heatmaps whose columns always show every season (only the
 * other filters narrow them). */
function reopenSeasons(dataset, state, allSeasons) {
  return applyFilters(dataset, { ...state, season: new Set(allSeasons) });
}

/** Builds parallel {values, counts} arrays for a fixed season axis from already-filtered rows:
 * groups by season and applies metricFn to each season's rows (null for a season with no rows),
 * plus the raw per-season row count so a chart can show a real n= in its tooltip. */
function seasonSeries(rows, seasons, metricFn) {
  const byS = groupBy(rows, 'season');
  const values = seasons.map((s) => { const g = byS.get(s); return g && g.length ? metricFn(g) : null; });
  const counts = seasons.map((s) => { const g = byS.get(s); return g ? g.length : 0; });
  return { values, counts };
}

function applyFilters(rows, state) {
  // A blank/null value on a row always passes every filter on that field -- "no
  // info charted for this dimension" isn't the same as "excluded by the user's
  // selection." (Real bug found and fixed 2026-07-29: the default, everything-
  // checked view must show every row, not silently drop the ones missing one field.)
  return rows.filter((r) => Object.entries(state).every(([field, set]) => {
    // Only checkbox-filter entries are Sets; anything else in the state (e.g. a single-select
    // control's value that Site.view mixes in) isn't a filter on this field.
    if (!(set instanceof Set)) return true;
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
  // Real bug found 2026-07-31: with no spellcheck/autocomplete attributes, a
  // name the browser's dictionary doesn't recognize (most athlete names) gets
  // underlined and can pop the browser's native spellcheck/autocorrect UI on a
  // quick click, competing with (and sometimes eating) the click meant to pick
  // a dropdown item. None of this input's own values are ever submitted or
  // autofilled, so all of these are safe to disable outright.
  input.spellcheck = false;
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('autocapitalize', 'off');
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
    // No cap here -- was a hard-coded slice(0, 40) (real bug found 2026-07-31:
    // this exact function's own docstring cites "230+ athlete names" as the
    // reason it exists, yet silently hid anything past the first 40 unfiltered
    // matches; .combobox-list's max-height/overflow-y:auto in theme.css can
    // scroll through any number of rendered rows, the cap was the only thing
    // actually preventing you from reaching the rest by scrolling or typing).
    const matches = options.filter((o) => o.label.toLowerCase().includes(q));
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
