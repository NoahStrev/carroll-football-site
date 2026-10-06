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

  function categoryCardHTML(catId, player) {
    const cat = CAREER_CATEGORIES[catId];
    const catData = player.categories[catId];
    const seasonRows = catData.seasons.map((s) => `<tr><td>${s.season}</td><td>${s.games}</td>${cat.cols.map(([key]) => `<td>${s[key] ?? '—'}</td>`).join('')}</tr>`).join('');
    return `
      <div class="card wide table-card">
        <div class="card-head"><h3>${cat.label}</h3><span class="data-note" style="margin:0;">${catData.career_games} games</span></div>
        <div class="card-body flush">
          <div class="tbl-scroll"><table class="mini">
            <thead><tr><th>Season</th><th>Games</th>${cat.cols.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead>
            <tbody>
              ${seasonRows}
              <tr class="total-row"><td>Career</td><td>${catData.career_games}</td>${cat.cols.map(([key]) => `<td>${catData.career[key] ?? '—'}</td>`).join('')}</tr>
            </tbody>
          </table></div>
        </div>
      </div>`;
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

  function lookupTab(root) {
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
      if (!cats.length) {
        contentEl.innerHTML = `<div class="insight wide">No tracked individual stat categories apply to ${esc(player.display_name)}'s position (${esc(player.position || '—')}) on this site.</div>`;
        return;
      }
      contentEl.innerHTML = cats.map((c) => categoryCardHTML(c, player)).join('');
    }
    const start = defaultPlayers()[0];
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
        <div class="card-head"><h3>${cat.label}</h3></div>
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
        <div class="card table-card"><div class="card-head"><h3>Individual</h3></div><div class="card-body flush">
          ${recordsTable(['Statistic', 'Value', 'Player', 'Opponent', 'Date'], (iBy.get(sec) || []).map((r) => `<tr><td class="name">${blank(r.statistic)}</td><td>${blank(r.value)}</td><td>${blank(r.player)}</td><td>${blank(r.opponent)}</td><td>${blank(r.date)}</td></tr>`).join(''))}
        </div></div>
        <div class="card table-card"><div class="card-head"><h3>Team</h3></div><div class="card-body flush">
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
          <div class="card table-card"><div class="card-head"><h3>${esc(statistic)}</h3></div><div class="card-body flush">
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
    data: { career: '../data/career-stats.json', records: '../data/records.json' },
    tabs: [
      { id: 'career', label: 'Career Stats', render: lookupTab },
      { id: 'compare', label: 'Compare Players', render: compareTab },
      { id: 'record-book', label: 'Record Book', render: recordBookTab },
      { id: 'record-watch', label: 'Record Watch', render: recordWatchTab },
      { id: 'awards', label: 'Awards History', render: awardsTab },
    ],
  });
})();
