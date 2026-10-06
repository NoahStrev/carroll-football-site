/* Opponent Scouting: how every opponent has been attacked / has attacked Carroll.

   Tabs: Next Opponent (a game-plan page for one opponent, defaulting to the next game on the
   schedule), By Opponent (per-opponent efficiency charts), Offense and Defense (scouting
   reports). Each report tab covers two views of the same table, switched with a pill:
   Carroll's own tendencies (self scout) and the selected opponent(s)' tendencies (scout).

   The two sides read different sheets:
   - Offense reports -- official play-by-play. Carroll's own calls are game-data
     `offense.official`; an opponent's calls are `defense.official` (their snaps, seen
     through Carroll's defense).
   - Defense reports -- hand-charted scheme calls (front/blitz/movement or front/blitz/
     coverage). Carroll's own are `defense.plays`; an opponent's defense, as charted by
     Carroll's staff watching it, is `offense.plays`.
   Quarter/goal-to-go/score/drive-context fields only exist on the official sheet, which
   is why the offense reports offer more scenario dimensions than the defense ones. */
(function () {
  const esc = Site.esc;
  const G = () => Site.data.game;

  const QUARTERS = ['1st', '2nd', '3rd', '4th', 'OT'];

  // Rush/Pass/Sack/Kneel/Two-Point Conversion is official play-by-play's full play_type
  // vocabulary. Kneel and Two-Point snaps aren't real play-calling signal, so they're
  // dropped from every run/pass split below. Sack counts as a pass call (the standard
  // stat-keeping convention).
  const runPassRows = (rows) => rows.filter((r) => r.play_type === 'Rush' || r.play_type === 'Pass' || r.play_type === 'Sack');
  const isRunPlay = (r) => r.play_type === 'Rush';
  const isPassPlay = (r) => r.play_type === 'Pass' || r.play_type === 'Sack';

  // "All opponents" is a sentinel for the Opponent <select>; real opponents are plain
  // team names, never this literal.
  const ALL_OPPONENTS = '__ALL__';
  const ALL_OPPONENTS_LABEL = 'All Opponents (Combined)';
  const SEASON_FILTER = [{ field: 'season', label: 'Season' }]; // every season starts checked
  const opponentLabel = (v) => (v === ALL_OPPONENTS ? ALL_OPPONENTS_LABEL : v);

  const filterByOpponentSeason = (rows, opponent, seasonSet) =>
    rows.filter((r) => (opponent === ALL_OPPONENTS || r.opponent === opponent) && seasonSet.has(String(r.season)));

  const opponentOptions = () => {
    const D = G();
    const names = [...new Set([...D.offense.official, ...D.defense.official].map((r) => r.opponent))].sort();
    return [{ value: ALL_OPPONENTS, label: ALL_OPPONENTS_LABEL }, ...names.map((o) => ({ value: o, label: o }))];
  };

  /* ================================================================ By Opponent == */

  function byOpponentMetrics(rows) {
    const withEff = rows.filter((r) => r.play_efficiency !== null);
    return {
      ypp: mean(rows.map((r) => r.yards)),
      success: rate(withEff, (r) => isSuccess(r.play_efficiency)),
      explosive: rate(withEff, (r) => r.play_efficiency === 'Explosive'),
      turnover: rate(rows, (r) => r.is_turnover),
    };
  }

  // scroll: true -- too many opponents to flex-shrink into one card, so each chart scrolls
  // horizontally within its own card instead.
  function opponentChart(title, rowsKey, metric, fmtFn, color) {
    return {
      title,
      render(el, ctx) {
        const byOpp = groupBy(ctx[rowsKey], 'opponent');
        const opponents = [...byOpp.keys()].sort();
        renderBar(el, {
          categories: opponents, values: opponents.map((o) => byOpponentMetrics(byOpp.get(o))[metric]),
          labelFmt: fmtFn, colorFn: () => cssVar(color), tooltipExtra: (o) => `${byOpp.get(o).length} plays`, scroll: true,
        });
      },
    };
  }

  function byOpponentTab(root) {
    const D = G();
    const f1 = (v) => fmt(v, 1), p0 = (v) => pct(v, 0);
    Site.view(root, {
      filters: { defs: SEASON_FILTER, values: D.filters.offense },
      source: 'Official play-by-play',
      actions: [{ label: '&#8595; PDF', onClick: () => printPage('Opponent Scouting - By Opponent - Carroll Football') }],
      prepare(st) { return { off: applyFilters(D.offense.official, st), def: applyFilters(D.defense.official, st) }; },
      summary: ({ off, def }) => `${off.length} offensive / ${def.length} defensive plays in view`,
      cards: [
        { section: 'Offense' },
        opponentChart('Yards / Play by Opponent', 'off', 'ypp', f1, '--cat-1'),
        opponentChart('Success Rate by Opponent', 'off', 'success', p0, '--serious'),
        opponentChart('Explosive Rate by Opponent', 'off', 'explosive', p0, '--cat-8'),
        opponentChart('Turnover Rate by Opponent', 'off', 'turnover', p0, '--critical'),
        { section: 'Defense' },
        opponentChart('Yards Allowed / Play by Opponent', 'def', 'ypp', f1, '--cat-1'),
        opponentChart('Success Rate Allowed by Opponent', 'def', 'success', p0, '--serious'),
        opponentChart('Explosive Rate Allowed by Opponent', 'def', 'explosive', p0, '--cat-8'),
        opponentChart('Takeaway Rate by Opponent', 'def', 'turnover', p0, '--good'),
      ],
      footer: () => `Source: Game Analysis's OfficialPlayByPlay sheet, combined_play_data.xlsx (${gameCoverageText(D.games)}).`,
    });
  }

  /* ================================================== shared: custom situation == */

  // A Custom Situation card: one dropdown per scenario dimension (default "Any" = ignored,
  // selections combine with AND) and a single result row for that exact combination. The
  // picks are kept across refreshes (changing opponent or season doesn't reset them).
  let customSeq = 0;
  function customSituationCard({ fields, matches, label, resultTable, emptyMsg, note }) {
    const picked = {};
    const uid = `cs${++customSeq}`;
    return {
      title: 'Custom Situation',
      render(el, ctx) {
        el.innerHTML = `
          <div class="custom-situation-grid no-print">${fields.map((f) => `
            <div><label for="${uid}-${f.id}">${f.label}</label>
              <select class="select-sm" id="${uid}-${f.id}" data-field="${f.id}">
                <option value="Any">Any</option>${f.options.map((o) => `<option value="${esc(o)}"${picked[f.id] === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}
              </select></div>`).join('')}</div>
          <div class="custom-result"></div>
          <div class="data-note">${note}</div>`;
        const resultEl = el.querySelector('.custom-result');
        function draw() {
          const sel = Object.fromEntries(fields.map((f) => [f.id, el.querySelector(`select[data-field="${f.id}"]`).value]));
          const matched = ctx.matchBase.filter((r) => matches(r, sel));
          const parts = fields.map((f) => (sel[f.id] === 'Any' ? null : label(f, sel[f.id]))).filter((v) => v !== null);
          resultEl.innerHTML = resultTable(parts.length ? parts.join(', ') : 'All snaps (no filters selected)', matched, emptyMsg);
        }
        el.querySelectorAll('select').forEach((s) => s.addEventListener('change', () => { picked[s.dataset.field] = s.value === 'Any' ? undefined : s.value; draw(); }));
        draw();
      },
    };
  }

  /* ============================================================ Offense reports == */

  // Leading/trailing by more than a score (8 points: two scores down is a fundamentally
  // different situation than one) vs by a score or less vs tied.
  const SCORE_BUCKETS = ['Leading by 9+', 'Leading by 1-8', 'Tied', 'Trailing by 1-8', 'Trailing by 9+'];
  function scoreBucket(sd) {
    if (sd === null || sd === undefined) return null;
    if (sd > 8) return 'Leading by 9+';
    if (sd > 0) return 'Leading by 1-8';
    if (sd === 0) return 'Tied';
    if (sd >= -8) return 'Trailing by 1-8';
    return 'Trailing by 9+';
  }
  const ordinalDown = (d) => (d === 1 ? '1st' : d === 2 ? '2nd' : d === 3 ? '3rd' : '4th');

  // Relies on the source array being in chronological play order (true throughout this
  // dataset). Flags whether the previous play in the same drive was Explosive and whether
  // it's the first play of its drive -- "what do they do to start a drive" is its own question.
  function withScenarioFlags(rows) {
    const flagged = [];
    groupBy(rows, 'game_label').forEach((gameRows) => {
      groupBy(gameRows, 'drive_num').forEach((driveRows) => {
        driveRows.forEach((r, i) => {
          flagged.push({ ...r, _afterExplosive: i > 0 && driveRows[i - 1].play_efficiency === 'Explosive', _firstPlayOfDrive: i === 0 });
        });
      });
    });
    // groupBy() silently skips rows whose key is null -- a handful of real snaps have no
    // charted drive_num (a charting gap, not real "no drive" plays). Losing them would drop
    // them from the ENTIRE table, so they're added back with a default drive-sequence flag.
    rows.forEach((r) => {
      if (r.game_label === null || r.game_label === undefined || r.drive_num === null || r.drive_num === undefined) {
        flagged.push({ ...r, _afterExplosive: false, _firstPlayOfDrive: false });
      }
    });
    return flagged;
  }

  // Every scenario dimension the official play-by-play carries; each is a section of the table.
  function buildScenarios(flagged) {
    const withDist = flagged.map((r) => ({ ...r, _db: distanceBucket(r.distance) }));
    const pair = (a, b, pa, pb) => [{ label: a, rows: flagged.filter(pa) }, { label: b, rows: flagged.filter(pb) }];
    return [
      { title: 'By Down', items: DOWNS.map((d) => ({ label: `${ordinalDown(d)} Down`, rows: flagged.filter((r) => r.down === d) })) },
      { title: 'By Distance', items: DIST_BUCKETS.map((b) => ({ label: `${b} yds to go`, rows: withDist.filter((r) => r._db === b) })) },
      { title: 'By Down & Distance', items: DOWNS.flatMap((d) => DIST_BUCKETS.map((b) => ({ label: `${ordinalDown(d)} & ${b}`, rows: withDist.filter((r) => r.down === d && r._db === b) }))) },
      { title: 'By Quarter', items: QUARTERS.map((q) => ({ label: q, rows: flagged.filter((r) => r.quarter === q) })) },
      { title: 'By Situation', items: SITUATIONS.map((s) => ({ label: s, rows: flagged.filter((r) => r.situation === s) })) },
      { title: 'By Field Zone', items: FIELD_ZONES.map((z) => ({ label: z, rows: flagged.filter((r) => r.field_zone === z) })) },
      { title: 'Goal-to-Go', items: pair('Goal-to-Go', 'Not Goal-to-Go', (r) => r.is_goal_to_go, (r) => !r.is_goal_to_go) },
      { title: 'By Score Situation', items: SCORE_BUCKETS.map((b) => ({ label: b, rows: flagged.filter((r) => scoreBucket(r.score_differential) === b) })) },
      { title: 'Drive Context', items: pair('First Play of Drive', 'Not First Play of Drive', (r) => r._firstPlayOfDrive, (r) => !r._firstPlayOfDrive) },
      { title: 'Explosive-Play Context', items: pair('After an Explosive Play', 'Other Snaps', (r) => r._afterExplosive, (r) => !r._afterExplosive) },
      // 2:00 or less in a half-ending quarter -- the real hurry-up signal (see build_game_data.py).
      { title: 'Clock Situation', items: pair('Two-Minute Drill', 'Other Snaps', (r) => r.is_two_minute_drill, (r) => !r.is_two_minute_drill) },
    ];
  }

  // One row = one scenario: Run/Pass mix (of every Run/Pass/Sack snap), Direction (of just the
  // subset with a charted direction), Pass Depth (of just the pass attempts with a charted
  // depth) -- three denominators in one row so a coach reads one line for "3rd & Long".
  // 1st Down/Success/Explosive % use the same Run/Pass/Sack denominator; is_first_down is a
  // clean official-play-by-play boolean (the hand-charted sheet's "1st DN" tag is NOT safe
  // to derive it from -- it's only ever a standalone tag, so it would silently undercount).
  function scenarioRowHTML(label, rows) {
    const rp = runPassRows(rows);
    const n = rp.length;
    const runN = rp.filter(isRunPlay).length;
    const dirRows = rp.filter((r) => r.direction);
    const dirPct = (d) => (dirRows.length ? pct(dirRows.filter((r) => r.direction === d).length / dirRows.length, 0) : '—');
    const depthRows = rp.filter(isPassPlay).filter((r) => r.pass_depth);
    const depthPct = (d) => (depthRows.length ? pct(depthRows.filter((r) => r.pass_depth === d).length / depthRows.length, 0) : '—');
    const of = (k) => pct(n ? k / n : null, 0);
    return `<tr>
      <td class="name">${label}</td><td>${n}</td><td>${of(runN)}</td><td>${pct(n ? (n - runN) / n : null, 0)}</td>
      <td>${dirPct('Left')}</td><td>${dirPct('Middle')}</td><td>${dirPct('Right')}</td>
      <td>${depthPct('Deep')}</td><td>${depthPct('Short')}</td>
      <td>${of(rp.filter((r) => r.is_first_down).length)}</td><td>${of(rp.filter((r) => isSuccess(r.play_efficiency)).length)}</td><td>${of(rp.filter((r) => r.play_efficiency === 'Explosive').length)}</td>
    </tr>`;
  }

  const sectionRowHTML = (title, colspan) => `<tr class="tbl-section"><td colspan="${colspan}">${title}</td></tr>`;
  const OFFENSE_TABLE_HEAD = '<tr><th>Scenario</th><th>N</th><th>Run %</th><th>Pass %</th><th>Dir: Left %</th><th>Dir: Mid %</th><th>Dir: Right %</th><th>Depth: Deep %</th><th>Depth: Short %</th><th>1st Down %</th><th>Success %</th><th>Explosive %</th></tr>';
  const scenarioTableWrap = (head, body) => `<div class="tbl-scroll"><table class="mini scenario-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;

  function scenarioTableHTML(flagged) {
    let rowsHTML = '';
    buildScenarios(flagged).forEach((sec) => {
      const items = sec.items.filter((it) => runPassRows(it.rows).length > 0);
      if (!items.length) return;
      rowsHTML += sectionRowHTML(sec.title, 12);
      items.forEach((it) => { rowsHTML += scenarioRowHTML(it.label, it.rows); });
    });
    // A single-season opponent with that season unchecked is a normal path through the
    // filter -- say "no data" rather than render a bare header.
    return rowsHTML ? scenarioTableWrap(OFFENSE_TABLE_HEAD, rowsHTML) : '<div class="insight">No real Run/Pass/Sack snaps match the selected opponent(s)/season(s).</div>';
  }

  const OFFENSE_CUSTOM_FIELDS = [
    { id: 'down', label: 'Down', options: DOWNS.map(String) },
    { id: 'distance', label: 'Distance', options: DIST_BUCKETS },
    { id: 'quarter', label: 'Quarter', options: QUARTERS },
    { id: 'situation', label: 'Situation', options: SITUATIONS },
    { id: 'fieldZone', label: 'Field Zone', options: FIELD_ZONES },
    { id: 'goalToGo', label: 'Goal-to-Go', options: ['Goal-to-Go', 'Not Goal-to-Go'] },
    { id: 'score', label: 'Score Situation', options: SCORE_BUCKETS },
    { id: 'drive', label: 'Drive Context', options: ['First Play of Drive', 'Not First Play of Drive'] },
    { id: 'explosive', label: 'Explosive-Play Context', options: ['After an Explosive Play', 'Other Snaps'] },
    { id: 'clock', label: 'Clock Situation', options: ['Two-Minute Drill', 'Other Snaps'] },
  ];

  function offenseMatches(r, s) {
    if (s.down !== 'Any' && String(r.down) !== s.down) return false;
    if (s.distance !== 'Any' && distanceBucket(r.distance) !== s.distance) return false;
    if (s.quarter !== 'Any' && r.quarter !== s.quarter) return false;
    if (s.situation !== 'Any' && r.situation !== s.situation) return false;
    if (s.fieldZone !== 'Any' && r.field_zone !== s.fieldZone) return false;
    if (s.goalToGo !== 'Any' && (s.goalToGo === 'Goal-to-Go') !== !!r.is_goal_to_go) return false;
    if (s.score !== 'Any' && scoreBucket(r.score_differential) !== s.score) return false;
    if (s.drive !== 'Any' && (s.drive === 'First Play of Drive') !== !!r._firstPlayOfDrive) return false;
    if (s.explosive !== 'Any' && (s.explosive === 'After an Explosive Play') !== !!r._afterExplosive) return false;
    if (s.clock !== 'Any' && (s.clock === 'Two-Minute Drill') !== !!r.is_two_minute_drill) return false;
    return true;
  }

  const OFFENSE_VIEWS = {
    self: {
      title: 'Offense Self Scout',
      note: "Carroll's own play-calling tendencies against the selected opponent(s).",
      rows: () => G().offense.official,
    },
    opponent: {
      title: 'Offense Scout',
      note: "The selected opponent(s)' own play-calling tendencies against Carroll's defense — real scouting signal if they're on a future schedule again.",
      rows: () => G().defense.official,
    },
  };

  function offenseReportView(root, who) {
    const D = G();
    const cfg = OFFENSE_VIEWS[who];
    Site.view(root, {
      selects: [{ id: 'opponent', label: 'Opponent', options: opponentOptions(), value: ALL_OPPONENTS }],
      filters: { defs: SEASON_FILTER, values: { season: D.filters.offense.season } },
      source: 'Official play-by-play',
      actions: [{ label: '&#8595; PDF', onClick: (st) => printPage(`Opponent Scouting - ${cfg.title} - ${opponentLabel(st.opponent)} - Carroll Football`) }],
      prepare(st) {
        const rows = filterByOpponentSeason(cfg.rows(), st.opponent, st.season);
        const flagged = withScenarioFlags(rows);
        return { rows, flagged, matchBase: flagged, rp: runPassRows(flagged), games: new Set(rows.map((r) => r.game_label)) };
      },
      kpis: [
        { label: 'Snaps (Run/Pass/Sack)', value: ({ rp }) => [String(rp.length)] },
        { label: 'Run %', value: ({ rp }) => [pct(rate(rp, isRunPlay))] },
        { label: 'Pass %', value: ({ rp }) => [pct(rate(rp, isPassPlay))] },
        { label: 'Games', value: ({ games }) => [String(games.size)] },
      ],
      intro: cfg.note,
      cards: [
        {
          title: 'Percentage Breakdown by Scenario', wide: true,
          render(el, { flagged }) {
            el.innerHTML = `${scenarioTableHTML(flagged)}<div class="data-note">Play Type, 1st Down, Success, and Explosive % are each of every Run/Pass/Sack snap in that scenario (the N column). Direction and Pass Depth % are each their own charted subset (direction ~74% of run/pass snaps, depth ~34% of pass attempts, site-wide) -- "—" means nothing was charted for that scenario, not 0%.</div>`;
          },
        },
        {
          ...customSituationCard({
            fields: OFFENSE_CUSTOM_FIELDS,
            matches: offenseMatches,
            // Down's own values (1/2/3/4) read as bare digits outside its dropdown.
            label: (f, v) => (f.id === 'down' ? `${ordinalDown(Number(v))} Down` : v),
            resultTable: (label, matched) => (runPassRows(matched).length
              ? scenarioTableWrap(OFFENSE_TABLE_HEAD, scenarioRowHTML(label, matched))
              : '<div class="insight">No real Run/Pass/Sack snaps match this combination for this opponent.</div>'),
            note: 'Combines every selection above with AND -- leave a dropdown on "Any" to ignore that dimension. Same charted-subset caveat applies to Direction/Pass Depth here as the table above.',
          }),
          wide: true,
        },
      ],
      footer: () => `Source: Game Analysis's OfficialPlayByPlay sheet, combined_play_data.xlsx (${gameCoverageText(D.games)}). Run/Pass excludes Kneel and Two-Point Conversion snaps; Sack counts as a pass call.`,
    });
  }

  /* ============================================================ Defense reports == */

  // Both read hand-charted scheme calls -- each a large open-ended vocabulary (60-90+ real
  // distinct calls), so the scenario table shows the single most-common real call per
  // scenario ("Top Front") instead of fixed percentage columns, paired with top-10 charts.
  // Quarter/goal-to-go/score/drive fields don't exist on the hand-charted sheet, so there
  // are 6 scenario dimensions here, not the offense reports' 11.
  // '-' is the sheet's own "charted, but nothing called" placeholder -- never a real call.
  const schemeRealRows = (rows, field) => rows.filter((r) => r[field] && r[field] !== '-');

  function schemeModalCellHTML(rows, field) {
    const real = schemeRealRows(rows, field);
    if (!real.length) return '—';
    const byVal = groupBy(real, field);
    const top = topKeysByCount(byVal, 1)[0];
    return `${esc(top)} <span class="modal-pct">(${pct(byVal.get(top).length / real.length, 0)})</span>`;
  }

  // 'Timeout'/'Unknown' are the sheet's non-snap play_type values, not real scenario buckets.
  const SCHEME_PLAY_TYPES = ['Run', 'Pass'];
  const PLAY_HASH = ['L', 'M', 'R'];

  function schemeScenarios(rows) {
    const withDist = rows.map((r) => ({ ...r, _db: distanceBucket(r.distance) }));
    return [
      { title: 'By Down', items: DOWNS.map((d) => ({ label: `${ordinalDown(d)} Down`, rows: rows.filter((r) => r.down === d) })) },
      { title: 'By Distance', items: DIST_BUCKETS.map((b) => ({ label: `${b} yds to go`, rows: withDist.filter((r) => r._db === b) })) },
      { title: 'By Situation', items: SITUATIONS.map((s) => ({ label: s, rows: rows.filter((r) => r.situation === s) })) },
      { title: 'By Field Zone', items: FIELD_ZONES.map((z) => ({ label: z, rows: rows.filter((r) => r.field_zone === z) })) },
      { title: 'By Play Type', items: SCHEME_PLAY_TYPES.map((t) => ({ label: t, rows: rows.filter((r) => r.play_type === t) })) },
      { title: 'By Hash', items: PLAY_HASH.map((h) => ({ label: h, rows: rows.filter((r) => r.hash === h) })) },
    ];
  }

  const schemeHead = (fields) => `<tr><th>Scenario</th><th>N</th>${fields.map((f) => `<th>Top ${f.label}</th>`).join('')}<th>Success %</th><th>Explosive %</th><th>Takeaway %</th><th>Sack %</th></tr>`;

  // Success/Explosive % use play_efficiency (systematically computed, present on the charted
  // sheet too). First Down % is deliberately NOT here -- the sheet's "1st DN" tag is only ever
  // a standalone tag, so a percentage derived from it would silently undercount. Takeaway/Sack %
  // come from fields that ARE safe (turnover_type is already computed; the "Sack" tag was checked
  // for compound-tagging gaps). Both read correctly from either side's data.
  function schemeRowHTML(label, rows, fields) {
    const of = (k) => pct(rows.length ? k / rows.length : null, 0);
    return `<tr>
      <td class="name">${label}</td><td>${rows.length}</td>
      ${fields.map((f) => `<td>${schemeModalCellHTML(rows, f.key)}</td>`).join('')}
      <td>${of(rows.filter((r) => isSuccess(r.play_efficiency)).length)}</td>
      <td>${of(rows.filter((r) => r.play_efficiency === 'Explosive').length)}</td>
      <td>${of(rows.filter((r) => isTakeaway(r.turnover_type)).length)}</td>
      <td>${of(rows.filter((r) => isSack(r.play_outcome)).length)}</td>
    </tr>`;
  }

  function schemeTableHTML(rows, fields) {
    let rowsHTML = '';
    schemeScenarios(rows).forEach((sec) => {
      const items = sec.items.filter((it) => it.rows.length > 0);
      if (!items.length) return;
      rowsHTML += sectionRowHTML(sec.title, 6 + fields.length);
      items.forEach((it) => { rowsHTML += schemeRowHTML(it.label, it.rows, fields); });
    });
    return rowsHTML ? scenarioTableWrap(schemeHead(fields), rowsHTML) : '<div class="insight">No charted snaps match the selected opponent(s)/season(s).</div>';
  }

  const SCHEME_CUSTOM_FIELDS = [
    { id: 'down', label: 'Down', options: DOWNS.map(String) },
    { id: 'distance', label: 'Distance', options: DIST_BUCKETS },
    { id: 'situation', label: 'Situation', options: SITUATIONS },
    { id: 'fieldZone', label: 'Field Zone', options: FIELD_ZONES },
    { id: 'playType', label: 'Play Type', options: SCHEME_PLAY_TYPES },
    { id: 'hash', label: 'Hash', options: PLAY_HASH },
  ];

  function schemeMatches(r, s) {
    if (s.down !== 'Any' && String(r.down) !== s.down) return false;
    if (s.distance !== 'Any' && distanceBucket(r.distance) !== s.distance) return false;
    if (s.situation !== 'Any' && r.situation !== s.situation) return false;
    if (s.fieldZone !== 'Any' && r.field_zone !== s.fieldZone) return false;
    if (s.playType !== 'Any' && r.play_type !== s.playType) return false;
    if (s.hash !== 'Any' && r.hash !== s.hash) return false;
    return true;
  }

  const SCHEME_CHART_COLORS = ['--cat-2', '--cat-7', '--cat-5'];

  const DEFENSE_VIEWS = {
    self: {
      title: 'Defense Self Scout',
      note: "Carroll's own defensive scheme calls (front, blitz, movement) against the selected opponent(s) — the offense reports cover play type (run/pass); this one covers Carroll's own call.",
      rows: () => G().defense.plays,
      fields: [
        { key: 'front_d', label: 'Front', chartTitle: 'Fronts Used (top 10 by volume)' },
        { key: 'blitz_d', label: 'Blitz', chartTitle: 'Blitzes Called (top 10 by volume)' },
        { key: 'movement', label: 'Movement', chartTitle: 'Movement/Stunt Called (top 10 by volume)' },
      ],
      footerNote: "Front/blitz/movement names are Carroll's own playbook call vocabulary, shown exactly as charted.",
      blitzUsesDash: true,
    },
    opponent: {
      title: 'Defense Scout',
      note: "The selected opponent(s)' own defensive scheme calls (front, blitz, coverage) shown against Carroll's offense — real scouting signal if they're on a future schedule again.",
      rows: () => G().offense.plays,
      fields: [
        { key: 'def_front', label: 'Front', chartTitle: 'Fronts Shown (top 10 by volume)' },
        { key: 'blitz', label: 'Blitz', chartTitle: 'Blitzes Shown (top 10 by volume)' },
        { key: 'coverage', label: 'Coverage', chartTitle: 'Coverage Shown (top 10 by volume)' },
      ],
      footerNote: "Front/blitz/coverage names are as charted by Carroll's own staff watching this opponent's defense, not that opponent's own internal terminology.",
      blitzUsesDash: false,
    },
  };

  // The opponent-defense fields (def_front/blitz/coverage) were charted through 2024 only,
  // so an all-seasons view is the useful default here; say so when a field is empty.
  function emptyFieldNote(field, where = 'in the current filter') {
    const D = G();
    const seasons = new Set();
    const total = new Map(), filled = new Map();
    [...D.offense.plays, ...D.defense.plays].forEach((r) => {
      const s = String(r.season);
      total.set(s, (total.get(s) || 0) + 1);
      if (r[field] && r[field] !== '-') filled.set(s, (filled.get(s) || 0) + 1);
    });
    filled.forEach((n, s) => { if (n / total.get(s) >= 0.1) seasons.add(s); });
    const list = [...seasons].sort();
    return list.length
      ? `<div class="data-note">Nothing charted for this ${where}. It was charted for ${list.length > 1 ? `${list[0]}–${list[list.length - 1]}` : `only ${list[0]}`}.</div>`
      : '<div class="data-note">This field is not charted in any season.</div>';
  }

  function defenseReportView(root, who) {
    const D = G();
    const cfg = DEFENSE_VIEWS[who];
    const [f0, f1, f2] = cfg.fields;
    const chart = (f, i, wide) => ({
      title: f.chartTitle, wide,
      render(el, { rows }) {
        const by = groupBy(schemeRealRows(rows, f.key), f.key);
        const cats = topKeysByCount(by, 10);
        if (!cats.length) { el.innerHTML = emptyFieldNote(f.key); return; }
        renderBar(el, { categories: cats, values: cats.map((v) => by.get(v).length), labelFmt: (v) => String(v), colorFn: () => cssVar(SCHEME_CHART_COLORS[i % SCHEME_CHART_COLORS.length]), tooltipExtra: (v) => `${by.get(v).length} snaps` });
      },
    });
    Site.view(root, {
      selects: [{ id: 'opponent', label: 'Opponent', options: opponentOptions(), value: ALL_OPPONENTS }],
      filters: { defs: SEASON_FILTER, values: { season: D.filters.offense.season } },
      source: 'Hand-charted plays',
      actions: [{ label: '&#8595; PDF', onClick: (st) => printPage(`Opponent Scouting - ${cfg.title} - ${opponentLabel(st.opponent)} - Carroll Football`) }],
      prepare(st) {
        const rows = filterByOpponentSeason(cfg.rows(), st.opponent, st.season);
        const byFront = groupBy(schemeRealRows(rows, f0.key), f0.key);
        return { rows, matchBase: rows, games: new Set(rows.map((r) => r.game_label)), byFront, topFront: topKeysByCount(byFront, 1)[0] };
      },
      kpis: [
        { label: 'Snaps (Charted)', value: ({ rows }) => [String(rows.length)] },
        {
          // defense.plays' blitz_d uses "-" as its "charted, nothing called" placeholder (so the
          // rate among non-blank rows is the real blitz rate), but offense.plays' blitz has no
          // such placeholder -- "-" never appears -- so that formula would always give 100%.
          // blitzUsesDash switches between the two real conventions.
          label: 'Blitz Rate',
          value: ({ rows }) => {
            if (cfg.blitzUsesDash) {
              const charted = rows.filter((r) => r[f1.key] !== null && r[f1.key] !== undefined);
              return [charted.length ? pct(rate(charted, (r) => r[f1.key] !== '-')) : '—', `${charted.length} charted`];
            }
            return [rows.length ? pct(rate(rows, (r) => r[f1.key] && r[f1.key] !== '-')) : '—', `${rows.length} snaps in view`];
          },
        },
        { label: 'Most-Used Front', value: ({ byFront, topFront }) => [topFront || '—', topFront ? `${byFront.get(topFront).length} snaps` : ''] },
        { label: 'Games', value: ({ games }) => [String(games.size)] },
      ],
      intro: cfg.note,
      cards: [
        {
          title: 'Most-Used Call by Scenario', wide: true,
          render(el, { rows }) {
            el.innerHTML = `${schemeTableHTML(rows, cfg.fields)}<div class="data-note">Top ${cfg.fields.map((f) => f.label).join('/')} is the single most-common real call charted for that scenario, with its share of that scenario's charted snaps for that field — "—" means nothing was charted for that field in that scenario, not that nothing was ever called. Success/Explosive/Takeaway/Sack % are each of every charted snap in that scenario (the N column) — Takeaway % counts an interception or a fumble recovered by the other side, Sack % counts a sack tagged on that snap.</div>`;
          },
        },
        chart(f0, 0), chart(f1, 1), chart(f2, 2, true),
        {
          ...customSituationCard({
            fields: SCHEME_CUSTOM_FIELDS,
            matches: schemeMatches,
            label: (f, v) => (f.id === 'down' ? `${ordinalDown(Number(v))} Down` : f.id === 'hash' ? `${v} Hash` : v),
            resultTable: (label, matched) => (matched.length
              ? scenarioTableWrap(schemeHead(cfg.fields), schemeRowHTML(label, matched, cfg.fields))
              : '<div class="insight">No charted snaps match this combination for this opponent.</div>'),
            note: 'Combines every selection above with AND — leave a dropdown on "Any" to ignore that dimension.',
          }),
          wide: true,
        },
      ],
      footer: `Source: Game Analysis's Plays sheet, combined_play_data.xlsx. ${cfg.footerNote}`,
    });
  }

  /* ============================================================ Next Opponent == */

  // One opponent's game-plan page: when/where, the series history, how they attack Carroll's
  // defense by down, how Carroll's offense/defense did against them next to its usual numbers,
  // and their charted defense. Defaults to the next game on the schedule; any opponent in the
  // archive can be picked. #next/<opponent> deep-links (Home's "Scouting report" link).
  const shortDay = (iso) => Site.dayLabel(iso, { weekday: 'short', month: 'short', day: 'numeric' });

  function nextOpponentOptions(H, meta) {
    const upcoming = meta.schedule.filter((g) => g.date >= Site.today() && !g.completed);
    const first = new Set(upcoming.map((g) => g.opponent));
    const rest = [...new Set([...Object.keys(H.history), ...opponentOptions().map((o) => o.value).filter((v) => v !== ALL_OPPONENTS)])]
      .filter((o) => !first.has(o)).sort();
    return {
      upcoming,
      options: [
        ...upcoming.map((g) => ({ value: g.opponent, label: `${Site.dayLabel(g.date)} · ${g.opponent}` })),
        ...rest.map((o) => ({ value: o, label: o })),
      ],
    };
  }

  // Their snaps vs Carroll's defense, sliced the same ways the Offense tab does -- the sections
  // that matter for a game plan; the full table and Custom Situation builder live on that tab.
  const NEXT_SECTIONS = ['By Down', 'By Distance', 'By Field Zone', 'By Score Situation'];

  // Two sides next to each other: this opponent vs every other opponent. `better` is whether a
  // higher number is good for Carroll, for the arrow color.
  function versusRow(label, mineFn, mine, others, f, better) {
    const a = mine.length ? mineFn(mine) : null, b = others.length ? mineFn(others) : null;
    if (a === null || a === undefined) return [label, '—', f(b)];
    const diff = b === null || b === undefined ? 0 : a - b;
    const flag = Math.abs(diff) < 1e-9 ? '' : `<span class="rk-move ${(diff > 0) === better ? 'good' : 'crit'}">${diff > 0 ? '▲' : '▼'}</span>`;
    return [label, `${f(a)} ${flag}`, f(b)];
  }

  function nextOpponentTab(root, { sub }) {
    const D = G(), H = Site.data.home, meta = Site.data.meta;
    const { upcoming, options } = nextOpponentOptions(H, meta);
    const wanted = sub && options.some((o) => o.value === sub) ? sub : null;
    const start = wanted || (upcoming[0] ? upcoming[0].opponent : options[0].value);

    const view = Site.view(root, {
      selects: [{ id: 'opponent', label: 'Opponent', options, value: start }],
      source: 'Official play-by-play, box scores',
      actions: [{ label: '&#8595; PDF', onClick: (st) => printPage(`Opponent Scouting - Next Opponent - ${st.opponent} - Carroll Football`) }],
      prepare(st) {
        const opp = st.opponent;
        const game = meta.schedule.find((g) => g.opponent === opp && g.date >= Site.today() && !g.completed) || null;
        const hist = H.history[opp] || [];
        const theirs = D.defense.official.filter((r) => r.opponent === opp);
        const ours = D.offense.official.filter((r) => r.opponent === opp);
        const otherTheirs = D.defense.official.filter((r) => r.opponent !== opp);
        const otherOurs = D.offense.official.filter((r) => r.opponent !== opp);
        const charted = new Set([...theirs, ...ours].map((r) => r.game_label));
        const seasons = [...new Set([...theirs, ...ours].map((r) => r.season))].sort();
        return { opp, game, hist, theirs, ours, otherTheirs, otherOurs, charted, seasons, flagged: withScenarioFlags(theirs), schemeRows: D.offense.plays.filter((r) => r.opponent === opp) };
      },
      kpis: [
        { label: 'Next game', value: ({ game }) => (game ? [shortDay(game.date), `${game.home ? 'Home' : 'Away'}${game.time ? ` · ${game.time}` : ''}${game.conference ? ' · CCIW' : ''}`] : ['—', 'Not on the remaining schedule']) },
        { label: 'Series record', value: ({ hist }) => { const w = hist.filter((g) => g.result === 'W').length, l = hist.filter((g) => g.result === 'L').length; return hist.length ? [`${w}–${l}`, `since ${hist[hist.length - 1].season}`] : ['—', 'No meetings on record']; } },
        { label: 'Their yards / play', value: ({ theirs, otherTheirs }) => (theirs.length ? [fmt(mean(theirs.map((r) => r.yards))), `others: ${fmt(mean(otherTheirs.map((r) => r.yards)))}`] : ['—', 'not charted']) },
        { label: 'Their run %', value: ({ theirs, otherTheirs }) => { const a = runPassRows(theirs), b = runPassRows(otherTheirs); return a.length ? [pct(rate(a, isRunPlay)), `others: ${pct(rate(b, isRunPlay))}`] : ['—', 'not charted']; } },
        { label: 'Charted games', value: ({ charted, seasons }) => [String(charted.size), seasons.length ? `${seasons[0]}${seasons.length > 1 ? `–${seasons[seasons.length - 1]}` : ''}` : 'none yet'] },
      ],
      intro: ({ opp, game, charted }) => (game
        ? `${esc(opp)} is next: ${shortDay(game.date)}, ${game.home ? 'at home' : 'on the road'}${game.venue ? ` (${esc(game.venue)})` : ''}. ${charted.size ? `Carroll has ${charted.size} charted game${charted.size === 1 ? '' : 's'} against them to learn from.` : 'There are no charted games against them yet, so only the series history is available.'}`
        : `${esc(opp)} is not on the remaining schedule — this is their history against Carroll.`),
      cards: [
        {
          title: 'Past meetings', table: {
            head: ['Date', 'Site', 'Result', 'Score'],
            rows: ({ hist }) => hist.map((g) => [`${g.date.slice(5).replace('-', '/')}/${String(g.season).slice(2)}`, g.home ? 'Home' : 'Away', `<span class="tag ${g.result === 'W' ? 'good' : 'crit'}">${g.result}</span>`, `${g.carroll_pts}–${g.opp_pts}`]),
            empty: 'No meetings in the box-score archive.',
          },
          note: 'Every box score in the archive (it reaches back to 2010 for some opponents); only 2021 onward has play-by-play to scout.',
        },
        {
          title: 'Carroll against them vs everyone else',
          render(el, { ours, theirs, otherOurs, otherTheirs }) {
            const m = (rows) => byOpponentMetrics(rows);
            const f1 = (v) => (v === null || v === undefined ? '—' : fmt(v, 1)), p0 = (v) => (v === null || v === undefined ? '—' : pct(v, 0));
            const rows = [
              versusRow('Offense: yards / play', (r) => m(r).ypp, ours, otherOurs, f1, true),
              versusRow('Offense: success rate', (r) => m(r).success, ours, otherOurs, p0, true),
              versusRow('Offense: explosive rate', (r) => m(r).explosive, ours, otherOurs, p0, true),
              versusRow('Offense: turnover rate', (r) => m(r).turnover, ours, otherOurs, p0, false),
              versusRow('Defense: yards / play allowed', (r) => m(r).ypp, theirs, otherTheirs, f1, false),
              versusRow('Defense: success rate allowed', (r) => m(r).success, theirs, otherTheirs, p0, false),
              versusRow('Defense: explosive rate allowed', (r) => m(r).explosive, theirs, otherTheirs, p0, false),
              versusRow('Defense: takeaway rate', (r) => m(r).turnover, theirs, otherTheirs, p0, true),
            ];
            el.innerHTML = Site.tableHTML({ head: ['', 'vs this opponent', 'vs all others'], rows, empty: 'No charted games against this opponent.' })
              + '<div class="data-note">Arrows are green when the difference favors Carroll. Small samples (one or two games) swing a lot — read them as hints, not rules.</div>';
          },
        },
        {
          title: 'How they attack (their offense vs Carroll\'s defense)', wide: true,
          render(el, { flagged }) {
            const wanted = buildScenarios(flagged).filter((sec) => NEXT_SECTIONS.includes(sec.title));
            let body = '';
            wanted.forEach((sec) => {
              const items = sec.items.filter((it) => runPassRows(it.rows).length > 0);
              if (!items.length) return;
              body += sectionRowHTML(sec.title, 12);
              items.forEach((it) => { body += scenarioRowHTML(it.label, it.rows); });
            });
            el.innerHTML = body
              ? `${scenarioTableWrap(OFFENSE_TABLE_HEAD, body)}<div class="data-note">Their snaps against Carroll's defense, every charted season. For the full table and the Custom Situation builder, use Offense → Opponent (scout) and pick this opponent.</div>`
              : '<div class="insight">No charted snaps from this opponent yet.</div>';
          },
        },
        {
          title: 'Their defense (as charted)',
          render(el, { schemeRows }) {
            const block = (field, label) => {
              const by = groupBy(schemeRealRows(schemeRows, field), field);
              const top = topKeysByCount(by, 4);
              const total = [...by.values()].reduce((n, rows) => n + rows.length, 0);
              return top.length ? Site.tableHTML({ head: [label, 'Snaps', 'Share'], rows: top.map((k) => [esc(k), String(by.get(k).length), pct(by.get(k).length / total, 0)]) }) : '';
            };
            const html = block('def_front', 'Front') + block('coverage', 'Coverage');
            el.innerHTML = html || emptyFieldNote('def_front', 'opponent');
          },
        },
        {
          title: 'Go deeper',
          render(el, { opp }) {
            el.innerHTML = `<ul class="tw-list">
              <li><a href="#offense/opponent">Offense → Opponent (scout)</a>: the full down/distance/zone/score tables and the Custom Situation builder. Pick ${esc(opp)} in its Opponent menu.</li>
              <li><a href="#defense/opponent">Defense → Defense Scout</a>: every front, blitz, and coverage they showed, by situation.</li>
              <li><a href="#by-opponent">By Opponent</a>: how ${esc(opp)} compares with every other opponent on the same charts.</li></ul>`;
          },
        },
      ],
      footer: () => `Source: Game Analysis's OfficialPlayByPlay sheet (${gameCoverageText(D.games)}), Special Teams Data box scores, Schedule. Run/Pass excludes kneel-downs and two-point tries; a sack counts as a pass call.`,
    });

    // Keep the picked opponent in the address so the page can be shared/bookmarked.
    const sel = root.querySelector('select.select-sm');
    if (sel) {
      Site.setSub(sel.value);
      sel.addEventListener('change', () => Site.setSub(sel.value));
    }
    return view;
  }

  /* ================================================================== mount == */

  const WHO_OPTIONS = [{ id: 'self', label: 'Carroll (self scout)' }, { id: 'opponent', label: 'Opponent (scout)' }];

  function reportTab(viewFn) {
    return (root, { sub }) => {
      root.innerHTML = '<div class="subbar" id="sc-who"></div><div id="sc-view"></div>';
      const start = sub === 'opponent' ? 'opponent' : 'self';
      Site.pills(root.querySelector('#sc-who'), {
        options: WHO_OPTIONS, value: start, label: 'Team',
        onChange: (id) => { Site.setSub(id); viewFn(root.querySelector('#sc-view'), id); },
      });
      viewFn(root.querySelector('#sc-view'), start);
    };
  }

  Site.mount({
    nav: 'scouting',
    title: 'Opponent Scouting',
    lead: "What every opponent has done against Carroll and what Carroll tends to call, as real percentages by down, distance, field position, and more — plus a Custom Situation builder for any exact combination.",
    data: { game: '../data/game-data.json', home: '../data/home.json' },
    tabs: [
      { id: 'next', label: 'Next Opponent', render: nextOpponentTab },
      { id: 'by-opponent', label: 'By Opponent', render: byOpponentTab },
      { id: 'offense', label: 'Offense', render: reportTab(offenseReportView) },
      { id: 'defense', label: 'Defense', render: reportTab(defenseReportView) },
    ],
  });
})();
