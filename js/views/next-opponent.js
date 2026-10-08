/* Next Opponent: one opponent's game-plan page, the first tab of Opponent Scouting (#next/<opponent>).

   Defaults to the next game on the schedule; any opponent in the archive can be picked, and Home's "Scouting report"
   link opens it directly. "What to expect" and the matchup card come from GameIntel (js/views/game-intel.js); the
   down / distance / zone / score tables reuse the Offense report's scenario builders, which live in scouting.js and
   reach this file through ScoutKit (read when the tab renders, so load order only needs scouting.js to run before
   the page mounts). */
const NextOpponent = (function () {
  const esc = Site.esc;
  const G = () => Site.data.game;

  // One opponent's game-plan page: when/where, the series history, how they attack Carroll's
  // defense by down, how Carroll's offense/defense did against them next to its usual numbers,
  // and their charted defense. Defaults to the next game on the schedule; any opponent in the
  // archive can be picked. #next/<opponent> deep-links (Home's "Scouting report" link).
  const shortDay = (iso) => Site.dayLabel(iso, { weekday: 'short', month: 'short', day: 'numeric' });

  // Their snaps vs Carroll's defense, sliced the same ways the Offense tab does -- the sections
  // that matter for a game plan; the full table and Custom Situation builder live on that tab.
  const NEXT_SECTIONS = ['By Down', 'By Distance', 'By Field Zone', 'By Score Situation'];

  function nextOpponentTab(root, { sub }) {
    const { withScenarioFlags, buildScenarios, scenarioRowHTML, sectionRowHTML, OFFENSE_TABLE_HEAD, scenarioTableWrap, schemeRealRows, emptyFieldNote } = ScoutKit;
    const D = G(), H = Site.data.home, meta = Site.data.meta;
    const { upcoming, options } = GameIntel.opponentOptions();
    const wanted = sub && options.some((o) => o.value === sub) ? sub : null;
    const start = wanted || (upcoming[0] ? upcoming[0].opponent : options[0].value);

    const view = Site.view(root, {
      pathSelect: 'opponent',
      selects: [{ id: 'opponent', label: 'Opponent', options, value: start }],
      source: 'Official play-by-play, box scores',
      actions: [{ label: '&#8595; PDF', onClick: (st) => printPage(`Opponent Scouting - Next Opponent - ${st.opponent} - Carroll Football`) }],
      prepare(st) {
        const opp = st.opponent;
        const game = meta.schedule.find((g) => g.opponent === opp && g.date >= Site.today() && !g.completed) || null;
        const hist = H.history[opp] || [];
        const theirs = opponentOffenseRows().filter((r) => r.opponent === opp);
        const ours = D.offense.official.filter((r) => r.opponent === opp);
        const otherTheirs = opponentOffenseRows().filter((r) => r.opponent !== opp);
        const otherOurs = D.offense.official.filter((r) => r.opponent !== opp);
        const charted = new Set([...theirs, ...ours].map((r) => r.game_label));
        const seasons = [...new Set([...theirs, ...ours].map((r) => r.season))].sort();
        return { opp, game, hist, theirs, ours, otherTheirs, otherOurs, charted, seasons, flagged: withScenarioFlags(theirs), schemeRows: D.offense.plays.filter((r) => r.opponent === opp) };
      },
      kpis: [
        { label: 'Next game', value: ({ game }) => (game ? [shortDay(game.date), `${game.home ? 'Home' : 'Away'}${game.time ? ` · ${game.time}` : ''}${game.conference ? ' · CCIW' : ''}`] : ['—', 'Not on the remaining schedule']) },
        { label: 'Series record', value: ({ hist }) => { const s = seriesRecord(hist); return s ? [`${s.w}–${s.l}`, `since ${s.since}`] : ['—', 'No meetings on record']; } },
        { label: 'Their yards / play', value: ({ theirs, otherTheirs }) => (theirs.length ? [fmt(mean(theirs.map((r) => r.yards))), `others: ${fmt(mean(otherTheirs.map((r) => r.yards)))}`] : ['—', 'not charted']) },
        { label: 'Their run %', value: ({ theirs, otherTheirs }) => { const a = runPassRows(theirs), b = runPassRows(otherTheirs); return a.length ? [pct(rate(a, isRunPlay)), `others: ${pct(rate(b, isRunPlay))}`] : ['—', 'not charted']; } },
        { label: 'Charted games', value: ({ charted, seasons }) => [String(charted.size), seasons.length ? `${seasons[0]}${seasons.length > 1 ? `–${seasons[seasons.length - 1]}` : ''}` : 'none yet'] },
      ],
      intro: ({ opp, game, charted }) => `<b>${game ? `${esc(opp)} · ${shortDay(game.date)}, ${game.home ? 'home' : 'away'}${game.venue ? ` (${esc(game.venue)})` : ''}` : `${esc(opp)} (not on the remaining schedule)`}: what to expect</b>${GameIntel.bulletsHTML(opp)}${charted.size ? '' : '<div class="data-note">No charted games against them yet, so tendencies and results against Carroll are not available.</div>'}`,
      cards: [
        {
          title: 'Matchups (national rank)', wide: true,
          render(el, { opp }) { el.innerHTML = GameIntel.matchupHTML(opp); },
        },
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
            const f1 = (v) => fmt(v, 1), p0 = (v) => pct(v, 0);
            const o = playMetrics(ours), oo = playMetrics(otherOurs), t = playMetrics(theirs), ot = playMetrics(otherTheirs);
            const rows = [
              versusRow('Offense: yards / play', o.ypp, oo.ypp, f1, true),
              versusRow('Offense: success rate', o.success, oo.success, p0, true),
              versusRow('Offense: explosive rate', o.explosive, oo.explosive, p0, true),
              versusRow('Offense: turnover rate', o.turnover, oo.turnover, p0, false),
              versusRow('Defense: yards / play allowed', t.ypp, ot.ypp, f1, false),
              versusRow('Defense: success rate allowed', t.success, ot.success, p0, false),
              versusRow('Defense: explosive rate allowed', t.explosive, ot.explosive, p0, false),
              versusRow('Defense: takeaway rate', t.turnover, ot.turnover, p0, true),
            ];
            el.innerHTML = Site.tableHTML({ head: ['', 'vs this opponent', 'vs all others'], rows, empty: 'No charted games against this opponent.' })
              + '<div class="data-note">Arrows are green when the difference favors Carroll. Small samples (one or two games) swing a lot — read them as hints, not rules.</div>';
          },
        },
        {
          title: 'Their season so far, every category (national rank)', wide: true,
          render(el, { opp }) {
            const T = Site.data.teams, theirs = T.teams[opp], mine = T.teams.Carroll;
            if (!theirs) {
              el.innerHTML = `<div class="data-note">${esc(opp)} is not in the CCIW national-ranking tables (a non-conference team), so there are no season totals to show.</div>`;
              return;
            }
            const show = (row, stat) => (row ? `${stat === 'Pct' ? pct(row.value, 1) : fmt(row.value, stat === 'Avg' ? 2 : 1)} <span class="muted">· #${row.rank}</span>` : '—');
            const sections = { offense: 'Offense', defense: 'Defense', other: 'Turnovers and punting' };
            let body = '';
            Object.entries(sections).forEach(([group, title]) => {
              body += sectionRowHTML(title, 3);
              T.categories.filter((c) => c.group === group).forEach((c) => {
                body += `<tr><td class="name">${esc(c.category)}${c.stat === 'Pct' ? '' : ` <span class="muted">(${esc(c.stat)})</span>`}</td><td>${show(theirs[c.category], c.stat)}</td><td>${show(mine && mine[c.category], c.stat)}</td></tr>`;
              });
            });
            const games = (team) => { const g = Object.values(team || {})[0]; return g ? g.games : 0; };
            el.innerHTML = `${scenarioTableWrap(`<tr><th>Category</th><th>${esc(opp)}</th><th>Carroll</th></tr>`, body)}<div class="data-note">National rank among all Division III teams (#1 is best, for defense too) from the ${esc(T.snapshot_date)} NCAA snapshot. It counts ${games(theirs)} game${games(theirs) === 1 ? '' : 's'} for ${esc(opp)} and ${games(mine)} for Carroll. The NCAA posts the latest results a few days late, so the two can differ by a game.</div>`;
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
          title: 'Go deeper', noPrint: true,
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

    return view;
  }

  return { tab: nextOpponentTab };
})();
