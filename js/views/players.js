/* Players & Records: per-player career stats (lookup + compare) and the program's
   record book, Record Watch, and award history. Career totals come from
   data/career-stats.json (build_career_stats.py); the record book / awards from
   data/records.json (build_records_data.py). */
(function () {
  const esc = Site.esc;
  // Scraped cells that are genuinely blank in the source come through as JSON null;
  // every raw-field interpolation on this page goes through blank() so it never
  // renders the literal text "null".
  const blank = (v) => (v === null || v === undefined || v === '' ? '—' : esc(v));

  /* ======================================================== Career Stats == */

  // Every real category build_career_stats.py can produce, with how to label/format
  // it. `cols` drives both the per-category table AND which fields exist at all --
  // a category simply isn't rendered for a player who has no data in it.
  const CAREER_CATEGORIES = {
    Rushing: { label: 'Rushing', cols: [['att', 'Att'], ['net', 'Yds'], ['td', 'TD'], ['yards_per_carry', 'Avg']] },
    Passing: { label: 'Passing', cols: [['att', 'Att'], ['cmp', 'Cmp'], ['yds', 'Yds'], ['td', 'TD'], ['int', 'Int'], ['completion_pct', 'Cmp%'], ['yards_per_att', 'Y/A']] },
    Receiving: { label: 'Receiving', cols: [['rec', 'Rec'], ['yds', 'Yds'], ['td', 'TD'], ['yards_per_rec', 'Avg']] },
    'Individual Defensive Statistics': { label: 'Defense', cols: [['solo', 'Solo'], ['ast', 'Ast'], ['tot', 'Tot'], ['sacks', 'Sacks'], ['int', 'Int'], ['ff', 'FF'], ['brup', 'BrUp'], ['blkd', 'Blkd'], ['qh', 'QH']] },
    Punting: { label: 'Punting', cols: [['att', 'Punts'], ['gross_yds', 'Yds'], ['gross_avg', 'Avg'], ['net_avg', 'Net Avg'], ['long', 'Long'], ['i20', 'In 20'], ['blocked', 'Blocked']] },
    Kickoffs: { label: 'Kickoffs', cols: [['att', 'No.'], ['yds', 'Yds'], ['avg', 'Avg'], ['long', 'Long'], ['tb', 'TB'], ['ob', 'OB'], ['inside_25', 'In 25']] },
    KickoffReturn: { label: 'Kickoff Return', cols: [['att', 'Ret'], ['yds', 'Yds'], ['avg', 'Avg'], ['long', 'Long']] },
    PuntReturn: { label: 'Punt Return', cols: [['att', 'Ret'], ['yds', 'Yds'], ['avg', 'Avg'], ['long', 'Long']] },
    PATFG: { label: 'Kicking (PAT/FG)', cols: [['fg_made', 'FG'], ['fg_att', 'FGA'], ['fg_pct', 'FG%'], ['exp_made', 'PAT'], ['exp_att', 'PATA'], ['exp_pct', 'PAT%']] },
    ShortSnapping: { label: 'Short Snapping (PAT/FG)', cols: [['att', 'Snaps']] },
    LongSnapping: { label: 'Long Snapping (Punt)', cols: [['att', 'Snaps']] },
  };

  // Which categories are worth showing for a given roster position -- a display
  // filter (a quarterback shouldn't show punt stats), not an assertion that a WR could
  // never legitimately have a punting stat. A player with no roster position still
  // shows every category they have real data in. OL has no offensive skill-position
  // category on this site (no per-lineman stat exists in the source data).
  const POSITION_CATEGORIES = {
    QB: ['Passing', 'Rushing'],
    RB: ['Rushing', 'Receiving', 'KickoffReturn', 'PuntReturn'],
    WR: ['Receiving', 'Rushing', 'KickoffReturn', 'PuntReturn'],
    TE: ['Receiving', 'Rushing'],
    OL: [],
    DL: ['Individual Defensive Statistics'],
    LB: ['Individual Defensive Statistics'],
    OLB: ['Individual Defensive Statistics'],
    SAM: ['Individual Defensive Statistics'],
    BOB: ['Individual Defensive Statistics'],
    CB: ['Individual Defensive Statistics', 'KickoffReturn', 'PuntReturn'],
    SAF: ['Individual Defensive Statistics', 'KickoffReturn', 'PuntReturn'],
    DB: ['Individual Defensive Statistics', 'KickoffReturn', 'PuntReturn'],
    SPEC: ['Punting', 'Kickoffs', 'PATFG', 'ShortSnapping', 'LongSnapping'],
  };

  function relevantCategoriesFor(player) {
    const real = Object.keys(player.categories);
    if (!player.position || !POSITION_CATEGORIES[player.position]) return real;
    const allowed = new Set(POSITION_CATEGORIES[player.position]);
    return real.filter((c) => allowed.has(c));
  }

  // opponent name for a game date, from the box-score history (the game log only stores the date)
  let opponentByDate = null;
  function opponentOn(date) {
    if (!opponentByDate) {
      opponentByDate = {};
      Object.entries(Site.data.home.history).forEach(([opp, games]) => games.forEach((g) => { opponentByDate[g.date] = { opp, home: g.home, result: g.result, us: g.carroll_pts, them: g.opp_pts }; }));
    }
    return opponentByDate[date] || null;
  }

  // One season's game-by-game lines for a category (a stat that is zero is simply absent from the line).
  function gameLogHTML(catId, season) {
    const cat = CAREER_CATEGORIES[catId];
    const rows = (season.log || []).map((g) => {
      const o = opponentOn(g.date);
      const who = o ? `${o.home ? 'vs' : '@'} ${esc(o.opp)} <span class="muted">${o.result} ${o.us}–${o.them}</span>` : '—';
      return `<tr><td>${g.date.slice(5).replace('-', '/')}</td><td class="name">${who}</td>${cat.cols.map(([key]) => `<td>${g[key] ?? (key.includes('pct') || key.startsWith('yards_per') || key === 'avg' ? '—' : 0)}</td>`).join('')}</tr>`;
    }).join('');
    return `<div class="tbl-scroll"><table class="mini game-log"><thead><tr><th>Date</th><th>Opponent</th>${cat.cols.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function categoryCardHTML(catId, player) {
    const cat = CAREER_CATEGORIES[catId];
    const catData = player.categories[catId];
    const logged = catData.seasons.filter((x) => x.log && x.log.length);
    const latestLogged = logged.length ? logged[logged.length - 1] : null;
    const seasonRows = catData.seasons.map((s) => `<tr><td>${s.season}</td><td>${s.games}</td>${cat.cols.map(([key]) => `<td>${s[key] ?? '—'}</td>`).join('')}</tr>`).join('');
    return `
      <div class="card wide table-card">
        <div class="card-head"><h2>${cat.label}</h2><span class="data-note">${catData.career_games} games</span></div>
        <div class="card-body flush" data-cat="${esc(catId)}">
          <div class="tbl-scroll"><table class="mini">
            <thead><tr><th>Season</th><th>Games</th>${cat.cols.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead>
            <tbody>
              ${seasonRows}
              <tr class="total-row"><td>Career</td><td>${catData.career_games}</td>${cat.cols.map(([key]) => `<td>${catData.career[key] ?? '—'}</td>`).join('')}</tr>
            </tbody>
          </table></div>
          ${latestLogged ? `<div class="gamelog-head"><b>Game by game</b>
            <select class="select-sm gl-season" aria-label="Season for the ${esc(cat.label)} game log">${logged.slice().reverse().map((x) => `<option value="${x.season}">${x.season}</option>`).join('')}</select></div>
            <div class="gamelog-body">${gameLogHTML(catId, latestLogged)}</div>` : ''}
        </div>
      </div>`;
  }

  // The season picker above each game log swaps its table in place.
  function wireGameLogs(contentEl, player) {
    contentEl.querySelectorAll('.gl-season').forEach((sel) => {
      sel.addEventListener('change', () => {
        const body = sel.closest('.card-body');
        const catId = body.dataset.cat;
        const season = player.categories[catId].seasons.find((x) => String(x.season) === sel.value);
        body.querySelector('.gamelog-body').innerHTML = gameLogHTML(catId, season);
      });
    });
  }


  /* ============================================================ Profile == */
  // The Career Stats tab doubles as a player profile: a header, honors (all-conference/region/American,
  // record-book entries, record watch) and strength testing next to the stat tables. Everything here is
  // matched by NAME, which has burned this site before, so every join is guarded: a full-name match alone is
  // not enough -- the honor's year has to fall inside the seasons this player has stats for -- and
  // strength testing joins only through the roster-confirmed athlete_key, never by name.

  const normName = (n) => String(n || '').toLowerCase().replace(/[.'’]/g, '').replace(/\s+/g, ' ').trim();

  function seasonSpan(player) {
    const years = Object.values(player.categories).flatMap((c) => c.seasons.map((x) => Number(x.season))).filter(Number.isFinite);
    return years.length ? { first: Math.min(...years), last: Math.max(...years), count: new Set(years).size } : null;
  }

  // "2012-2014" or "1994" -> [start, end]
  function yearRange(text) {
    const m = String(text || '').match(/(\d{4})(?:\s*[-–]\s*(\d{4}))?/);
    return m ? [Number(m[1]), Number(m[2] || m[1])] : null;
  }

  function honorsFor(player) {
    const span = seasonSpan(player);
    if (!span) return { awards: [], records: [], watch: [] };
    const key = normName(player.display_name);
    const R = Site.data.records;
    const awards = [];
    Object.entries({ AllConference: 'All-Conference', AllRegion: 'All-Region', AllAmerican: 'All-American' }).forEach(([k, label]) => {
      (R.awards[k] || []).forEach((a) => {
        const y = Number(a.year);
        if (normName(a.player) === key && Number.isFinite(y) && y >= span.first && y <= span.last + 1) awards.push({ year: y, text: `${label}${a.recognition && a.recognition !== '--' ? ` — ${a.recognition}` : a.team ? ` — ${a.team}` : ''}${a.affiliation && a.affiliation !== '--' ? ` (${a.affiliation})` : ''}` });
      });
    });
    const records = [];
    [['CareerIndividual', 'Career'], ['SeasonIndividual', 'Single season'], ['SingleGameIndividual', 'Single game']].forEach(([k, scope]) => {
      (R.records[k] || []).forEach((r) => {
        if (normName(r.player) !== key) return;
        const range = r.years ? yearRange(r.years) : r.date ? yearRange(String(r.date).split('/').pop()) : null;
        if (!range || range[1] < span.first || range[0] > span.last) return;
        records.push({ scope, text: `${r.statistic}: ${r.value}${r.rank ? ` (#${r.rank}${r.tied ? ', tied' : ''})` : ''}`, when: r.years || r.date });
      });
    });
    const watch = [];
    ['career', 'season'].forEach((scope) => Object.values(R.record_watch[scope] || {}).forEach((list) => list.forEach((e) => { if (normName(e.player) === key) watch.push({ scope, e }); })));
    return { awards: awards.sort((a, b) => a.year - b.year), records, watch };
  }

  function profileHeaderHTML(player, shownCats) {
    const span = seasonSpan(player);
    const cats = shownCats.map((c) => (CAREER_CATEGORIES[c] || { label: c }).label);
    return `<div class="card wide"><div class="card-body profile-head">
      <div class="avatar" style="background:var(--cat-6);">${esc(initials(player.display_name))}</div>
      <div><div class="profile-name">${esc(player.display_name)}</div>
      <div class="data-note" style="margin:2px 0 0;">${player.position ? `${esc(player.position)} · ` : ''}${span ? `${span.first === span.last ? span.first : `${span.first}–${span.last}`} (${span.count} season${span.count === 1 ? '' : 's'} with stats)` : 'no seasons on record'} · ${esc(cats.join(', ') || 'no stat categories')}</div></div>
    </div></div>`;
  }

  function honorsHTML(player) {
    const h = honorsFor(player);
    if (!h.awards.length && !h.records.length && !h.watch.length) return '';
    const items = [
      ...h.awards.map((a) => `<li><b>${a.year}</b> ${esc(a.text)}</li>`),
      ...h.records.map((r) => `<li><b>Record book</b> · ${esc(r.scope)} ${esc(r.text)} <span class="muted">${esc(r.when || '')}</span></li>`),
      ...h.watch.map(({ scope, e }) => `<li><b>Record watch</b> · ${scope === 'career' ? 'career' : 'this season'} ${esc(e.statistic)}: ${fmt(e.current_value, Number.isInteger(e.current_value) ? 0 : 1)} — ${recordWatchStatusHTML(e)}</li>`),
    ];
    return `<div class="card wide"><div class="card-head"><h2>Honors and records</h2></div><div class="card-body"><ul class="tw-list">${items.join('')}</ul>
      <div class="data-note">Matched by full name and only when the year falls inside this player's seasons on the site.</div></div></div>`;
  }

  // lifting.json is 3 MB, so it is fetched only when a player with a roster-confirmed athlete_key is opened.
  let liftingPromise = null;
  const loadLifting = () => (liftingPromise = liftingPromise || fetch('../data/lifting.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null));

  const LIFT_METRICS = [['Bench', 'lb', true], ['Squat', 'lb', true], ['Clean', 'lb', true], ['Combined Total', 'lb', true], ['Vertical', 'in', true], ['Broad Jump', 'in', true], ['Pro Agility', 'sec', false], ['Weight', 'lb', null]];

  function liftingHTML(player, L) {
    const a = L && L.athletes.find((x) => x.athlete_key === player.athlete_key);
    if (!a) return '';
    const order = new Map(L.sessions.map((s, i) => [s.label, i]));
    const rows = LIFT_METRICS.map(([metric, unit, higherBetter]) => {
      const pts = a.points.filter((p) => p.metric === metric && p.value !== null && order.has(p.session_label)).sort((x, y) => order.get(x.session_label) - order.get(y.session_label));
      if (!pts.length) return null;
      const first = pts[0], latest = pts[pts.length - 1];
      const best = higherBetter === null ? null : pts.reduce((b, p) => ((higherBetter ? p.value > b.value : p.value < b.value) ? p : b), pts[0]);
      const change = pts.length > 1 ? latest.value - first.value : null;
      const cell = (p) => `${fmt(p.value, Number.isInteger(p.value) ? 0 : 1)} <span class="muted">${esc(p.session_label)}</span>`;
      return `<tr><td class="name">${metric} <span class="muted">(${unit})</span></td><td>${cell(first)}</td><td>${cell(latest)}</td><td>${best ? cell(best) : '—'}</td><td>${change === null ? '—' : `${change > 0 ? '+' : ''}${fmt(change, Number.isInteger(change) ? 0 : 1)}`}</td></tr>`;
    }).filter(Boolean);
    if (!rows.length) return '';
    return `<div class="card wide table-card"><div class="card-head"><h2>Strength and testing</h2><span class="data-note">from Lifting &amp; Strength</span></div><div class="card-body flush"><div class="tbl-scroll"><table class="mini">
      <thead><tr><th>Test</th><th>First</th><th>Latest</th><th>Best</th><th>Change</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></div></div>`;
  }

  function playerOptions() {
    return Site.data.career.players
      .slice()
      .sort((a, b) => a.display_name.localeCompare(b.display_name))
      .map((p) => ({ value: p.display_name, label: p.position ? `${p.display_name} (${p.position})` : p.display_name }));
  }

  function findPlayer(name) { return Site.data.career.players.find((p) => p.display_name === name); }

  // Open on players who matter now: most recent season on record first, then most career games --
  // not whoever sorts first alphabetically.
  function defaultPlayers() {
    const score = (p) => {
      const cats = Object.values(p.categories);
      return [Math.max(...cats.flatMap((c) => c.seasons.map((s) => Number(s.season)))), cats.reduce((n, c) => n + (c.career_games || 0), 0)];
    };
    return Site.data.career.players.slice().sort((a, b) => { const [a1, a2] = score(a), [b1, b2] = score(b); return b1 - a1 || b2 - a2; }).map((p) => p.display_name);
  }

  function lookupTab(root, { sub }) {
    root.innerHTML = `
      <section class="panel">
        <div class="body">
          <div class="combo-slot" id="cs-combobox"></div>
          <div class="cards" id="cs-content"></div>
        </div>
        <div class="footer-note">Source: Special Teams Data's raw box-score archive (2010-present) and this site's own data/special-teams.json, aggregated by build_career_stats.py. Rate stats (Avg/Cmp%/FG%) are computed from the summed counting stats, never averaged per-game. Only categories relevant to a player's own roster position are shown; a player with no Lifting Data roster match shows every category they have real stats in instead, since there's no position on file to filter by.</div>
      </section>`;
    const options = playerOptions();
    const contentEl = root.querySelector('#cs-content');

    function render(name) {
      const player = findPlayer(name);
      if (!player) { contentEl.innerHTML = '<div class="insight wide">Search for a player above to see their career stats.</div>'; return; }
      const cats = relevantCategoriesFor(player);
      const top = profileHeaderHTML(player, cats) + honorsHTML(player);
      if (!cats.length) {
        contentEl.innerHTML = `${top}<div class="insight wide">No tracked individual stat categories apply to ${esc(player.display_name)}'s position (${esc(player.position || '—')}) on this site.</div><div id="cs-lifting" class="wide"></div>`;
      } else {
        contentEl.innerHTML = `${top}${cats.map((c) => categoryCardHTML(c, player)).join('')}<div id="cs-lifting" class="wide"></div>`;
      }
      if (player.athlete_key) {
        loadLifting().then((L) => {
          const slot = contentEl.querySelector('#cs-lifting');
          if (slot && contentEl.dataset.player === name) slot.outerHTML = liftingHTML(player, L);
        });
      }
      contentEl.dataset.player = name;
      wireGameLogs(contentEl, player);
      Site.setSub(name);
    }
    const start = findPlayer(sub) ? sub : defaultPlayers()[0]; // #career/<name> opens that player
    makeSearchCombobox(root.querySelector('#cs-combobox'), { options, value: start, onChange: render, placeholder: 'Search player name…' });
    render(start);
  }

  // One category's Stat / Player A / Player B table -- for every category in the UNION
  // of both players' own relevant categories, so comparing 2 players at different
  // positions still shows whatever they genuinely share. A player missing a category
  // shows "—" throughout their column rather than omitting the row.
  function compareCategoryHTML(catId, playerA, playerB) {
    const cat = CAREER_CATEGORIES[catId];
    const a = playerA.categories[catId];
    const b = playerB.categories[catId];
    const rows = cat.cols.map(([key, label]) => `<tr><td class="name">${label}</td><td>${a ? (a.career[key] ?? '—') : '—'}</td><td>${b ? (b.career[key] ?? '—') : '—'}</td></tr>`).join('');
    return `
      <div class="card wide table-card">
        <div class="card-head"><h2>${cat.label}</h2></div>
        <div class="card-body flush">
          <table class="mini">
            <thead><tr><th>Career Total</th><th>${esc(playerA.display_name)}</th><th>${esc(playerB.display_name)}</th></tr></thead>
            <tbody><tr><td class="name">Games</td><td>${a ? a.career_games : '—'}</td><td>${b ? b.career_games : '—'}</td></tr>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function compareTab(root) {
    root.innerHTML = `
      <section class="panel">
        <div class="body">
          <div class="grid2 h2h-pickers">
            <div class="h2h-col"><div class="h2h-head"><div class="avatar" id="cmp-A-avatar" style="background:var(--cat-6);"></div><div class="h2h-sel" id="cmp-A-sel"></div></div></div>
            <div class="h2h-col"><div class="h2h-head"><div class="avatar" id="cmp-B-avatar" style="background:var(--cat-3);"></div><div class="h2h-sel" id="cmp-B-sel"></div></div></div>
          </div>
          <div class="cards" id="cmp-content"></div>
        </div>
        <div class="footer-note">Career totals only -- see Career Stats for a season-by-season breakdown of either player. Only categories relevant to either player's own roster position are compared (see Career Stats' own footer note for what that means for an unmatched player).</div>
      </section>`;
    const options = playerOptions();
    const top = defaultPlayers();
    const state = { a: top[0], b: top[1] || top[0] };

    function render() {
      const playerA = findPlayer(state.a), playerB = findPlayer(state.b);
      root.querySelector('#cmp-A-avatar').textContent = playerA ? initials(playerA.display_name) : '';
      root.querySelector('#cmp-B-avatar').textContent = playerB ? initials(playerB.display_name) : '';
      const contentEl = root.querySelector('#cmp-content');
      if (!playerA || !playerB) { contentEl.innerHTML = '<div class="insight wide">Search for 2 players above to compare their career stats.</div>'; return; }
      const cats = [...new Set([...relevantCategoriesFor(playerA), ...relevantCategoriesFor(playerB)])];
      if (!cats.length) {
        contentEl.innerHTML = `<div class="insight wide">Neither ${esc(playerA.display_name)} nor ${esc(playerB.display_name)} has a tracked individual stat category that applies to their position on this site.</div>`;
        return;
      }
      contentEl.innerHTML = cats.map((c) => compareCategoryHTML(c, playerA, playerB)).join('');
    }
    makeSearchCombobox(root.querySelector('#cmp-A-sel'), { options, value: state.a, onChange: (v) => { state.a = v; render(); }, placeholder: 'Search player name…' });
    makeSearchCombobox(root.querySelector('#cmp-B-sel'), { options, value: state.b, onChange: (v) => { state.b = v; render(); }, placeholder: 'Search player name…' });
    render();
  }


  /* ============================================================ Leaders == */
  // Who is producing in any one season: a top-15 table per stat, and the leader of each headline stat up top.
  // Ranked on the counting stat (yards, tackles, ...), not a rate, so a player with 2 carries can't top a table.
  const LEADER_STATS = [
    ['Rushing', 'net', 'Rushing yards'], ['Passing', 'yds', 'Passing yards'], ['Receiving', 'yds', 'Receiving yards'],
    ['Receiving', 'rec', 'Receptions'], ['Individual Defensive Statistics', 'tot', 'Tackles'], ['Individual Defensive Statistics', 'sacks', 'Sacks'],
    ['Individual Defensive Statistics', 'tfl', 'Tackles for loss'], ['Individual Defensive Statistics', 'int', 'Interceptions'],
    ['KickoffReturn', 'yds', 'Kickoff return yards'], ['PuntReturn', 'yds', 'Punt return yards'], ['PATFG', 'fg_made', 'Field goals made'],
    ['Punting', 'gross_yds', 'Punting yards'], ['Kickoffs', 'att', 'Kickoffs'],
  ];

  function leaderRows(catId, key, season, n) {
    return Site.data.career.players
      .map((p) => { const c = p.categories[catId]; const s = c && c.seasons.find((x) => String(x.season) === String(season)); return s && s[key] > 0 ? { p, s } : null; })
      .filter(Boolean)
      .sort((a, b) => b.s[key] - a.s[key] || (b.s.games || 0) - (a.s.games || 0))
      .slice(0, n);
  }

  function leadersTab(root) {
    const seasons = [...new Set(Site.data.career.players.flatMap((p) => Object.values(p.categories).flatMap((c) => c.seasons.map((x) => String(x.season)))))].sort().reverse();
    const kpi = (catId, key, label) => ({ label, value: ({ season }) => { const [top] = leaderRows(catId, key, season, 1); return top ? [esc(top.p.display_name), `${fmt(top.s[key], Number.isInteger(top.s[key]) ? 0 : 1)} ${key === 'tot' ? 'tackles' : key === 'net' || key === 'yds' ? 'yards' : key}`] : ['—', 'no one this season']; } });
    Site.view(root, {
      selects: [
        { id: 'season', label: 'Season', options: seasons.map((x, i) => ({ value: x, label: i === 0 ? `${x} (latest)` : x })), value: seasons[0] },
        { id: 'stat', label: 'Stat', options: LEADER_STATS.map(([c, k, l], i) => ({ value: String(i), label: l })), value: '0' },
      ],
      source: 'Box scores (2010-present)',
      prepare(st) { return { season: st.season, stat: LEADER_STATS[Number(st.stat)] }; },
      kpis: [kpi('Rushing', 'net', 'Rushing leader'), kpi('Passing', 'yds', 'Passing leader'), kpi('Receiving', 'yds', 'Receiving leader'), kpi('Individual Defensive Statistics', 'tot', 'Tackles leader')],
      intro: ({ season }) => `Season leaders for ${season}. Pick a stat to see the top 15; click a name for that player's full profile.`,
      cards: [{
        title: 'Top 15', wide: true,
        render(el, { season, stat }) {
          const [catId, key, label] = stat;
          const cat = CAREER_CATEGORIES[catId];
          const rows = leaderRows(catId, key, season, 15);
          el.innerHTML = rows.length
            ? Site.tableHTML({
              head: ['#', 'Player', 'Pos', 'G', ...cat.cols.map(([, l]) => l)],
              rows: rows.map(({ p, s }, i) => [String(i + 1), `<a href="#career/${encodeURIComponent(p.display_name)}">${esc(p.display_name)}</a>`, esc(p.position || '—'), String(s.games ?? '—'), ...cat.cols.map(([k]) => (k === key ? `<b>${s[k]}</b>` : String(s[k] ?? '—')))]),
            }) + `<div class="data-note">${esc(label)}, ${esc(season)} — ranked on the counting stat; rate columns (average, percentage) come from the same season's totals.</div>`
            : `<div class="data-note">No one has recorded ${esc(label.toLowerCase())} in ${esc(season)}.</div>`;
        },
      }],
      footer: () => 'Source: Special Teams Data box scores, aggregated by build_career_stats.py (special-teams categories from data/special-teams.json).',
    });
  }

  /* ========================================================= Record Book == */

  const RECORD_BOOK_VIEWS = [
    { id: 'single_game', label: 'Single-Game' },
    { id: 'single_season', label: 'Single-Season (Team)' },
    { id: 'career', label: 'Career (Individual)' },
    { id: 'season', label: 'Single-Season (Individual)' },
  ];

  function groupBySection(rows) {
    const map = new Map();
    rows.forEach((r) => {
      const key = r.section || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return map;
  }

  const recordsTable = (head, body) => `<div class="tbl-scroll"><table class="mini records-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;

  function singleGameHTML(individualRows, teamRows) {
    const iBy = groupBySection(individualRows), tBy = groupBySection(teamRows);
    return [...new Set([...iBy.keys(), ...tBy.keys()])].map((sec) => `
      <div class="record-section-title">${esc(sec)}</div>
      <div class="cards">
        <div class="card table-card"><div class="card-head"><h2>Individual</h2></div><div class="card-body flush">
          ${recordsTable(['Statistic', 'Value', 'Player', 'Opponent', 'Date'], (iBy.get(sec) || []).map((r) => `<tr><td class="name">${blank(r.statistic)}</td><td>${blank(r.value)}</td><td>${blank(r.player)}</td><td>${blank(r.opponent)}</td><td>${blank(r.date)}</td></tr>`).join(''))}
        </div></div>
        <div class="card table-card"><div class="card-head"><h2>Team</h2></div><div class="card-body flush">
          ${recordsTable(['Statistic', 'Value', 'Opponent', 'Date'], (tBy.get(sec) || []).map((r) => `<tr><td class="name">${blank(r.statistic)}</td><td>${blank(r.value)}</td><td>${blank(r.opponent)}</td><td>${blank(r.date)}</td></tr>`).join(''))}
        </div></div>
      </div>`).join('');
  }

  function singleSeasonTeamHTML(rows) {
    return [...groupBySection(rows).entries()].map(([sec, secRows]) => `
      <div class="record-section-title">${esc(sec)}</div>
      <div class="card table-card"><div class="card-body flush">
        ${recordsTable(['Statistic', 'Value', 'Season'], secRows.map((r) => `<tr><td class="name">${blank(r.statistic)}</td><td>${blank(r.value)}</td><td>${blank(r.season)}</td></tr>`).join(''))}
      </div></div>`).join('');
  }

  function leaderboardRecordsHTML(rows) {
    const byCategory = new Map();
    rows.forEach((r) => {
      if (!byCategory.has(r.category)) byCategory.set(r.category, new Map());
      const stats = byCategory.get(r.category);
      if (!stats.has(r.statistic)) stats.set(r.statistic, []);
      stats.get(r.statistic).push(r);
    });
    let html = '';
    byCategory.forEach((stats, category) => {
      html += `<div class="record-section-title">${esc(category)}</div><div class="cards">`;
      stats.forEach((entries, statistic) => {
        html += `
          <div class="card table-card"><div class="card-head"><h2>${esc(statistic)}</h2></div><div class="card-body flush">
            <table class="mini records-table"><thead><tr><th>Rank</th><th>Player</th><th>Value</th><th>Years</th></tr></thead>
            <tbody>${entries.map((e) => `<tr><td>${blank(e.rank_label)}</td><td class="name">${blank(e.player)}</td><td>${blank(e.value)}</td><td>${blank(e.years)}</td></tr>`).join('')}</tbody></table>
          </div></div>`;
      });
      html += '</div>';
    });
    return html;
  }

  function recordBookTab(root, { sub }) {
    root.innerHTML = `
      <section class="panel">
        <div class="body">
          <div class="toolbar-row"><div id="rb-views"></div><button type="button" class="download-btn no-print push-right" id="rb-pdf">&#8595; PDF</button></div>
          <div id="rb-content"></div>
        </div>
        <div class="footer-note">Source: Carroll Athletics' own gopios.com record book (Records &amp; Awards project's scrape of the site's All-Time Records pages). Shown exactly as published, including any real ties.</div>
      </section>`;
    const R = Site.data.records.records;
    const views = {
      single_game: () => singleGameHTML(R.SingleGameIndividual, R.SingleGameTeam),
      single_season: () => singleSeasonTeamHTML(R.SingleSeasonTeam),
      career: () => leaderboardRecordsHTML(R.CareerIndividual),
      season: () => leaderboardRecordsHTML(R.SeasonIndividual),
    };
    const start = views[sub] ? sub : 'single_game';
    const draw = (id) => { root.querySelector('#rb-content').innerHTML = views[id](); };
    Site.pills(root.querySelector('#rb-views'), { options: RECORD_BOOK_VIEWS, value: start, onChange: (id) => { Site.setSub(id); draw(id); } });
    root.querySelector('#rb-pdf').addEventListener('click', () => printPage('Record Book - Carroll Football'));
    draw(start);
  }

  /* ======================================================== Record Watch == */

  const watchRowHTML = (e) => `<tr><td class="name">${esc(e.player)}</td><td>${esc(e.position || '—')}</td><td>${fmt(e.current_value, Number.isInteger(e.current_value) ? 0 : 1)}</td><td>${recordWatchStatusHTML(e)}</td></tr>`;

  // build_records_data.py already filters to active players, drops zero entries, and
  // caps each statistic at 5 (see its GAP_CUTOFF_FRACTION) -- this is pure rendering.
  function watchSectionHTML(entriesByStat, totalLabel) {
    const stats = Object.keys(entriesByStat);
    if (!stats.length) return `<div class="insight">No current player is close enough to a real ${totalLabel.toLowerCase()} record yet to show here.</div>`;
    return stats.map((stat) => `
      <div class="record-section-title">${esc(stat)}</div>
      <div class="card table-card"><div class="card-body flush">
        <table class="mini records-table"><thead><tr><th>Player</th><th>Position</th><th>${totalLabel}</th><th>Status</th></tr></thead>
        <tbody>${entriesByStat[stat].map(watchRowHTML).join('')}</tbody></table>
      </div></div>`).join('');
  }

  const WATCH_VIEWS = [
    { id: 'career', label: 'Career', totalLabel: 'Career Total' },
    { id: 'season', label: 'Single Season', totalLabel: 'Season Total' },
  ];

  function recordWatchTab(root, { sub }) {
    const rw = Site.data.records.record_watch;
    root.innerHTML = `
      <section class="panel">
        <div class="body">
          <div class="toolbar-row"><div id="rw-views"></div></div>
          <div class="insight" style="margin-bottom:14px;">Only players with a real ${rw.current_season} stat-line (still on the team, not just active sometime recently) are shown, and only when they're genuinely within range of the current Top 5 — up to 5 per statistic.</div>
          <div id="rw-content"></div>
        </div>
        <div class="footer-note">Career/season totals from this site's own build_career_stats.py (real box-score archive, 2010-present, joined to the roster). Record book values from the scraped Career/Single-Season leaderboards. Covers Rushing, Passing, Receiving, Interceptions, Tackles, Sacks, Field Goals, PATs, Punting, and Kickoff/Punt Returns — the categories with a real per-player total already built. Rate-stat records (e.g. "Average Yards Per Punt") aren't compared here, only counting stats.</div>
      </section>`;
    const draw = (id) => {
      const view = WATCH_VIEWS.find((v) => v.id === id);
      root.querySelector('#rw-content').innerHTML = watchSectionHTML(rw[view.id], view.totalLabel);
    };
    const start = WATCH_VIEWS.some((v) => v.id === sub) ? sub : 'career';
    Site.pills(root.querySelector('#rw-views'), { options: WATCH_VIEWS, value: start, onChange: (id) => { Site.setSub(id); draw(id); } });
    draw(start);
  }

  /* ===================================================== Awards History == */

  const AWARD_VIEWS = [
    { id: 'AllConference', label: 'All-Conference', cols: [['player', 'Player'], ['year', 'Year'], ['recognition', 'Recognition'], ['conference', 'Conference']] },
    { id: 'AllRegion', label: 'All-Region', cols: [['player', 'Player'], ['year', 'Year'], ['position', 'Position'], ['class_year', 'Class'], ['team', 'Team']] },
    { id: 'AllAmerican', label: 'All-American', cols: [['player', 'Player'], ['year', 'Year'], ['position', 'Position'], ['class_year', 'Class'], ['team', 'Team'], ['affiliation', 'Affiliation']] },
  ];

  function awardsTab(root, { sub }) {
    root.innerHTML = `
      <section class="panel">
        <div class="body">
          <div class="toolbar-row">
            <div id="aw-views"></div>
            <input type="text" class="name-search push-right" id="aw-search" placeholder="Search player name…" autocomplete="off" spellcheck="false" aria-label="Search award winners">
            <button type="button" class="download-btn no-print" id="aw-pdf">&#8595; PDF</button>
          </div>
          <div id="aw-content"></div>
        </div>
        <div class="footer-note">Source: Carroll Athletics' own gopios.com award-winner history (Records &amp; Awards project's scrape). Shown exactly as published, including real historical spelling/formatting quirks in older entries.</div>
      </section>`;
    const state = { view: AWARD_VIEWS.some((v) => v.id === sub) ? sub : 'AllConference' };
    const search = root.querySelector('#aw-search');
    function draw() {
      const view = AWARD_VIEWS.find((v) => v.id === state.view);
      const q = search.value.trim().toLowerCase();
      let rows = Site.data.records.awards[state.view];
      if (q) rows = rows.filter((r) => (r.player || '').toLowerCase().includes(q));
      root.querySelector('#aw-content').innerHTML = `
        <div class="insight" style="margin-bottom:10px;">${rows.length} entries</div>
        <div class="tbl-scroll"><table class="mini records-table">
          <thead><tr>${view.cols.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead>
          <tbody>${rows.map((r) => `<tr>${view.cols.map(([key], i) => `<td${i === 0 ? ' class="name"' : ''}>${esc(r[key] || '—')}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>`;
    }
    Site.pills(root.querySelector('#aw-views'), { options: AWARD_VIEWS, value: state.view, onChange: (id) => { state.view = id; Site.setSub(id); draw(); } });
    search.addEventListener('input', draw);
    root.querySelector('#aw-pdf').addEventListener('click', () => printPage(`${AWARD_VIEWS.find((v) => v.id === state.view).label} - Carroll Football`));
    draw();
  }

  Site.mount({
    nav: 'players',
    title: 'Players & Records',
    lead: "Real per-player career totals from Carroll's box-score archive (2010–present), the program's all-time record book, current players closing in on it, and the full award history.",
    data: { career: '../data/career-stats.json', records: '../data/records.json', home: '../data/home.json' },
    tabs: [
      { id: 'career', label: 'Career Stats', render: lookupTab },
      { id: 'leaders', label: 'Season Leaders', render: leadersTab },
      { id: 'compare', label: 'Compare Players', render: compareTab },
      { id: 'record-book', label: 'Record Book', render: recordBookTab },
      { id: 'record-watch', label: 'Record Watch', render: recordWatchTab },
      { id: 'awards', label: 'Awards History', render: awardsTab },
    ],
  });
})();
