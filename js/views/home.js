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

  // A finished season's ranking table has no week number (null, read as -1); a season in progress has weeks 1..n.
  const weekOf = (r) => (r.week === null ? -1 : r.week);
  const latestWeek = (rows) => Math.max(...rows.map(weekOf));

  function rankingsCard(R, season) {
    const latest = (scope) => {
      const rows = R[scope].rows.filter((r) => r.season === season);
      const week = latestWeek(rows);
      const at = (w) => rows.filter((r) => weekOf(r) === w);
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
      note: cc.week < 0
        ? `Final ${season} rankings. <a href="rankings.html">All rankings →</a>`
        : `CCIW through Week ${cc.week}, national through Week ${nat.week}${cc.prev.length ? '; arrows show movement since the week before' : ''}. National figures can trail the CCIW ones by a game while the NCAA posts the latest results. <a href="rankings.html">All rankings →</a>`,
    };
  }


  /* ------------------------------------------------------------------ this week == */

  const dayText = Site.dayLabel;

  // Up to three sentences about a game: the numbers furthest from the earlier-seasons average
  // (offense/defense efficiency, turnovers), each marked good or bad for Carroll. With nothing earlier
  // to compare with (the first season in the archive) it just states the game's own numbers.
  function takeaways(g, P, label) {
    if (!g.charted) return [];
    const o = g.offense, d = g.defense, items = [];
    if (!P) {
      return [
        { good: null, text: `Offense averaged ${fmt(o.ypp)} yards per play, ${pct(o.success, 0)} success rate.` },
        { good: null, text: `Defense allowed ${fmt(d.ypp)} yards per play, ${pct(d.success, 0)} success rate.` },
        { good: null, text: `Turnovers: ${d.turnovers} taken away, ${o.turnovers} given up.` },
      ];
    }
    const rel = (now, base) => (base ? Math.abs(now - base) / base : 0);
    items.push({ w: rel(o.ypp, P.offense.ypp), good: o.ypp >= P.offense.ypp, text: `Offense averaged ${fmt(o.ypp)} yards per play (${label}: ${fmt(P.offense.ypp)}).` });
    items.push({ w: rel(d.ypp, P.defense.ypp), good: d.ypp <= P.defense.ypp, text: `Defense allowed ${fmt(d.ypp)} yards per play (${label}: ${fmt(P.defense.ypp)}).` });
    items.push({ w: rel(o.success, P.offense.success), good: o.success >= P.offense.success, text: `Offense success rate was ${pct(o.success, 0)} (${label}: ${pct(P.offense.success, 0)}).` });
    items.push({ w: rel(d.success, P.defense.success), good: d.success <= P.defense.success, text: `Defense held opponents to a ${pct(d.success, 0)} success rate (${label}: ${pct(P.defense.success, 0)}).` });
    const net = d.turnovers - o.turnovers;
    items.push({ w: Math.abs(net) / 3, good: net >= 0, text: `Turnovers: ${d.turnovers} taken away, ${o.turnovers} given up (${net > 0 ? '+' : ''}${net}).` });
    return items.sort((a, b) => b.w - a.w).slice(0, 3);
  }

  function lastGameCard(B, title) {
    const g = B.games[B.games.length - 1];
    if (!g) return '';
    const tags = takeaways(g, B.prior_stats, B.prior_label);
    return `<div class="card tight">
      <div class="card-head"><h2>${title}</h2><span class="data-note">${dayText(g.date, { month: 'short', day: 'numeric' })}</span></div>
      <div class="card-body">
        <div class="tw-score"><span class="tag ${g.result === 'W' ? 'good' : 'crit'}">${g.result}</span> <b>${g.carroll_pts}–${g.opp_pts}</b> ${g.home ? 'vs' : '@'} ${esc(g.opponent)}</div>
        ${tags.length ? `<ul class="tw-list">${tags.map((t) => `<li class="${t.good === null ? '' : t.good ? 'good' : 'crit'}">${esc(t.text)}</li>`).join('')}</ul>` : `<div class="data-note">This game hasn't been charted yet.</div>`}
      </div>
      <div class="insight card-note"><a href="opponent-scouting.html#review/${g.date}">Full game review →</a></div>
    </div>`;
  }

  // For a finished season: the games that stand out (links to each game's review).
  function highlightsCard(B) {
    const link = (g, text) => `<a href="opponent-scouting.html#review/${g.date}">${text}</a>`;
    const label = (g) => `${g.home ? 'vs' : '@'} ${esc(g.opponent)} <span class="muted">${g.carroll_pts}–${g.opp_pts}</span>`;
    const margin = (g) => g.carroll_pts - g.opp_pts;
    const charted = B.games.filter((g) => g.charted);
    const best = (arr, key, dir) => arr.slice().sort((a, b) => dir * (key(a) - key(b)))[0];
    const items = [];
    if (B.games.length) {
      const win = best(B.games, margin, -1), loss = best(B.games, margin, 1);
      items.push(`Biggest win: ${link(win, label(win))}`);
      if (margin(loss) < 0) items.push(`Toughest loss: ${link(loss, label(loss))}`);
    }
    if (charted.length) {
      const off = best(charted, (g) => g.offense.ypp, -1), def = best(charted, (g) => g.defense.ypp, 1);
      items.push(`Best offensive game: ${link(off, label(off))} <span class="muted">${fmt(off.offense.ypp)} yds/play</span>`);
      items.push(`Best defensive game: ${link(def, label(def))} <span class="muted">${fmt(def.defense.ypp)} allowed/play</span>`);
    }
    return `<div class="card tight">
      <div class="card-head"><h2>Season highlights</h2></div>
      <div class="card-body"><ul class="tw-list">${items.map((t) => `<li>${t}</li>`).join('')}</ul></div>
      <div class="insight card-note">Each game links to its full review.</div>
    </div>`;
  }

  function streakText(s) {
    return `${s.word} the last ${s.streak === 1 ? 'meeting' : `${s.streak} meetings`}`;
  }

  function nextGameCard(H, meta) {
    const today = Site.today();
    const upcoming = meta.schedule.filter((x) => x.date >= today && !x.completed);
    const next = upcoming[0];
    if (!next) {
      return `<div class="card tight"><div class="card-head"><h2>Next game</h2></div><div class="card-body"><div class="data-note">No more games on the schedule${meta.schedule.length ? ' — the regular season is complete.' : '.'}</div></div></div>`;
    }
    const series = seriesRecord(H.history[next.opponent]);
    const rest = upcoming.slice(1, 5).map((x) => `${esc(x.opponent)} <span class="muted">${dayText(x.date, { month: 'short', day: 'numeric' })}</span>`).join(' · ');
    return `<div class="card tight">
      <div class="card-head"><h2>Next game</h2><span class="data-note">${dayText(next.date, { weekday: 'short', month: 'short', day: 'numeric' })}${next.time ? ` · ${esc(next.time)}` : ''}</span></div>
      <div class="card-body">
        <div class="tw-score"><b>${next.home ? 'Home vs' : 'At'} ${esc(next.opponent)}</b> ${next.conference ? '<span class="tag good">CCIW</span>' : '<span class="tag">Non-conference</span>'}</div>
        <div class="data-note" style="margin:2px 0 8px;">${esc(next.venue || '')}${next.city ? `, ${esc(next.city)}` : ''}</div>
        ${series ? `<ul class="tw-list">
          <li>Carroll is <b>${series.w}–${series.l}</b> against ${esc(next.opponent)} since ${series.since}.</li>
          <li>${streakText(series)}, ${series.last.carroll_pts}–${series.last.opp_pts} (${series.last.season}).</li></ul>` : '<div class="data-note">No earlier meetings in the box-score archive.</div>'}
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


  /* ============================================================== compare == */
  // Any two seasons side by side: the record and per-game numbers, offense and defense efficiency, special teams, where
  // Carroll finished in the CCIW, and game-by-game yards per play. The arrow on the left season's number is green when
  // that season was better than the other one.

  // Carroll's CCIW rank for a headline category in a season (the final table for a finished season, the latest week
  // for the current one).
  function cciwRank(R, season, h) {
    if (!h.cciw) return null;
    const rows = R.cciw.rows.filter((r) => r.season === String(season) && r.phase === h.phase && r.category === h.category && (r.metric ?? r.stat) === h.cciw);
    if (!rows.length) return null;
    const week = latestWeek(rows);
    return rows.find((r) => weekOf(r) === week) || null;
  }

  function compareTab(root) {
    const { home: H, rankings: R } = Site.data;
    const keys = Object.keys(H.seasons).sort().reverse(); // newest first
    const a0 = keys[0], b0 = keys[1] || keys[0];
    const f1 = (v) => fmt(v, 1), f2 = (v) => fmt(v, 2), p0 = (v) => pct(v, 0), p1 = (v) => pct(v, 1);
    const charted = (B) => B.games.filter((g) => g.charted).length || 1;

    Site.view(root, {
      selects: [
        { id: 'a', label: 'Season', options: keys.map((k) => ({ value: k, label: k })), value: a0 },
        { id: 'b', label: 'vs', options: keys.map((k) => ({ value: k, label: k })), value: b0 },
      ],
      source: 'Box scores, official play-by-play, rankings',
      actions: [{ label: '&#8595; PDF', onClick: (st) => printPage(`Compare Seasons - ${st.a} vs ${st.b} - Carroll Football`) }],
      prepare(st) { return { A: H.seasons[st.a], B: H.seasons[st.b], a: st.a, b: st.b }; },
      kpis: [
        { label: 'Record', value: ({ A, B, a, b }) => [`${A.record || '—'} vs ${B.record || '—'}`, `${a} vs ${b}`] },
        { label: 'Points per game', value: ({ A, B, a, b }) => [`${fmt(A.season_stats.pts_for_pg)} – ${fmt(A.season_stats.pts_against_pg)}`, `${a} vs ${b}: ${fmt(B.season_stats.pts_for_pg)} – ${fmt(B.season_stats.pts_against_pg)}`] },
        { label: 'Yards per play (off / def)', value: ({ A, B, a, b }) => [`${fmt(A.season_stats.offense.ypp)} / ${fmt(A.season_stats.defense.ypp)}`, `${a} vs ${b}: ${fmt(B.season_stats.offense.ypp)} / ${fmt(B.season_stats.defense.ypp)}`] },
      ],
      cards: [
        {
          title: 'Side by side', wide: true,
          render(el, { A, B, a, b }) {
            const sa = A.season_stats, sb = B.season_stats;
            const perGame = (v, Bk) => (v === null || v === undefined ? null : v / charted(Bk));
            const rankRow = (label, h) => {
              const ra = cciwRank(R, a, h), rb = cciwRank(R, b, h);
              // a lower rank number is better, so flip the sign for the arrow
              return versusRow(label, ra ? -ra.rank : null, rb ? -rb.rank : null, (v) => `#${-v}`, true);
            };
            const rows = [
              versusRow('Points scored per game', sa.pts_for_pg, sb.pts_for_pg, f1, true),
              versusRow('Points allowed per game', sa.pts_against_pg, sb.pts_against_pg, f1, false),
              versusRow('Offense: yards / play', sa.offense.ypp, sb.offense.ypp, f2, true),
              versusRow('Offense: success rate', sa.offense.success, sb.offense.success, p1, true),
              versusRow('Offense: explosive rate', sa.offense.explosive, sb.offense.explosive, p1, true),
              versusRow('Offense: turnovers per game', perGame(sa.offense.turnovers, A), perGame(sb.offense.turnovers, B), f1, false),
              versusRow('Defense: yards / play allowed', sa.defense.ypp, sb.defense.ypp, f2, false),
              versusRow('Defense: success rate allowed', sa.defense.success, sb.defense.success, p1, false),
              versusRow('Defense: explosive rate allowed', sa.defense.explosive, sb.defense.explosive, p1, false),
              versusRow('Defense: takeaways per game', perGame(sa.defense.turnovers, A), perGame(sb.defense.turnovers, B), f1, true),
              versusRow('Special teams: average score', sa.st_score, sb.st_score, f1, true),
              rankRow('CCIW rank: scoring offense', HEADLINES[0]),
              rankRow('CCIW rank: scoring defense', HEADLINES[1]),
              rankRow('CCIW rank: total offense', HEADLINES[2]),
              rankRow('CCIW rank: total defense', HEADLINES[3]),
            ];
            el.innerHTML = Site.tableHTML({ head: ['', a, b], rows })
              + '<div class="data-note">Arrows are green when the left season was better. Efficiency numbers come from the official play-by-play (2021 onward); per-game figures use the games charted that season. Turnovers count offensive and defensive snaps only (a fumble lost on a return is not in the play-by-play). A season in progress is still settling, so early-season ranks swing.</div>';
          },
        },
        ...[['offense', 'Offense: yards per play, game by game'], ['defense', 'Defense: yards allowed per play, game by game']].map(([side, title]) => ({
          title,
          render(el, { A, B, a, b }) {
            const n = Math.max(A.games.length, B.games.length);
            const val = (Bk, i) => { const g = Bk.games[i]; return g && g.charted ? g[side].ypp : null; };
            el.innerHTML = `<div class="legend"><span class="sw"><span class="dot" style="background:var(--cat-1)"></span>${esc(a)}</span><span class="sw"><span class="dot" style="background:var(--cat-2)"></span>${esc(b)}</span></div><div class="gr-slot"></div>`;
            renderGroupedBar(el.querySelector('.gr-slot'), {
              categories: Array.from({ length: n }, (_, i) => `G${i + 1}`),
              valuesA: Array.from({ length: n }, (_, i) => val(A, i)), valuesB: Array.from({ length: n }, (_, i) => val(B, i)),
              colorA: cssVar('--cat-1'), colorB: cssVar('--cat-2'), nameA: a, nameB: b, labelFmt: (v) => fmt(v, 1),
            });
          },
        })),
        {
          title: 'Game by game', wide: true,
          render(el, { A, B, a, b }) {
            const n = Math.max(A.games.length, B.games.length);
            const cell = (g) => (g ? `${g.home ? 'vs' : '@'} ${esc(g.opponent)} <span class="tag ${g.result === 'W' ? 'good' : 'crit'}">${g.result} ${g.carroll_pts}–${g.opp_pts}</span>` : '—');
            el.innerHTML = Site.tableHTML({ head: ['Game', a, b], rows: Array.from({ length: n }, (_, i) => [String(i + 1), cell(A.games[i]), cell(B.games[i])]) });
          },
        },
      ],
      footer: () => 'Season numbers are summaries of the same official play-by-play, special teams, and box-score data the dashboards use.',
    });
  }

  /* --------------------------------------------------------------------- page == */

  const EXPLORE = [
    { href: 'offense.html', title: 'Offense', blurb: 'Efficiency, play-calling, outcomes, the situations where Carroll is easiest to read, and each position group.' },
    { href: 'defense.html', title: 'Defense', blurb: 'What Carroll allows and calls, with line, linebacker, corner, and safety views.' },
    { href: 'special-teams.html', title: 'Special Teams', blurb: 'All five units on one scale, plus every kicker, punter, and snapper.' },
    { href: 'opponent-scouting.html', title: 'Opponent Scouting', blurb: 'A game plan for the next opponent, a recap of any game, and real percentages by down, distance, and field position.' },
    { href: 'rankings.html', title: 'Rankings', blurb: 'CCIW and national rank in every published category, week by week.' },
    { href: 'lifting-strength.html', title: 'Lifting & Strength', blurb: 'Strength and testing leaderboards by class, and athlete comparison.' },
    { href: 'players.html', title: 'Players & Records', blurb: 'Career stats back to 2010 with game-by-game logs, season leaders, the record book, and who is closing in on it.' },
  ];

  function render(root, { sub }) {
    const { home: H, rankings: R, records: REC, meta } = Site.data;
    const seasonKey = H.seasons[sub] ? sub : String(H.season);
    const isCurrent = seasonKey === String(H.season);
    const B = H.seasons[seasonKey];
    const S = B.season_stats, P = B.prior_stats, label = B.prior_label;
    const played = B.games.length;
    const lastGame = B.games[B.games.length - 1];
    // The changelog is a separate script; a typo in it must not take the front page down with it.
    const upd = typeof UPDATES !== 'undefined' ? UPDATES[0] : null;
    const vs = (html) => (P ? html : ''); // nothing earlier to compare with in the first archive season

    const tiles = [
      tile('Record', esc(B.record || '—'), B.conference_record ? `${esc(B.conference_record)} in the CCIW` : `${played} games`),
      tile('Points per game', `${fmt(S.pts_for_pg)} – ${fmt(S.pts_against_pg)}`, `for – against ${vs(deltaHTML(S.pts_for_pg - S.pts_against_pg, P && P.pts_for_pg - P.pts_against_pg, { label: `${label} margin` }))}`),
      tile('Offense · yards / play', fmt(S.offense.ypp), S.offense.plays ? `${pct(S.offense.success)} success ${vs(deltaHTML(S.offense.ypp, P && P.offense.ypp, { label }))}` : 'not charted yet', '--good'),
      tile('Defense · yards allowed / play', fmt(S.defense.ypp), S.defense.plays ? `${pct(S.defense.success)} success allowed ${vs(deltaHTML(S.defense.ypp, P && P.defense.ypp, { label, lowerBetter: true }))}` : 'not charted yet', '--critical'),
      tile('Special teams · avg score', fmt(S.st_score, 1), vs(deltaHTML(S.st_score, P && P.st_score, { digits: 1, label }))),
    ];

    const gameRows = B.games.map((g) => {
      const res = `<span class="tag ${g.result === 'W' ? 'good' : 'crit'}">${g.result} ${g.carroll_pts}–${g.opp_pts}</span>`;
      const off = g.charted ? `${fmt(g.offense.ypp)} <span class="muted">· ${pct(g.offense.success, 0)}</span>` : '—';
      const def = g.charted ? `${fmt(g.defense.ypp)} <span class="muted">· ${pct(g.defense.success, 0)}</span>` : '—';
      return `<tr><td>${g.date.slice(5).replace('-', '/')}</td><td class="name"><a href="opponent-scouting.html#review/${g.date}" title="Game review">${g.home ? 'vs' : '@'} ${esc(g.opponent)}</a></td><td>${res}</td><td>${off}</td><td>${def}</td><td>${fmt(g.st_score, 0)}</td></tr>`;
    }).join('');

    const rank = rankingsCard(R, seasonKey);
    const sideCards = [rank, ...(isCurrent ? [recordWatchCard(REC.record_watch)] : [])];
    const seasons = Object.keys(H.seasons).sort().reverse(); // newest first (a JS object lists numeric-looking keys ascending)

    root.innerHTML = `
      <section class="panel">
        <div class="body">
          <div class="home-season no-print"><label for="home-season" class="pill-label">Season</label>
            <select id="home-season" class="select-sm">${seasons.map((k) => `<option value="${k}"${k === seasonKey ? ' selected' : ''}>${k}${k === String(H.season) ? ' (current)' : ''}</option>`).join('')}</select></div>
          <div class="kpirow-5 home-tiles">${tiles.join('')}</div>
          <div class="cards">${lastGameCard(B, isCurrent ? 'Last game' : 'Final game')}${isCurrent ? nextGameCard(H, meta) : highlightsCard(B)}</div>
          <div class="cards">
            <div class="card table-card wide">
              <div class="card-head"><h2>${seasonKey} season</h2><span class="data-note">Offense / defense: yards per play · success rate. Special teams: avg Value/Score.</span></div>
              <div class="card-body flush"><table class="mini">
                <thead><tr><th>Date</th><th>Opponent</th><th>Result</th><th>Offense</th><th>Defense (allowed)</th><th>Special teams</th></tr></thead>
                <tbody>${gameRows}</tbody>
              </table></div>
            </div>
            ${sideCards.map((c) => `<div class="card table-card"><div class="card-head"><h2>${c.title}</h2></div><div class="card-body flush">${c.html}</div><div class="insight card-note">${c.note}</div></div>`).join('')}
          </div>
          <h2 class="home-heading">Explore</h2>
          <div class="explore-grid">${EXPLORE.map((x) => `<a class="explore-card" href="${x.href}"><b>${x.title}</b><span>${x.blurb}</span></a>`).join('')}</div>
        </div>
        <div class="footer-note">Season numbers are summaries of the same official play-by-play, special teams, and box-score data the dashboards use. ${lastGame ? `${isCurrent ? 'Latest' : 'Final'} game: ${esc(lastGame.opponent)}, ${lastGame.date}. ` : ''}${upd ? `Latest update: <a href="updates.html">v${upd.version} — ${esc(upd.title)}</a> (${esc(upd.date)}).` : ''}</div>
      </section>`;

    root.querySelector('#home-season').addEventListener('change', (e) => {
      Site.setSub(e.target.value === String(H.season) ? '' : e.target.value);
      render(root, { sub: e.target.value });
    });
  }

  Site.mount({
    nav: 'home',
    title: 'Home',
    lead: 'The current season at a glance — and the way into every dashboard.',
    data: { home: '../data/home.json', rankings: '../data/rankings.json', records: '../data/records.json' },
    tabs: [{ id: 'overview', label: 'Overview', render }, { id: 'compare', label: 'Compare Seasons', render: compareTab }],
  });
})();
