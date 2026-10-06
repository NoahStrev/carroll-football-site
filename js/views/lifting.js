/* Lifting & Strength: offseason strength + athletic-testing leaderboards (one group
   at a time: All Time, Last Session, or a single class) and athlete comparison.
   Data: data/lifting.json (build_lifting_data.py). */
(function () {
  const esc = Site.esc;
  let D = null;

  // Strength Score/Athleticism Score are team-scope percentile composites; Broad Jump/
  // Vertical/Pro Agility are raw athletic testing. Position-scope scores are left out
  // of this page on purpose (see README).
  const STRENGTH_METRICS = ['Combined Total', 'Bench', 'Squat', 'Clean', 'Strength Score (Team)'];
  const ATHLETIC_METRICS = ['Broad Jump', 'Vertical', 'Pro Agility', 'Athleticism Score (Team)'];
  const METRIC_UNITS = {
    'Combined Total': 'lbs', Bench: 'lbs', Squat: 'lbs', Clean: 'lbs', Weight: 'lbs', Height: 'in',
    'Strength Score (Team)': '', 'Athleticism Score (Team)': '', 'Broad Jump': 'in', Vertical: 'in', 'Pro Agility': 's',
  };
  // Pro Agility is a timed sprint -- lower is faster/better, the one metric here that
  // isn't "bigger number wins" (matches Lifting Data's own z-score convention).
  const LOWER_IS_BETTER = new Set(['Pro Agility']);
  const metricLabel = (metric, v) => `${fmt(v, metric === 'Pro Agility' ? 2 : 1)}${METRIC_UNITS[metric] || ''}`;

  /* ------------------------------------------------------------ leaderboards --- */

  // Rank is assigned from the FULL sorted list before any name-search filtering, so a
  // search match still shows their real standing rather than "1" because they were the
  // only row left. Every qualifying athlete is listed (scrolled, not truncated to a top-N).
  function leaderboardCard(title, rows, query) {
    const lowerBetter = LOWER_IS_BETTER.has(title);
    const ranked = [...rows].sort((a, b) => (lowerBetter ? a.value - b.value : b.value - a.value)).map((r, i) => ({ ...r, rank: i + 1 }));
    const q = (query || '').trim().toLowerCase();
    const shown = q ? ranked.filter((r) => `${r.first_name} ${r.last_name}`.toLowerCase().includes(q)) : ranked;
    if (!shown.length) {
      // While searching, a metric with no name match is skipped rather than rendered
      // as an empty card -- a wall of empty cards isn't the answer someone's looking for.
      return q ? '' : `<div class="card"><div class="card-head"><h2>${title}</h2></div><div class="lb-empty">No qualifying sessions.</div></div>`;
    }
    const body = shown.map((r) => `
      <tr><td><span class="lb-rank">${r.rank}</span></td>
      <td class="name">${esc(r.first_name)} ${esc(r.last_name)}<span class="lb-session">${esc(r.session_label)}</span></td>
      <td class="lb-value">${metricLabel(title, r.value)}</td></tr>`).join('');
    return `
      <div class="card">
        <div class="card-head"><h2>${title}</h2><span class="count">${shown.length}${q && shown.length !== ranked.length ? ` of ${ranked.length}` : ''}</span></div>
        <div class="card-body lb-scroll-wrap"><table class="mini lb-scroll">
          <thead><tr><th></th><th>Athlete · session</th><th style="text-align:right;">Value</th></tr></thead>
          <tbody>${body}</tbody>
        </table></div>
      </div>`;
  }

  // One row per athlete -- their single best session for the metric (lowest time for
  // Pro Agility, highest value for everything else). A class group (e.g. Seniors) spans
  // several testing sessions per athlete, so without this one athlete could hold
  // several ranks on the same leaderboard.
  function bestPerAthlete(rows, metric) {
    const lowerBetter = LOWER_IS_BETTER.has(metric);
    const byAthlete = new Map();
    rows.forEach((r) => {
      const cur = byAthlete.get(r.athlete_key);
      if (!cur || (lowerBetter ? r.value < cur.value : r.value > cur.value)) byAthlete.set(r.athlete_key, r);
    });
    return [...byAthlete.values()];
  }

  // Row set per metric for each selectable group.
  const GROUP_ROWS = {
    all: (metric, pos) => bestPerAthlete(applyFilters(D.leaderboard_rows.filter((r) => r.metric === metric), { position: pos }), metric),
    // Last Session is one session per athlete already.
    last: (metric, pos) => applyFilters(D.leaderboard_rows.filter((r) => r.metric === metric && r.is_last_session), { position: pos }),
    byClass: (cls) => (metric, pos) => bestPerAthlete(applyFilters(D.leaderboard_rows.filter((r) => r.class === cls && r.metric === metric), { position: pos }), metric),
  };

  function groups() {
    return [
      { id: 'all-time', label: 'All Time', rows: GROUP_ROWS.all },
      { id: 'last-session', label: `Last Session (${D.last_session.label})`, rows: GROUP_ROWS.last },
      { id: 'senior', label: 'Seniors', rows: GROUP_ROWS.byClass('Senior') },
      { id: 'junior', label: 'Juniors', rows: GROUP_ROWS.byClass('Junior') },
      { id: 'sophomore', label: 'Sophomores', rows: GROUP_ROWS.byClass('Sophomore') },
      { id: 'freshman', label: 'Freshmen', rows: GROUP_ROWS.byClass('Freshman') },
    ];
  }

  function leaderboardsTab(root, { sub }) {
    const all = groups();
    const state = { group: all.some((g) => g.id === sub) ? sub : 'all-time' };
    const footerYears = [...new Set(D.sessions.map((s) => s.football_year))].sort();
    root.innerHTML = `
      <div class="subbar"><span id="lb-groups"></span></div>
      <section class="panel">
        <div class="shelf"><span class="shelf-filters" id="lb-shelf"></span></div>
        <div class="body" id="lb-body"></div>
        <div class="footer-note">Source: Lifting Data project's Strength (Combined Total/Bench/Squat/Clean/Strength Score) and Athletic Testing (Broad Jump/Vertical/Pro Agility/Athleticism Score) metrics — best value per athlete per session, ${footerYears.length} football years (${footerYears[0]} through ${footerYears[footerYears.length - 1]}). Class-year groups (Seniors … Freshmen) are derived from years-with-program, which is only populated from 2023-24 onward, so 2021-22 and 2022-23 sessions appear only under All Time / Last Session.</div>
      </section>`;

    const positions = [...new Set(D.leaderboard_rows.map((r) => r.position).filter(Boolean))].sort();
    const defs = [{ field: 'position', label: 'Position' }];
    root.querySelector('#lb-shelf').innerHTML = `${buildFilterPanel('lb', defs, { position: positions })}<input type="text" class="name-search" id="lb-namesearch" placeholder="Search player name…" autocomplete="off" spellcheck="false" aria-label="Search player name">`;
    wireFilterPanel('lb', defs, draw);
    root.querySelector('#lb-namesearch').addEventListener('input', draw);
    Site.pills(root.querySelector('#lb-groups'), { options: all, value: state.group, onChange: (id) => { state.group = id; Site.setSub(id); draw(); } });

    function section(label, metrics, group, pos, q) {
      return `<div class="lbgrid-label">${label}</div><div class="lbgrid">${metrics.map((m) => leaderboardCard(m, group.rows(m, pos), q)).join('')}</div>`;
    }
    function draw() {
      const group = all.find((g) => g.id === state.group);
      const pos = readFilterState('lb', defs).position;
      const q = root.querySelector('#lb-namesearch').value;
      const body = root.querySelector('#lb-body');
      body.innerHTML = section('Strength', STRENGTH_METRICS, group, pos, q) + section('Athletic Testing', ATHLETIC_METRICS, group, pos, q);
      // A search that matches nobody leaves only the section labels -- say so.
      if (q.trim() && !body.querySelector('.card')) {
        body.innerHTML = '';
        const msg = el('div', 'lb-empty');
        msg.style.padding = '24px 4px';
        msg.textContent = `No one matching "${q.trim()}" has a qualifying session in view.`;
        body.appendChild(msg);
      }
    }
    draw();
  }

  /* ----------------------------------------------------------------- compare --- */

  // "Line up people at a point in time": a 2021-22 freshman's numbers plot against a
  // 2024-25 freshman's at the same x position. Real class labels only exist from
  // 2023-24, so the x-axis uses each athlete's OWN chronological order of recorded
  // football years (Year 1, Year 2, ...); the class label is layered into the tooltip
  // wherever it's known.
  let CLASS_LOOKUP = null;
  const PERIOD_RANK = { December: 0, January: 1, April: 2, '—': 0 };
  const athleteYearOrder = (athlete) => {
    const years = [...new Set(athlete.points.map((p) => p.football_year))].sort();
    return new Map(years.map((y, i) => [y, i + 1]));
  };

  // Up to 4 athletes in fixed categorical slots (cat-1..cat-4); slots 3-4 default to
  // "— None —" since a coach may only want 2 or 3.
  const COMPARE_SLOT_COUNT = 4;
  const COMPARE_SLOT_COLORS = ['--cat-1', '--cat-2', '--cat-3', '--cat-4'];
  const COMPARE_NONE_OPTION = { value: '', label: '— None —' };

  function compareTab(root) {
    const names = D.athletes.map((a) => ({ key: a.athlete_key, label: `${a.first_name} ${a.last_name}` })).sort((a, b) => a.label.localeCompare(b.label));
    const slotIndexes = [...Array(COMPARE_SLOT_COUNT).keys()];
    // Slots 1-2 open on the athletes with the most recent testing, then the most sessions.
    const recency = (a) => [a.points.reduce((m, p) => (p.football_year > m ? p.football_year : m), ''), a.points.length];
    const defaults = D.athletes.slice().sort((x, y) => { const [x1, x2] = recency(x), [y1, y2] = recency(y); return y1.localeCompare(x1) || y2 - x2; }).map((a) => a.athlete_key);
    root.innerHTML = `
      <section class="panel">
        <div class="shelf">
          <div class="fp-group compare-slots">
            ${slotIndexes.map((i) => `<div class="fp-label" style="margin:0;">Athlete ${i + 1}</div><div id="cmp-${i}" style="min-width:220px;"></div>`).join('')}
          </div>
        </div>
        <div class="body">
          <div class="compare-legend" id="cmp-legend"></div>
          <div class="comparegrid" id="cmp-charts"></div>
        </div>
        <div class="footer-note">Source: Lifting Data project — Combined Total, Bench, Squat, Clean, Strength Score, Broad Jump, Vertical, Pro Agility, Athleticism Score (best per session), Weight (per session), Height (per football year). X-axis is each athlete's own Year 1/Year 2/... (their first, second, ... recorded season in this dataset), not calendar year — a Year 1 point lines up with another athlete's Year 1 regardless of what actual football year each was in. Hover a point for the real session and class year (Freshman/Sophomore/Junior/Senior, where known — only populated 2023-24 onward).</div>
      </section>`;

    // Searchable combobox rather than a plain <select> -- 230+ names alphabetically.
    const sels = slotIndexes.map((i) => makeSearchCombobox(root.querySelector(`#cmp-${i}`), {
      options: i < 2 ? names.map((n) => ({ value: n.key, label: n.label })) : [COMPARE_NONE_OPTION, ...names.map((n) => ({ value: n.key, label: n.label }))],
      value: i < 2 ? defaults[i] : '',
      onChange: () => draw(), placeholder: 'Search athlete…',
    }));

    function seriesFor(athleteKey, metric) {
      const a = D.athletes.find((x) => x.athlete_key === athleteKey);
      if (!a) return { points: [], name: '' };
      const yearOrder = athleteYearOrder(a);
      const points = a.points.filter((p) => p.metric === metric).map((p) => {
        const yearIdx = yearOrder.get(p.football_year);
        const periodRank = PERIOD_RANK[p.testing_period] ?? 0;
        return { value: p.value, yearIdx, periodRank, key: `${yearIdx}.${periodRank}`, session_label: p.session_label, classLabel: CLASS_LOOKUP.get(`${athleteKey}|${p.football_year}`) || null };
      }).sort((x, y) => x.yearIdx - y.yearIdx || x.periodRank - y.periodRank);
      return { points, name: `${a.first_name} ${a.last_name}` };
    }

    function renderCompareChart(container, metric, activeSlots) {
      const seriesList = activeSlots.map(({ athleteKey, color }) => ({ ...seriesFor(athleteKey, metric), color }));
      const allKeys = [...new Set(seriesList.flatMap((s) => s.points.map((p) => p.key)))].sort((k1, k2) => {
        const [y1, p1] = k1.split('.').map(Number), [y2, p2] = k2.split('.').map(Number);
        return y1 - y2 || p1 - p2;
      });
      const W = 380, H = 130, PAD = 8;
      const allVals = seriesList.flatMap((s) => s.points.map((p) => p.value));
      if (!allVals.length) { container.innerHTML = `<div class="card-head"><h2>${metric} Comparison</h2></div><div class="card-body"><div class="lb-empty">No data.</div></div>`; return; }
      const vMin = Math.min(...allVals), vMax = Math.max(...allVals);
      const sx = (i) => PAD + (i / Math.max(1, allKeys.length - 1)) * (W - PAD * 2);
      const sy = (v) => H - PAD - ((v - vMin) / (vMax - vMin || 1)) * (H - PAD * 2);
      const svgns = 'http://www.w3.org/2000/svg';

      function pathFor(series, color) {
        const g = document.createElementNS(svgns, 'g');
        const idxOf = (key) => allKeys.indexOf(key);
        for (let i = 1; i < series.points.length; i++) {
          const p0 = series.points[i - 1], p1 = series.points[i];
          const line = document.createElementNS(svgns, 'line');
          line.setAttribute('x1', sx(idxOf(p0.key))); line.setAttribute('y1', sy(p0.value));
          line.setAttribute('x2', sx(idxOf(p1.key))); line.setAttribute('y2', sy(p1.value));
          line.setAttribute('stroke', color); line.setAttribute('stroke-width', '2'); line.setAttribute('stroke-linecap', 'round');
          g.appendChild(line);
        }
        series.points.forEach((p) => {
          const c = document.createElementNS(svgns, 'circle');
          c.setAttribute('cx', sx(idxOf(p.key))); c.setAttribute('cy', sy(p.value)); c.setAttribute('r', 3);
          c.setAttribute('fill', color);
          c.style.cursor = 'pointer';
          const html = [
            `<div class="tt-title">${esc(series.name)} — Year ${p.yearIdx}</div>`,
            `<div class="tt-row"><span>${metric}</span><span>${metricLabel(metric, p.value)}</span></div>`,
            `<div class="tt-muted">${esc(p.session_label)}${p.classLabel ? `, ${esc(p.classLabel)}` : ''}</div>`,
          ].join('');
          c.addEventListener('mouseenter', (e) => showTooltip(e.clientX, e.clientY, html));
          c.addEventListener('mousemove', (e) => showTooltip(e.clientX, e.clientY, html));
          c.addEventListener('mouseleave', hideTooltip);
          g.appendChild(c);
        });
        return g;
      }

      const svg = document.createElementNS(svgns, 'svg');
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.style.width = '100%'; svg.style.height = `${H}px`;
      seriesList.forEach((s) => svg.appendChild(pathFor(s, s.color)));

      container.innerHTML = `<div class="card-head"><h2>${metric} Comparison</h2></div><div class="card-body"></div>`;
      const body = container.querySelector('.card-body');
      body.appendChild(svg);
      const axis = el('div', 'axis-x');
      const labelFor = (key) => (key ? `Year ${key.split('.')[0]}` : '');
      axis.appendChild(el('span', null, labelFor(allKeys[0])));
      axis.appendChild(el('span', null, labelFor(allKeys[allKeys.length - 1])));
      body.appendChild(axis);
    }

    function draw() {
      // A "— None —" slot is skipped entirely, so 2, 3, or 4 athletes all work the same way.
      const activeSlots = sels
        .map((sel, i) => ({ athleteKey: sel.value, color: cssVar(COMPARE_SLOT_COLORS[i]), name: names.find((n) => n.key === sel.value)?.label }))
        .filter((s) => s.athleteKey);
      root.querySelector('#cmp-legend').innerHTML = activeSlots.map((s) => `<span class="sw"><span class="dot" style="background:${s.color}"></span>${esc(s.name || '—')}</span>`).join('');
      const chartsEl = root.querySelector('#cmp-charts');
      chartsEl.innerHTML = '';
      if (!activeSlots.length) { chartsEl.innerHTML = '<div class="lb-empty">Pick at least one athlete above to compare.</div>'; return; }
      [...STRENGTH_METRICS, 'Weight', 'Height', ...ATHLETIC_METRICS].forEach((metric) => {
        const card = el('div', 'card');
        chartsEl.appendChild(card);
        renderCompareChart(card, metric, activeSlots);
      });
    }
    draw();
  }

  function init() {
    D = Site.data.lifting;
    if (CLASS_LOOKUP) return;
    CLASS_LOOKUP = new Map();
    D.leaderboard_rows.forEach((r) => { if (r.class) CLASS_LOOKUP.set(`${r.athlete_key}|${r.football_year}`, r.class); });
  }

  Site.mount({
    nav: 'lifting',
    title: 'Lifting & Strength',
    lead: 'Offseason strength and athletic-testing leaderboards — all-time, last session, or by class — and athlete-vs-athlete comparison across career years.',
    data: { lifting: '../data/lifting.json' },
    tabs: [
      { id: 'leaderboards', label: 'Leaderboards', render: (root, ctx) => { init(); leaderboardsTab(root, ctx); } },
      { id: 'compare', label: 'Compare Athletes', render: (root) => { init(); compareTab(root); } },
    ],
  });
})();
