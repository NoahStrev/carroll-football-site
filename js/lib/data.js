/*
  data.js -- special-teams row helpers and buckets, grouping (groupBy, uniqueByKey,
  topKeysByCount, gameTrend, bestByGroup), and the offense/defense play-data constants.
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

/** Opponents' snaps as THEIR offense. game-data's defense.official is Carroll's defense, i.e. the opponent's
 * offense, but its score_differential is still Carroll's lead (verified: Carroll up 13 reads +13 on both
 * sheets). Anything that treats those rows as the opponent's own offense and buckets them by score ("Leading
 * by 9+") has to flip the sign, or the labels are backwards. Memoized; the rows are otherwise unchanged. */
let opponentOffenseCache = null, opponentOffenseSource = null;
function opponentOffenseRows() {
  const source = Site.data.game.defense.official;
  if (opponentOffenseSource !== source) {
    opponentOffenseSource = source;
    opponentOffenseCache = source.map((r) => (r.score_differential === null || r.score_differential === undefined ? r : { ...r, score_differential: -r.score_differential }));
  }
  return opponentOffenseCache;
}


/* ----------------------------- play-by-play helpers shared by Scouting, Game Review, Tells -- */

const QUARTERS = ['1st', '2nd', '3rd', '4th', 'OT'];
const ordinalDown = (d) => (d === 1 ? '1st' : d === 2 ? '2nd' : d === 3 ? '3rd' : '4th');

// Leading/trailing by more than a score (8 points: two scores down is a fundamentally different situation
// than one) vs by a score or less vs tied. The lead is from the sheet's own side (see opponentOffenseRows).
const SCORE_BUCKETS = ['Leading by 9+', 'Leading by 1-8', 'Tied', 'Trailing by 1-8', 'Trailing by 9+'];
function scoreBucket(sd) {
  if (sd === null || sd === undefined) return null;
  if (sd > 8) return 'Leading by 9+';
  if (sd > 0) return 'Leading by 1-8';
  if (sd === 0) return 'Tied';
  if (sd >= -8) return 'Trailing by 1-8';
  return 'Trailing by 9+';
}

// Rush/Pass/Sack/Kneel/Two-Point Conversion is official play-by-play's full play_type vocabulary. Kneel and
// Two-Point snaps aren't real play-calling signal, so every run/pass split drops them. A sack counts as a pass
// call (the standard stat-keeping convention).
const isRunPlay = (r) => r.play_type === 'Rush';
const isPassPlay = (r) => r.play_type === 'Pass' || r.play_type === 'Sack';
const runPassRows = (rows) => rows.filter((r) => isRunPlay(r) || isPassPlay(r));

/** The headline numbers for any set of official play-by-play snaps. Rates are null (never a fake 0%) for an empty set. */
function playMetrics(rows) {
  const classified = rows.filter((r) => r.play_efficiency !== null);
  const runPass = runPassRows(rows);
  return {
    plays: rows.length,
    ypp: mean(rows.map((r) => r.yards)),
    success: rate(classified, (r) => isSuccess(r.play_efficiency)),
    explosive: rate(classified, (r) => r.play_efficiency === 'Explosive'),
    turnover: rate(rows, (r) => r.is_turnover),          // turnovers per snap
    turnovers: rows.filter((r) => r.is_turnover).length, // turnovers in total
    runPct: runPass.length ? rate(runPass, isRunPlay) : null,
  };
}

/** One "this vs usual" table row: [label, this (with an arrow), usual]. The arrow is green when the gap favors
 * Carroll (`higherBetter` says which direction that is), plain when null (a number with no good or bad
 * direction). No arrow when both read the same after formatting. */
function versusRow(label, a, b, format, higherBetter) {
  const diff = a === null || a === undefined || b === null || b === undefined || format(a) === format(b) ? 0 : a - b;
  const cls = higherBetter === null ? '' : (diff > 0) === higherBetter ? 'good' : 'crit';
  const arrow = diff === 0 ? '' : ` <span class="rk-move ${cls}">${diff > 0 ? '▲' : '▼'}</span>`;
  return [label, `${a === null || a === undefined ? '—' : format(a)}${arrow}`, b === null || b === undefined ? '—' : format(b)];
}

/** The series with one opponent, from a home.json history list (newest game first): wins, losses, the first season on
 * record, the latest meeting (with `word`: "Won"/"Lost"/"Tied"), and how many of the most recent meetings share its
 * result. null with no meetings. */
function seriesRecord(hist) {
  if (!hist || !hist.length) return null;
  const count = (res) => hist.filter((g) => g.result === res).length;
  let streak = 0;
  while (streak < hist.length && hist[streak].result === hist[0].result) streak++;
  const word = { W: 'Won', L: 'Lost' }[hist[0].result] || 'Tied';
  return { w: count('W'), l: count('L'), n: hist.length, since: hist[hist.length - 1].season, last: hist[0], word, streak };
}
