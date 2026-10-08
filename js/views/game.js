/* Offense and Defense dashboards (js/views/game.js).

   Both pages are the same five tabs over the same data -- Scorecard (official
   play-by-play), Tendencies and Outcomes (hand-charted plays), and Position Groups
   (one coach-view at a time) -- plus Tells (js/views/tells.js) -- so one parametrized builder produces both. Only the
   labels, color semantics, and the position-group content differ per side.

   No player-level attribution exists in this data (plays are charted at the play
   level, not per-player), so the position-group views are schematic/situational
   views built from the same charted fields, organized around what each position
   group's coach cares about -- not player stat lines.

   Data: data/game-data.json (build_game_data.py): { games, offense: {plays, official,
   drives}, defense: {...}, filters: {offense, defense} }. `official` is Game
   Analysis's OfficialPlayByPlay sheet (every snap, incl. efficiency/drive fields);
   `plays` is the hand-charted Plays sheet (formation/personnel/front/blitz/...). */
(function () {
  const esc = Site.esc;
  const G = () => Site.data.game;

  /* ------------------------------------------------------------- shared bits -- */

  const succ = (r) => isSuccess(r.play_efficiency);
  const expl = (r) => r.play_efficiency === 'Explosive';
  const isSackPlay = (r) => !!r.play_outcome && r.play_outcome.includes('Sack');
  // '-' is the source sheet's own "charted, but nothing called" placeholder -- never a real call.
  const realCall = (field) => (r) => r[field] && r[field] !== '-';
  const withEfficiency = (rows) => rows.filter((r) => r.play_efficiency !== null);
  const RUN_PASS_COLORS = () => ({ Run: cssVar('--cat-1'), Pass: cssVar('--cat-4') });
  // Charted play hash is only ever L/M/R (HASH_ORDER in js/lib/data.js is the 5-value kick-location order).
  const PLAY_HASH_ORDER = ['L', 'M', 'R'];

  // Filter sets: Scorecard and the official-play-by-play position views share one;
  // everything hand-charted shares the other.
  const OFFICIAL_FILTERS = [
    { field: 'season', label: 'Season', defaultLatestOnly: true },
    { field: 'opponent', label: 'Opponent' },
    { field: 'quarter', label: 'Quarter' },
    { field: 'situation', label: 'Situation' },
    { field: 'field_zone', label: 'Field Zone' },
    { field: 'direction', label: 'Direction' },
  ];
  const CHARTED_FILTERS = [
    { field: 'season', label: 'Season', defaultLatestOnly: true },
    { field: 'opponent', label: 'Opponent' },
    { field: 'situation', label: 'Situation' },
    { field: 'field_zone', label: 'Field Zone' },
    { field: 'down', label: 'Down' },
    { field: 'hash', label: 'Hash' },
    { field: 'play_type', label: 'Play Type' },
  ];

  const coverage = () => gameCoverageText(G().games);
  const FOOT_CHARTED = "Source: Game Analysis's Plays sheet, combined_play_data.xlsx.";
  const FOOT_OFFICIAL = () => `Source: Game Analysis's OfficialPlayByPlay sheet, combined_play_data.xlsx (${coverage()}).`;

  // Football shorthand for the drive-result axis (the tooltip keeps the full name).
  const DRIVE_SHORT = { Touchdown: 'TD', 'Field Goal Good': 'FG good', 'Field Goal No Good': 'FG missed', 'Turnover on Downs': 'On downs' };
  const pointsOf = (d) => (d.result === 'Touchdown' ? 6 : d.result === 'Field Goal Good' ? 3 : 0);
  const share = (n, d) => pct(d ? n / d : null, 0);


  /** Seasons in which `field` is genuinely charted (at least 10% of that season's rows on
   * a sheet carrying it have a real value -- a stray handful of cells doesn't count), so an
   * empty chart can say *why* (e.g. opponent front/coverage were charted 2021-2024 only)
   * instead of showing blank axes. Computed from the data, so it stays true as charting
   * practice changes. */
  const seasonsCache = new Map();
  function chartedSeasons(field) {
    if (seasonsCache.has(field)) return seasonsCache.get(field);
    const D = G();
    const seasons = new Set();
    [D.offense.plays, D.defense.plays, D.offense.official, D.defense.official].forEach((rows) => {
      const total = new Map(), filled = new Map();
      rows.forEach((r) => {
        const s = String(r.season);
        total.set(s, (total.get(s) || 0) + 1);
        if (r[field] !== null && r[field] !== undefined && r[field] !== '' && r[field] !== '-') filled.set(s, (filled.get(s) || 0) + 1);
      });
      filled.forEach((n, s) => { if (n / total.get(s) >= 0.1) seasons.add(s); });
    });
    const list = [...seasons].sort();
    seasonsCache.set(field, list);
    return list;
  }
  // "2021–2024" / "2025" / null when never charted.
  function chartedSpan(field) {
    const seasons = chartedSeasons(field);
    if (!seasons.length) return null;
    return seasons.length > 1 ? `${seasons[0]}–${seasons[seasons.length - 1]}` : seasons[0];
  }
  function emptyNote(field) {
    const span = chartedSpan(field);
    if (!span) return '<div class="data-note">This field is not charted in any season.</div>';
    const multi = span.includes('–');
    return `<div class="data-note">Nothing charted for this in the current filter. It was charted ${multi ? 'for' : 'only for'} ${span} — add ${multi ? 'those seasons' : 'that season'} in Filters to see it.</div>`;
  }

  /* Card factories. Each returns a card spec for Site.view; `get` picks the row set
     out of the view's ctx (default ctx.rows). */

  /** Top-N counts of a categorical field, colored by rank order. tip: 'share' (default,
   * "12% of snaps"), 'count' ("34 plays"), or 'avg' (a permanent "avg N yds" caption). */
  function countCard(title, field, { get = (c) => c.rows, n = 10, denom, noun = 'snaps', color, has, tip = 'share', wide } = {}) {
    return {
      title, wide,
      render(el, ctx) {
        const rows = get(ctx);
        const total = denom ? denom(ctx) : ctx.rows.length;
        const by = groupBy(rows.filter(has || ((r) => r[field])), field);
        const cats = topKeysByCount(by, n);
        if (!cats.length) { el.innerHTML = emptyNote(field); return; }
        renderBar(el, {
          categories: cats, values: cats.map((c) => by.get(c).length), labelFmt: (v) => String(v),
          colorFn: color ? () => cssVar(color) : (name, v, i) => catColor(i),
          tooltipExtra: tip === 'share' ? (c) => `${share(by.get(c).length, total)} of ${noun}` : tip === 'count' ? (c) => `${by.get(c).length} ${noun}` : undefined,
          xlab2: tip === 'avg' ? (c) => `avg ${fmt(mean(by.get(c).map((r) => r.yards)), 1)} yds` : undefined,
        });
      },
    };
  }

  /** Top-N (or fixed-order) categories with a success rate (or any predicate rate). */
  function rateCard(title, field, { get = (c) => c.rows, n = 10, order, pred = succ, color, noun = 'run snaps', wide, has } = {}) {
    return {
      title, wide,
      render(el, ctx) {
        const rows = get(ctx);
        const by = groupBy(rows.filter(has || ((r) => r[field])), field);
        const cats = order ? order.filter((o) => by.has(o)) : topKeysByCount(by, n);
        if (!cats.length) { el.innerHTML = emptyNote(field); return; }
        renderBar(el, {
          categories: cats, values: cats.map((c) => rate(by.get(c), pred)), labelFmt: (v) => pct(v, 0),
          colorFn: () => cssVar(color), tooltipExtra: (c) => `${by.get(c).length} ${noun}`, counts: cats.map((c) => by.get(c).length),
        });
      },
    };
  }

  /** Run/Pass stacked mix by a fixed-order field (down, situation). */
  function mixCard(title, field, order, get = (c) => c.runPass) {
    return {
      title,
      render(el, ctx) {
        const rows = get(ctx);
        const by = groupBy(rows.filter((r) => r[field]), field);
        const cats = order.filter((o) => by.has(o));
        renderStacked(el, {
          categories: field === 'down' ? cats.map(ordinalDown) : cats,
          series: { Run: cats.map((c) => by.get(c).filter((r) => r.play_type === 'Run').length), Pass: cats.map((c) => by.get(c).filter((r) => r.play_type === 'Pass').length) },
          order: ['Run', 'Pass'], colors: RUN_PASS_COLORS(),
        });
      },
    };
  }

  /** Detail table over a categorical field's top-N values. `cols` = [{label, cell(rowsOfGroup)}];
   * `first` is the label of the leading (category) column. */
  function detailTable(title, field, first, cols, { get = (c) => c.rows, n = 15, empty, note, has } = {}) {
    return {
      title, wide: true, note,
      table: {
        head: [first, ...cols.map((c) => c.label)],
        rows(ctx) {
          const by = groupBy(get(ctx).filter(has || ((r) => r[field])), field);
          return topKeysByCount(by, n).map((k) => [esc(k), ...cols.map((c) => c.cell(by.get(k)))]);
        },
        empty: () => { const span = chartedSpan(field); return `${empty || 'Nothing in the current filter.'} ${span ? `(Charted ${span.includes('–') ? span : `only ${span}`}.)` : '(Not charted in any season.)'}`; },
      },
    };
  }

  const avgYds = (g) => fmt(mean(g.map((r) => r.yards)), 1);
  const succPct = (g) => pct(rate(g.filter((r) => r.play_efficiency !== null), succ), 0);
  const explPct = (g) => pct(rate(g.filter((r) => r.play_efficiency !== null), expl), 0);

  /* ----------------------------------------------------------- per-side labels -- */

  const SIDES = {
    offense: {
      title: 'Offense',
      lead: "How Carroll's offense is performing and what it's calling: efficiency on official play-by-play, play-calling and outcomes from the hand-charted plays, and a view for each offensive position group.",
      ypp: 'Yards / Play', succ: 'Success Rate', exp: 'Explosive Rate', turn: 'Turnover Rate', turnNoun: 'giveaways', rz: 'Red Zone TD %', ppd: 'Points / Drive',
      dots: { ypp: '--good', succ: '--good', turn: '--critical' },
      down: 'Yards / Play by Down', sit: 'Success Rate by Situation', zone: 'Explosive Rate by Field Zone', drives: 'Drive Result Mix',
      heat: 'Success Rate — Down × Distance', heatNote: 'Sequential blue = success rate; text = successful/plays; faded cells have fewer than 5 snaps.', trend: 'Yards / Play by Game',
      colors: { down: '--cat-1', sit: '--cat-3', zone: '--cat-2' },
      logHead: ['Opponent', 'Date', 'Plays', 'Yds/Play', 'Success %', 'Explosive %', 'Turnovers', 'Points/Drive'],
      logNote: "Yds/Play, Success %, Explosive %, and Turnovers respect every filter above. Points/Drive uses this game's full drive log regardless of the Quarter/Situation/Field Zone filters (drives aren't scoped to a single quarter or situation).",
      footExtra: '',
      outcomeAvg: 'Avg Yards', outcomeTurn: 'Turnover Rate', outcomeTurnGlossary: 'Turnover Rate', outcomeTurnNoun: 'turnovers', outcomeTurnDot: '--critical', outcomeYppDot: '--good', outcomeMix: 'Outcome Mix by Play Type',
    },
    defense: {
      title: 'Defense',
      lead: "How Carroll's defense is performing and what it's calling: efficiency allowed on official play-by-play, defensive calls and outcomes from the hand-charted plays, and a view for each defensive position group.",
      ypp: 'Yards Allowed / Play', succ: 'Success % Allowed', exp: 'Explosive Rate Allowed', turn: 'Takeaway Rate', turnNoun: 'takeaways', rz: 'Red Zone TD % Allowed', ppd: 'Points Allowed / Drive',
      dots: { ypp: '--critical', succ: '--critical', turn: '--good' },
      down: 'Yards Allowed / Play by Down', sit: 'Success Rate Allowed by Situation', zone: 'Explosive Rate Allowed by Field Zone', drives: 'Opponent Drive Result Mix',
      heat: 'Success Rate Allowed — Down × Distance', heatNote: 'Sequential blue = success rate allowed; text = successful/plays; faded cells have fewer than 5 snaps.', trend: 'Yards Allowed / Play by Game',
      colors: { down: '--critical', sit: '--serious', zone: '--cat-8' },
      logHead: ['Opponent', 'Date', 'Plays', 'Yds/Play Allowed', 'Success % Allowed', 'Explosive % Allowed', 'Takeaways', 'Points/Drive Allowed'],
      logNote: "Yds/Play, Success %, Explosive %, and Takeaways respect every filter above. Points/Drive Allowed uses this game's full drive log regardless of the Quarter/Situation/Field Zone filters (drives aren't scoped to a single quarter or situation).",
      footExtra: ", opponent's-possession rows",
      outcomeAvg: 'Avg Yards Allowed', outcomeTurn: 'Takeaway Rate', outcomeTurnGlossary: 'Takeaway Rate', outcomeTurnNoun: 'takeaways', outcomeTurnDot: '--good', outcomeYppDot: '--critical', outcomeMix: 'Outcome Mix by Play Type Faced',
    },
  };

  /* ---------------------------------------------------------------- scorecard -- */

  function scorecardTab(side) {
    const S = SIDES[side];
    return (root) => {
      const D = G();
      Site.view(root, {
        filters: { defs: OFFICIAL_FILTERS, values: D.filters[side] },
        source: 'Official play-by-play',
        prepare(st) {
          const rows = applyFilters(D[side].official, st);
          const drives = applyFilters(D[side].drives, { season: st.season, opponent: st.opponent });
          return { rows, drives, withEff: withEfficiency(rows) };
        },
        summary: ({ rows }) => `${rows.length} plays in view`,
        kpis: [
          { label: S.ypp, dot: S.dots.ypp, value: ({ rows }) => [fmt(mean(rows.map((r) => r.yards)), 1), `${rows.length} plays`] },
          { label: S.succ, dot: S.dots.succ, glossary: 'Success Rate', value: ({ withEff }) => [pct(rate(withEff, succ)), `${withEff.length} classified`] },
          { label: S.exp, glossary: 'Explosive Play', value: ({ withEff }) => [pct(rate(withEff, expl))] },
          { label: S.turn, dot: S.dots.turn, glossary: S.turn, value: ({ rows }) => [pct(rate(rows, (r) => r.is_turnover)), `${rows.filter((r) => r.is_turnover).length} ${S.turnNoun}`] },
          {
            label: S.rz, glossary: 'Red Zone',
            value: ({ rows }) => {
              const keys = new Set(rows.filter((r) => r.field_zone === 'Red Zone').map((r) => `${r.game_label}|${r.drive_num}`));
              const results = [...keys].map((k) => rows.find((r) => `${r.game_label}|${r.drive_num}` === k).drive_result);
              return [results.length ? pct(results.filter((r) => r === 'Touchdown').length / results.length) : '—', `${results.length} red zone drives`];
            },
          },
          { label: S.ppd, glossary: 'Points / Drive (approx.)', value: ({ drives }) => [fmt(drives.length ? mean(drives.map(pointsOf)) : null, 2), `${drives.length} drives (season/opponent filters only)`] },
        ],
        cards: [
          {
            title: S.down,
            render(el, { rows }) {
              const downs = DOWNS.filter((d) => rows.some((r) => r.down === d));
              const by = groupBy(rows, 'down');
              renderBar(el, { categories: downs.map(ordinalDown), values: downs.map((d) => mean(by.get(d).map((r) => r.yards))), labelFmt: (v) => fmt(v, 1), colorFn: () => cssVar(S.colors.down), tooltipExtra: (d, i) => `${by.get(downs[i]).length} plays`, counts: downs.map((d) => by.get(d).length) });
            },
          },
          {
            title: S.sit,
            render(el, { withEff }) {
              const by = groupBy(withEff, 'situation');
              const cats = SITUATIONS.filter((s) => by.has(s));
              renderBar(el, { categories: cats, values: cats.map((s) => rate(by.get(s), succ)), labelFmt: (v) => pct(v, 0), colorFn: () => cssVar(S.colors.sit), tooltipExtra: (s) => `${by.get(s).length} plays`, counts: cats.map((s) => by.get(s).length) });
            },
          },
          {
            title: S.zone,
            render(el, { withEff }) {
              const by = groupBy(withEff, 'field_zone');
              const cats = FIELD_ZONES.filter((z) => by.has(z));
              renderBar(el, { categories: cats, values: cats.map((z) => rate(by.get(z), expl)), labelFmt: (v) => pct(v, 0), colorFn: () => cssVar(S.colors.zone), tooltipExtra: (z) => `${by.get(z).length} plays`, counts: cats.map((z) => by.get(z).length) });
            },
          },
          {
            title: S.drives,
            render(el, { rows }) {
              // drive_result repeats on every play row of a drive -- collapse to one row per real drive.
              const driveRows = uniqueByKey(rows.filter((r) => r.drive_result), (r) => `${r.game_label}|${r.drive_num}`);
              const by = groupBy(driveRows, 'drive_result');
              const cats = topKeysByCount(by, 8);
              const colors = categoricalColorMap(cats);
              renderBar(el, { categories: cats, values: cats.map((c) => by.get(c).length), labelFmt: (v) => String(v), colorFn: (name) => colors[name], axisLabel: (c) => DRIVE_SHORT[c] || c, tooltipExtra: (c) => `${share(by.get(c).length, driveRows.length)} of drives` });
            },
          },
          {
            title: S.heat, note: `${S.heatNote} Standard down/distance efficiency grid, Rush/Pass/Sack/Kneel snaps only.`,
            render(el, { withEff }) {
              const downs = DOWNS.filter((d) => withEff.some((r) => r.down === d));
              const by = groupBy(withEff.map((r) => ({ ...r, _db: distanceBucket(r.distance) })).filter((r) => r._db), '_db');
              renderHeatmap(el, {
                rowLabels: downs, colLabels: DIST_BUCKETS,
                cellFor: (down, bucket) => {
                  const g = (by.get(bucket) || []).filter((r) => r.down === down);
                  return g.length ? { pct: rate(g, succ), n: g.length, made: g.filter(succ).length } : null;
                },
                title: (down, bucket) => `Down ${down}, ${bucket} yds to go`,
              });
            },
          },
          { raw: true, render: (el, { rows }) => renderTrendCard(el, rows, 'yards', ' yds', S.trend) },
          {
            title: 'Game log', wide: true, note: S.logNote,
            table: {
              head: S.logHead,
              empty: 'No games in current filter.',
              rows({ rows, drives }) {
                const byGame = groupBy(rows, 'game_label');
                const drivesByGame = groupBy(drives, 'game_label');
                return D.games.filter((g) => byGame.has(g.game_label)).map((g) => {
                  const gRows = byGame.get(g.game_label);
                  const gEff = withEfficiency(gRows);
                  const gDrives = drivesByGame.get(g.game_label) || [];
                  return [esc(g.opponent), g.date, gRows.length, fmt(mean(gRows.map((r) => r.yards)), 1), pct(rate(gEff, succ), 0), pct(rate(gEff, expl), 0), gRows.filter((r) => r.is_turnover).length, fmt(gDrives.length ? mean(gDrives.map(pointsOf)) : null, 2)];
                });
              },
            },
          },
        ],
        footer: () => `${FOOT_OFFICIAL().slice(0, -1)}${S.footExtra}.`,
      });
    };
  }

  /* --------------------------------------------------------------- tendencies -- */

  const runPassOf = (rows) => rows.filter((r) => r.play_type === 'Run' || r.play_type === 'Pass');

  function offenseTendencies(root) {
    const D = G();
    Site.view(root, {
      filters: { defs: CHARTED_FILTERS, values: D.filters.offense },
      source: 'Hand-charted plays',
      prepare(st) { const rows = applyFilters(D.offense.plays, st); return { rows, runPass: runPassOf(rows) }; },
      summary: ({ rows }) => `${rows.length} snaps in view`,
      kpis: [
        { label: 'Run Rate', value: ({ runPass }) => [pct(rate(runPass, (r) => r.play_type === 'Run')), `${runPass.length} run/pass snaps`] },
        { label: 'Pass Rate', value: ({ runPass }) => [pct(rate(runPass, (r) => r.play_type === 'Pass'))] },
        { label: 'Yards / Play (Run+Pass)', dot: '--good', value: ({ runPass }) => [fmt(mean(runPass.map((r) => r.yards)), 1)] },
        {
          label: 'Most-Used Formation',
          value: ({ rows }) => {
            const by = groupBy(rows.filter((r) => r.formation), 'formation');
            const top = topKeysByCount(by, 1)[0];
            return [top || '—', top ? `${by.get(top).length} snaps` : ''];
          },
        },
      ],
      cards: [
        mixCard('Run/Pass Mix by Down', 'down', DOWNS),
        mixCard('Run/Pass Mix by Situation', 'situation', SITUATIONS),
        countCard('Formation Usage', 'formation', { color: '--cat-1', tip: 'avg' }),
        countCard('Personnel Usage', 'personnel', { color: '--cat-3', tip: 'avg', has: (r) => r.personnel !== null && r.personnel !== undefined }),
        countCard('Opponent Defensive Front Shown', 'def_front', { color: '--cat-2', noun: 'plays', tip: 'count' }),
        countCard('Opponent Coverage Shown', 'coverage', { color: '--cat-5', noun: 'plays', tip: 'count' }),
        detailTable('Play call detail (top 15 by volume)', 'play_call', 'Play Call', [
          { label: 'N', cell: (g) => g.length }, { label: 'Avg Yards', cell: avgYds }, { label: 'Success %', cell: succPct }, { label: 'Explosive %', cell: explPct },
        ], { empty: 'No play calls in current filter.', note: 'Only ~35% of snaps have a specific Play Call charted (on top of the Run/Pass bucket) — this table only ever counts rows that actually have one, respecting every filter above.' }),
      ],
      footer: `${FOOT_CHARTED} Formation/personnel/play-call/front/coverage names shown exactly as charted, including occasional typos — not normalized.`,
    });
  }

  function defenseTendencies(root) {
    const D = G();
    Site.view(root, {
      filters: { defs: CHARTED_FILTERS, values: D.filters.defense },
      source: 'Hand-charted plays',
      prepare(st) { const rows = applyFilters(D.defense.plays, st); return { rows, runPass: runPassOf(rows) }; },
      summary: ({ rows }) => `${rows.length} snaps in view`,
      kpis: [
        { label: 'Run Rate Faced', value: ({ runPass }) => [pct(rate(runPass, (r) => r.play_type === 'Run')), `${runPass.length} run/pass snaps`] },
        { label: 'Pass Rate Faced', value: ({ runPass }) => [pct(rate(runPass, (r) => r.play_type === 'Pass'))] },
        { label: 'Yards / Play Allowed', dot: '--critical', value: ({ runPass }) => [fmt(mean(runPass.map((r) => r.yards)), 1)] },
        {
          label: 'Blitz Rate',
          value: ({ rows }) => {
            const charted = rows.filter((r) => r.blitz_d !== null && r.blitz_d !== undefined);
            return [charted.length ? pct(rate(charted, (r) => r.blitz_d !== '-')) : '—', `${charted.length} charted`];
          },
        },
      ],
      cards: [
        mixCard('Run/Pass Mix Faced by Down', 'down', DOWNS),
        mixCard('Run/Pass Mix Faced by Situation', 'situation', SITUATIONS),
        countCard("Carroll's Defensive Front Called", 'front_d', { color: '--cat-2', tip: 'avg' }),
        countCard("Carroll's Blitz Called", 'blitz_d', { color: '--cat-7', tip: 'avg', has: realCall('blitz_d') }),
        detailTable('Defensive front detail (top 15 by volume)', 'front_d', 'Front', [
          { label: 'N', cell: (g) => g.length }, { label: 'Avg Yards Allowed', cell: avgYds }, { label: 'Success % Allowed', cell: succPct }, { label: 'Explosive % Allowed', cell: explPct },
        ], { empty: 'No fronts in current filter.', note: 'Front (D) is only charted on some defensive snaps — this table only ever counts rows that actually have one, respecting every filter above.' }),
      ],
      footer: `${FOOT_CHARTED} Front/blitz-call names shown exactly as charted, including occasional typos — not normalized.`,
    });
  }

  /* ----------------------------------------------------------------- outcomes -- */

  // play_outcome is real but messy -- some rows are compound strings like "Rush, TD" or
  // "Complete, Fumble" (several things happened on one play) -- shown exactly as charted.
  function outcomesTab(side) {
    const S = SIDES[side];
    return (root) => {
      const D = G();
      Site.view(root, {
        filters: { defs: CHARTED_FILTERS, values: D.filters[side] },
        source: 'Hand-charted plays',
        prepare(st) {
          const rows = applyFilters(D[side].plays, st);
          const by = groupBy(rows.filter((r) => r.play_outcome), 'play_outcome');
          return { rows, by, cats: topKeysByCount(by, 10) };
        },
        summary: ({ rows }) => `${rows.length} snaps in view`,
        kpis: [
          { label: 'Plays in View', value: ({ rows }) => [String(rows.length)] },
          { label: 'Most Common Outcome', value: ({ by, cats }) => [cats[0] || '—', cats[0] ? `${by.get(cats[0]).length} plays` : ''] },
          { label: S.outcomeTurn, dot: S.outcomeTurnDot, glossary: S.outcomeTurnGlossary, value: ({ rows }) => [pct(rate(rows, (r) => !!r.turnover_type)), `${rows.filter((r) => r.turnover_type).length} ${S.outcomeTurnNoun}`] },
          { label: S.outcomeAvg, dot: S.outcomeYppDot, value: ({ rows }) => [fmt(mean(rows.map((r) => r.yards)), 1)] },
        ],
        cards: [
          {
            title: 'Outcome Breakdown (top 10 by volume)', wide: true,
            render(el, { rows, by, cats }) {
              renderBar(el, { categories: cats, values: cats.map((c) => by.get(c).length), labelFmt: (v) => String(v), colorFn: (name, v, i) => catColor(i), tooltipExtra: (c) => `${share(by.get(c).length, rows.length)} of plays` });
            },
          },
          {
            title: S.outcomeMix, wide: true,
            render(el, { by, cats }) {
              renderStacked(el, {
                categories: cats,
                series: { Run: cats.map((c) => by.get(c).filter((r) => r.play_type === 'Run').length), Pass: cats.map((c) => by.get(c).filter((r) => r.play_type === 'Pass').length) },
                order: ['Run', 'Pass'], colors: RUN_PASS_COLORS(),
              });
            },
          },
          {
            title: 'Outcome detail', wide: true,
            table: {
              head: ['Outcome', 'N', '% of Plays', S.outcomeAvg],
              empty: 'No outcomes in current filter.',
              rows: ({ rows, by, cats }) => cats.map((c) => [esc(c), by.get(c).length, share(by.get(c).length, rows.length), fmt(mean(by.get(c).map((r) => r.yards)), 1)]),
            },
          },
        ],
        footer: `${FOOT_CHARTED} Outcome shown exactly as charted, including compound values (e.g. "Rush, TD") — not normalized or split into separate rows.`,
      });
    };
  }

  // The card factories and filter sets the Position Groups tab (js/views/position-groups.js) builds its views from.
  window.GameKit = { CHARTED_FILTERS, FOOT_CHARTED, G, OFFICIAL_FILTERS, PLAY_HASH_ORDER, avgYds, countCard, coverage, detailTable, esc, expl, isSackPlay, rateCard, realCall, succ, withEfficiency };

  /* -------------------------------------------------------------------- mount -- */

  function mountSide(side) {
    const S = SIDES[side];
    Site.mount({
      nav: side,
      title: S.title,
      lead: S.lead,
      data: { game: '../data/game-data.json' },
      tabs: [
        { id: 'scorecard', label: 'Scorecard', render: scorecardTab(side) },
        { id: 'tendencies', label: 'Tendencies', render: side === 'offense' ? offenseTendencies : defenseTendencies },
        { id: 'outcomes', label: 'Outcomes', render: outcomesTab(side) },
        { id: 'tells', label: 'Tells', render: Tells.tab(side) },
        { id: 'fourth', label: 'Fourth Down', render: FourthDown.tab(side) },
        { id: 'positions', label: 'Position Groups', render: PositionGroups.tab(side) },
      ],
    });
  }

  mountSide(document.body.dataset.side);
})();
