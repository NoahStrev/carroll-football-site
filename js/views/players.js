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
          ${latestLogged ? `<div class="gamelog-head"><b>Game by game</b> <span class="print-only gl-season-print">${esc(latestLogged.season)}</span>
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
        body.querySelector('.gl-season-print').textContent = sel.value;
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
    // Three groups side by side, each showing its first few lines and a "show all" for the rest (a long record
    // list used to push the stat tables far down the page).
    const SHOWN = 4, collapse = (lis) => lis.length > SHOWN + 1; // hiding a single line behind a button is not worth it
    const group = (title, lis) => (lis.length ? `<div class="honor-group"><div class="honor-title">${title} <span class="muted">${lis.length}</span></div>
      <ul class="tw-list">${lis.map((li, i) => (i < SHOWN || !collapse(lis) ? li : li.replace('<li>', '<li class="honor-extra">'))).join('')}</ul>
      ${collapse(lis) ? `<button type="button" class="honor-toggle no-print" aria-expanded="false">Show all ${lis.length}</button>` : ''}</div>` : '');
    const groups = [
      group('Awards', h.awards.map((a) => `<li><b>${a.year}</b> ${esc(a.text)}</li>`)),
      group('Record book', h.records.map((r) => `<li>${esc(r.scope)} ${esc(r.text)} <span class="muted">${esc(r.when || '')}</span></li>`)),
      group('Record watch', h.watch.map(({ scope, e }) => `<li>${scope === 'career' ? 'Career' : 'This season'} ${esc(e.statistic)}: ${fmt(e.current_value, Number.isInteger(e.current_value) ? 0 : 1)} — ${recordWatchStatusHTML(e)}</li>`)),
    ].join('');
    return `<div class="card wide"><div class="card-head"><h2>Honors and records</h2></div><div class="card-body"><div class="honor-groups">${groups}</div>
      <div class="data-note">Matched by full name and only when the year falls inside this player's seasons on the site.</div></div></div>`;
  }

  // "Show all" / "Show fewer" under each honors group (one handler per profile container).
  function wireHonors(contentEl) {
    if (contentEl._honors) return;
    contentEl._honors = true;
    contentEl.addEventListener('click', (e) => {
      const b = e.target.closest('.honor-toggle');
      if (!b) return;
      const g = b.closest('.honor-group'), open = g.classList.toggle('expanded');
      b.setAttribute('aria-expanded', String(open));
      b.textContent = open ? 'Show fewer' : `Show all ${g.querySelectorAll('li').length}`;
    });
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
      wireHonors(contentEl);
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

  Site.mount({
    nav: 'players',
    title: 'Players & Records',
    lead: "Real per-player career totals from Carroll's box-score archive (2010–present), the program's all-time record book, current players closing in on it, and the full award history.",
    data: { career: '../data/career-stats.json', records: '../data/records.json', home: '../data/home.json' },
    tabs: [
      { id: 'career', label: 'Career Stats', render: lookupTab },
      { id: 'leaders', label: 'Season Leaders', render: leadersTab },
      { id: 'compare', label: 'Compare Players', render: compareTab },
      { id: 'record-book', label: 'Record Book', render: RecordsTabs.recordBookTab },
      { id: 'record-watch', label: 'Record Watch', render: RecordsTabs.recordWatchTab },
      { id: 'awards', label: 'Awards History', render: RecordsTabs.awardsTab },
    ],
  });
})();
