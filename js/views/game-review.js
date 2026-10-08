/* Game Review: a one-page recap of any single game -- the post-game counterpart to Next Opponent.

   Pick a game (it opens on the most recent) and see the result, how Carroll's offense and defense
   compared with their usual numbers, yards per play by quarter, how every drive ended, run/pass by
   down, the biggest plays, every turnover, and special teams. "Usual" means every OTHER game in the
   play-by-play archive, so a game is never compared with itself.

   Loaded before scouting.js, which mounts it as the "Game Review" tab (#review/<yyyy-mm-dd>).
   Reads game-data.json (official play-by-play), special-teams.json, and home.json's box-score
   history (the final score for every game). Games without play-by-play still show the result and
   special teams. */
const GameReview = (function () {
  const esc = Site.esc;

  const DRIVE_ORDER = ['Touchdown', 'Field Goal Good', 'Field Goal No Good', 'Punt', 'Turnover', 'Turnover on Downs', 'End of Game'];
  const ST_UNITS = [['punt', 'Punt'], ['punt_return', 'Punt Return'], ['kickoff', 'Kickoff'], ['kickoff_return', 'Kickoff Return'], ['money_unit', 'PAT / Field Goal']];

  const downDist = (r) => (r.down ? `${ordinalDown(r.down)} & ${r.is_goal_to_go ? 'Goal' : r.distance}` : '—');
  const stDate = (d) => { const [m, day, y] = d.split('/'); return `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}`; };

  // Cards built from play-by-play are hidden (not left saying "nothing here") for a game with no charting.
  function gated(el, game) {
    el.closest('.card').hidden = !game.charted;
    return game.charted;
  }

  const gameCount = (rows) => new Set(rows.map((r) => r.game_label)).size;

  // Every game in the play-by-play era, newest first. `charted` says whether play-by-play exists.
  function gameList(H, D) {
    const firstSeason = Math.min(...D.games.map((g) => g.season));
    const charted = new Set(D.games.map((g) => g.date));
    const list = [];
    Object.entries(H.history).forEach(([opponent, games]) => games.forEach((g) => {
      if (g.season >= firstSeason) list.push({ ...g, opponent, charted: charted.has(g.date) });
    }));
    return list.sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  function render(root, { sub }) {
    const D = Site.data.game, H = Site.data.home, ST = Site.data.st;
    const games = gameList(H, D);
    const start = games.some((g) => g.date === sub) ? sub : (games.find((g) => g.charted) || games[0]).date;
    const f1 = (v) => fmt(v, 1), p0 = (v) => pct(v, 0);
    const count = (v) => (Number.isInteger(v) ? String(v) : fmt(v, 1)); // a real score or play count reads as a whole number

    const view = Site.view(root, {
      pathSelect: 'game',
      selects: [{
        id: 'game', label: 'Game', value: start,
        options: games.map((g) => ({ group: `${g.season} season`, value: g.date, label: `${Site.dayLabel(g.date, { month: 'short', day: 'numeric', year: 'numeric' })} · ${g.home ? 'vs' : '@'} ${g.opponent} (${g.result} ${g.carroll_pts}–${g.opp_pts})${g.charted ? '' : ' — result only'}` })),
      }],
      source: 'Official play-by-play, box scores',
      actions: [{ label: '&#8595; PDF', onClick: (st) => printPage(`Game Review - ${st.game} - Carroll Football`) }],
      prepare(st) {
        const game = games.find((g) => g.date === st.game);
        const on = (r) => r.date === game.date;
        const off = D.offense.official.filter(on), def = D.defense.official.filter(on);
        const otherOff = D.offense.official.filter((r) => !on(r)), otherDef = D.defense.official.filter((r) => !on(r));
        const others = games.filter((g) => g.date !== game.date);
        const stRows = (key) => ST.units[key].filter((r) => stDate(r.date) === game.date);
        return {
          game, off, def, otherOff, otherDef, others, stRows,
          offM: playMetrics(off), defM: playMetrics(def), otherOffM: playMetrics(otherOff), otherDefM: playMetrics(otherDef),
          otherGames: Math.max(1, gameCount(otherOff)),
        };
      },
      kpis: [
        { label: 'Result', value: ({ game }) => [`${game.result} ${game.carroll_pts}–${game.opp_pts}`, `${game.home ? 'Home vs' : 'At'} ${game.opponent}`] },
        { label: 'Offense · yards / play', value: ({ game, offM, otherOffM }) => (game.charted ? [fmt(offM.ypp), `usual ${fmt(otherOffM.ypp)}`] : ['—', 'not charted']) },
        { label: 'Defense · yards allowed / play', value: ({ game, defM, otherDefM }) => (game.charted ? [fmt(defM.ypp), `usual ${fmt(otherDefM.ypp)}`] : ['—', 'not charted']) },
        { label: 'Turnover margin', value: ({ game, offM, defM }) => { if (!game.charted) return ['—', 'not charted']; const net = defM.turnovers - offM.turnovers; return [`${net > 0 ? '+' : ''}${net}`, `${defM.turnovers} taken · ${offM.turnovers} given`]; } },
        { label: 'Special teams · avg score', value: ({ stRows }) => { const all = ST_UNITS.flatMap(([k]) => stRows(k).map((r) => r.score)); return all.length ? [fmt(mean(all)), `${all.length} plays`] : ['—', 'no plays']; } },
      ],
      intro: ({ game }) => (game.charted
        ? `${esc(game.opponent)}, ${Site.dayLabel(game.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}. Everything below is compared with the usual numbers from every other game in the play-by-play archive. <a href="#next/${encodeURIComponent(game.opponent)}">Scouting report for ${esc(game.opponent)} →</a>`
        : `${esc(game.opponent)}, ${Site.dayLabel(game.date, { month: 'long', day: 'numeric', year: 'numeric' })}. This game has no play-by-play charting on the site, so only the result and special teams are shown.`),
      cards: [
        {
          title: 'This game vs the usual',
          render(el, { game, off, def, offM, defM, otherOffM, otherDefM, otherGames, others }) {
            if (!gated(el, game)) return;
            const perGame = (n) => n / otherGames;
            const usualPts = (key) => mean(others.map((g) => g[key]));
            const rows = [
              versusRow('Points scored', game.carroll_pts, usualPts('carroll_pts'), count, true),
              versusRow('Offense: plays', offM.plays, perGame(otherOffM.plays), count, true),
              versusRow('Offense: yards / play', offM.ypp, otherOffM.ypp, f1, true),
              versusRow('Offense: success rate', offM.success, otherOffM.success, p0, true),
              versusRow('Offense: explosive rate', offM.explosive, otherOffM.explosive, p0, true),
              versusRow('Offense: run %', offM.runPct, otherOffM.runPct, p0, true),
              versusRow('Points allowed', game.opp_pts, usualPts('opp_pts'), count, false),
              versusRow('Defense: plays faced', defM.plays, perGame(otherDefM.plays), count, null),
              versusRow('Defense: yards / play allowed', defM.ypp, otherDefM.ypp, f1, false),
              versusRow('Defense: success rate allowed', defM.success, otherDefM.success, p0, false),
              versusRow('Defense: explosive rate allowed', defM.explosive, otherDefM.explosive, p0, false),
              versusRow('Opponent run %', defM.runPct, otherDefM.runPct, p0, null),
            ];
            el.innerHTML = Site.tableHTML({ head: ['', 'This game', 'Usual'], rows })
              + '<div class="data-note">Arrows are green when the difference favors Carroll. "Usual" is the average of every other charted game; for play counts it is per game. The opponent run % has no good or bad direction, so its arrow is plain.</div>';
          },
        },
        {
          title: 'Yards per play by quarter',
          render(el, { game, off, def }) {
            if (!gated(el, game)) return;
            const qs = QUARTERS.filter((q) => off.some((r) => r.quarter === q) || def.some((r) => r.quarter === q));
            const val = (rows, q) => mean(rows.filter((r) => r.quarter === q).map((r) => r.yards));
            el.innerHTML = `<div class="legend"><span class="sw"><span class="dot" style="background:var(--cat-1)"></span>Carroll offense</span><span class="sw"><span class="dot" style="background:var(--cat-2)"></span>Allowed by defense</span></div><div class="gr-slot"></div>`;
            renderGroupedBar(el.querySelector('.gr-slot'), {
              categories: qs, valuesA: qs.map((q) => val(off, q)), valuesB: qs.map((q) => val(def, q)),
              colorA: cssVar('--cat-1'), colorB: cssVar('--cat-2'), nameA: 'Carroll offense', nameB: 'Allowed by defense',
              labelFmt: (v) => fmt(v, 1), countsA: qs.map((q) => off.filter((r) => r.quarter === q).length), countsB: qs.map((q) => def.filter((r) => r.quarter === q).length),
            });
          },
        },
        {
          title: 'How every drive ended',
          render(el, { game, off, def }) {
            if (!gated(el, game)) return;
            const drives = (rows) => [...groupBy(rows.filter((r) => r.drive_num !== null && r.drive_num !== undefined), 'drive_num').values()].map((d) => d[0].drive_result || 'Other');
            const mine = drives(off), theirs = drives(def);
            const kinds = [...DRIVE_ORDER, ...new Set([...mine, ...theirs].filter((k) => !DRIVE_ORDER.includes(k)))].filter((k) => mine.includes(k) || theirs.includes(k));
            const rows = kinds.map((k) => [k, String(mine.filter((x) => x === k).length), String(theirs.filter((x) => x === k).length)]);
            rows.push([`<b>Total drives</b>`, `<b>${mine.length}</b>`, `<b>${theirs.length}</b>`]);
            el.innerHTML = Site.tableHTML({ head: ['Result', 'Carroll drives', 'Opponent drives'], rows });
          },
        },
        {
          title: 'Run / pass by down',
          render(el, { game, off, def, otherOff, otherDef }) {
            if (!gated(el, game)) return;
            const runPct = (rows, d) => playMetrics(rows.filter((r) => r.down === d)).runPct;
            const cell = (rows, other, d) => { const a = runPct(rows, d), b = runPct(other, d); return `${a === null ? '—' : p0(a)} <span class="muted">(usual ${b === null ? '—' : p0(b)})</span>`; };
            const rows = DOWNS.map((d) => [`${ordinalDown(d)} down`, cell(off, otherOff, d), cell(def, otherDef, d)]);
            el.innerHTML = Site.tableHTML({ head: ['', 'Carroll run %', 'Opponent run %'], rows })
              + '<div class="data-note">Run share of run, pass, and sack snaps (sacks count as passes).</div>';
          },
        },
        {
          title: 'Biggest plays',
          render(el, { game, off, def }) {
            if (!gated(el, game)) return;
            const top = (rows) => rows.filter((r) => r.yards !== null && !r.is_penalty).sort((a, b) => b.yards - a.yards).slice(0, 5);
            const line = (side) => (r) => [side, r.quarter, downDist(r), esc(`${r.play_type}${r.direction ? ` ${r.direction}` : ''}`), `${r.yards}${r.is_touchdown ? ' TD' : ''}`];
            el.innerHTML = Site.tableHTML({ head: ['', 'Qtr', 'Down & dist', 'Play', 'Yds'], rows: [...top(off).map(line('Carroll')), ...top(def).map(line('Opponent'))] });
          },
        },
        {
          title: 'Turnovers',
          render(el, { game, off, def }) {
            if (!gated(el, game)) return;
            const line = (who) => (r) => [who, r.quarter, downDist(r), esc(r.play_outcome || r.play_type), esc(r.field_zone || '—')];
            const rows = [...off.filter((r) => r.is_turnover).map(line('Carroll gave away')), ...def.filter((r) => r.is_turnover).map(line('Carroll took away'))]
              .sort((a, b) => QUARTERS.indexOf(a[1]) - QUARTERS.indexOf(b[1]));
            el.innerHTML = Site.tableHTML({ head: ['', 'Qtr', 'Down & dist', 'Type', 'Where'], rows, empty: 'No turnovers in this game.' });
          },
        },
        {
          title: 'Special teams',
          render(el, { game, stRows }) {
            const rows = ST_UNITS.map(([key, label]) => {
              const mine = stRows(key).map((r) => r.score);
              const usual = ST.units[key].filter((r) => stDate(r.date) !== game.date).map((r) => r.score);
              return versusRow(label, mean(mine), mean(usual), (v) => fmt(v, 1), true).concat([String(mine.length)]);
            }).filter((r) => r[3] !== '0');
            el.innerHTML = rows.length
              ? Site.tableHTML({ head: ['Unit', 'Avg score', 'Usual', 'Plays'], rows })
                + '<div class="data-note">Value/Score on the same scale as the Special Teams page; "usual" is every other game since 2021.</div>'
              : '<div class="data-note">No special teams plays recorded for this game.</div>';
          },
        },
      ],
      footer: () => `Source: Game Analysis's OfficialPlayByPlay sheet (${gameCoverageText(D.games)}), Special Teams Data box scores and Value/Score. Turnover margin is takeaways minus giveaways.`,
    });

    return view;
  }

  return { render };
})();
