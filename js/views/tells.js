/* Tells: where Carroll is most predictable -- surfaced automatically instead of making a coach hunt through
   scenario tables. A "tell" is a situation where the call leans one way strongly enough that an opponent can
   key on it, or where it differs from how everyone else calls the same situation.

   Offense: Carroll's run/pass lean in every down & distance, field zone, score, and situation, next to the
   run/pass lean of opponents' offenses in the same spot (their snaps against Carroll's defense, in the play-by-play).
   Defense: Carroll's blitz rate in each situation against Carroll's own overall blitz rate, and the situations where
   one front is called most of the time (hand-charted calls).

   Small samples are the enemy, so a situation needs 20+ snaps before it can be flagged and the gap has to clear
   a two-proportion z-test (about 90% confidence) -- the same bar for every row, so a flag means "this is probably
   real", not "this happened once". Loaded before game.js, which mounts it as the Tells tab on Offense and Defense. */
const Tells = (function () {
  const esc = Site.esc;
  const G = () => Site.data.game;

  const MIN_FLAG = 20;       // snaps needed (on each side, for a comparison) before a situation is flagged
  const MIN_LEAN = 25;       // snaps needed to call a situation predictable
  const LEAN = 0.65;         // one call this share of the time = predictable
  const Z = 1.645;           // ~90% two-sided


  // The situations to look at. Each is a predicate over one snap; the same list is applied to both sides so
  // the rows line up. `score` only exists on the official play-by-play (the hand-charted sheet has no score).
  function situations({ score }) {
    const list = [];
    DOWNS.forEach((d) => DIST_BUCKETS.forEach((b) => list.push({ group: 'Down & distance', label: `${ordinalDown(d)} & ${b}`, test: (r) => r.down === d && distanceBucket(r.distance) === b })));
    FIELD_ZONES.forEach((z) => list.push({ group: 'Field zone', label: z, test: (r) => r.field_zone === z }));
    SITUATIONS.forEach((s) => list.push({ group: 'Situation', label: s, test: (r) => r.situation === s }));
    if (score) {
      SCORE_BUCKETS.forEach((b) => list.push({ group: 'Score', label: b, test: (r) => scoreBucket(r.score_differential) === b }));
      list.push({ group: 'Clock', label: 'Two-minute drill', test: (r) => !!r.is_two_minute_drill });
    }
    return list;
  }

  // z for two independent proportions, pooled standard error.
  function zTwo(p1, n1, p2, n2) {
    const p = (p1 * n1 + p2 * n2) / (n1 + n2);
    const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
    return se === 0 ? 0 : (p1 - p2) / se;
  }
  // z for one proportion against a known rate.
  function zOne(p, n, p0) {
    const se = Math.sqrt(p0 * (1 - p0) / n);
    return se === 0 ? 0 : (p - p0) / se;
  }

  const pts = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} pts`;
  const note = (t) => `<div class="data-note">${t}</div>`;
  const empty = (t) => `<div class="data-note">${t}</div>`;

  /* ============================================================== offense == */

  function offenseAnalysis(ours, theirs) {
    const all = situations({ score: true }).map((s) => {
      const a = runPassRows(ours.filter(s.test)), b = runPassRows(theirs.filter(s.test));
      const run = a.length ? rate(a, isRunPlay) : null, runB = b.length ? rate(b, isRunPlay) : null;
      const z = a.length >= MIN_FLAG && b.length >= MIN_FLAG ? zTwo(run, a.length, runB, b.length) : 0;
      return { ...s, n: a.length, nb: b.length, run, runB, gap: run !== null && runB !== null ? run - runB : null, z };
    });
    return {
      all,
      differs: all.filter((s) => Math.abs(s.z) >= Z).sort((x, y) => Math.abs(y.z) - Math.abs(x.z)).slice(0, 10),
      predictable: all.filter((s) => s.n >= MIN_LEAN && Math.max(s.run, 1 - s.run) >= LEAN).sort((x, y) => Math.max(y.run, 1 - y.run) - Math.max(x.run, 1 - x.run) || y.n - x.n).slice(0, 10),
    };
  }

  const leanText = (run) => (run >= 0.5 ? `Runs ${Math.round(run * 100)}%` : `Passes ${Math.round((1 - run) * 100)}%`);

  function offenseTab(root) {
    const D = G();
    Site.view(root, {
      filters: { defs: [{ field: 'season', label: 'Season' }], values: D.filters.offense },
      source: 'Official play-by-play',
      actions: [{ label: '&#8595; PDF', onClick: () => printPage('Offense Tells - Carroll Football') }],
      prepare(st) {
        const ours = applyFilters(D.offense.official, st), theirs = applyFilters(opponentOffenseRows(), st);
        return { ours, theirs, ...offenseAnalysis(ours, theirs), rp: runPassRows(ours), rpTheirs: runPassRows(theirs) };
      },
      summary: ({ ours, theirs }) => `${ours.length} Carroll / ${theirs.length} opponent snaps in view`,
      kpis: [
        { label: 'Carroll run %', value: ({ rp, rpTheirs }) => [pct(rate(rp, isRunPlay), 0), `opponents ${pct(rate(rpTheirs, isRunPlay), 0)}`] },
        { label: 'Tells found', glossary: 'Tell', value: ({ differs, predictable }) => [String(new Set([...differs, ...predictable].map((s) => `${s.group}${s.label}`)).size), 'situations flagged below'] },
        { label: 'Most run-heavy spot', value: ({ all }) => { const c = all.filter((s) => s.n >= MIN_LEAN).sort((a, b) => b.run - a.run)[0]; return c ? [`${Math.round(c.run * 100)}%`, `${c.label} (${c.n})`] : ['—', 'not enough snaps']; } },
        { label: 'Most pass-heavy spot', value: ({ all }) => { const c = all.filter((s) => s.n >= MIN_LEAN).sort((a, b) => a.run - b.run)[0]; return c ? [`${Math.round((1 - c.run) * 100)}%`, `${c.label} (${c.n})`] : ['—', 'not enough snaps']; } },
      ],
      intro: 'Where Carroll\'s offense is easiest to read. A situation needs 20+ snaps on both sides and a gap that clears a significance test before it counts as a tell, so a flag means "probably real", not "it happened once".',
      cards: [
        {
          title: 'Most predictable situations', wide: false,
          render(el, { predictable }) {
            el.innerHTML = predictable.length
              ? Site.tableHTML({ head: ['Situation', 'Snaps', 'Carroll', 'Opponents'], rows: predictable.map((s) => [`${esc(s.label)}<span class="sub-label">${esc(s.group)}</span>`, String(s.n), `<b>${leanText(s.run)}</b>`, s.runB === null ? '—' : `runs ${Math.round(s.runB * 100)}%`]) })
                + note(`Spots where Carroll makes the same call ${Math.round(LEAN * 100)}% of the time or more (${MIN_LEAN}+ snaps). An opponent can sit on these.`)
              : empty(`No situation has ${MIN_LEAN}+ snaps with a ${Math.round(LEAN * 100)}% lean in this view.`);
          },
        },
        {
          title: 'Where Carroll differs from opponents',
          render(el, { differs }) {
            el.innerHTML = differs.length
              ? Site.tableHTML({ head: ['Situation', 'Carroll runs', 'Opponents run', 'Gap'], rows: differs.map((s) => [`${esc(s.label)}<span class="sub-label">${esc(s.group)}</span>`, `${Math.round(s.run * 100)}% <span class="muted">(${s.n})</span>`, `${Math.round(s.runB * 100)}% <span class="muted">(${s.nb})</span>`, `<b>${pts(s.gap)}</b>`]) })
                + note('Same situation, other teams\' offenses (their snaps against Carroll\'s defense). A big gap is a habit that is Carroll\'s own, not just the situation.')
              : empty('No situation differs from opponents by enough, with enough snaps, to flag in this view.');
          },
        },
        {
          title: 'Every situation', wide: true,
          render(el, { all }) {
            const rows = all.filter((s) => s.n > 0).map((s) => [`${esc(s.label)}<span class="sub-label">${esc(s.group)}</span>`, String(s.n), s.run === null ? '—' : `${Math.round(s.run * 100)}%`, s.runB === null ? '—' : `${Math.round(s.runB * 100)}% <span class="muted">(${s.nb})</span>`, s.gap === null ? '—' : pts(s.gap), Math.abs(s.z) >= Z ? '<span class="tag crit">tell</span>' : s.n >= MIN_LEAN && Math.max(s.run, 1 - s.run) >= LEAN ? '<span class="tag">lean</span>' : '']);
            el.innerHTML = `<div class="tbl-scroll">${Site.tableHTML({ head: ['Situation', 'Snaps', 'Carroll run %', 'Opponents run %', 'Gap', ''], rows })}</div>`
              + note('"tell" = differs from opponents beyond chance; "lean" = a 65%+ one-way call on 25+ snaps. Run % is the run share of run, pass, and sack snaps (sacks count as passes).');
          },
        },
      ],
      footer: () => `Source: Game Analysis's OfficialPlayByPlay sheet (${gameCoverageText(D.games)}). Opponent figures are opponents' own offenses against Carroll's defense.`,
    });
  }

  /* ============================================================== defense == */

  const blitzed = (r) => r.blitz_d !== null && r.blitz_d !== undefined && r.blitz_d !== '-';
  const chartedBlitz = (rows) => rows.filter((r) => r.blitz_d !== null && r.blitz_d !== undefined);

  function defenseAnalysis(rows) {
    const base = chartedBlitz(rows);
    const p0 = base.length ? rate(base, blitzed) : null;
    const all = situations({ score: false }).map((s) => {
      const a = chartedBlitz(rows.filter(s.test));
      const p = a.length ? rate(a, blitzed) : null;
      const real = rows.filter(s.test).filter((r) => r.front_d && r.front_d !== '-');
      const byFront = groupBy(real, 'front_d');
      const top = topKeysByCount(byFront, 1)[0];
      return {
        ...s, n: a.length, blitz: p, gap: p !== null && p0 !== null ? p - p0 : null,
        z: a.length >= MIN_FLAG && p0 !== null && p0 > 0 && p0 < 1 ? zOne(p, a.length, p0) : 0,
        front: top || null, frontN: real.length, frontShare: top ? byFront.get(top).length / real.length : 0,
      };
    });
    return {
      all, p0, base,
      differs: all.filter((s) => Math.abs(s.z) >= Z && Math.abs(s.gap) >= 0.08).sort((x, y) => Math.abs(y.z) - Math.abs(x.z)).slice(0, 10),
      fronts: all.filter((s) => s.frontN >= MIN_LEAN && s.frontShare >= 0.55).sort((x, y) => y.frontShare - x.frontShare || y.frontN - x.frontN).slice(0, 10),
    };
  }

  function defenseTab(root) {
    const D = G();
    Site.view(root, {
      filters: { defs: [{ field: 'season', label: 'Season' }], values: D.filters.defense || D.filters.offense },
      source: 'Hand-charted plays',
      actions: [{ label: '&#8595; PDF', onClick: () => printPage('Defense Tells - Carroll Football') }],
      prepare(st) {
        const rows = applyFilters(D.defense.plays, st);
        return { rows, ...defenseAnalysis(rows) };
      },
      summary: ({ rows }) => `${rows.length} charted defensive snaps in view`,
      kpis: [
        { label: 'Overall blitz rate', value: ({ p0, base }) => (p0 === null ? ['—', 'no blitz charting'] : [pct(p0, 0), `${base.length} charted snaps`]) },
        { label: 'Blitz tells found', glossary: 'Tell', value: ({ differs }) => [String(differs.length), 'situations flagged'] },
        { label: 'Most blitz-heavy spot', value: ({ all }) => { const c = all.filter((s) => s.n >= MIN_LEAN && s.blitz !== null).sort((a, b) => b.blitz - a.blitz)[0]; return c ? [pct(c.blitz, 0), `${c.label} (${c.n})`] : ['—', 'not enough snaps']; } },
        { label: 'Most front-predictable spot', value: ({ fronts }) => (fronts[0] ? [pct(fronts[0].frontShare, 0), `${fronts[0].front} on ${fronts[0].label}`] : ['—', 'none above 55%']) },
      ],
      intro: 'Where Carroll\'s defense is easiest to read: situations where the blitz rate is far from Carroll\'s own average, and spots where one front is called most of the time. Same bar as the offense tab: 20+ snaps and a gap beyond chance.',
      cards: [
        {
          title: 'Blitz rate vs Carroll\'s own average',
          render(el, { differs, p0 }) {
            el.innerHTML = differs.length
              ? Site.tableHTML({ head: ['Situation', 'Snaps', 'Blitz %', 'vs average'], rows: differs.map((s) => [`${esc(s.label)}<span class="sub-label">${esc(s.group)}</span>`, String(s.n), `<b>${pct(s.blitz, 0)}</b>`, pts(s.gap)]) })
                + note(`Carroll's overall blitz rate in this view is ${pct(p0, 0)}. Rows are situations that differ from it by 8+ points and beyond chance.`)
              : empty('No situation differs from Carroll\'s average blitz rate by enough, with enough snaps, to flag in this view.');
          },
        },
        {
          title: 'Fronts called most of the time',
          render(el, { fronts }) {
            el.innerHTML = fronts.length
              ? Site.tableHTML({ head: ['Situation', 'Snaps', 'Front', 'Share'], rows: fronts.map((s) => [`${esc(s.label)}<span class="sub-label">${esc(s.group)}</span>`, String(s.frontN), esc(s.front), `<b>${pct(s.frontShare, 0)}</b>`]) })
                + note('Spots where one front makes up 55%+ of the real calls (25+ snaps).')
              : empty('No situation has one front above 55% with 25+ snaps in this view.');
          },
        },
        {
          title: 'Every situation', wide: true,
          render(el, { all, p0 }) {
            const rows = all.filter((s) => s.n > 0 || s.frontN > 0).map((s) => [`${esc(s.label)}<span class="sub-label">${esc(s.group)}</span>`, String(s.n), s.blitz === null ? '—' : pct(s.blitz, 0), s.gap === null ? '—' : pts(s.gap), s.front ? `${esc(s.front)} <span class="muted">${pct(s.frontShare, 0)} of ${s.frontN}</span>` : '—', Math.abs(s.z) >= Z && Math.abs(s.gap) >= 0.08 ? '<span class="tag crit">tell</span>' : '']);
            el.innerHTML = `<div class="tbl-scroll">${Site.tableHTML({ head: ['Situation', 'Snaps', 'Blitz %', `vs ${p0 === null ? 'average' : pct(p0, 0)}`, 'Top front', ''], rows })}</div>`
              + note('Blitz % is of snaps where blitz was charted; "—" means nothing charted. Top front is the most common real front call in that situation.');
          },
        },
      ],
      footer: () => `Source: Game Analysis's Plays sheet (hand-charted). Front and blitz names are Carroll's own playbook vocabulary.`,
    });
  }

  // leanAnalysis(a, b): a's run/pass lean by situation against b's (the Next Opponent tab points it at an opponent).
  return { tab: (side) => (side === 'offense' ? offenseTab : defenseTab), leanAnalysis: offenseAnalysis, blitzAnalysis: defenseAnalysis };
})();
