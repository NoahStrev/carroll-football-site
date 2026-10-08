/* Game intel: the week's matchup, boiled down. Shared by the Next Opponent tab (a "what to expect" list and a
   matchup card) and the printable Game Plan tab, so both say the same thing.

   Matchups pair each of Carroll's offensive categories with the opponent's matching defensive one (and the
   reverse) using the national ranks from data/team-stats.json (#1 is best, for defense too). A gap of 30+ ranks
   is called an edge for the better side; anything closer is "even" -- national rank among ~240 teams, built on
   only a few games this early in the season, is a rough guide, and the card says so.

   Tendencies come from the same run/pass analysis the Tells tab uses, pointed at the opponent: where their
   run/pass lean differs from how every OTHER opponent calls the same spot (20+ snaps each side, ~90% confidence).

   Needs Site.data.teams (team-stats.json), game (game-data.json), home (home.json), meta (schedule). */
const GameIntel = (function () {
  const esc = Site.esc;
  const EDGE = 30; // ranks

  // [label, Carroll-side/opponent offense category, matching defense category, stat is a percentage]
  const PAIRS = [
    ['Scoring', 'Scoring Offense', 'Scoring Defense', false],
    ['Total yards', 'Total Offense', 'Total Defense', false],
    ['Passing', 'Passing Offense', 'Passing Yards Allowed', false],
    ['Rushing', 'Rushing Offense', 'Rushing Defense', false],
    ['Third down', '3rd Down Conversion Pct', '3rd Down Conversion Pct Defense', true],
    ['Red zone', 'Red Zone Offense', 'Red Zone Defense', true],
  ];

  const cell = (row, isPct) => (row ? `${isPct ? pct(row.value, 1) : fmt(row.value, row.value < 10 && !Number.isInteger(row.value) ? 2 : 1)} <span class="muted">· #${row.rank}</span>` : '—');

  /** Both matchup tables' rows, or null when the opponent isn't in the CCIW national tables. */
  function matchups(opp) {
    const T = Site.data.teams.teams, them = T[opp], us = T.Carroll;
    if (!them || !us) return null;
    const build = (offTeam, defTeam, offName, defName) => PAIRS.map(([label, offCat, defCat, isPct]) => {
      const o = offTeam[offCat], d = defTeam[defCat];
      const gap = o && d ? d.rank - o.rank : null; // positive: the offense out-ranks the defense it faces
      return { label, o, d, isPct, gap, edge: gap === null ? null : gap >= EDGE ? 'offense' : gap <= -EDGE ? 'defense' : 'even', offName, defName };
    });
    return {
      ours: build(us, them, 'Carroll', opp),   // Carroll's offense against their defense
      theirs: build(them, us, opp, 'Carroll'), // their offense against Carroll's defense
    };
  }

  function edgeCell(m, carrollIsOffense) {
    if (m.edge === null) return '—';
    if (m.edge === 'even') return '<span class="muted">even</span>';
    const carrollEdge = (m.edge === 'offense') === carrollIsOffense;
    return `<span class="tag ${carrollEdge ? 'good' : 'crit'}">${carrollEdge ? 'Carroll' : 'Them'}</span>`;
  }

  /** The matchup card's body: two small tables, with a note about how much to trust ranks this early. */
  function matchupHTML(opp) {
    const M = matchups(opp);
    if (!M) return `<div class="data-note">${esc(opp)} is not in the CCIW national-ranking tables, so there is no matchup comparison.</div>`;
    const table = (title, rows, head, carrollIsOffense) => `<div class="matchup-block"><div class="matchup-title">${title}</div>${Site.tableHTML({
      head: ['', head[0], head[1], 'Edge'],
      rows: rows.map((m) => [m.label, cell(m.o, m.isPct), cell(m.d, m.isPct), edgeCell(m, carrollIsOffense)]),
    })}</div>`;
    const T = Site.data.teams;
    return `<div class="matchup-grid">${table("Carroll's offense vs their defense", M.ours, ['Carroll offense', `${esc(opp)} defense`], true)}${table(`${esc(opp)}'s offense vs Carroll's defense`, M.theirs, [`${esc(opp)} offense`, 'Carroll defense'], false)}</div>
      <div class="data-note">National rank among all Division III teams (#1 is best, for defense too), ${esc(T.snapshot_date)} NCAA snapshot. An edge needs a ${EDGE}+ rank gap; early in a season a few games swing ranks a lot, so treat this as a guide.</div>`;
  }

  /** Their run/pass tendencies against Carroll's defense vs how every other opponent calls the same spots. */
  function tendencies(opp) {
    const all = opponentOffenseRows();
    const theirs = all.filter((r) => r.opponent === opp), others = all.filter((r) => r.opponent !== opp);
    if (!theirs.length) return null;
    return Tells.leanAnalysis(theirs, others);
  }

  const pctText = (v) => `${Math.round(v * 100)}%`;

  /** [{ tone: 'good'|'crit'|'', html }] -- the few lines worth reading before the game. */
  function expectBullets(opp) {
    const H = Site.data.home, meta = Site.data.meta, D = Site.data.game;
    const out = [];
    const game = meta.schedule.find((g) => g.opponent === opp && g.date >= Site.today() && !g.completed);
    const hist = H.history[opp] || [];
    if (hist.length) {
      const w = hist.filter((g) => g.result === 'W').length, l = hist.filter((g) => g.result === 'L').length;
      const last = hist[0];
      out.push({ tone: '', html: `Series: Carroll is <b>${w}–${l}</b> since ${hist[hist.length - 1].season}${game ? ` and ${game.home ? 'hosts' : 'travels to'} them ${Site.dayLabel(game.date, { weekday: 'long', month: 'short', day: 'numeric' })}` : ''}. ${last.result === 'W' ? 'Won' : last.result === 'L' ? 'Lost' : 'Tied'} the last meeting ${last.carroll_pts}–${last.opp_pts} (${last.season}).` });
    }
    const M = matchups(opp);
    if (M) {
      const edges = [...M.ours.map((m) => ({ ...m, carroll: m.edge === 'offense', side: 'ours' })), ...M.theirs.map((m) => ({ ...m, carroll: m.edge === 'defense', side: 'theirs' }))]
        .filter((m) => m.edge && m.edge !== 'even')
        .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, 3);
      edges.forEach((m) => {
        const line = m.side === 'ours'
          ? `Carroll's ${m.label.toLowerCase()} offense (#${m.o.rank}) faces their ${m.label.toLowerCase()} defense (#${m.d.rank})`
          : `Their ${m.label.toLowerCase()} offense (#${m.o.rank}) faces Carroll's ${m.label.toLowerCase()} defense (#${m.d.rank})`;
        out.push({ tone: m.carroll ? 'good' : 'crit', html: `${esc(line)}: ${m.carroll ? 'an edge for Carroll' : 'an edge for them'}.` });
      });
    }
    const T = tendencies(opp);
    if (T) {
      T.differs.slice(0, 2).forEach((s) => out.push({ tone: '', html: `${esc(s.label)}: they run <b>${pctText(s.run)}</b> of the time (${s.n} snaps) against Carroll's defense, vs ${pctText(s.runB)} for other opponents in the same spot.` }));
      const lean = T.predictable.find((s) => !T.differs.slice(0, 2).includes(s));
      if (lean) out.push({ tone: '', html: `${esc(lean.label)}: they ${lean.run >= 0.5 ? 'run' : 'pass'} <b>${Math.round(Math.max(lean.run, 1 - lean.run) * 100)}%</b> of the time (${lean.n} snaps).` });
    }
    const ours = D.offense.official.filter((r) => r.opponent === opp), usual = D.offense.official.filter((r) => r.opponent !== opp);
    if (ours.length) {
      const a = playMetrics(ours), b = playMetrics(usual), games = new Set(ours.map((r) => r.game_label)).size;
      out.push({ tone: a.ypp >= b.ypp ? 'good' : 'crit', html: `Carroll's offense has averaged <b>${fmt(a.ypp)}</b> yards a play against them (${games} charted game${games === 1 ? '' : 's'}) vs ${fmt(b.ypp)} against everyone else.` });
    }
    return out;
  }

  function bulletsHTML(opp) {
    const items = expectBullets(opp);
    return items.length ? `<ul class="tw-list">${items.map((b) => `<li class="${b.tone}">${b.html}</li>`).join('')}</ul>` : '<div class="data-note">Not enough data on this opponent yet.</div>';
  }

  /** The opponent <select>: the schedule's remaining games first, then every other opponent on record. */
  function opponentOptions() {
    const H = Site.data.home, meta = Site.data.meta, D = Site.data.game;
    const upcoming = meta.schedule.filter((g) => g.date >= Site.today() && !g.completed);
    const first = new Set(upcoming.map((g) => g.opponent));
    const charted = new Set([...D.offense.official, ...D.defense.official].map((r) => r.opponent));
    const rest = [...new Set([...Object.keys(H.history), ...charted])].filter((o) => !first.has(o)).sort();
    return {
      upcoming,
      options: [
        ...upcoming.map((g) => ({ group: 'On the schedule', value: g.opponent, label: `${Site.dayLabel(g.date)} · ${g.opponent}` })),
        ...rest.map((o) => ({ group: 'All opponents', value: o, label: o })),
      ],
    };
  }

  return { matchups, matchupHTML, tendencies, expectBullets, bulletsHTML, opponentOptions };
})();
