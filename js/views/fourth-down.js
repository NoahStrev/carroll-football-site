/* Fourth Down: how often and where the offense goes for it, and whether it works.

   The official play-by-play has no punt or field-goal snaps, so every 4th-down row is a go-for-it (isFourthTry in
   js/lib/data.js). How OFTEN a team goes is "tries / (tries + punts + field-goal tries)", the kicks counted from how
   drives ended -- close, but a field goal from the 3rd down at the end of a half is counted as a kick.

   Offense: Carroll's own tries. Defense: opponents' tries against Carroll's defense (rows flipped so the score is the
   offense's own, as on the Tells tab). Loaded before game.js, which mounts it as the Fourth Down tab on both pages. */
const FourthDown = (function () {
  const esc = Site.esc;
  const G = () => Site.data.game;
  const p0 = (v) => pct(v, 0);

  const FILTERS = [{ field: 'season', label: 'Season', defaultLatestOnly: true }, { field: 'opponent', label: 'Opponent' }];

  // "Up 7" / "Down 3" / "Tied", from the offense's own side.
  const scoreText = (sd) => (sd === null || sd === undefined ? '—' : sd > 0 ? `Up ${sd}` : sd < 0 ? `Down ${-sd}` : 'Tied');
  const resultTag = (r) => (convertedTry(r) ? '<span class="tag good">Converted</span>' : r.is_turnover ? '<span class="tag crit">Turnover</span>' : '<span class="tag crit">Stopped</span>');
  const none = '<div class="data-note">No fourth-down tries in this view.</div>';

  // [key, rows] for one grouping, in a fixed order, only the groups that have tries.
  function groups(tries, keyFn, order) {
    const by = groupBy(tries.map((r) => ({ ...r, _k: keyFn(r) })).filter((r) => r._k), '_k');
    return order.filter((k) => by.has(k)).map((k) => [k, by.get(k)]);
  }

  function chartCard(title, keyFn, order, color) {
    return {
      title,
      render(el, { tries }) {
        const g = groups(tries, keyFn, order), size = (k) => g.find(([x]) => x === k)[1];
        if (!g.length) { el.innerHTML = none; return; }
        renderBar(el, {
          categories: g.map(([k]) => k), values: g.map(([, rows]) => rate(rows, convertedTry)), labelFmt: (v) => p0(v),
          colorFn: () => cssVar(color), tooltipExtra: (k) => `${size(k).length} tries`,
          xlab2: (k) => `${size(k).filter(convertedTry).length} of ${size(k).length}`,
        });
      },
    };
  }

  function tab(side) {
    const offense = side === 'offense';
    const W = offense
      ? { tries: 'Went for it', rate: 'Converted', go: 'Go-for-it rate', color: '--cat-1', lead: 'Carroll on 4th down' }
      : { tries: 'Opponents went for it', rate: 'Opponents converted', go: 'Opponent go-for-it rate', color: '--cat-2', lead: "Opponents' 4th downs against Carroll's defense" };
    return (root) => {
      const D = G();
      Site.view(root, {
        filters: { defs: FILTERS, values: D.filters[side] },
        source: 'Official play-by-play',
        actions: [{ label: '&#8595; PDF', onClick: () => printPage(`${offense ? 'Offense' : 'Defense'} Fourth Down - Carroll Football`) }],
        prepare(st) {
          const rows = applyFilters(offense ? D.offense.official : opponentOffenseRows(), st);
          const drives = applyFilters(D[side].drives, st);
          const kicks = drives.filter((d) => d.result === 'Punt' || (d.result || '').startsWith('Field Goal')).length;
          const tries = fourthTries(rows);
          return { rows, tries, stats: fourthStats(rows), kicks, decisions: tries.length + kicks };
        },
        summary: ({ tries }) => `${tries.length} fourth-down tries in view`,
        kpis: [
          { label: W.tries, value: ({ stats }) => [String(stats.tries), stats.games ? `${fmt(stats.perGame, 1)} a game over ${stats.games} games` : 'no charted games'] },
          { label: W.rate, dot: offense ? '--good' : '--critical', value: ({ stats }) => [p0(stats.rate), `${stats.made} of ${stats.tries}`] },
          { label: W.go, glossary: 'Go-for-it rate', value: ({ tries, decisions, kicks }) => [decisions ? p0(tries.length / decisions) : '—', `${tries.length} tries, ${kicks} punts and field goals`] },
          { label: 'Average distance to go', value: ({ tries }) => [fmt(mean(tries.map((r) => r.distance)), 1), 'yards, on the tries'] },
        ],
        intro: `${W.lead}. Every fourth-down snap in the play-by-play is a try (punts and field goals are not charted as snaps); a try converts on a first down or touchdown. Samples are small, so read a bar next to its "x of y".`,
        cards: [
          chartCard('Conversion by distance to go', (r) => distanceBucket(r.distance), DIST_BUCKETS, W.color),
          chartCard('Conversion by field zone', (r) => r.field_zone, FIELD_ZONES, W.color),
          {
            title: 'Run or pass',
            render(el, { tries }) {
              const kinds = [['Run', isRunPlay], ['Pass', isPassPlay]].map(([label, test]) => [label, tries.filter(test)]).filter(([, rows]) => rows.length);
              el.innerHTML = kinds.length
                ? Site.tableHTML({ head: ['', 'Tries', 'Converted', 'Rate', 'Yards / try'], rows: kinds.map(([label, rows]) => [label, String(rows.length), String(rows.filter(convertedTry).length), `<b>${p0(rate(rows, convertedTry))}</b>`, fmt(mean(rows.map((r) => r.yards)), 1)]) })
                  + '<div class="data-note">A sack counts as a pass.</div>'
                : none;
            },
          },
          {
            title: 'When it happens',
            render(el, { tries }) {
              const g = groups(tries, (r) => scoreBucket(r.score_differential), SCORE_BUCKETS);
              el.innerHTML = g.length
                ? Site.tableHTML({ head: ['Score', 'Tries', 'Rate'], rows: g.map(([k, rows]) => [k, String(rows.length), `<b>${p0(rate(rows, convertedTry))}</b>`]) })
                  + `<div class="data-note">Score from ${offense ? "Carroll's" : "the opponent's"} side when it went for it.</div>`
                : none;
            },
          },
          {
            title: 'Every fourth-down try', wide: true,
            render(el, { tries }) {
              // newest game first, snaps within a game in the order they happened
              const shown = tries.map((r, i) => ({ r, i })).sort((a, b) => (a.r.date < b.r.date ? 1 : a.r.date > b.r.date ? -1 : a.i - b.i)).slice(0, 60).map((x) => x.r);
              el.innerHTML = Site.tableHTML({
                head: ['Date', offense ? 'Opponent' : 'Opponent offense', 'Qtr', 'Down & dist', 'Field zone', 'Play', 'Yds', 'Score', 'Result'],
                rows: shown.map((r) => [`${r.date.slice(5).replace('-', '/')}/${String(r.season).slice(2)}`, esc(r.opponent), esc(r.quarter), `4th &amp; ${r.is_goal_to_go ? 'Goal' : r.distance}`, esc(r.field_zone || '—'), esc(`${r.play_type}${r.direction ? ` ${r.direction}` : ''}`), String(r.yards ?? '—'), scoreText(r.score_differential), resultTag(r)]),
                empty: 'No fourth-down tries in this view.',
              }) + (tries.length > shown.length ? `<div class="data-note">Showing the latest ${shown.length} of ${tries.length}; narrow the season or opponent to see the rest.</div>` : '');
            },
          },
        ],
        footer: () => `Source: Game Analysis's OfficialPlayByPlay sheet (${gameCoverageText(D.games)}). The go-for-it rate counts punts and field-goal tries from how drives ended; the season and opponent filters apply to it.`,
      });
    };
  }

  return { tab };
})();
