/* Special Teams -- the Overview and the five unit dashboards (Money Unit = PAT/FG,
   Punt, Punt Return, Kickoff, Kickoff Return). Data: data/special-teams.json
   (build_special_teams_data.py): { units: {unit: [row...]}, filters: {unit: {field: [options]}} }.

   Every unit sheet carries a Value/Score column -- "points added over expectation" vs.
   an average Carroll attempt at that unit, rescaled to 0-100 -- which is what the Overview
   compares across units. */
(function () {
  const U = () => Site.data.st;
  const esc = Site.esc;
  const ST = (window.ST = window.ST || {});
  ST.U = U;

  ST.rowCount = (unit) => U().units[unit].length;
  ST.source = (unit, sheet, extra = '') => `Source: Carroll ${sheet} sheet, Carroll_Special_Teams_2021_Current.xlsx (${ST.rowCount(unit)} rows).${extra ? ` ${extra}` : ''}`;
  ST.seasonsInView = (unit, rows) => U().filters[unit].season.filter((s) => rows.some((r) => r.season === s));
  const SEASON_LATEST = { field: 'season', label: 'Season', defaultLatestOnly: true };
  ST.SEASON_LATEST = SEASON_LATEST;

  // The next-drive result vocabularies the stacked "outcome by field position" charts use.
  const OUTCOME_CATS = ['No Score', 'Field Goal', 'Touchdown', 'Safety'];

  // A season-axis bar over `rows`: one bar per season present, value = metric(that season's rows).
  ST.seasonBars = (el, unit, rows, { metric, labelFmt, color, noun, subset }) => {
    const seasons = ST.seasonsInView(unit, rows);
    const by = groupBy(subset ? subset(rows) : rows, 'season');
    renderBar(el, {
      categories: seasons, values: seasons.map((s) => { const g = by.get(s); return g && g.length ? metric(g) : null; }),
      labelFmt, colorFn: () => cssVar(color), tooltipExtra: (s) => `${(by.get(s) || []).length} ${noun}`,
    });
  };

  /** Drive-success-by-bucket style bar: rate of `pred` within each present bucket of `field`. */
  function bucketRate(el, rows, field, pred, color, noun, order) {
    const by = groupBy(rows.filter((r) => r[field]), field);
    const buckets = order ? order.filter((b) => by.has(b)) : sortBuckets([...new Set(rows.map((r) => r[field]).filter(Boolean))]);
    renderBar(el, {
      categories: buckets, values: buckets.map((b) => rate(by.get(b), pred)), labelFmt: (v) => pct(v, 0),
      colorFn: () => cssVar(color), tooltipExtra: (b) => `${by.get(b).length} ${noun}`,
    });
  }
  const driveOk = (r) => r.drive_success;

  /** An "Avg X" KPI tile: the mean of one field over the view's rows (`of`: another row set in the view's context),
   * with the unit after it and, when `charted`, how many rows actually had the field underneath. */
  const avgKpi = (label, field, { digits = 1, unit = '', charted = false, of = 'rows' } = {}) => ({
    label,
    value: (ctx) => {
      const rows = ctx[of];
      const v = `${fmt(mean(rows.map((r) => r[field])), digits)}${unit}`;
      return charted ? [v, `${rows.filter((r) => r[field] !== null).length} charted`] : [v];
    },
  });
  /** A "# of X" KPI tile: how many rows are in view. */
  const countKpi = (label) => ({ label, value: ({ rows }) => [String(rows.length)] });

  /* ================================================================== Overview == */

  const UNIT_KEYS = ['money_unit', 'punt', 'punt_return', 'kickoff', 'kickoff_return'];
  const UNIT_LABELS = { money_unit: 'Money Unit', punt: 'Punt', punt_return: 'Punt Return', kickoff: 'Kickoff', kickoff_return: 'Kickoff Return' };
  ST.UNIT_LABELS = UNIT_LABELS;

  ST.overviewTab = function (root) {
    const D = U();
    const allSeasons = [...new Set(UNIT_KEYS.flatMap((u) => D.filters[u].season))].sort();
    Site.view(root, {
      filters: { defs: [SEASON_LATEST], values: { season: allSeasons } },
      source: 'All 5 special teams units',
      prepare(st) {
        const byUnit = {};
        UNIT_KEYS.forEach((u) => { byUnit[u] = applyFilters(D.units[u], { season: st.season }); });
        const total = UNIT_KEYS.reduce((s, u) => s + byUnit[u].length, 0);
        return { byUnit, total, all: UNIT_KEYS.flatMap((u) => byUnit[u]) };
      },
      summary: ({ total }) => `${total} plays across all units in view`,
      kpis: UNIT_KEYS.map((u) => ({
        label: `${UNIT_LABELS[u]} Avg Score`, glossary: 'Value / Score',
        value: ({ byUnit }) => [fmt(mean(byUnit[u].map((r) => r.score)), 1), `${byUnit[u].length} plays`],
      })),
      cards: [
        {
          title: 'Avg Score by Unit',
          render(el, { byUnit }) {
            renderBar(el, {
              categories: UNIT_KEYS.map((u) => UNIT_LABELS[u]), values: UNIT_KEYS.map((u) => mean(byUnit[u].map((r) => r.score))),
              labelFmt: (v) => fmt(v, 0), colorFn: (name, v) => (v === null ? cssVar('--muted') : v >= 50 ? cssVar('--good') : cssVar('--critical')),
              tooltipExtra: (name, i) => `${byUnit[UNIT_KEYS[i]].length} plays`,
            });
          },
        },
        {
          title: 'Avg Score by Season (all units combined)',
          render(el, { all }) {
            const by = groupBy(all, 'season');
            const seasons = allSeasons.filter((s) => by.has(s));
            renderBar(el, { categories: seasons, values: seasons.map((s) => mean(by.get(s).map((r) => r.score))), labelFmt: (v) => fmt(v, 0), colorFn: () => cssVar('--cat-1'), tooltipExtra: (s) => `${by.get(s).length} plays` });
          },
        },
        {
          title: 'Snap/Play Volume by Unit', wide: true,
          render(el, { byUnit, total }) {
            renderBar(el, {
              categories: UNIT_KEYS.map((u) => UNIT_LABELS[u]), values: UNIT_KEYS.map((u) => byUnit[u].length), labelFmt: (v) => String(v),
              colorFn: (name, v, i) => catColor(i), tooltipExtra: (name, i) => `${pct(total ? byUnit[UNIT_KEYS[i]].length / total : null, 0)} of all plays in view`,
            });
          },
        },
        {
          // Deliberately reads every season, NOT the season-filtered rows -- comparing across
          // seasons at once is the table's whole point.
          title: 'Avg Score — unit × season', wide: true,
          note: "Avg Score (0–100 rescale of each unit's own Value metric) per season — always shows every season regardless of the Season filter above, which only scopes the KPIs/charts. A dash means that unit has no charted plays that season.",
          table: {
            head: ['Unit', ...allSeasons.map((s) => ({ label: s, align: 'right' })), { label: 'All Time', align: 'right' }],
            rows: () => UNIT_KEYS.map((u) => {
              const rows = D.units[u];
              const byS = groupBy(rows, 'season');
              return [UNIT_LABELS[u], ...allSeasons.map((s) => { const g = byS.get(s); return g && g.length ? fmt(mean(g.map((r) => r.score)), 0) : '—'; }), `<b>${rows.length ? fmt(mean(rows.map((r) => r.score)), 0) : '—'}</b>`];
            }),
          },
        },
      ],
      footer: 'Source: all 5 Carroll Special Teams sheets\' own Value/Score columns ("points added over expectation" vs. an average Carroll attempt at that unit), Carroll_Special_Teams_2021_Current.xlsx.',
    });
  };

  /* ================================================================ Money Unit == */

  const kickTip = (r) => [
    `<div class="tt-title">${esc(r.kicker)} — ${r.make ? 'Make' : 'Miss'}</div>`,
    `<div class="tt-row"><span>Snap to kick</span><span>${fmt(r.snap_to_kick, 2)}s</span></div>`,
    `<div class="tt-row"><span>Distance</span><span>${r.distance} yd</span></div>`,
    '<div class="tt-divider"></div>',
    `<div class="tt-muted">${r.fg_exp} vs ${esc(r.opponent)}, ${r.date} · Q${r.quarter}${r.hash_kicked_from ? ` · Hash ${r.hash_kicked_from}` : ''}</div>`,
  ].join('');

  ST.moneyUnitTab = function (root) {
    const D = U();
    Site.view(root, {
      filters: { defs: [{ field: 'fg_exp', label: 'FG / EXP' }, { field: 'is_home', label: 'Home/Away' }, { field: 'quarter', label: 'Quarter' }, SEASON_LATEST, { field: 'kicker', label: 'Kicker' }, { field: 'long_snapper', label: 'Long Snapper' }], values: D.filters.money_unit },
      source: 'PAT / Field Goal',
      prepare(st) { const rows = applyFilters(D.units.money_unit, st); return { rows, fgRows: fgs(rows), patRows: pats(rows) }; },
      summary: ({ rows }) => `${rows.length} kicks in view`,
      kpis: [
        { label: 'Kicks Attempted', value: ({ rows }) => [`${makes(rows).length}/${rows.length}`, 'made / attempted'] },
        { label: 'FG %', dot: '--good', value: ({ fgRows }) => [pct(fgRows.length ? makes(fgRows).length / fgRows.length : null), `${makes(fgRows).length}/${fgRows.length} field goals`] },
        { label: 'PAT %', dot: '--good', value: ({ patRows }) => [pct(patRows.length ? makes(patRows).length / patRows.length : null), `${makes(patRows).length}/${patRows.length} PATs`] },
        avgKpi('Avg Snap to Kick', 'snap_to_kick', { digits: 2, unit: 's', charted: true }),
        avgKpi('Avg FG Distance', 'distance', { unit: ' yds', of: 'fgRows' }),
        { label: 'Kicks Blocked', dot: '--critical', value: ({ rows }) => [String(rows.filter((r) => r.miss_location === 'Blocked').length)] },
      ],
      cards: [
        {
          title: 'Snap to Kick vs Distance',
          render(el, { rows }) {
            renderScatter(el, {
              points: rows.filter((r) => r.snap_to_kick !== null && r.distance !== null).map((r) => ({ x: r.snap_to_kick, y: r.distance, group: r.make ? 'Make' : 'Miss', label: kickTip(r) })),
              xLabel: 'Snap to kick (s)', yLabel: 'Distance (yd)', colorMap: { Make: cssVar('--good'), Miss: cssVar('--critical') },
            });
          },
        },
        {
          title: 'FG % by Distance Bucket',
          render(el, { fgRows }) {
            const by = groupBy(fgRows.map((r) => ({ ...r, _b: fgDistBucket(r.distance) })), '_b');
            renderBar(el, {
              categories: FG_DIST_BUCKETS, values: FG_DIST_BUCKETS.map((b) => { const g = by.get(b); return g && g.length ? g.filter((r) => r.make).length / g.length : null; }),
              labelFmt: (v) => pct(v, 0), colorFn: () => cssVar('--cat-1'), tooltipExtra: (b) => `${(by.get(b) || []).length} kicks`,
            });
          },
        },
        {
          title: 'Make % by Hash Kicked From',
          render(el, { rows }) {
            const by = groupBy(rows.filter((r) => r.hash_kicked_from), 'hash_kicked_from');
            const hashes = HASH_ORDER.filter((h) => by.has(h));
            renderBar(el, { categories: hashes, values: hashes.map((h) => by.get(h).filter((r) => r.make).length / by.get(h).length), labelFmt: (v) => pct(v, 0), colorFn: () => cssVar('--cat-3'), tooltipExtra: (h) => `${by.get(h).length} kicks` });
          },
        },
        {
          title: 'Misses by Location',
          render(el, { rows, fgRows }) {
            const missRows = rows.filter((r) => !r.make && r.miss_location);
            const by = groupBy(missRows, 'miss_location');
            if (!by.size) { el.innerHTML = '<div class="data-note">No blocked kicks in the current filter. Only "Blocked" is currently tracked as a miss reason in the source data (the Tableau version\'s L/Short breakdown isn\'t captured yet).</div>'; return; }
            const cats = [...by.keys()];
            renderBar(el, {
              categories: cats, values: cats.map((c) => by.get(c).length), labelFmt: (v) => String(v), colorFn: () => cssVar('--critical'),
              tooltipExtra: (c) => `${pct(missRows.length ? by.get(c).length / missRows.length : null, 0)} of misses · ${pct(fgRows.length ? by.get(c).length / fgRows.length : null, 0)} of all FG attempts`,
            });
          },
        },
        { raw: true, render: (el, { rows }) => renderTrendCard(el, rows, 'snap_to_catch', 's', 'Avg Snap to Catch') },
        { raw: true, render: (el, { rows }) => renderTrendCard(el, rows, 'snap_to_kick', 's', 'Avg Snap to Kick') },
      ],
      footer: () => ST.source('money_unit', 'PAT-FG', "Snap-timing fields recompute only from rows where they're actually charted."),
    });
  };

  /* ===================================================================== Punt == */

  const nextDriveTip = (r) => `vs ${esc(r.opponent)}, ${r.date} · Q${r.quarter} · Next drive: ${r.next_drive_outcome || 'No Score'}`;

  ST.puntTab = function (root) {
    const D = U();
    Site.view(root, {
      filters: { defs: [{ field: 'snapper', label: 'Snapper Name' }, { field: 'next_drive_outcome', label: 'Next Drive Outcome' }, { field: 'is_home', label: 'Home/Away' }, { field: 'quarter', label: 'Quarter' }, SEASON_LATEST, { field: 'opponent', label: 'Opponent' }, { field: 'punter', label: 'Punter' }], values: D.filters.punt },
      source: 'Punt unit',
      prepare(st) { return { rows: applyFilters(D.units.punt, st) }; },
      summary: ({ rows }) => `${rows.length} punts in view`,
      kpis: [
        countKpi('# of Punts'),
        avgKpi('Avg Hangtime', 'hangtime', { digits: 2, unit: 's', charted: true }),
        avgKpi('Avg Distance', 'total_distance', { unit: ' yds' }),
        avgKpi('Avg Snap to Kick', 'snap_to_kick', { digits: 2, unit: 's', charted: true }),
        avgKpi('Avg Field Position', 'converted_los'),
        avgKpi('Avg Points Scored', 'next_drive_points', { digits: 2 }),
      ],
      cards: [
        {
          title: 'Return Length vs Hangtime',
          render(el, { rows }) {
            const colors = categoricalColorMap(D.filters.punt.next_drive_outcome.length ? OUTCOME_CATS : []);
            renderScatter(el, {
              points: rows.filter((r) => r.hangtime !== null && r.return_length !== null).map((r) => ({
                x: r.hangtime, y: r.return_length, group: r.next_drive_outcome || 'No Score',
                label: [`<div class="tt-title">${esc(r.punter || '—')}</div>`, `<div class="tt-row"><span>Hangtime</span><span>${fmt(r.hangtime, 2)}s</span></div>`, `<div class="tt-row"><span>Return length</span><span>${r.return_length} yd</span></div>`, `<div class="tt-row"><span>Kick outcome</span><span>${r.kick_outcome || '—'}</span></div>`, '<div class="tt-divider"></div>', `<div class="tt-muted">${nextDriveTip(r)}</div>`].join(''),
              })),
              xLabel: 'Hangtime (s)', yLabel: 'Return length (yd)', colorMap: colors,
            });
          },
        },
        {
          title: 'Punts by Outcome',
          render(el, { rows }) {
            const outcomes = ['Downed', 'Fair Catch', 'Out of Bounds', 'Touchback', 'Muff', 'Return', 'Return Touchdown'].filter((o) => rows.some((r) => r.kick_outcome === o));
            const colors = categoricalColorMap(outcomes);
            renderBar(el, { categories: outcomes, values: outcomes.map((o) => rows.filter((r) => r.kick_outcome === o).length), labelFmt: (v) => String(v), colorFn: (name) => colors[name], tooltipExtra: (o) => `${pct(rows.length ? rows.filter((r) => r.kick_outcome === o).length / rows.length : null, 0)} of punts in view` });
          },
        },
        { title: 'Drive Success by Field Position', render: (el, { rows }) => bucketRate(el, rows, 'field_bucket', driveOk, '--cat-1', 'punts') },
        {
          title: 'Outcome by Field Position',
          render(el, { rows }) {
            const buckets = sortBuckets([...new Set(rows.map((r) => r.field_bucket).filter(Boolean))]);
            const by = groupBy(rows.filter((r) => r.field_bucket), 'field_bucket');
            renderStacked(el, { categories: buckets, series: Object.fromEntries(OUTCOME_CATS.map((o) => [o, buckets.map((b) => by.get(b).filter((r) => r.next_drive_outcome === o).length)])), order: OUTCOME_CATS, colors: categoricalColorMap(OUTCOME_CATS) });
          },
        },
        { raw: true, render: (el, { rows }) => renderTrendCard(el, rows, 'snap_to_kick', 's', 'Avg Snap to Kick') },
        { raw: true, render: (el, { rows }) => renderTrendCard(el, rows, 'total_distance', ' yds', 'Avg Punt Distance') },
      ],
      footer: () => ST.source('punt', 'Punt'),
    });
  };

  /* ================================================================ Punt Return == */

  ST.puntReturnTab = function (root) {
    const D = U();
    Site.view(root, {
      filters: { defs: [{ field: 'kick_outcome', label: 'Kick Outcome' }, { field: 'next_drive_outcome', label: 'Next Drive Outcome' }, { field: 'is_home', label: 'Home/Away' }, { field: 'quarter', label: 'Quarter' }, SEASON_LATEST, { field: 'opponent', label: 'Opponent' }, { field: 'returner', label: 'Returner' }], values: D.filters.punt_return },
      source: 'Punt return unit',
      prepare(st) { return { rows: applyFilters(D.units.punt_return, st) }; },
      summary: ({ rows }) => `${rows.length} punts in view`,
      kpis: [
        countKpi('# of Punts'),
        avgKpi('Avg Carry Distance', 'carry_distance', { unit: ' yds' }),
        avgKpi('Avg Return Length', 'return_length', { unit: ' yds' }),
        avgKpi('Avg Snap to Kick', 'snap_to_kick', { digits: 2, unit: 's', charted: true }),
        avgKpi('Avg Field Position', 'converted_los'),
        avgKpi('Avg Points Scored', 'next_drive_points', { digits: 2 }),
      ],
      cards: [
        {
          title: 'Return Length vs Hangtime',
          render(el, { rows }) {
            renderScatter(el, {
              points: rows.filter((r) => r.hangtime !== null && r.return_length !== null).map((r) => ({
                x: r.hangtime, y: r.return_length, group: r.next_drive_outcome || 'No Score',
                label: [`<div class="tt-title">${esc(r.returner || '—')}</div>`, `<div class="tt-row"><span>Hangtime</span><span>${fmt(r.hangtime, 2)}s</span></div>`, `<div class="tt-row"><span>Return length</span><span>${r.return_length} yd</span></div>`, `<div class="tt-row"><span>Kick outcome</span><span>${r.kick_outcome || '—'}</span></div>`, '<div class="tt-divider"></div>', `<div class="tt-muted">${nextDriveTip(r)}</div>`].join(''),
              })),
              xLabel: 'Hangtime (s)', yLabel: 'Return length (yd)', colorMap: categoricalColorMap(OUTCOME_CATS),
            });
          },
        },
        {
          title: 'Punts by Outcome',
          render(el, { rows }) {
            const outcomes = ['Downed', 'Fair Catch', 'Out of Bounds', 'Touchback', 'Muff', 'Blocked', 'Return', 'Return Touchdown', 'Safety'].filter((o) => rows.some((r) => r.kick_outcome === o));
            const colors = categoricalColorMap(outcomes);
            renderBar(el, { categories: outcomes, values: outcomes.map((o) => rows.filter((r) => r.kick_outcome === o).length), labelFmt: (v) => String(v), colorFn: (name) => colors[name], tooltipExtra: (o) => `${pct(rows.length ? rows.filter((r) => r.kick_outcome === o).length / rows.length : null, 0)} of punts in view` });
          },
        },
        { title: 'Drive Success by Field Position', render: (el, { rows }) => bucketRate(el, rows, 'field_bucket', driveOk, '--cat-1', 'punts') },
        {
          title: 'Drive Success by Return Length',
          render(el, { rows }) {
            const rlBucket = (rl) => (rl <= 5 ? '0-5' : rl <= 10 ? '6-10' : rl <= 15 ? '11-15' : rl <= 20 ? '16-20' : '21+');
            const by = groupBy(rows.filter((r) => r.return_length !== null && r.return_length > 0).map((r) => ({ ...r, _rlb: rlBucket(r.return_length) })), '_rlb');
            const cats = ['0-5', '6-10', '11-15', '16-20', '21+'].filter((c) => by.has(c));
            renderBar(el, { categories: cats, values: cats.map((c) => rate(by.get(c), driveOk)), labelFmt: (v) => pct(v, 0), colorFn: () => cssVar('--cat-3'), tooltipExtra: (c) => `${by.get(c).length} punts` });
          },
        },
        { raw: true, render: (el, { rows }) => renderTrendCard(el, rows, 'return_length', ' yds', 'Avg Return Length') },
        {
          title: 'Field Position by Outcome',
          render(el, { rows }) {
            const buckets = sortBuckets([...new Set(rows.map((r) => r.field_bucket).filter(Boolean))]);
            const by = groupBy(rows.filter((r) => r.field_bucket), 'field_bucket');
            renderStacked(el, { categories: buckets, series: Object.fromEntries(OUTCOME_CATS.map((o) => [o, buckets.map((b) => by.get(b).filter((r) => r.next_drive_outcome === o).length)])), order: OUTCOME_CATS, colors: categoricalColorMap(OUTCOME_CATS) });
          },
        },
      ],
      footer: () => ST.source('punt_return', 'Punt Return', '"Punts by Outcome" reflects the sheet\'s own Kick Outcome column.'),
    });
  };

  /* ================================================================== Kickoff == */

  ST.kickoffTab = function (root) {
    const D = U();
    Site.view(root, {
      filters: { defs: [{ field: 'kick_type', label: 'Kick Type' }, { field: 'next_drive_outcome', label: 'Next Drive Outcome' }, { field: 'is_home', label: 'Home/Away' }, { field: 'quarter', label: 'Quarter' }, SEASON_LATEST, { field: 'opponent', label: 'Opponent' }, { field: 'kicker', label: 'Kicker' }], values: D.filters.kickoff },
      source: 'Kickoff unit',
      prepare(st) { const rows = applyFilters(D.units.kickoff, st); const types = ['Deep', 'Onside'].filter((t) => rows.some((r) => r.kick_type === t)); return { rows, types, typeColors: categoricalColorMap(types), byType: groupBy(rows, 'kick_type') }; },
      summary: ({ rows }) => `${rows.length} kicks in view`,
      kpis: [
        countKpi('# of Kicks'),
        avgKpi('Avg Hangtime', 'hangtime', { digits: 2, unit: 's', charted: true }),
        avgKpi('Avg Distance', 'total_distance', { unit: ' yds' }),
        avgKpi('Avg Return Length', 'return_length', { unit: ' yds' }),
        avgKpi('Avg Field Position', 'converted_los'),
        avgKpi('Avg Points Scored', 'next_drive_points', { digits: 2 }),
      ],
      cards: [
        {
          title: 'Kick Distance vs Field Position',
          render(el, { rows, typeColors }) {
            renderScatter(el, {
              points: rows.filter((r) => r.total_distance !== null && r.converted_los !== null).map((r) => ({
                x: r.total_distance, y: r.converted_los, group: r.kick_type,
                label: [`<div class="tt-title">${esc(r.kicker)} — ${r.kick_type}</div>`, `<div class="tt-row"><span>Kick distance</span><span>${r.total_distance} yd</span></div>`, `<div class="tt-row"><span>Landing spot</span><span>${r.converted_los}</span></div>`, r.return_length !== null ? `<div class="tt-row"><span>Return allowed</span><span>${r.return_length} yd</span></div>` : '', '<div class="tt-divider"></div>', `<div class="tt-muted">${nextDriveTip(r)}</div>`].join(''),
              })),
              xLabel: 'Kick distance (yd)', yLabel: 'Field position', colorMap: typeColors,
            });
          },
        },
        {
          title: 'Avg Field Position by Kick Type',
          render(el, { types, typeColors, byType }) {
            renderBar(el, { categories: types, values: types.map((t) => mean(byType.get(t).map((r) => r.converted_los))), colorFn: (name) => typeColors[name], tooltipExtra: (t) => `${byType.get(t).length} kicks` });
          },
        },
        { title: 'Drive Success by Field Position', render: (el, { rows }) => bucketRate(el, rows, 'field_bucket', driveOk, '--cat-1', 'kicks') },
        {
          title: 'Drive Success by Kick Type',
          render(el, { types, typeColors, byType }) {
            renderBar(el, { categories: types, values: types.map((t) => rate(byType.get(t), driveOk)), labelFmt: (v) => pct(v, 0), colorFn: (name) => typeColors[name], tooltipExtra: (t) => `${byType.get(t).length} kicks` });
          },
        },
        { raw: true, render: (el, { rows }) => renderTrendCard(el, rows, 'converted_los', '', 'Avg Field Position') },
        { raw: true, render: (el, { rows }) => renderTrendCard(el, rows, 'return_length', ' yds', 'Avg Return Length Allowed') },
      ],
      footer: () => ST.source('kickoff', 'Kickoff', 'Only Deep and Onside kick types are distinguished in the source data (no separate Pooch/Squib category tracked).'),
    });
  };

  /* ============================================================= Kickoff Return == */

  ST.kickoffReturnTab = function (root) {
    const D = U();
    Site.view(root, {
      filters: { defs: [{ field: 'kick_type', label: 'Kick Type' }, { field: 'next_drive_outcome', label: 'Next Drive Outcome' }, { field: 'is_home', label: 'Home/Away' }, { field: 'quarter', label: 'Quarter' }, SEASON_LATEST, { field: 'opponent', label: 'Opponent' }, { field: 'returner', label: 'Returner' }], values: D.filters.kickoff_return },
      source: 'Kickoff return unit',
      prepare(st) { return { rows: applyFilters(D.units.kickoff_return, st) }; },
      summary: ({ rows }) => `${rows.length} returns in view`,
      kpis: [
        countKpi('# of Returns'),
        avgKpi('Avg Hangtime', 'hangtime', { digits: 2, unit: 's', charted: true }),
        avgKpi('Avg Distance', 'total_distance', { unit: ' yds' }),
        avgKpi('Avg Return Length', 'return_length', { unit: ' yds' }),
        avgKpi('Avg Field Position', 'converted_los'),
        avgKpi('Avg Points Scored', 'next_drive_points', { digits: 2 }),
      ],
      cards: [
        {
          title: 'Field Position by Return Length',
          render(el, { rows }) {
            const colors = categoricalColorMap([...new Set(rows.map((r) => r.returner).filter(Boolean))]);
            renderScatter(el, {
              points: rows.filter((r) => r.converted_los !== null && r.return_length !== null).map((r) => ({
                x: r.converted_los, y: r.return_length, group: r.returner,
                label: [`<div class="tt-title">${esc(r.returner || '—')}</div>`, `<div class="tt-row"><span>Landing spot</span><span>${r.converted_los}</span></div>`, `<div class="tt-row"><span>Return length</span><span>${r.return_length} yd</span></div>`, r.return_location ? `<div class="tt-row"><span>Return location</span><span>${r.return_location}</span></div>` : '', '<div class="tt-divider"></div>', `<div class="tt-muted">vs ${esc(r.opponent)}, ${r.date} · Q${r.quarter} · ${r.kick_type} · Next drive: ${r.next_drive_outcome || 'No Score'}</div>`].join(''),
              })),
              xLabel: 'Field position (landing)', yLabel: 'Return length (yd)', colorMap: colors,
            });
          },
        },
        {
          title: 'Drive Success by Return Location',
          render(el, { rows }) {
            bucketRate(el, rows, 'return_location', driveOk, '--cat-1', 'returns', ['L', 'LM', 'M', 'RM', 'R', 'OBR', 'OBL']);
          },
        },
        { title: 'Drive Success by Field Position', render: (el, { rows }) => bucketRate(el, rows, 'field_bucket', driveOk, '--cat-3', 'returns') },
        {
          title: 'Outcome by Field Position',
          render(el, { rows }) {
            const cats = ['No Score', 'Field Goal', 'Touchdown'].filter((o) => rows.some((r) => r.next_drive_outcome === o));
            const buckets = sortBuckets([...new Set(rows.map((r) => r.field_bucket).filter(Boolean))]);
            const by = groupBy(rows.filter((r) => r.field_bucket), 'field_bucket');
            renderStacked(el, { categories: buckets, series: Object.fromEntries(cats.map((o) => [o, buckets.map((b) => by.get(b).filter((r) => r.next_drive_outcome === o).length)])), order: cats, colors: categoricalColorMap(cats) });
          },
        },
        { raw: true, render: (el, { rows }) => renderTrendCard(el, rows, 'converted_los', '', 'Avg Starting Field Position') },
        { raw: true, render: (el, { rows }) => renderTrendCard(el, rows, 'return_length', ' yds', 'Avg Return Length') },
      ],
      footer: () => ST.source('kickoff_return', 'Kickoff Return', 'Return Location uses the sheet\'s "Hash Received On" field.'),
    });
  };
})();
