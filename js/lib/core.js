/*
  core.js -- colors, mean/rate, fmt/pct, escapeHTML, el(), printPage, the tooltip,
  the glossary and its inline "?" hints, and the KPI tile (kpiHTML / setKPI).
  Part of the shared library every dashboard loads, in this order (see any page in dashboards/):
    js/lib/core.js      helpers, formatting, tooltip, glossary + KPI tiles
    js/lib/data.js      row helpers: special-teams buckets, grouping, play-data constants
    js/lib/charts.js    chart renderers (bar, stacked, scatter, heatmap, sparkline, grouped bar)
    js/lib/filters.js   checkbox filter panel, searchable combobox
  These are classic scripts sharing one global scope, so load order matters only for code that runs
  at load time; everything else is called later by js/shell.js and js/views/*.js.

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
/* ------------------------------------------------ chart marks: mouse, keyboard, screen reader -- */

const tooltipText = (html) => String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** Gives one chart mark (a bar, segment, point, cell) its tooltip on hover AND on keyboard focus, and the tooltip's
 * text as its accessible label. `html` is a string or a function returning one. Marks start out unfocusable;
 * enableChartKeys(container) makes the chart one tab stop and arrow keys walk its marks. */
function attachTooltip(mark, html) {
  const get = () => (typeof html === 'function' ? html() : html);
  mark.addEventListener('mouseenter', (e) => showTooltip(e.clientX, e.clientY, get()));
  mark.addEventListener('mousemove', (e) => showTooltip(e.clientX, e.clientY, get()));
  mark.addEventListener('mouseleave', hideTooltip);
  mark.addEventListener('focus', () => { const r = mark.getBoundingClientRect(); showTooltip(r.left + r.width / 2, r.top, get()); });
  mark.addEventListener('blur', hideTooltip);
  mark.classList.add('chart-mark');
  mark.setAttribute('tabindex', '-1');
  mark.setAttribute('role', 'img');
  mark.setAttribute('aria-label', tooltipText(get()));
}

/** Call once a chart is built: its first mark becomes the tab stop, and the arrow keys, Home and End move between
 * marks (a scatter with hundreds of points is one tab stop, not hundreds). The key handler is added once per
 * container, since a view re-renders into the same element. */
function enableChartKeys(container) {
  const first = container.querySelector('.chart-mark');
  if (first) first.setAttribute('tabindex', '0');
  if (container._chartKeys) return;
  container._chartKeys = true;
  container.addEventListener('keydown', (e) => {
    const marks = [...container.querySelectorAll('.chart-mark')];
    const i = marks.indexOf(document.activeElement);
    if (i < 0) return;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const j = step !== undefined ? Math.max(0, Math.min(marks.length - 1, i + step)) : e.key === 'Home' ? 0 : e.key === 'End' ? marks.length - 1 : null;
    if (j === null) return;
    e.preventDefault();
    marks[i].setAttribute('tabindex', '-1');
    marks[j].setAttribute('tabindex', '0');
    marks[j].focus();
  });
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.style.display = 'none';
}

/* ------------------------------------------------------- glossary + KPI tile --- */
// Term -> plain-language definition. The single source of truth for both the Glossary page
// (js/views/glossary.js) and the inline "?" hover hints on KPI tiles -- add a term here once and
// it's usable from either place.
const GLOSSARY = {
  'Go-for-it rate': "How often a team goes for it on 4th down instead of punting or kicking a field goal: tries divided by tries plus punts plus field-goal tries. The punts and field goals are counted from how drives ended, so it is a close estimate rather than an exact count.",
  'Tell': "A situation where a team's call is predictable enough, or different enough from how everyone else calls it, that an opponent can key on it. The Tells tabs only flag a spot with 20+ snaps and a gap big enough that it is probably real rather than chance (about 90% confidence).",
  'Lean': "A situation where one call (run or pass, or one front) is made at least 65% of the time on 25+ snaps. A lean is a habit; a tell is a habit that stands out from what opponents do in the same spot.",
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
  'Snapper Tackle': "A punt where the long snapper made a tackle in coverage. Worked out from the box score's tackle credit and the snapper named for that punt: a tackle only if the snapper is the one credited. A punt with no snapper named is left out rather than counted as no tackle.",
  'Kicker Tackle': "A kickoff where the kicker made the tackle on the return, read from the tackle credit in the box score. Counted for every season.",
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
