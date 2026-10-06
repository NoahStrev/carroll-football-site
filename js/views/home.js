/* Home: the current season at a glance -- record and scoring, headline efficiency next to the
   prior-seasons average, the game log, where Carroll ranks, who's closing in on a record, and a
   map of the site. Everything here is a summary of numbers the dashboards already show:
   data/home.json (build_home_data.py) for the season, rankings.json and records.json directly. */
(function () {
  const esc = Site.esc;

  // delta vs the prior average: arrow + signed difference, green when better, red when worse.
  // `lowerBetter` flips it for defense (fewer yards allowed is good).
  function deltaHTML(now, prior, { digits = 1, lowerBetter = false, label, pctPoints = false } = {}) {
    if (now === null || prior === null) return '';
    const diff = now - prior;
    if (Math.abs(diff) < Math.pow(10, -digits) / 2) return `<span class="delta">on par with ${label}</span>`;
    const good = lowerBetter ? diff < 0 : diff > 0;
    const shown = pctPoints ? `${(Math.abs(diff) * 100).toFixed(1)} pts` : Math.abs(diff).toFixed(digits);
    return `<span class="delta ${good ? 'good' : 'crit'}">${diff > 0 ? '▲' : '▼'} ${shown} vs ${label}</span>`;
  }

  function tile(label, value, foot, dot) {
    return `<div class="kpi"${dot ? ` style="--kpi-accent:var(${dot})"` : ''}><div class="label">${label}</div><div class="value">${value}</div><div class="foot">${foot}</div></div>`;
  }

  /* ------------------------------------------------------------------ rankings == */

  // The headline categories, with each scope's own metric column (CCIW: metric, National: stat).
  const HEADLINES = [
    { label: 'Scoring Offense', phase: 'offense', category: 'Scoring Offense', cciw: 'AVG/G', national: 'PPG', unit: ' ppg' },
    { label: 'Scoring Defense', phase: 'defense', category: 'Scoring Defense', cciw: 'AVG/G', national: 'Avg', unit: ' ppg' },
    { label: 'Total Offense', phase: 'offense', category: 'Total Offense', cciw: 'AVG/G', national: 'YPG', unit: ' ypg' },
    { label: 'Total Defense', phase: 'defense', category: 'Total Defense', cciw: 'AVG/G', national: 'YPG', unit: ' ypg' },
    { label: 'Passing Offense', phase: 'offense', category: 'Passing Offense', cciw: 'AVG/G', national: 'YPG', unit: ' ypg' },
    { label: 'Rushing Offense', phase: 'offense', category: 'Rushing Offense', cciw: 'YDS/G', national: 'YPG', unit: ' ypg' },
    { label: 'Turnover Margin', phase: 'overall', category: 'Turnover Margin', cciw: null, national: 'Avg', unit: ' per game' },
  ];

  function rankingsCard(R, season) {
    const latest = (scope) => {
      const rows = R[scope].rows.filter((r) => r.season === season);
      const week = Math.max(...rows.map((r) => (r.week === null ? -1 : r.week)));
      const at = (w) => rows.filter((r) => (r.week === null ? -1 : r.week) === w);
      return { rows: at(week), prev: week > 1 ? at(week - 1) : [], week };
    };
    const cc = latest('cciw'), nat = latest('national');
    const find = (rows, h, field) => rows.find((r) => r.phase === h.phase && r.category === h.category && (r.metric ?? r.stat) === field);
    // Rank movement since last week: a lower rank number is better, so improving is "up".
    const moved = (set, h, field, row) => {
      const before = row && find(set.prev, h, field);
      const d = before ? before.rank - row.rank : 0;
      return d ? ` <span class="rk-move ${d > 0 ? 'good' : 'crit'}" title="vs Week ${set.week - 1}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</span>` : '';
    };
    const body = HEADLINES.map((h) => {
      const c = h.cciw ? find(cc.rows, h, h.cciw) : null;
      const n = find(nat.rows, h, h.national);
      const cell = (row, tag) => (row ? `${esc(row.value)} <span class="muted">·</span> ${tag}` : '—');
      return `<tr><td class="name">${h.label}</td><td>${cell(c, c ? rankTag(c.rank, c.out_of) + moved(cc, h, h.cciw, c) : '')}</td><td>${cell(n, n ? `#${n.rank}${moved(nat, h, h.national, n)}` : '')}</td></tr>`;
    }).join('');
    return {
      title: 'Where Carroll ranks', wide: false,
      html: `<table class="mini"><thead><tr><th>Category</th><th>CCIW</th><th>National</th></tr></thead><tbody>${body}</tbody></table>`,
      note: `CCIW through Week ${cc.week}, national through Week ${nat.week}${cc.prev.length ? '; arrows show movement since the week before' : ''}. National figures can trail the CCIW ones by a game while the NCAA posts the latest results. <a href="rankings.html">All rankings →</a>`,
    };
  }


  /* ------------------------------------------------------------------ this week == */

  const dayText = Site.dayLabel;

  // Up to three sentences about the game just played: the numbers furthest from the prior-seasons
  // average (offense/defense efficiency, turnovers), each marked good or bad for Carroll.
  function takeaways(g, P, label) {
    if (!g.charted) return [];
    const o = g.offense, d = g.defense, items = [];
    const rel = (now, base) => (base ? Math.abs(now - base) / base : 0);
    items.push({ w: rel(o.ypp, P.offense.ypp), good: o.ypp >= P.offense.ypp, text: `Offense averaged ${fmt(o.ypp)} yards per play (${label}: ${fmt(P.offense.ypp)}).` });
    items.push({ w: rel(d.ypp, P.defense.ypp), good: d.ypp <= P.defense.ypp, text: `Defense allowed ${fmt(d.ypp)} yards per play (${label}: ${fmt(P.defense.ypp)}).` });
    items.push({ w: rel(o.success, P.offense.success), good: o.success >= P.offense.success, text: `Offense success rate was ${pct(o.success, 0)} (${label}: ${pct(P.offense.success, 0)}).` });
    items.push({ w: rel(d.success, P.defense.success), good: d.success <= P.defense.success, text: `Defense held opponents to a ${pct(d.success, 0)} success rate (${label}: ${pct(P.defense.success, 0)}).` });
    const net = d.turnovers - o.turnovers;
    items.push({ w: Math.abs(net) / 3, good: net >= 0, text: `Turnovers: ${d.turnovers} taken away, ${o.turnovers} given up (${net > 0 ? '+' : ''}${net}).` });
    return items.sort((a, b) => b.w - a.w).slice(0, 3);
  }

  function lastGameCard(H) {
    const g = H.games[H.games.length - 1];
    if (!g) return '';
    const tags = takeaways(g, H.prior_stats, H.prior_label);
    return `<div class="card tight">
      <div class="card-head"><h2>Last game</h2><span class="data-note" style="margin:0;">${dayText(g.date, { month: 'short', day: 'numeric' })}</span></div>
      <div class="card-body">
        <div class="tw-score"><span class="tag ${g.result === 'W' ? 'good' : 'crit'}">${g.result}</span> <b>${g.carroll_pts}–${g.opp_pts}</b> ${g.home ? 'vs' : '@'} ${esc(g.opponent)}</div>
        ${tags.length ? `<ul class="tw-list">${tags.map((t) => `<li class="${t.good ? 'good' : 'crit'}">${esc(t.text)}</li>`).join('')}</ul>` : `<div class="data-note">This game hasn't been charted yet.</div>`}
      </div>
      <div class="insight card-note"><a href="opponent-scouting.html#by-opponent">All games by opponent →</a></div>
    </div>`;
  }

  function streakText(list) {
    let n = 0;
    while (n < list.length && list[n].result === list[0].result) n++;
    return `${list[0].result === 'W' ? 'Won' : list[0].result === 'L' ? 'Lost' : 'Tied'} the last ${n === 1 ? 'meeting' : `${n} meetings`}`;
  }

  function nextGameCard(H, meta) {
    const today = Site.today();
    const upcoming = meta.schedule.filter((x) => x.date >= today && !x.completed);
    const next = upcoming[0];
    if (!next) {
      return `<div class="card tight"><div class="card-head"><h2>Next game</h2></div><div class="card-body"><div class="data-note">No more games on the schedule${meta.schedule.length ? ' — the regular season is complete.' : '.'}</div></div></div>`;
    }
    const hist = H.history[next.opponent] || [];
    const w = hist.filter((x) => x.result === 'W').length, l = hist.filter((x) => x.result === 'L').length;
    const last = hist[0];
    const rest = upcoming.slice(1, 5).map((x) => `${esc(x.opponent)} <span class="muted">${dayText(x.date, { month: 'short', day: 'numeric' })}</span>`).join(' · ');
    return `<div class="card tight">
      <div class="card-head"><h2>Next game</h2><span class="data-note" style="margin:0;">${dayText(next.date, { weekday: 'short', month: 'short', day: 'numeric' })}${next.time ? ` · ${esc(next.time)}` : ''}</span></div>
      <div class="card-body">
        <div class="tw-score"><b>${next.home ? 'Home vs' : 'At'} ${esc(next.opponent)}</b> ${next.conference ? '<span class="tag good">CCIW</span>' : '<span class="tag">Non-conference</span>'}</div>
        <div class="data-note" style="margin:2px 0 8px;">${esc(next.venue || '')}${next.city ? `, ${esc(next.city)}` : ''}</div>
        ${hist.length ? `<ul class="tw-list">
          <li>Carroll is <b>${w}–${l}</b> against ${esc(next.opponent)} since ${hist[hist.length - 1].season}.</li>
          <li>${streakText(hist)}${last ? `, ${last.carroll_pts}–${last.opp_pts} (${last.season})` : ''}.</li></ul>` : '<div class="data-note">No earlier meetings in the box-score archive.</div>'}
      </div>
      <div class="insight card-note"><a href="opponent-scouting.html#next/${encodeURIComponent(next.opponent)}">Scouting report: ${esc(next.opponent)} →</a>${rest ? `<br><span class="muted">Then: ${rest}</span>` : ''}</div>
    </div>`;
  }

  /* ------------------------------------------------------------------- records == */

  function recordWatchCard(rw) {
    // Everyone the record-book already lists -- inside a leaderboard, or about to be -- sorted by how
    // close they are to the next rank (already inside first). build_records_data.py has already filtered
    // to active players and capped the list, so this just picks the most interesting few.
    const entries = [];
    [['career', 'Career'], ['season', 'This season']].forEach(([key, scope]) => {
      Object.entries(rw[key] || {}).forEach(([stat, list]) => list.forEach((e) => {
        const lb = e.leaderboard;
        const i = lb.findIndex((r) => e.current_value >= r.value_numeric);
        const next = i === -1 ? lb[lb.length - 1] : i > 0 ? lb[i - 1] : null;
        const gap = next ? next.value_numeric - e.current_value : 0;
        entries.push({ e, stat, scope, inside: i !== -1, rel: next ? gap / (next.value_numeric || 1) : 0 });
      }));
    });
    entries.sort((a, b) => (b.inside - a.inside) || (a.rel - b.rel));
    // One line per player (their most notable), so a single kicker doesn't fill the list.
    const seen = new Set();
    const top = entries.filter((x) => (seen.has(x.e.player) ? false : seen.add(x.e.player))).slice(0, 5);
    const rows = top.map(({ e, stat, scope }) => `<tr><td class="name">${esc(e.player)}</td><td>${esc(stat)} <span class="muted">· ${scope}</span></td><td>${fmt(e.current_value, Number.isInteger(e.current_value) ? 0 : 1)}</td><td>${recordWatchStatusHTML(e)}</td></tr>`).join('');
    return {
      title: 'Closest to a record', wide: false,
      html: rows ? `<table class="mini"><thead><tr><th>Player</th><th>Record</th><th>Now</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="data-note">No current player is close enough to a record yet.</div>',
      note: '<a href="players.html#record-watch">Full Record Watch →</a>',
    };
  }

  /* --------------------------------------------------------------------- page == */

  const EXPLORE = [
    { href: 'offense.html', title: 'Offense', blurb: 'Efficiency, play-calling, outcomes, and a view for each position group.' },
    { href: 'defense.html', title: 'Defense', blurb: 'What Carroll allows and calls, with line, linebacker, corner, and safety views.' },
    { href: 'special-teams.html', title: 'Special Teams', blurb: 'All five units on one scale, plus every kicker, punter, and snapper.' },
    { href: 'opponent-scouting.html', title: 'Opponent Scouting', blurb: 'Real percentages by down, distance, and field position — theirs and ours.' },
    { href: 'rankings.html', title: 'Rankings', blurb: 'CCIW and national rank in every published category, week by week.' },
    { href: 'lifting-strength.html', title: 'Lifting & Strength', blurb: 'Strength and testing leaderboards by class, and athlete comparison.' },
    { href: 'players.html', title: 'Players & Records', blurb: 'Career stats back to 2010, the record book, and who is closing in on it.' },
  ];

  function render(root) {
    const { home: H, rankings: R, records: REC, meta } = Site.data;
    const S = H.season_stats, P = H.prior_stats, label = H.prior_label;
    const played = H.games.length;
    const lastGame = H.games[H.games.length - 1];
    // The changelog is a separate script; a typo in it must not take the front page down with it.
    const upd = typeof UPDATES !== 'undefined' ? UPDATES[0] : null;

    const record = `${H.record || '—'}`;
    const tiles = [
      tile('Record', record, H.conference_record ? `${esc(H.conference_record)} in the CCIW` : `${played} games`),
      tile('Points per game', `${fmt(S.pts_for_pg)} – ${fmt(S.pts_against_pg)}`, `for – against ${deltaHTML(S.pts_for_pg - S.pts_against_pg, P.pts_for_pg - P.pts_against_pg, { label: `${label} margin` })}`),
      tile('Offense · yards / play', fmt(S.offense.ypp), `${pct(S.offense.success)} success ${deltaHTML(S.offense.ypp, P.offense.ypp, { label })}`, '--good'),
      tile('Defense · yards allowed / play', fmt(S.defense.ypp), `${pct(S.defense.success)} success allowed ${deltaHTML(S.defense.ypp, P.defense.ypp, { label, lowerBetter: true })}`, '--critical'),
      tile('Special teams · avg score', fmt(S.st_score, 1), `${deltaHTML(S.st_score, P.st_score, { digits: 1, label })}`),
    ];

    const gameRows = H.games.map((g) => {
      const res = `<span class="tag ${g.result === 'W' ? 'good' : 'crit'}">${g.result} ${g.carroll_pts}–${g.opp_pts}</span>`;
      const off = g.charted ? `${fmt(g.offense.ypp)} <span class="muted">· ${pct(g.offense.success, 0)}</span>` : '—';
      const def = g.charted ? `${fmt(g.defense.ypp)} <span class="muted">· ${pct(g.defense.success, 0)}</span>` : '—';
      return `<tr><td>${g.date.slice(5).replace('-', '/')}</td><td class="name"><a href="opponent-scouting.html#review/${g.date}" title="Game review">${g.home ? 'vs' : '@'} ${esc(g.opponent)}</a></td><td>${res}</td><td>${off}</td><td>${def}</td><td>${fmt(g.st_score, 0)}</td></tr>`;
    }).join('');

    const rank = rankingsCard(R, String(H.season));
    const watch = recordWatchCard(REC.record_watch);

    root.innerHTML = `
      <section class="panel">
        <div class="body">
          <div class="kpirow-5 home-tiles">${tiles.join('')}</div>
          <div class="cards">${lastGameCard(H)}${nextGameCard(H, meta)}</div>
          <div class="cards">
            <div class="card table-card wide">
              <div class="card-head"><h2>${H.season} season</h2><span class="data-note" style="margin:0;">Offense / defense: yards per play · success rate. Special teams: avg Value/Score.</span></div>
              <div class="card-body flush"><table class="mini">
                <thead><tr><th>Date</th><th>Opponent</th><th>Result</th><th>Offense</th><th>Defense (allowed)</th><th>Special teams</th></tr></thead>
                <tbody>${gameRows}</tbody>
              </table></div>
            </div>
            ${[rank, watch].map((c) => `<div class="card table-card"><div class="card-head"><h2>${c.title}</h2></div><div class="card-body flush">${c.html}</div><div class="insight card-note">${c.note}</div></div>`).join('')}
          </div>
          <h2 class="home-heading">Explore</h2>
          <div class="explore-grid">${EXPLORE.map((x) => `<a class="explore-card" href="${x.href}"><b>${x.title}</b><span>${x.blurb}</span></a>`).join('')}</div>
        </div>
        <div class="footer-note">Season numbers are summaries of the same official play-by-play, special teams, and box-score data the dashboards use. Latest game: ${lastGame ? `${esc(lastGame.opponent)}, ${lastGame.date}` : '—'}. ${upd ? `Latest update: <a href="updates.html">v${upd.version} — ${esc(upd.title)}</a> (${esc(upd.date)}).` : ''}</div>
      </section>`;
  }

  Site.mount({
    nav: 'home',
    title: 'Home',
    lead: 'The current season at a glance — and the way into every dashboard.',
    data: { home: '../data/home.json', rankings: '../data/rankings.json', records: '../data/records.json' },
    tabs: [{ id: 'overview', label: 'Overview', render }],
  });
})();
