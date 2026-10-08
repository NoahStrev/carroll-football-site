/* Game Plan: the week's whole picture on a page you can print -- the matchup, how the opponent attacks Carroll's
   defense, where Carroll's own calls are easiest to read, the last few meetings, and a blank notes box.

   Nothing new is computed here: it assembles GameIntel (matchups, "what to expect"), the same run/pass and blitz
   analyses the Tells tabs use, and the series history. Opens on the next game on the schedule; any opponent can be
   picked. Mounted as the "Game Plan" tab of Opponent Scouting (#plan/<opponent>). The PDF button prints it; the page
   is laid out to come out as two letter-size pages (see the print rules in css/theme.css). */
const GamePlan = (function () {
  const esc = Site.esc;
  const G = () => Site.data.game;
  const p0 = (v) => pct(v, 0);

  // Most useful rows first, without repeating a situation that is both a lean and a difference.
  function topSituations(analysis, n) {
    const seen = new Set(), out = [];
    [...analysis.differs, ...analysis.predictable].forEach((s) => {
      const key = `${s.group}|${s.label}`;
      if (!seen.has(key)) { seen.add(key); out.push(s); }
    });
    return out.slice(0, n);
  }

  const labelCell = (s) => `${esc(s.label)}<span class="sub-label">${esc(s.group)}</span>`;

  function tab(root, { sub }) {
    const D = G(), H = Site.data.home;
    const { upcoming, options } = GameIntel.opponentOptions();
    const wanted = sub && options.some((o) => o.value === sub) ? sub : null;
    const start = wanted || (upcoming[0] ? upcoming[0].opponent : options[0].value);

    const view = Site.view(root, {
      linkSelects: false,
      selects: [{ id: 'opponent', label: 'Opponent', options, value: start }],
      source: 'Official play-by-play, box scores, NCAA team stats',
      actions: [{ label: '&#8595; PDF', onClick: (st) => printPage(`Game Plan - ${st.opponent} - Carroll Football`) }],
      prepare(st) {
        const opp = st.opponent;
        const game = Site.data.meta.schedule.find((g) => g.opponent === opp && g.date >= Site.today() && !g.completed) || null;
        const teams = Site.data.teams.teams;
        return {
          opp, game, hist: H.history[opp] || [],
          them: teams[opp] || null, us: teams.Carroll || null,
          theirLean: GameIntel.tendencies(opp),
        };
      },
      kpis: [
        { label: 'Game', value: ({ game }) => (game ? [Site.dayLabel(game.date, { weekday: 'short', month: 'short', day: 'numeric' }), `${game.home ? 'Home' : 'Away'}${game.time ? ` · ${game.time}` : ''}${game.conference ? ' · CCIW' : ''}`] : ['—', 'not on the remaining schedule']) },
        { label: 'Series record', value: ({ hist }) => { const w = hist.filter((g) => g.result === 'W').length, l = hist.filter((g) => g.result === 'L').length; return hist.length ? [`${w}–${l}`, `since ${hist[hist.length - 1].season}`] : ['—', 'no meetings on record']; } },
        { label: 'Their scoring offense', value: ({ them }) => { const r = them && them['Scoring Offense']; return r ? [`${fmt(r.value)} ppg`, `#${r.rank} nationally`] : ['—', 'not in the CCIW tables']; } },
        { label: 'Their scoring defense', value: ({ them }) => { const r = them && them['Scoring Defense']; return r ? [`${fmt(r.value)} ppg`, `#${r.rank} nationally`] : ['—', 'not in the CCIW tables']; } },
      ],
      intro: ({ opp }) => `<b>What to expect — ${esc(opp)}</b>${GameIntel.bulletsHTML(opp)}`,
      cards: [
        { title: 'Matchups (national rank)', wide: true, render(el, { opp }) { el.innerHTML = GameIntel.matchupHTML(opp); } },
        {
          title: 'How they attack Carroll\'s defense',
          render(el, { theirLean }) {
            if (!theirLean) { el.innerHTML = '<div class="data-note">No charted snaps from this opponent yet.</div>'; return; }
            const rows = topSituations(theirLean, 6);
            el.innerHTML = rows.length
              ? Site.tableHTML({ head: ['Situation', 'Snaps', 'They run', 'Others run'], rows: rows.map((s) => [labelCell(s), String(s.n), `<b>${p0(s.run)}</b>`, s.runB === null ? '—' : p0(s.runB)]) })
                + '<div class="data-note">Spots where their run/pass call differs from other opponents, or leans one way 65%+ (20+ snaps).</div>'
              : '<div class="data-note">Nothing stands out beyond chance in the charted snaps.</div>';
          },
        },
        {
          title: 'Where Carroll\'s offense is easiest to read',
          render(el) {
            const A = Tells.leanAnalysis(D.offense.official, opponentOffenseRows());
            const rows = topSituations(A, 6);
            el.innerHTML = rows.length
              ? Site.tableHTML({ head: ['Situation', 'Snaps', 'Carroll run', 'Opponents run'], rows: rows.map((s) => [labelCell(s), String(s.n), `<b>${p0(s.run)}</b>`, s.runB === null ? '—' : p0(s.runB)]) })
                + '<div class="data-note">All charted seasons. Your own habits are what an opponent scouts first.</div>'
              : '<div class="data-note">No habit stands out.</div>';
          },
        },
        {
          title: 'Where Carroll\'s defense is easiest to read',
          render(el) {
            const B = Tells.blitzAnalysis(D.defense.plays);
            const rows = B.differs.slice(0, 6);
            el.innerHTML = rows.length
              ? Site.tableHTML({ head: ['Situation', 'Snaps', 'Blitz %', 'vs avg'], rows: rows.map((s) => [labelCell(s), String(s.n), `<b>${p0(s.blitz)}</b>`, `${s.gap > 0 ? '+' : ''}${Math.round(s.gap * 100)} pts`]) })
                + `<div class="data-note">Carroll's overall blitz rate is ${B.p0 === null ? '—' : p0(B.p0)}.</div>`
              : '<div class="data-note">No situation stands out.</div>';
          },
        },
        {
          title: 'Recent meetings',
          render(el, { hist, opp }) {
            el.innerHTML = Site.tableHTML({
              head: ['Date', 'Site', 'Result', 'Score'],
              rows: hist.slice(0, 5).map((g) => [`${g.date.slice(5).replace('-', '/')}/${String(g.season).slice(2)}`, g.home ? 'Home' : 'Away', `<span class="tag ${g.result === 'W' ? 'good' : 'crit'}">${g.result}</span>`, `${g.carroll_pts}–${g.opp_pts}`]),
              empty: `No meetings with ${opp} in the box-score archive.`,
            });
          },
        },
        {
          title: 'Notes', wide: true, printOnly: true,
          render(el) { el.innerHTML = '<div class="notes-lines"><div></div><div></div><div></div><div></div></div>'; },
        },
      ],
      footer: () => `Sources: Game Analysis's OfficialPlayByPlay and Plays sheets (${gameCoverageText(D.games)}), Special Teams Data box scores, NCAA team stats, Schedule. A tell needs 20+ snaps and a gap beyond chance.`,
    });

    const sel = root.querySelector('select.select-sm');
    if (sel) {
      Site.setSub(sel.value);
      sel.addEventListener('change', () => Site.setSub(sel.value));
    }
    return view;
  }

  return { tab };
})();
