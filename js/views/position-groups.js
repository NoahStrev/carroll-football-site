/* Position Groups: the last tab on Offense and Defense -- one coach-view at a time (QB / RB / WR / OL, DL / LB / CB / S).

   Each group is a Site.view spec built from the same card factories as the other tabs (countCard, rateCard,
   detailTable, ... in js/views/game.js), so it reads them from GameKit, which game.js publishes before it mounts the
   page. The groups are defined on first use (not at load) because the factories do not exist until game.js has run.
   Loaded before game.js. */
const PositionGroups = (function () {
  let built = null;

  function define() {
    const { CHARTED_FILTERS, FOOT_CHARTED, G, OFFICIAL_FILTERS, PLAY_HASH_ORDER, avgYds, countCard, coverage, detailTable, esc, expl, isSackPlay, rateCard, realCall, succ, withEfficiency } = GameKit;

    /* ----------------------------------------------------------- position groups -- */

    // Each entry is a Site.view spec builder. `data` picks which sheet/filters it uses.
    const charted = (side) => ({ filters: CHARTED_FILTERS, source: 'Hand-charted plays', rows: (st) => applyFilters(G()[side].plays, st) });
    const official = (side) => ({ filters: OFFICIAL_FILTERS, source: 'Official play-by-play', rows: (st) => applyFilters(G()[side].official, st) });

    function positionView(side, def) {
      return (root) => {
        const D = G();
        const src = def.data(side);
        Site.view(root, {
          filters: { defs: src.filters, values: D.filters[side] },
          source: src.source,
          prepare(st) { const rows = src.rows(st); return { rows, ...def.prepare(rows) }; },
          summary: (ctx) => def.summary(ctx),
          kpis: def.kpis,
          cards: def.cards,
          footer: def.footer,
        });
      };
    }

    const OFFENSE_GROUPS = [
      {
        id: 'qb', label: 'Quarterbacks', data: charted,
        prepare: (rows) => ({ passRows: rows.filter((r) => r.play_type === 'Pass'), sackRows: rows.filter((r) => r.play_type === 'Pass' && isSackPlay(r)) }),
        summary: ({ passRows }) => `${passRows.length} pass snaps in view`,
        kpis: [
          { label: 'Pass Snaps', value: ({ passRows }) => [String(passRows.length)] },
          { label: 'Pass Efficiency', dot: '--good', glossary: 'Success Rate', value: ({ passRows }) => [pct(rate(passRows, succ))] },
          { label: 'Sack Rate', dot: '--critical', value: ({ passRows, sackRows }) => [pct(passRows.length ? sackRows.length / passRows.length : null), `${sackRows.length} sacks`] },
          {
            label: 'Most Common Protection',
            value: ({ rows }) => {
              const by = groupBy(rows.filter((r) => r.protection), 'protection');
              const top = topKeysByCount(by, 1)[0];
              return [top || '—', top ? `${by.get(top).length} snaps` : ''];
            },
          },
        ],
        cards: [
          countCard('Coverage Faced (top 10 by volume)', 'coverage', { get: (c) => c.passRows, denom: (c) => c.passRows.length, noun: 'pass snaps' }),
          rateCard('Pass Efficiency by Coverage Faced', 'coverage', { get: (c) => c.passRows, color: '--cat-3', noun: 'pass snaps' }),
          countCard('Protection Called (top 10 by volume)', 'protection', { wide: true }),
          detailTable('Coverage detail', 'coverage', 'Coverage', [
            { label: 'N', cell: (g) => g.length }, { label: 'Pass Eff %', cell: (g) => pct(rate(g, succ), 0) }, { label: 'Explosive %', cell: (g) => pct(rate(g, expl), 0) }, { label: 'Avg Yards', cell: avgYds },
          ], { get: (c) => c.passRows, n: 10, empty: 'No coverage data in current filter.' }),
        ],
        footer: `${FOOT_CHARTED} Coverage/protection names are the opponent's defense (coverage) and Carroll's own offensive call (protection), shown exactly as charted. Sack→Pass is the standard stat-keeping convention, so sacks count as pass snaps here.`,
      },
      {
        id: 'rb', label: 'Running Backs', data: charted,
        prepare: (rows) => ({ runRows: rows.filter((r) => r.play_type === 'Run') }),
        summary: ({ runRows }) => `${runRows.length} run snaps in view`,
        kpis: [
          { label: 'Run Snaps', value: ({ runRows }) => [String(runRows.length)] },
          { label: 'Run Efficiency', dot: '--good', glossary: 'Success Rate', value: ({ runRows }) => [pct(rate(runRows, succ))] },
          { label: 'Explosive Run Rate', dot: '--good', glossary: 'Explosive Play', value: ({ runRows }) => [pct(rate(runRows, expl))] },
          {
            label: 'Most-Used Backfield',
            value: ({ rows }) => {
              const by = groupBy(rows.filter((r) => r.backfield), 'backfield');
              const top = topKeysByCount(by, 1)[0];
              return [top || '—', top ? `${by.get(top).length} snaps` : ''];
            },
          },
        ],
        cards: [
          rateCard('Run Efficiency by Front Faced', 'def_front', { get: (c) => c.runRows, color: '--good' }),
          countCard('Backfield Alignment (top 10 by volume)', 'backfield', { wide: true }),
          rateCard('Run Efficiency by Formation', 'formation', { get: (c) => c.runRows, color: '--cat-1', wide: true }),
          detailTable('Front-faced detail — run snaps only', 'def_front', 'Front Faced', [
            { label: 'N', cell: (g) => g.length }, { label: 'Run Eff %', cell: (g) => pct(rate(g, succ), 0) }, { label: 'Explosive %', cell: (g) => pct(rate(g, expl), 0) }, { label: 'Avg Yards', cell: avgYds },
          ], { get: (c) => c.runRows, n: 10, empty: 'No run snaps in current filter.' }),
        ],
        footer: `${FOOT_CHARTED} Front Faced is the opponent's defensive front shown against Carroll's offense; Backfield/Formation are Carroll's own call, shown exactly as charted.`,
      },
      {
        id: 'wr', label: 'Receivers', data: charted,
        prepare: (rows) => ({ passRows: rows.filter((r) => r.play_type === 'Pass') }),
        summary: ({ passRows }) => `${passRows.length} pass snaps in view`,
        kpis: [
          { label: 'Pass Snaps', value: ({ passRows }) => [String(passRows.length)] },
          { label: 'Pass Efficiency', dot: '--good', glossary: 'Success Rate', value: ({ passRows }) => [pct(rate(passRows, succ))] },
          { label: 'Explosive Pass Rate', dot: '--good', glossary: 'Explosive Play', value: ({ passRows }) => [pct(rate(passRows, expl))] },
          {
            label: 'Most Common Shell Faced',
            value: ({ passRows }) => {
              const by = groupBy(passRows.filter((r) => r.cov_shell), 'cov_shell');
              const top = topKeysByCount(by, 1)[0];
              return [top || '—', top ? `${by.get(top).length} snaps` : ''];
            },
          },
        ],
        cards: [
          countCard('Coverage Shell Faced (top 10 by volume)', 'cov_shell', { get: (c) => c.passRows, denom: (c) => c.passRows.length, noun: 'pass snaps' }),
          rateCard('Pass Efficiency by Personnel', 'personnel', { get: (c) => c.passRows, color: '--cat-5', noun: 'pass snaps', has: (r) => r.personnel !== null && r.personnel !== undefined }),
          countCard('Formation Usage on Pass Plays (top 10 by volume)', 'formation', { get: (c) => c.passRows, denom: (c) => c.passRows.length, noun: 'pass snaps', wide: true }),
          detailTable('Coverage shell detail', 'cov_shell', 'Shell', [
            { label: 'N', cell: (g) => g.length }, { label: 'Pass Eff %', cell: (g) => pct(rate(g, succ), 0) }, { label: 'Explosive %', cell: (g) => pct(rate(g, expl), 0) }, { label: 'Avg Yards', cell: avgYds },
          ], { get: (c) => c.passRows, n: 10, empty: 'No coverage shell data in current filter.' }),
        ],
        footer: `${FOOT_CHARTED} Coverage Shell is the opponent's deep-safety alignment (e.g. "2 High") shown against Carroll's offense; Personnel/Formation are Carroll's own call, shown exactly as charted.`,
      },
      {
        id: 'ol', label: 'Offensive Line', data: charted,
        prepare: (rows) => ({ runRows: rows.filter((r) => r.play_type === 'Run'), sackRows: rows.filter(isSackPlay) }),
        summary: ({ rows }) => `${rows.length} snaps in view`,
        kpis: [
          { label: 'Snaps in View', value: ({ rows }) => [String(rows.length)] },
          { label: 'Run Efficiency', dot: '--good', glossary: 'Success Rate', value: ({ runRows }) => [pct(rate(runRows, succ)), `${runRows.length} run snaps`] },
          { label: 'Sack Rate Allowed', dot: '--critical', value: ({ rows, sackRows }) => [pct(rows.length ? sackRows.length / rows.length : null), `${sackRows.length} sacks`] },
          {
            label: 'Most Common Protection',
            value: ({ rows }) => {
              const by = groupBy(rows.filter((r) => r.protection), 'protection');
              const top = topKeysByCount(by, 1)[0];
              return [top || '—', top ? `${by.get(top).length} snaps` : ''];
            },
          },
        ],
        cards: [
          countCard('Fronts Faced (top 10 by volume)', 'def_front', { wide: true }),
          rateCard('Run Efficiency by Front Faced', 'def_front', { get: (c) => c.runRows, color: '--good' }),
          countCard('Stunts Faced (top 10 by volume)', 'stunt', { wide: true }),
          {
            title: 'Front-faced detail', wide: true,
            table: {
              head: ['Front Faced', 'N', 'Run Eff %', 'Avg Yards', 'Sacks'],
              empty: 'No fronts in current filter.',
              rows({ rows }) {
                const by = groupBy(rows.filter((r) => r.def_front), 'def_front');
                return topKeysByCount(by, 10).map((f) => {
                  const g = by.get(f);
                  const gRun = g.filter((r) => r.play_type === 'Run');
                  return [esc(f), g.length, pct(gRun.length ? rate(gRun, succ) : null, 0), fmt(mean(g.map((r) => r.yards)), 1), g.filter(isSackPlay).length];
                });
              },
            },
          },
        ],
        footer: `${FOOT_CHARTED} Front/Stunt Faced is the opponent's defense shown against Carroll's offense; Protection is Carroll's own call, shown exactly as charted.`,
      },
    ];

    const DEFENSE_GROUPS = [
      {
        id: 'dline', label: 'Defensive Line', data: charted,
        prepare: (rows) => ({ runRows: rows.filter((r) => r.play_type === 'Run'), sackRows: rows.filter(isSackPlay) }),
        summary: ({ rows }) => `${rows.length} snaps in view`,
        kpis: [
          { label: 'Snaps in View', value: ({ rows }) => [String(rows.length)] },
          { label: 'Run Efficiency Allowed', dot: '--critical', glossary: 'Success Rate', value: ({ runRows }) => [pct(rate(runRows, succ)), `${runRows.length} run snaps`] },
          { label: 'Sack Rate', dot: '--good', value: ({ rows, sackRows }) => [pct(rows.length ? sackRows.length / rows.length : null), `${sackRows.length} sacks`] },
          {
            label: 'Most-Used Front',
            value: ({ rows }) => {
              const by = groupBy(rows.filter((r) => r.front_d), 'front_d');
              const top = topKeysByCount(by, 1)[0];
              return [top || '—', top ? `${by.get(top).length} snaps` : ''];
            },
          },
        ],
        cards: [
          countCard('Front Called (top 10 by volume)', 'front_d', { wide: true }),
          rateCard('Run Efficiency Allowed by Front', 'front_d', { get: (c) => c.runRows, color: '--critical' }),
          countCard('Movement/Stunt Called (top 10 by volume)', 'movement', { wide: true, has: realCall('movement') }),
          {
            title: 'Front detail', wide: true,
            table: {
              head: ['Front', 'N', 'Run Eff % Allowed', 'Avg Yards Allowed', 'Sacks'],
              empty: 'No fronts in current filter.',
              rows({ rows }) {
                const by = groupBy(rows.filter((r) => r.front_d), 'front_d');
                return topKeysByCount(by, 10).map((f) => {
                  const g = by.get(f);
                  const gRun = g.filter((r) => r.play_type === 'Run');
                  return [esc(f), g.length, pct(gRun.length ? rate(gRun, succ) : null, 0), fmt(mean(g.map((r) => r.yards)), 1), g.filter(isSackPlay).length];
                });
              },
            },
          },
        ],
        footer: `${FOOT_CHARTED} Front/movement names are Carroll's own playbook call vocabulary, shown exactly as charted.`,
      },
      {
        id: 'linebackers', label: 'Linebackers', data: charted,
        prepare: (rows) => ({ runRows: rows.filter((r) => r.play_type === 'Run') }),
        summary: ({ runRows }) => `${runRows.length} run snaps in view`,
        kpis: [
          { label: 'Run Snaps Faced', value: ({ runRows }) => [String(runRows.length)] },
          { label: 'Run Efficiency Allowed', dot: '--critical', glossary: 'Success Rate', value: ({ runRows }) => [pct(rate(runRows, succ))] },
          { label: 'Explosive Run Rate Allowed', dot: '--critical', glossary: 'Explosive Play', value: ({ runRows }) => [pct(rate(runRows, expl))] },
          {
            label: 'Most Common Blitz Call',
            value: ({ rows }) => {
              const by = groupBy(rows.filter(realCall('blitz_d')), 'blitz_d');
              const top = topKeysByCount(by, 1)[0];
              return [top || '—', top ? `${by.get(top).length} snaps` : ''];
            },
          },
        ],
        cards: [
          rateCard('Run Efficiency Allowed by Front', 'front_d', { get: (c) => c.runRows, color: '--critical' }),
          rateCard('Run Efficiency Allowed by Hash', 'hash', { get: (c) => c.runRows, order: PLAY_HASH_ORDER, color: '--cat-1' }),
          countCard('Blitz Called (top 10 by volume)', 'blitz_d', { wide: true, has: realCall('blitz_d') }),
          detailTable('Front detail — run snaps only', 'front_d', 'Front', [
            { label: 'N (run)', cell: (g) => g.length }, { label: 'Run Eff %', cell: (g) => pct(rate(g, succ), 0) }, { label: 'Explosive %', cell: (g) => pct(rate(g, expl), 0) }, { label: 'Avg Yards', cell: avgYds },
          ], { get: (c) => c.runRows, n: 10, empty: 'No run snaps in current filter.' }),
        ],
        footer: `${FOOT_CHARTED} Front/blitz names are Carroll's own playbook call vocabulary, shown exactly as charted.`,
      },
      {
        id: 'corners', label: 'Cornerbacks', data: official,
        prepare: (rows) => { const passRows = rows.filter((r) => r.play_type === 'Pass'); return { passRows, withEff: withEfficiency(passRows) }; },
        summary: ({ passRows }) => `${passRows.length} pass snaps in view`,
        kpis: [
          { label: 'Pass Snaps Faced', value: ({ passRows }) => [String(passRows.length)] },
          { label: 'Pass Efficiency Allowed', dot: '--critical', glossary: 'Success Rate', value: ({ withEff }) => [pct(rate(withEff, succ)), `${withEff.length} classified`] },
          { label: 'Explosive Pass Rate Allowed', dot: '--critical', glossary: 'Explosive Play', value: ({ withEff }) => [pct(rate(withEff, expl))] },
          { label: 'Avg Yards / Pass Allowed', dot: '--critical', value: ({ passRows }) => [fmt(mean(passRows.map((r) => r.yards)), 1)] },
        ],
        cards: [
          rateCard('Pass Efficiency Allowed by Direction', 'direction', { get: (c) => c.passRows, order: ['Left', 'Middle', 'Right'], color: '--critical', noun: 'passes' }),
          rateCard('Pass Efficiency Allowed by Depth', 'pass_depth', { get: (c) => c.passRows, order: ['Short', 'Deep'], color: '--serious', noun: 'passes' }),
          { raw: true, wide: true, render: (el, { passRows }) => renderTrendCard(el, passRows, 'yards', ' yds', 'Pass Yards Allowed by Game') },
          {
            title: 'Direction detail', wide: true,
            table: {
              head: ['Direction', 'N', 'Efficiency % Allowed', 'Explosive %', 'Avg Yards'],
              empty: 'No direction data in current filter.',
              rows({ passRows }) {
                const by = groupBy(passRows.filter((r) => r.direction), 'direction');
                return ['Left', 'Middle', 'Right'].filter((d) => by.has(d)).map((d) => { const g = by.get(d); return [d, g.length, pct(rate(g, succ), 0), pct(rate(g, expl), 0), avgYds(g)]; });
              },
            },
          },
        ],
        footer: "Source: Game Analysis's OfficialPlayByPlay sheet, combined_play_data.xlsx. Direction/depth coverage is much sparser for 2021 games (source play text didn't include those qualifiers that year) — not a parsing gap, a source-data limitation.",
      },
      {
        id: 'safeties', label: 'Safeties', data: official,
        prepare: (rows) => {
          const withEff = withEfficiency(rows);
          return { withEff, passEff: withEff.filter((r) => r.play_type === 'Pass'), runEff: withEff.filter((r) => r.play_type === 'Run') };
        },
        summary: ({ rows }) => `${rows.length} plays in view`,
        kpis: [
          { label: 'Snaps in View', value: ({ rows }) => [String(rows.length)] },
          { label: 'Explosive Rate Allowed', dot: '--critical', glossary: 'Explosive Play', value: ({ withEff }) => [pct(rate(withEff, expl)), `${withEff.length} classified`] },
          { label: 'Pass Efficiency Allowed', dot: '--critical', glossary: 'Success Rate', value: ({ passEff }) => [pct(rate(passEff, succ)), `${passEff.length} pass plays`] },
          { label: 'Run Efficiency Allowed', dot: '--critical', glossary: 'Success Rate', value: ({ runEff }) => [pct(rate(runEff, succ)), `${runEff.length} run plays`] },
        ],
        cards: [
          rateCard('Explosive Rate Allowed by Field Zone', 'field_zone', { get: (c) => c.withEff, order: FIELD_ZONES, pred: expl, color: '--cat-8', noun: 'plays' }),
          {
            title: 'Explosive Rate Allowed by Play Type',
            render(el, { withEff }) {
              const by = groupBy(withEff, 'play_type');
              const types = ['Run', 'Pass'].filter((t) => by.has(t));
              renderBar(el, { categories: types, values: types.map((t) => rate(by.get(t), expl)), labelFmt: (v) => pct(v, 0), colorFn: (name) => (name === 'Run' ? cssVar('--cat-1') : cssVar('--cat-4')), tooltipExtra: (t) => `${by.get(t).length} plays` });
            },
          },
          { raw: true, wide: true, render: (el, { rows }) => renderTrendCard(el, rows, 'yards', ' yds', 'Yards Allowed / Play by Game') },
          {
            title: 'Field zone detail', wide: true,
            table: {
              head: ['Field Zone', 'N', 'Explosive %', 'Pass Eff % Allowed', 'Run Eff % Allowed'],
              empty: 'No field zone data in current filter.',
              rows({ withEff }) {
                const by = groupBy(withEff, 'field_zone');
                return FIELD_ZONES.filter((z) => by.has(z)).map((z) => {
                  const g = by.get(z), gPass = g.filter((r) => r.play_type === 'Pass'), gRun = g.filter((r) => r.play_type === 'Run');
                  return [z, g.length, pct(rate(g, expl), 0), pct(gPass.length ? rate(gPass, succ) : null, 0), pct(gRun.length ? rate(gRun, succ) : null, 0)];
                });
              },
            },
          },
        ],
        footer: 'Source: Game Analysis\'s OfficialPlayByPlay sheet, combined_play_data.xlsx. Field Zone is Carroll\'s own defense\'s distance-to-goal, so "Red Zone" here means the opponent is deep in Carroll territory.',
      },
    ];

    /** Position Groups tab: pill picker over the side's group views; each group rebuilds
     * the view (its filter set depends on which sheet the group reads). */
    function positionGroupsTab(side, groups) {
      return (root, { sub }) => {
        root.innerHTML = '<div class="subbar" id="pg-picker"></div><div id="pg-view"></div>';
        const start = groups.some((g) => g.id === sub) ? sub : groups[0].id;
        const show = (id) => positionView(side, groups.find((g) => g.id === id))(root.querySelector('#pg-view'));
        Site.pills(root.querySelector('#pg-picker'), { options: groups, value: start, label: 'Position group', onChange: (id) => { Site.setSub(id); show(id); } });
        show(start);
      };
    }


    return { OFFENSE_GROUPS, DEFENSE_GROUPS, positionGroupsTab };
  }

  /** The Position Groups tab renderer for one side. */
  function tab(side) {
    built = built || define();
    return built.positionGroupsTab(side, side === 'offense' ? built.OFFENSE_GROUPS : built.DEFENSE_GROUPS);
  }

  return { tab };
})();
