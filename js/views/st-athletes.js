/* Special Teams -- the Athletes tab: one place for every special-teams role instead of a page
   per role. Pick a role (Placekicker, Kickoff Kicker, Punter, Short Snapper, Long Snapper)
   and a view:
     Scorecard      headline KPIs + the role's key metric by season
     Head-to-Head   any two athletes side by side
     Deep Dive      situational splits (quarter, hash, snap location, home/away), an
                    athlete x season heatmap, and a detail table

   A role is a unit's sheet (money_unit / kickoff / punt) viewed by one athlete column
   (kicker / long_snapper / punter / snapper). The three view builders below are shared;
   each role only supplies its metrics. "Short snapper" is the PAT/FG snapper (the sheet's
   `long_snapper` column on money_unit); "long snapper" snaps punts. */
(function () {
  const ST = window.ST;
  const U = ST.U;
  const esc = Site.esc;
  const SEASON_LATEST = ST.SEASON_LATEST;
  const A_COLOR = '--cat-6', B_COLOR = '--cat-3';

  /* ------------------------------------------------------------ shared helpers == */

  const years = (rows) => {
    const s = [...new Set(rows.map((r) => r.season))].sort();
    return s.length ? (s.length === 1 ? s[0] : `${s[0]} – ${s[s.length - 1]}`) : '—';
  };
  const hangtime = (rows) => { const h = rows.filter((r) => r.hangtime !== null); return h.length ? `${fmt(mean(h.map((r) => r.hangtime)), 2)}s` : '—'; };
  const snapTime = (rows) => { const t = rows.filter((r) => r.snap_to_catch !== null); return t.length ? `${fmt(mean(t.map((r) => r.snap_to_catch)), 2)}s` : '—'; };
  const longFg = (rows) => { const m = makes(fgs(rows)); return m.length ? `${Math.max(...m.map((r) => r.distance))} yds` : '—'; };
  const isBlocked = (r) => r.miss_location === 'Blocked';
  const deepKick = (rows) => rows.filter((r) => r.kick_type === 'Deep');
  const onsideKick = (rows) => rows.filter((r) => r.kick_type === 'Onside');
  const isTouchback = (r) => r.kick_outcome === 'Touchback';
  const protectionIssue = (r) => r.blocked || r.punter_tackle;
  const yds = (n) => (v) => `${fmt(v, n)} yds`;
  const p0 = (v) => pct(v, 0);
  const seasonWord = () => String(U().filters.money_unit.season.length);

  /** A quarter -> metric bar. */
  function quarterBars(el, unit, byQ, { metric, color, noun, labelFmt = p0 }) {
    const quarters = U().filters[unit].quarter.filter((q) => byQ.has(q));
    renderBar(el, { categories: quarters, values: quarters.map((q) => metric(byQ.get(q))), labelFmt, colorFn: () => cssVar(color), tooltipExtra: (q) => `${byQ.get(q).length} ${noun}` });
  }
  /** Hash kicked-from -> metric bar (charted 2023 onward). */
  function hashBars(el, rows, { metric, color, noun }) {
    const by = groupBy(rows.filter((r) => r.hash_kicked_from), 'hash_kicked_from');
    const present = HASH_ORDER.filter((h) => by.has(h));
    if (!present.length) { el.innerHTML = '<div class="data-note">No charted hash data in the current filter (2023 onward only).</div>'; return; }
    renderBar(el, { categories: present, values: present.map((h) => metric(by.get(h))), labelFmt: p0, colorFn: () => cssVar(color), tooltipExtra: (h) => `${by.get(h).length} ${noun}` });
  }
  /** Snap location -> metric bar (charted 2023 onward). */
  function snapLocBars(el, unit, rows, { metric, color, noun }) {
    const by = groupBy(rows.filter((r) => r.snap_location).map((r) => ({ ...r, snap_location: String(r.snap_location) })), 'snap_location');
    const present = snapLocationScale(U().units[unit]).filter((s) => by.has(s));
    if (!present.length) { el.innerHTML = '<div class="data-note">No charted Snap Location data in the current filter (2023 onward only).</div>'; return; }
    renderBar(el, { categories: present, values: present.map((s) => metric(by.get(s))), labelFmt: p0, colorFn: () => cssVar(color), tooltipExtra: (s) => `${by.get(s).length} ${noun}` });
  }
  /** Avg Value/Score by season; green at/above the 50 average, red below. */
  function scoreBars(el, unit, rows, noun) {
    const by = groupBy(rows, 'season');
    const seasons = ST.seasonsInView(unit, rows);
    renderBar(el, {
      categories: seasons, values: seasons.map((s) => mean((by.get(s) || []).map((r) => r.score))), labelFmt: (v) => fmt(v, 0),
      colorFn: (s, v) => (v >= 50 ? cssVar('--good') : cssVar('--critical')), tooltipExtra: (s) => `${(by.get(s) || []).length} ${noun}`,
    });
  }
  /** Athlete x season heatmap of a rate. Columns always cover every season. */
  function athleteHeat(el, unit, field, rows, { pred }) {
    const allSeasons = U().filters[unit].season;
    const athletes = U().filters[unit][field].filter((a) => rows.some((r) => r[field] === a));
    renderHeatmap(el, {
      rowLabels: athletes, colLabels: allSeasons,
      cellFor: (athlete, season) => {
        const g = rows.filter((r) => r.season === season && r[field] === athlete);
        return g.length ? { pct: rate(g, pred), n: g.length, made: g.filter(pred).length } : null;
      },
      title: (athlete, season) => `${athlete}, ${season}`,
    });
  }
  const heatNote = (what, extra) => `Sequential blue = ${what}. Columns always show all ${seasonWord()} seasons — ${extra}`;

  /** Detail table: one row per athlete present in `rows`. cols = [{label, cell(athleteRows)}]. */
  function athleteTable(unit, field, rows, firstLabel, cols) {
    const athletes = U().filters[unit][field].filter((a) => rows.some((r) => r[field] === a));
    return {
      head: [firstLabel, 'Seasons', ...cols.map((c) => c.label)],
      rows: athletes.map((a) => {
        const g = rows.filter((r) => r[field] === a);
        const s = [...new Set(g.map((r) => r.season))].sort();
        return [esc(a), s.length === 1 ? s[0] : `${s[0]}–${s[s.length - 1]}`, ...cols.map((c) => c.cell(g))];
      }),
    };
  }

  /** Best-quarter KPI + home/away KPI helpers (metric-specific via `metric`). */
  function bestQuarter(byQ, metric, fmtV, noun) {
    const { key, value } = bestByGroup(byQ, metric);
    return key !== null ? [`Q${key}`, `${fmtV(value)} (n=${byQ.get(key).length})`] : ['—', `not enough ${noun}`];
  }

  /* ----------------------------------------------------------------- roles == */

  // Each role supplies: unit/field/word/noun, the Scorecard spec, the Head-to-Head config, and the Deep Dive spec.
  const ROLES = [
    /* ------------------------------------------------------------ Placekicker */
    {
      id: 'placekicker', label: 'Placekicker', unit: 'money_unit', field: 'kicker', word: 'kicker', noun: 'kicks', sheet: 'PAT-FG',
      summary: (n) => `${n} kicks in view`,
      scorecard: {
        filterField: 'kicker', filterLabel: 'Kicker',
        kpis: [
          { label: 'PAT Make Rate', dot: '--good', value: (rows) => { const p = pats(rows); return [pct(makeRate(p)), `${makes(p).length}/${p.length} PATs`]; } },
          { label: 'FG Make Rate', dot: '--critical', value: (rows) => { const f = fgs(rows); return [pct(makeRate(f)), `${makes(f).length}/${f.length} field goals`]; } },
          { label: 'Longest FG Made', value: (rows) => [longFg(rows)] },
          { label: 'Kicks in View', value: (rows) => [String(rows.length)] },
          { label: 'Avg PAT/FG Score', glossary: 'Value / Score', value: (rows) => [fmt(mean(rows.map((r) => r.score)), 0)] },
        ],
        cards: (R) => [
          { title: 'FG Make % by Season', render: (el, { rows }) => ST.seasonBars(el, R.unit, rows, { subset: fgs, metric: makeRate, labelFmt: p0, color: '--cat-1', noun: 'kicks' }) },
          {
            title: 'FG Make % by Distance Bucket',
            render(el, { rows }) {
              const by = groupBy(fgs(rows).map((r) => ({ ...r, _b: fgDistBucket(r.distance) })), '_b');
              renderBar(el, { categories: FG_DIST_BUCKETS, values: FG_DIST_BUCKETS.map((b) => { const g = by.get(b); return g && g.length ? makeRate(g) : null; }), labelFmt: p0, colorFn: () => cssVar('--cat-3'), tooltipExtra: (b) => `${(by.get(b) || []).length} kicks` });
            },
          },
        ],
      },
      h2h: {
        mini: [{ label: 'PAT%', value: (g) => pct(makeRate(pats(g))) }, { label: 'FG%', value: (g) => pct(makeRate(fgs(g))) }, { label: 'Long', value: longFg }, { label: 'Avg Score', value: (g) => fmt(mean(g.map((r) => r.score)), 0) }],
        outcome: {
          title: 'FG makes by distance',
          draw(el, g, who) {
            const by = groupBy(fgs(g).map((r) => ({ ...r, _b: fgDistBucket(r.distance) })), '_b');
            renderBar(el, { categories: FG_DIST_BUCKETS, values: FG_DIST_BUCKETS.map((b) => (by.get(b) || []).filter((r) => r.make).length), labelFmt: String, colorFn: () => cssVar('--cat-1'), tooltipExtra: (b) => `${(by.get(b) || []).length} kicks`, compact: true });
          },
        },
        trends: [{ title: 'FG make % by season — selected kickers', subset: fgs, metric: makeRate, labelFmt: p0 }],
        extra: 'optime',
      },
      deep: {
        filters: [SEASON_LATEST, { field: 'kicker', label: 'Kicker' }, { field: 'quarter', label: 'Quarter' }, { field: 'is_home', label: 'Home/Away' }],
        kpis: [
          { label: 'FG Make Rate', dot: '--critical', value: ({ fg }) => [pct(makeRate(fg)), `${makes(fg).length}/${fg.length} field goals`] },
          { label: 'Blocked', value: ({ rows }) => [String(rows.filter(isBlocked).length)] },
          { label: 'Home vs Away FG%', value: ({ fg }) => [`${pct(makeRate(fg.filter((r) => r.is_home)), 0)} / ${pct(makeRate(fg.filter((r) => !r.is_home)), 0)}`, 'home / away'] },
          { label: 'Best Quarter', value: ({ byQ }) => bestQuarter(byQ, makeRate, p0, 'attempts') },
        ],
        build(R, D) {
          return {
            prepare: (rows, st) => { const fg = fgs(rows); return { fg, pat: pats(rows), byQ: groupBy(fg, 'quarter'), heatRows: fgs(reopenSeasons(D.units[R.unit], st, D.filters[R.unit].season)) }; },
            cards: [
              { title: 'FG attempts &amp; make % by quarter', render: (el, { byQ }) => quarterBars(el, R.unit, byQ, { metric: makeRate, color: '--cat-2', noun: 'kicks' }) },
              {
                title: 'PAT vs FG attempt volume by season',
                render(el, { rows, fg, pat }) {
                  const seasons = ST.seasonsInView(R.unit, rows);
                  const pBy = groupBy(pat, 'season'), fBy = groupBy(fg, 'season');
                  renderStacked(el, { categories: seasons, series: { PAT: seasons.map((s) => (pBy.get(s) || []).length), FG: seasons.map((s) => (fBy.get(s) || []).length) }, order: ['PAT', 'FG'], colors: { PAT: cssVar('--cat-1'), FG: cssVar('--cat-3') } });
                },
              },
              {
                title: 'FG make % — distance bucket × season', wide: true, note: heatNote('make%', 'only the Kicker and Quarter filters narrow this grid.'),
                render(el, { heatRows }) {
                  renderHeatmap(el, {
                    rowLabels: FG_DIST_BUCKETS, colLabels: D.filters[R.unit].season,
                    cellFor: (bucket, season) => { const g = heatRows.filter((r) => r.season === season && fgDistBucket(r.distance) === bucket); return g.length ? { pct: makeRate(g), n: g.length, made: makes(g).length } : null; },
                    title: (bucket, season) => `${bucket} yds, ${season}`,
                  });
                },
              },
              { title: 'FG make % by hash kicked from', render: (el, { fg }) => hashBars(el, fg, { metric: makeRate, color: '--cat-3', noun: 'kicks' }) },
              { title: 'FG make % by Snap Location', render: (el, { fg }) => snapLocBars(el, R.unit, fg, { metric: makeRate, color: '--cat-5', noun: 'kicks' }) },
              { title: 'Avg PAT/FG Score by season', wide: true, render: (el, { rows }) => scoreBars(el, R.unit, rows, 'kicks') },
            ],
            table: {
              title: 'Kicker &amp; miss-type detail', note: 'Attempts/makes/PAT/FG/Long/Score are real and respect the filters above. Avg Op Time only reflects charted rows (2023 onward) — shows "—" for a kicker with none in view.',
              build: (rows) => athleteTable(R.unit, R.field, rows, 'Kicker', [
                { label: 'PAT (made/att)', cell: (g) => `${makes(pats(g)).length}/${pats(g).length}` }, { label: 'PAT %', cell: (g) => pct(makeRate(pats(g)), 0) },
                { label: 'FG (made/att)', cell: (g) => `${makes(fgs(g)).length}/${fgs(g).length}` }, { label: 'FG %', cell: (g) => pct(makeRate(fgs(g)), 0) },
                { label: 'Long', cell: longFg }, { label: 'Avg Score', cell: (g) => fmt(mean(g.map((r) => r.score)), 0) }, { label: 'Avg Op Time', cell: (g) => { const t = g.filter((r) => r.snap_to_kick !== null); return t.length ? `${fmt(mean(t.map((r) => r.snap_to_kick)), 2)}s` : '—'; } },
              ]),
            },
          };
        },
      },
    },

    /* --------------------------------------------------------- Kickoff Kicker */
    {
      id: 'kickoff-kicker', label: 'Kickoff Kicker', unit: 'kickoff', field: 'kicker', word: 'kicker', noun: 'kicks', sheet: 'Kickoff',
      summary: (n) => `${n} kickoffs in view`,
      scorecard: {
        filterField: 'kicker', filterLabel: 'Kicker', footExtra: 'Distance/return-allowed charted as two separate charts rather than one dual-axis chart -- different units, different meanings, never combined on one scale.',
        kpis: [
          { label: 'Touchback Rate', dot: '--good', value: (rows) => { const d = deepKick(rows); return [pct(rate(d, (r) => r.touchback)), `${d.filter((r) => r.touchback).length}/${d.length} deep kicks`]; } },
          { label: 'Inside-25 Rate', value: (rows) => [pct(rate(deepKick(rows), (r) => r.inside_25))] },
          { label: 'Avg Kickoff Distance', value: (rows) => [`${fmt(mean(deepKick(rows).map((r) => r.total_distance)), 1)} yds`] },
          { label: 'Avg Return Allowed', dot: '--critical', value: (rows) => [`${fmt(mean(deepKick(rows).map((r) => r.return_length)), 1)} yds`] },
        ],
        cards: (R) => [
          { title: 'Touchback % by Season', render: (el, { rows }) => ST.seasonBars(el, R.unit, rows, { subset: deepKick, metric: (g) => rate(g, (r) => r.touchback), labelFmt: p0, color: '--cat-1', noun: 'kicks' }) },
          { title: 'Inside-25 % by Season', render: (el, { rows }) => ST.seasonBars(el, R.unit, rows, { subset: deepKick, metric: (g) => rate(g, (r) => r.inside_25), labelFmt: p0, color: '--cat-3', noun: 'kicks' }) },
          { title: 'Avg Kickoff Distance by Season', render: (el, { rows }) => ST.seasonBars(el, R.unit, rows, { subset: deepKick, metric: (g) => mean(g.map((r) => r.total_distance)), labelFmt: yds(0), color: '--cat-4', noun: 'kicks' }) },
          { title: 'Avg Return Allowed by Season', render: (el, { rows }) => ST.seasonBars(el, R.unit, rows, { subset: deepKick, metric: (g) => mean(g.map((r) => r.return_length)), labelFmt: yds(0), color: '--critical', noun: 'kicks' }) },
        ],
      },
      h2h: {
        mini: [
          { label: 'TB%', value: (g) => pct(rate(deepKick(g), (r) => r.touchback)) }, { label: 'I25%', value: (g) => pct(rate(deepKick(g), (r) => r.inside_25)) },
          { label: 'Avg dist', value: (g) => `${fmt(mean(deepKick(g).map((r) => r.total_distance)), 1)} yds` }, { label: 'Hangtime', sub: '(2023+)', value: hangtime },
        ],
        outcome: {
          title: 'Outcome mix',
          draw(el, g) {
            const cats = ['Touchback', 'Out of Bounds', 'Returned', 'Onside'];
            const of = (r) => (r.kick_type === 'Onside' ? 'Onside' : r.touchback ? 'Touchback' : r.out_of_bounds ? 'Out of Bounds' : 'Returned');
            const by = groupBy(g.map((r) => ({ ...r, _o: of(r) })), '_o');
            const present = cats.filter((o) => by.has(o));
            renderBar(el, { categories: present, values: present.map((o) => by.get(o).length), labelFmt: String, colorFn: () => cssVar('--cat-1'), tooltipExtra: (o) => `${pct(g.length ? by.get(o).length / g.length : null, 0)} of this kicker's kicks`, compact: true });
          },
        },
        trends: [
          { title: 'Touchback % by season — selected kickers', subset: deepKick, metric: (g) => rate(g, (r) => r.touchback), labelFmt: p0 },
          { title: 'Avg return allowed by season — selected kickers', subset: deepKick, metric: (g) => mean(g.map((r) => r.return_length)), labelFmt: yds(1) },
        ],
        extra: null,
      },
      deep: {
        filters: [SEASON_LATEST, { field: 'kicker', label: 'Kicker' }, { field: 'quarter', label: 'Quarter' }, { field: 'opponent', label: 'Opponent' }, { field: 'is_home', label: 'Home/Away' }],
        kpis: [
          { label: 'Touchback Rate', dot: '--good', value: ({ deep }) => [pct(rate(deep, (r) => r.touchback)), `${deep.filter((r) => r.touchback).length}/${deep.length} deep kicks`] },
          { label: 'Home vs Away TB%', value: ({ deep }) => [`${pct(rate(deep.filter((r) => r.is_home), (r) => r.touchback), 0)} / ${pct(rate(deep.filter((r) => !r.is_home), (r) => r.touchback), 0)}`, 'home / away'] },
          { label: 'Best Quarter (TB%)', value: ({ byQ }) => bestQuarter(byQ, (g) => rate(g, (r) => r.touchback), p0, 'attempts') },
          { label: 'Onside Recovery Rate', value: ({ rows }) => { const o = onsideKick(rows); return [pct(rate(o, (r) => r.onside_obtained)), `${o.filter((r) => r.onside_obtained).length}/${o.length} attempts`]; } },
        ],
        build(R, D) {
          const tb = (g) => rate(g, (r) => r.touchback);
          return {
            prepare: (rows, st) => { const deep = deepKick(rows); return { deep, byQ: groupBy(deep, 'quarter'), heatRows: deepKick(reopenSeasons(D.units[R.unit], st, D.filters[R.unit].season)) }; },
            cards: [
              { title: 'Touchback % &amp; volume by quarter', render: (el, { byQ }) => quarterBars(el, R.unit, byQ, { metric: tb, color: '--cat-2', noun: 'kicks' }) },
              { title: 'Avg return allowed by season', render: (el, { rows }) => ST.seasonBars(el, R.unit, rows, { subset: deepKick, metric: (g) => mean(g.map((r) => r.return_length)), labelFmt: yds(0), color: '--critical', noun: 'kicks' }) },
              { title: 'Touchback % — kicker × season', wide: true, note: heatNote('TB%; text = TB/attempts (deep kicks only)', 'only the Quarter filter narrows this grid (Kicker filter hides non-matching rows).'), render: (el, { heatRows }) => athleteHeat(el, R.unit, R.field, heatRows, { pred: (r) => r.touchback }) },
              { title: 'Touchback % by hash kicked from', render: (el, { deep }) => hashBars(el, deep, { metric: tb, color: '--cat-3', noun: 'kicks' }) },
              { title: 'Avg Kickoff Score by season', render: (el, { rows }) => scoreBars(el, R.unit, rows, 'kicks') },
            ],
            table: {
              title: 'Kicker detail', note: 'Kicks/TB%/I25%/distance/return/Score are real and respect the filters above. Hangtime only reflects charted rows (2023 onward) — shows "—" for a kicker with none in view.',
              build: (rows) => athleteTable(R.unit, R.field, rows, 'Kicker', [
                { label: 'Kicks', cell: (g) => g.length }, { label: 'TB%', cell: (g) => pct(tb(deepKick(g)), 0) }, { label: 'I25%', cell: (g) => pct(rate(deepKick(g), (r) => r.inside_25), 0) },
                { label: 'Avg dist', cell: (g) => `${fmt(mean(deepKick(g).map((r) => r.total_distance)), 1)} yds` }, { label: 'Avg return', cell: (g) => `${fmt(mean(deepKick(g).map((r) => r.return_length)), 1)} yds` },
                { label: 'Avg Score', cell: (g) => fmt(mean(g.map((r) => r.score)), 0) }, { label: 'Hangtime', cell: hangtime },
              ]),
            },
          };
        },
      },
    },

    /* ------------------------------------------------------------------ Punter */
    {
      id: 'punter', label: 'Punter', unit: 'punt', field: 'punter', word: 'punter', noun: 'punts', sheet: 'Punt',
      summary: (n) => `${n} punts in view`,
      scorecard: {
        filterField: 'punter', filterLabel: 'Punter', footExtra: 'Net = gross distance − return yardage. Gross/net charted as two separate charts rather than one dual-axis chart.',
        kpis: [
          { label: 'Avg Net Punt', value: (rows) => [`${fmt(avgNet(rows), 1)} yds`] },
          { label: 'Inside-20 Rate', dot: '--good', value: (rows) => [pct(rate(rows, (r) => r.i20))] },
          { label: 'Touchback Rate', dot: '--critical', value: (rows) => [pct(rate(rows, isTouchback))] },
          { label: 'Punts in View', value: (rows) => [String(rows.length)] },
          { label: 'Avg Punt Score', glossary: 'Value / Score', value: (rows) => [fmt(mean(rows.map((r) => r.score)), 0)] },
        ],
        cards: (R) => [
          { title: 'Net Punt Yardage by Season', render: (el, { rows }) => ST.seasonBars(el, R.unit, rows, { metric: avgNet, labelFmt: yds(0), color: '--cat-1', noun: 'punts' }) },
          { title: 'Gross Punt Distance by Season', render: (el, { rows }) => ST.seasonBars(el, R.unit, rows, { metric: (g) => mean(g.map((r) => r.total_distance)), labelFmt: yds(0), color: '--cat-4', noun: 'punts' }) },
          { title: 'Inside-20 % by Season', render: (el, { rows }) => ST.seasonBars(el, R.unit, rows, { metric: (g) => rate(g, (r) => r.i20), labelFmt: p0, color: '--good', noun: 'punts' }) },
          { title: 'Touchback % by Season', render: (el, { rows }) => ST.seasonBars(el, R.unit, rows, { metric: (g) => rate(g, isTouchback), labelFmt: p0, color: '--critical', noun: 'punts' }) },
        ],
      },
      h2h: {
        mini: [{ label: 'Net avg', value: (g) => `${fmt(avgNet(g), 1)} yds` }, { label: 'I20%', value: (g) => pct(rate(g, (r) => r.i20)) }, { label: 'TB%', value: (g) => pct(rate(g, isTouchback)) }, { label: 'Hangtime', sub: '(2023+)', value: hangtime }],
        outcome: {
          title: 'Outcome mix',
          draw(el, g) {
            const by = groupBy(g, 'kick_outcome');
            const present = PUNT_OUTCOMES.filter((o) => by.has(o));
            renderBar(el, { categories: present, values: present.map((o) => by.get(o).length), labelFmt: String, colorFn: () => cssVar('--cat-1'), tooltipExtra: (o) => `${pct(g.length ? by.get(o).length / g.length : null, 0)} of this punter's kicks`, compact: true });
          },
        },
        trends: [{ title: 'Net punt yardage by season — selected punters', metric: avgNet, labelFmt: yds(1) }],
        extra: 'optime',
      },
      deep: {
        filters: [SEASON_LATEST, { field: 'punter', label: 'Punter' }, { field: 'quarter', label: 'Quarter' }, { field: 'opponent', label: 'Opponent' }, { field: 'is_home', label: 'Home/Away' }],
        kpis: [
          { label: 'Avg Net Punt', value: ({ rows }) => [`${fmt(avgNet(rows), 1)} yds`] },
          { label: 'Home vs Away Net', value: ({ rows }) => [`${fmt(avgNet(rows.filter((r) => r.is_home)), 0)} / ${fmt(avgNet(rows.filter((r) => !r.is_home)), 0)} yds`, 'home / away'] },
          { label: 'Best Quarter (Net)', value: ({ byQ }) => bestQuarter(byQ, avgNet, (v) => `${fmt(v, 1)} yds`, 'punts') },
          { label: 'Touchback Rate', dot: '--critical', value: ({ rows }) => [pct(rate(rows, isTouchback))] },
        ],
        build(R, D) {
          const i20 = (g) => rate(g, (r) => r.i20);
          return {
            prepare: (rows, st) => ({ byQ: groupBy(rows, 'quarter'), heatRows: reopenSeasons(D.units[R.unit], st, D.filters[R.unit].season) }),
            cards: [
              { title: 'Avg net punt by quarter', render: (el, { byQ }) => quarterBars(el, R.unit, byQ, { metric: avgNet, color: '--cat-2', noun: 'punts', labelFmt: yds(0) }) },
              { title: 'Avg hangtime by season', render: (el, { rows }) => ST.seasonBars(el, R.unit, rows, { subset: (rs) => rs.filter((r) => r.hangtime !== null), metric: (g) => mean(g.map((r) => r.hangtime)), labelFmt: (v) => `${fmt(v, 2)}s`, color: '--cat-5', noun: 'punts' }) },
              { title: 'Inside-20 % — punter × season', wide: true, note: heatNote('I20%; text = I20/punts', 'only the Quarter filter narrows this grid (Punter filter hides non-matching rows).'), render: (el, { heatRows }) => athleteHeat(el, R.unit, R.field, heatRows, { pred: (r) => r.i20 }) },
              { title: 'Inside-20 % by hash kicked from', render: (el, { rows }) => hashBars(el, rows, { metric: i20, color: '--cat-3', noun: 'punts' }) },
              { title: 'Inside-20 % by Snap Location', render: (el, { rows }) => snapLocBars(el, R.unit, rows, { metric: i20, color: '--cat-5', noun: 'punts' }) },
              { title: 'Avg Punt Score by season', wide: true, render: (el, { rows }) => scoreBars(el, R.unit, rows, 'punts') },
            ],
            table: {
              title: 'Punter detail', note: 'Punts/Net/Gross/I20%/TB%/Score are real and respect the filters above. Hangtime only reflects charted rows (2023 onward) — shows "—" for a punter with none in view.',
              build: (rows) => athleteTable(R.unit, R.field, rows, 'Punter', [
                { label: 'Punts', cell: (g) => g.length }, { label: 'Net avg', cell: (g) => `${fmt(avgNet(g), 1)} yds` }, { label: 'Gross avg', cell: (g) => `${fmt(mean(g.map((r) => r.total_distance)), 1)} yds` },
                { label: 'I20%', cell: (g) => pct(i20(g), 0) }, { label: 'TB%', cell: (g) => pct(rate(g, isTouchback), 0) }, { label: 'Avg Score', cell: (g) => fmt(mean(g.map((r) => r.score)), 0) }, { label: 'Hangtime', cell: hangtime },
              ]),
            },
          };
        },
      },
    },

    /* ----------------------------------------------------------- Short Snapper */
    {
      id: 'short-snapper', label: 'Short Snapper', unit: 'money_unit', field: 'long_snapper', word: 'snapper', noun: 'snaps', sheet: 'PAT-FG', credited: true,
      summary: (n) => `${n} attempts in view`,
      creditedSummary: (n) => `${n} credited snaps in view`,
      scorecard: {
        filterField: 'long_snapper', filterLabel: 'Snapper',
        footFn: (rows) => { const all = ST.rowCount('money_unit'), c = U().units.money_unit.filter((r) => r.long_snapper).length; return `Snapper only credited on ${c}/${all} attempts -- "Snaps by Snapper" and the filter's Snapper options reflect only those; PAT%/FG% KPIs use every attempt regardless of whether a snapper is credited.`; },
        kpis: [
          { label: 'PAT Make Rate', dot: '--good', value: (rows) => { const p = pats(rows); return [pct(makeRate(p)), `${makes(p).length}/${p.length} PATs`]; } },
          { label: 'FG Make Rate', dot: '--critical', value: (rows) => { const f = fgs(rows); return [pct(makeRate(f)), `${makes(f).length}/${f.length} field goals`]; } },
          { label: 'Snaps in View', value: (rows) => [String(rows.length)] },
          { label: 'Blocked Kicks', value: (rows) => [String(rows.filter(isBlocked).length)] },
          { label: 'Avg PAT/FG Score', glossary: 'Value / Score', value: (rows) => [fmt(mean(rows.map((r) => r.score)), 0)] },
        ],
        cards: (R) => [
          { title: 'PAT % by Season', render: (el, { rows }) => ST.seasonBars(el, R.unit, rows, { subset: pats, metric: makeRate, labelFmt: p0, color: '--cat-1', noun: 'snaps' }) },
          { title: 'FG % by Season', render: (el, { rows }) => ST.seasonBars(el, R.unit, rows, { subset: fgs, metric: makeRate, labelFmt: p0, color: '--cat-3', noun: 'snaps' }) },
          {
            title: 'Snaps by Snapper',
            render(el, { rows }) {
              const credited = rows.filter((r) => r.long_snapper);
              const by = groupBy(credited, 'long_snapper');
              const snappers = U().filters[R.unit].long_snapper.filter((s) => rows.some((r) => r.long_snapper === s));
              renderBar(el, { categories: snappers, values: snappers.map((s) => (by.get(s) || []).length), labelFmt: String, colorFn: () => cssVar('--cat-4'), tooltipExtra: (s) => `${pct(credited.length ? (by.get(s) || []).length / credited.length : null, 0)} of credited snaps` });
            },
          },
          { title: 'Avg Snap Time by Season', render: (el, { rows }) => ST.seasonBars(el, R.unit, rows, { subset: (rs) => rs.filter((r) => r.snap_to_catch !== null), metric: (g) => mean(g.map((r) => r.snap_to_catch)), labelFmt: (v) => `${fmt(v, 2)}s`, color: '--cat-5', noun: 'snaps' }) },
        ],
      },
      h2h: {
        mini: [{ label: 'PAT%', value: (g) => pct(makeRate(pats(g))) }, { label: 'FG%', value: (g) => pct(makeRate(fgs(g))) }, { label: 'Snaps', value: (g) => String(g.length) }, { label: 'Snap time', sub: '(2023+)', value: snapTime }],
        outcome: {
          title: 'Outcome mix',
          draw(el, g) {
            const cats = ['Make', 'Miss', 'Blocked'];
            const by = groupBy(g.map((r) => ({ ...r, _o: r.make ? 'Make' : (isBlocked(r) ? 'Blocked' : 'Miss') })), '_o');
            const present = cats.filter((o) => by.has(o));
            renderBar(el, { categories: present, values: present.map((o) => by.get(o).length), labelFmt: String, colorFn: () => cssVar('--cat-1'), tooltipExtra: (o) => `${pct(g.length ? by.get(o).length / g.length : null, 0)} of this snapper's attempts`, compact: true });
          },
        },
        trends: [{ title: 'FG % by season — selected snappers', subset: fgs, metric: makeRate, labelFmt: p0 }],
        extra: 'snaploc',
      },
      deep: {
        filters: [SEASON_LATEST, { field: 'long_snapper', label: 'Snapper' }, { field: 'quarter', label: 'Quarter' }, { field: 'is_home', label: 'Home/Away' }],
        kpis: [
          { label: 'FG Make Rate', dot: '--critical', value: ({ fg }) => [pct(makeRate(fg)), `${makes(fg).length}/${fg.length} field goals`] },
          { label: 'Blocked Rate', value: ({ rows }) => [pct(rows.length ? rows.filter(isBlocked).length / rows.length : null)] },
          { label: 'Home vs Away FG%', value: ({ fg }) => [`${pct(makeRate(fg.filter((r) => r.is_home)), 0)} / ${pct(makeRate(fg.filter((r) => !r.is_home)), 0)}`, 'home / away'] },
          { label: 'Best Quarter (FG%)', value: ({ byQ }) => bestQuarter(byQ, makeRate, p0, 'attempts') },
        ],
        build(R, D) {
          return {
            prepare: (rows, st) => { const fg = fgs(rows); return { fg, byQ: groupBy(fg, 'quarter'), heatRows: fgs(reopenSeasons(D.units[R.unit], st, D.filters[R.unit].season).filter((r) => r.long_snapper)) }; },
            cards: [
              { title: 'FG make % &amp; volume by quarter', render: (el, { byQ }) => quarterBars(el, R.unit, byQ, { metric: makeRate, color: '--cat-2', noun: 'snaps' }) },
              {
                title: 'Snap volume by season',
                render(el, { rows }) {
                  const by = groupBy(rows, 'season');
                  const seasons = ST.seasonsInView(R.unit, rows);
                  renderBar(el, { categories: seasons, values: seasons.map((s) => (by.get(s) || []).length), labelFmt: String, colorFn: () => cssVar('--cat-4') });
                },
              },
              { title: 'FG make % — snapper × season', wide: true, note: heatNote('FG make%; text = made/attempted', 'only the Quarter filter narrows this grid (Snapper filter hides non-matching rows).'), render: (el, { heatRows }) => athleteHeat(el, R.unit, R.field, heatRows, { pred: (r) => r.make }) },
              { title: 'Make % by Snap Location', render: (el, { fg }) => snapLocBars(el, R.unit, fg, { metric: makeRate, color: '--cat-5', noun: 'snaps' }) },
              { title: 'Avg PAT/FG Score by season', render: (el, { rows }) => scoreBars(el, R.unit, rows, 'snaps') },
            ],
            table: {
              title: 'Snapper detail', note: 'Snaps/PAT%/FG%/Blocked/Score are real and respect the filters above. Snap Time only reflects charted rows (2023 onward) — shows "—" for a snapper with none in view.',
              build: (rows) => athleteTable(R.unit, R.field, rows, 'Snapper', [
                { label: 'Snaps', cell: (g) => g.length }, { label: 'PAT%', cell: (g) => pct(makeRate(pats(g)), 0) }, { label: 'FG%', cell: (g) => pct(makeRate(fgs(g)), 0) },
                { label: 'Blocked', cell: (g) => g.filter(isBlocked).length }, { label: 'Avg Score', cell: (g) => fmt(mean(g.map((r) => r.score)), 0) }, { label: 'Snap Time', cell: snapTime },
              ]),
            },
          };
        },
      },
    },

    /* ------------------------------------------------------------ Long Snapper */
    {
      id: 'long-snapper', label: 'Long Snapper', unit: 'punt', field: 'snapper', word: 'snapper', noun: 'snaps', h2hNoun: 'punts', sheet: 'Punt', credited: true,
      summary: (n) => `${n} punts in view`,
      creditedSummary: (n) => `${n} credited punts in view`,
      scorecard: {
        filterField: 'snapper', filterLabel: 'Snapper', footExtra: 'Net = gross distance − return yardage. Blocked/Punter Tackle rates use every punt, not just snapper-credited ones.',
        kpis: [
          { label: 'Punts in View', value: (rows) => [String(rows.length)] },
          { label: 'Blocked Rate', dot: '--critical', value: (rows) => [pct(rate(rows, (r) => r.blocked))] },
          { label: 'Punter Tackle Rate', dot: '--critical', value: (rows) => [pct(rate(rows, (r) => r.punter_tackle))] },
          { label: 'Avg Net Punt', dot: '--good', value: (rows) => [`${fmt(avgNet(rows), 1)} yds`] },
          { label: 'Avg Punt Score', glossary: 'Value / Score', value: (rows) => [fmt(mean(rows.map((r) => r.score)), 0)] },
        ],
        cards: (R) => [
          { title: 'Blocked Rate by Season', render: (el, { rows }) => ST.seasonBars(el, R.unit, rows, { metric: (g) => rate(g, (r) => r.blocked), labelFmt: p0, color: '--critical', noun: 'snaps' }) },
          { title: 'Punter Tackle Rate by Season', render: (el, { rows }) => ST.seasonBars(el, R.unit, rows, { metric: (g) => rate(g, (r) => r.punter_tackle), labelFmt: p0, color: '--serious', noun: 'snaps' }) },
          { title: 'Net Punt by Season', render: (el, { rows }) => ST.seasonBars(el, R.unit, rows, { metric: avgNet, labelFmt: yds(0), color: '--cat-1', noun: 'snaps' }) },
          { title: 'Avg Snap Time by Season', render: (el, { rows }) => ST.seasonBars(el, R.unit, rows, { subset: (rs) => rs.filter((r) => r.snap_to_catch !== null), metric: (g) => mean(g.map((r) => r.snap_to_catch)), labelFmt: (v) => `${fmt(v, 2)}s`, color: '--cat-5', noun: 'snaps' }) },
        ],
      },
      h2h: {
        mini: [{ label: 'Blocked%', value: (g) => pct(rate(g, (r) => r.blocked)) }, { label: 'Tackle%', value: (g) => pct(rate(g, (r) => r.punter_tackle)) }, { label: 'Net avg', value: (g) => `${fmt(avgNet(g), 1)} yds` }, { label: 'Snap time', sub: '(2023+)', value: snapTime }],
        outcome: {
          title: 'Outcome mix',
          draw(el, g) {
            const by = groupBy(g, 'kick_outcome');
            const present = PUNT_OUTCOMES.filter((o) => by.has(o));
            renderBar(el, { categories: present, values: present.map((o) => by.get(o).length), labelFmt: String, colorFn: () => cssVar('--cat-1'), tooltipExtra: (o) => `${pct(g.length ? by.get(o).length / g.length : null, 0)} of this snapper's punts`, compact: true });
          },
        },
        trends: [{ title: 'Net punt by season — selected snappers', metric: avgNet, labelFmt: yds(1) }],
        extra: 'snaploc',
      },
      deep: {
        filters: [SEASON_LATEST, { field: 'snapper', label: 'Snapper' }, { field: 'quarter', label: 'Quarter' }, { field: 'opponent', label: 'Opponent' }, { field: 'is_home', label: 'Home/Away' }],
        kpis: [
          { label: 'Blocked Rate', dot: '--critical', value: ({ rows }) => [pct(rate(rows, (r) => r.blocked))] },
          { label: 'Punter Tackle Rate', dot: '--critical', value: ({ rows }) => [pct(rate(rows, (r) => r.punter_tackle))] },
          { label: 'Home vs Away Net', value: ({ rows }) => [`${fmt(avgNet(rows.filter((r) => r.is_home)), 0)} / ${fmt(avgNet(rows.filter((r) => !r.is_home)), 0)} yds`, 'home / away'] },
          { label: 'Best Quarter (Net)', value: ({ byQ }) => bestQuarter(byQ, avgNet, (v) => `${fmt(v, 1)} yds`, 'punts') },
        ],
        build(R, D) {
          const blocked = (g) => rate(g, (r) => r.blocked);
          return {
            prepare: (rows, st) => ({ byQ: groupBy(rows, 'quarter'), heatRows: reopenSeasons(D.units[R.unit], st, D.filters[R.unit].season).filter((r) => r.snapper) }),
            cards: [
              { title: 'Protection-issue rate by quarter', note: 'Protection issue = Blocked or Punter Tackle.', render: (el, { byQ }) => quarterBars(el, R.unit, byQ, { metric: (g) => rate(g, protectionIssue), color: '--critical', noun: 'snaps' }) },
              { title: 'Net punt by season', render: (el, { rows }) => ST.seasonBars(el, R.unit, rows, { metric: avgNet, labelFmt: yds(0), color: '--cat-1', noun: 'snaps' }) },
              { title: 'Blocked rate — snapper × season', wide: true, note: heatNote('blocked rate; text = blocked/punts', 'only the Quarter filter narrows this grid (Snapper filter hides non-matching rows).'), render: (el, { heatRows }) => athleteHeat(el, R.unit, R.field, heatRows, { pred: (r) => r.blocked }) },
              { title: 'Blocked rate by Snap Location', render: (el, { rows }) => snapLocBars(el, R.unit, rows, { metric: blocked, color: '--cat-5', noun: 'snaps' }) },
              { title: 'Avg Punt Score by season', render: (el, { rows }) => scoreBars(el, R.unit, rows, 'snaps') },
            ],
            table: {
              title: 'Snapper detail', note: 'Punts/Blocked%/Tackle%/Net/Score are real and respect the filters above. Snap Time only reflects charted rows (2023 onward) — shows "—" for a snapper with none in view.',
              build: (rows) => athleteTable(R.unit, R.field, rows, 'Snapper', [
                { label: 'Punts', cell: (g) => g.length }, { label: 'Blocked%', cell: (g) => pct(blocked(g), 0) }, { label: 'Tackle%', cell: (g) => pct(rate(g, (r) => r.punter_tackle), 0) },
                { label: 'Net avg', cell: (g) => `${fmt(avgNet(g), 1)} yds` }, { label: 'Avg Score', cell: (g) => fmt(mean(g.map((r) => r.score)), 0) }, { label: 'Snap Time', cell: snapTime },
              ]),
            },
          };
        },
      },
    },
  ];
  ST.ROLES = ROLES;

  /* ------------------------------------------------------------- view builders == */

  const credit = (R, rows) => (R.credited ? rows.filter((r) => r[R.field]) : rows);

  function scorecardView(root, R) {
    const D = U(), S = R.scorecard;
    Site.view(root, {
      filters: { defs: [SEASON_LATEST, { field: S.filterField, label: S.filterLabel }], values: D.filters[R.unit] },
      source: `${R.label} scorecard`,
      prepare(st) { return { rows: applyFilters(D.units[R.unit], st) }; },
      summary: ({ rows }) => R.summary(rows.length),
      kpis: S.kpis.map((k) => ({ ...k, value: ({ rows }) => k.value(rows) })),
      cards: S.cards(R),
      footer: ({ rows }) => `${ST.source(R.unit, R.sheet, S.footFn ? S.footFn(rows) : S.footExtra)}`,
    });
  }

  function miniKpi(label, sub, value) {
    return `<div class="mini-kpi"><div class="l">${label}${sub ? ` <span class="mini-sub">${sub}</span>` : ''}</div><div class="v">${value}</div></div>`;
  }

  function h2hView(root, R) {
    const D = U(), H = R.h2h;
    const athletes = D.filters[R.unit][R.field];
    // Default A/B to the athletes with the most activity in the latest season (then overall),
    // so the first view isn't two names with nothing in the default season.
    const rowsAll = credit(R, D.units[R.unit]);
    const latest = D.filters[R.unit].season.slice().sort().at(-1);
    const activity = (a) => [rowsAll.filter((r) => r[R.field] === a && String(r.season) === latest).length, rowsAll.filter((r) => r[R.field] === a).length];
    const ranked = athletes.slice().sort((x, y) => { const [x1, x2] = activity(x), [y1, y2] = activity(y); return y1 - x1 || y2 - x2 || x.localeCompare(y); });
    const sel = (id, label, value) => ({ id, label, options: athletes.map((a) => ({ value: a, label: a })), value });
    const sideCard = (key, color) => ({
      raw: true,
      render(el, ctx) {
        const name = ctx[key];
        const g = ctx.rows.filter((r) => r[R.field] === name);
        el.classList.add('athlete-card');
        el.innerHTML = `
          <div class="h2h-head"><div class="avatar" style="background:var(${color});">${esc(initials(name || ''))}</div>
            <div class="h2h-sel"><b>${esc(name)}</b><div class="yrs">${g.length ? years(g) : `no ${R.h2hNoun || R.noun} in range`}</div></div></div>
          <div class="h2h-body">
            <div class="mini-kpi-row">${H.mini.map((m) => miniKpi(m.label, m.sub, m.value(g))).join('')}</div>
            <div class="card-head compact"><h2>${H.outcome.title}</h2></div><div class="h2h-chart"></div>
          </div>`;
        H.outcome.draw(el.querySelector('.h2h-chart'), g, key);
      },
    });
    const trendCard = (T) => ({
      title: T.title,
      render(el, ctx) {
        const seasons = D.filters[R.unit].season;
        const mine = (name) => (T.subset || ((r) => r))(ctx.rows.filter((r) => r[R.field] === name));
        const sA = seasonSeries(mine(ctx.a), seasons, T.metric), sB = seasonSeries(mine(ctx.b), seasons, T.metric);
        el.innerHTML = `<div class="legend"><span class="sw"><span class="dot" style="background:var(${A_COLOR})"></span>${esc(ctx.a)}</span><span class="sw"><span class="dot" style="background:var(${B_COLOR})"></span>${esc(ctx.b)}</span></div><div class="trend-slot"></div>`;
        renderGroupedBar(el.querySelector('.trend-slot'), { categories: seasons, valuesA: sA.values, valuesB: sB.values, colorA: cssVar(A_COLOR), colorB: cssVar(B_COLOR), nameA: ctx.a, nameB: ctx.b, labelFmt: T.labelFmt, countsA: sA.counts, countsB: sB.counts });
      },
    });
    const extra = H.extra === 'optime' ? [{
      title: 'Operation time build-up, snap → kick',
      note: `Only charted 2023 onward — bars use whichever of the selected ${R.word}s' rows actually have Snap to Catch/Catch to Kick logged, never padded with blanks for 2021–2022.`,
      render(el, ctx) {
        const pair = [ctx.a, ctx.b];
        const op = ctx.rows.filter((r) => pair.includes(r[R.field]));
        renderStacked(el, {
          categories: pair,
          series: { 'Snap → catch': pair.map((p) => mean(op.filter((r) => r[R.field] === p).map((r) => r.snap_to_catch)) || 0), 'Catch → kick': pair.map((p) => mean(op.filter((r) => r[R.field] === p).map((r) => r.catch_to_kick)) || 0) },
          order: ['Snap → catch', 'Catch → kick'], colors: { 'Snap → catch': cssVar('--cat-1'), 'Catch → kick': cssVar('--cat-4') },
        });
      },
    }] : H.extra === 'snaploc' ? [{
      title: 'Snap Location distribution',
      note: 'Charted 2023 onward only. Snap Location is a snap-quality ranking (scale may be 1-3 or 1-5) -- which end means "better" isn\'t confirmed yet, shown as-is.',
      render(el, ctx) {
        const rows = ctx.rows.filter((r) => (r[R.field] === ctx.a || r[R.field] === ctx.b) && r.snap_location);
        if (!rows.length) { el.innerHTML = `<div class="data-note">No charted Snap Location data for either ${R.word} in the current filter (2023 onward only).</div>`; return; }
        const locs = snapLocationScale(D.units[R.unit]);
        const count = (name, sl) => rows.filter((r) => r[R.field] === name && String(r.snap_location) === sl).length;
        renderStacked(el, { categories: locs, series: { [ctx.a]: locs.map((sl) => count(ctx.a, sl)), [ctx.b]: locs.map((sl) => count(ctx.b, sl)) }, order: [ctx.a, ctx.b], colors: { [ctx.a]: cssVar(A_COLOR), [ctx.b]: cssVar(B_COLOR) } });
      },
    }] : [];

    Site.view(root, {
      filters: { defs: [SEASON_LATEST], values: D.filters[R.unit] },
      selects: [sel('a', `${R.word[0].toUpperCase()}${R.word.slice(1)} A`, ranked[0]), sel('b', `${R.word[0].toUpperCase()}${R.word.slice(1)} B`, ranked[1] || ranked[0])],
      source: `${R.label} head-to-head`,
      prepare(st) { return { rows: credit(R, applyFilters(D.units[R.unit], st)), a: st.a, b: st.b }; },
      summary: ({ rows }) => (R.credited ? R.creditedSummary : R.summary)(rows.length),
      cards: [sideCard('a', A_COLOR), sideCard('b', B_COLOR), ...H.trends.map(trendCard), ...extra],
      footer: () => {
        if (!R.credited) return ST.source(R.unit, R.sheet);
        const n = new Set(D.units[R.unit].map((r) => r[R.field]).filter(Boolean)).size;
        return `${ST.source(R.unit, R.sheet)} ${n} ${R.word}${n === 1 ? ' is' : 's are'} credited so far -- pick any two; the comparison works the same as more ${R.unit === 'punt' ? 'punts' : 'attempts'} get a ${R.word} charted.`;
      },
    });
  }

  function deepView(root, R) {
    const D = U(), Dp = R.deep;
    const built = Dp.build(R, D);
    Site.view(root, {
      filters: { defs: Dp.filters, values: D.filters[R.unit] },
      source: `${R.label} deep dive`,
      prepare(st) {
        const rows = credit(R, applyFilters(D.units[R.unit], st));
        return { rows, ...built.prepare(rows, st) };
      },
      summary: ({ rows }) => (R.credited ? R.creditedSummary : R.summary)(rows.length),
      kpis: Dp.kpis,
      cards: [
        ...built.cards,
        {
          title: built.table.title, wide: true, note: built.table.note,
          render(el, ctx) {
            const t = built.table.build(ctx.rows);
            el.innerHTML = Site.tableHTML({ head: t.head, rows: t.rows, empty: `No ${R.word}s in current filter.` });
          },
        },
      ],
      footer: () => ST.source(R.unit, R.sheet, R.credited ? `${U().units[R.unit].filter((r) => r[R.field]).length} have a credited ${R.word}.` : ''),
    });
  }

  /* ----------------------------------------------------------------- the tab == */

  const VIEWS = [{ id: 'scorecard', label: 'Scorecard' }, { id: 'head-to-head', label: 'Head-to-Head' }, { id: 'deep-dive', label: 'Deep Dive' }];

  ST.athletesTab = function (root, { sub }) {
    const [roleId, viewId] = (sub || '').split('/');
    const state = { role: ROLES.some((r) => r.id === roleId) ? roleId : ROLES[0].id, view: VIEWS.some((v) => v.id === viewId) ? viewId : 'scorecard' };
    root.innerHTML = '<div class="subbar"><span id="at-role"></span><span id="at-view"></span></div><div id="at-body"></div>';
    function show() {
      Site.setSub(`${state.role}/${state.view}`);
      const R = ROLES.find((r) => r.id === state.role);
      const body = root.querySelector('#at-body');
      ({ scorecard: scorecardView, 'head-to-head': h2hView, 'deep-dive': deepView })[state.view](body, R);
    }
    Site.pills(root.querySelector('#at-role'), { options: ROLES, value: state.role, label: 'Role', onChange: (id) => { state.role = id; show(); } });
    Site.pills(root.querySelector('#at-view'), { options: VIEWS, value: state.view, label: 'View', size: 'xs', onChange: (id) => { state.view = id; show(); } });
    show();
  };
})();
