/* Rankings: Carroll's CCIW and National (NCAA D3) rank by statistical category.
   Season/week selection is page-level (kept across the phase tabs); each phase
   tab shows its CCIW and National tables side by side. */
(function () {
  const PHASES = [
    { id: 'offense', label: 'Offensive' },
    { id: 'defense', label: 'Defensive' },
    { id: 'special_teams', label: 'Special Teams' },
    { id: 'overall', label: 'Additional Metrics' },
  ];

  // The two sources name the same column differently (CCIW: metric, National: stat).
  const SCOPES = [
    { id: 'cciw', label: 'CCIW', statField: 'metric', statHead: 'Metric', rankHead: 'CCIW Rank', rankCell: (r) => rankTag(r.rank, r.out_of) },
    { id: 'national', label: 'National', statField: 'stat', statHead: 'Stat', rankHead: 'National Rank', rankCell: (r) => `#${r.rank}` },
  ];

  // ranked=true (one season selected): real per-category rank, best first -- exactly
  // what the source publishes. ranked=false (All seasons): a rank pulled out of its
  // own year's pool and sorted next to a different year's would imply a cross-season
  // comparison neither source publishes, so Rank is dropped and each season's real
  // value is listed, newest season first.
  function rankTable(scope, rows, ranked) {
    if (!rows.length) return `<div class="lb-empty">No ${scope.label}-scope rows for this selection.</div>`;
    const right = 'text-align:right;';
    if (ranked) {
      const body = rows.slice().sort((a, b) => a.rank - b.rank).map((r) => `
        <tr><td class="name">${Site.esc(r.category)}</td><td>${Site.esc(r[scope.statField])}</td>
        <td style="${right}">${Site.esc(r.value)}</td><td style="${right}">${scope.rankCell(r)}</td></tr>`).join('');
      return `<table class="mini rank-table"><thead><tr><th>Category</th><th>${scope.statHead}</th><th style="${right}">Value</th><th style="${right}">${scope.rankHead}</th></tr></thead><tbody>${body}</tbody></table>`;
    }
    const body = rows.slice().sort((a, b) => b.season.localeCompare(a.season) || a.category.localeCompare(b.category)).map((r) => `
      <tr><td>${r.season}</td><td class="name">${Site.esc(r.category)}</td><td>${Site.esc(r[scope.statField])}</td>
      <td style="${right}">${Site.esc(r.value)}</td></tr>`).join('');
    return `<table class="mini rank-table"><thead><tr><th>Season</th><th>Category</th><th>${scope.statHead}</th><th style="${right}">Value</th></tr></thead><tbody>${body}</tbody></table>`;
  }

  // season === '' means "All seasons": each season's in-progress weeks collapse to
  // their latest week so the combined view doesn't repeat a category per week. A
  // specific season with weekly data uses the chosen week (default: latest).
  function prepareRows(rows, season, week) {
    const rowKey = (r) => `${r.season}|${r.phase}|${r.category}|${r.metric ?? r.stat}`;
    if (!season) {
      const latestPerKey = new Map();
      rows.forEach((r) => {
        const existing = latestPerKey.get(rowKey(r));
        if (!existing || (r.week ?? -1) > (existing.week ?? -1)) latestPerKey.set(rowKey(r), r);
      });
      return [...latestPerKey.values()];
    }
    const seasonRows = rows.filter((r) => r.season === season);
    if (!seasonRows.some((r) => r.week !== null)) return seasonRows;
    const w = week != null ? week : Math.max(...seasonRows.map((r) => r.week));
    return seasonRows.filter((r) => r.week === w);
  }

  // The national table as bars: every category's rank on one scale, best first, so strengths and weaknesses show
  // without reading numbers. The NCAA tables carry no team count, so the scale assumes about 250 Division III
  // teams (or the worst rank published, if that is larger).
  const D3_TEAMS = 250;
  function rankStrip(rows) {
    const worst = Math.max(D3_TEAMS, ...rows.map((r) => r.rank));
    const body = rows.slice().sort((a, b) => a.rank - b.rank).map((r) => {
      const share = 1 - (r.rank - 1) / (worst - 1);
      const tone = r.rank <= worst / 4 ? '--good' : r.rank > worst * 0.75 ? '--critical' : '--cat-1';
      return `<div class="rs-row" role="img" aria-label="${Site.esc(r.category)}, national rank ${r.rank}">
        <span class="rs-label">${Site.esc(r.category)}</span>
        <span class="rs-track"><i style="width:${(share * 100).toFixed(1)}%; background:var(${tone})"></i></span>
        <span class="rs-rank">#${r.rank}</span></div>`;
    }).join('');
    return `<div class="rankstrip">${body}</div>
      <div class="data-note">Bar length shows how far up the national list: #1 fills the bar, #${worst} is empty (the scale assumes about ${D3_TEAMS} Division III teams). Green is the top quarter, red the bottom quarter.</div>`;
  }

  function printCard(cardEl, filenameTitle) {
    document.querySelectorAll('.print-target').forEach((el) => el.classList.remove('print-target'));
    cardEl.classList.add('print-target');
    printPage(filenameTitle);
  }

  // Page-level selection, kept when switching phase tabs.
  const sel = { season: null, week: null };

  function render(root, phase) {
    const D = Site.data.rankings;
    const rowsFor = (scope) => D[scope.id].rows.filter((r) => r.phase === phase.id);
    const seasons = [...new Set(SCOPES.flatMap((s) => rowsFor(s).map((r) => r.season)))].sort().reverse();
    if (sel.season === null || (sel.season !== '' && !seasons.includes(sel.season))) { sel.season = seasons[0] || ''; sel.week = null; }

    const weeksFor = (scope, season) => (season && D[scope.id].weeks[season]) || [];
    const unionWeeks = (season) => {
      const byNum = new Map();
      SCOPES.forEach((s) => weeksFor(s, season).forEach((w) => { if (!byNum.has(w.week)) byNum.set(w.week, w); }));
      return [...byNum.values()].sort((a, b) => a.week - b.week);
    };

    root.innerHTML = `
      <div class="subbar" id="rk-controls"></div>
      <section class="panel">
        <div class="body">
          ${phase.id === 'overall' ? '<div class="insight" style="margin-bottom:14px;">CCIW-scope has no Additional Metrics category (Turnover Margin, Winning %, Penalties) — cciw.org doesn\'t publish these as their own ranked category the way NCAA.com does. Only National Rankings apply to this tab.</div>' : ''}
          <div class="card" id="rk-glance-card" style="margin-bottom:16px;" hidden>
            <div class="card-head"><h2>National rank at a glance <span class="print-only" id="rk-glance-printlabel"></span></h2><span class="data-note">longer bar = better rank</span></div>
            <div class="card-body" id="rk-glance"></div>
          </div>
          <div class="cards">
            ${SCOPES.map((s) => `
              <div class="card table-card" id="rk-${s.id}-card">
                <div class="card-head"><h2>${s.label} Rankings <span class="print-only" id="rk-${s.id}-printlabel"></span></h2>
                  <span><span class="filters-summary" id="rk-${s.id}-summary"></span> <button type="button" class="download-btn no-print" id="rk-${s.id}-pdf">&#8595; PDF</button></span></div>
                <div class="rank-scroll" id="rk-${s.id}-table"></div>
              </div>`).join('')}
          </div>
        </div>
        <div class="footer-note no-print">Source: CCIW Buddah Report's ${D.generated_from.cciw.join(', ')} (cciw.org) and National Buddah Report's ${D.generated_from.national.join(', ')} (NCAA.com D3) — all read as-is, not re-scraped by this site.</div>
      </section>`;

    const controls = root.querySelector('#rk-controls');
    function drawControls() {
      const weeks = unionWeeks(sel.season);
      controls.innerHTML = `
        <label class="pill-label" for="rk-season">Season</label>
        <select class="select-sm" id="rk-season">${seasons.map((s) => `<option value="${s}"${s === sel.season ? ' selected' : ''}>${s}</option>`).join('')}<option value=""${sel.season === '' ? ' selected' : ''}>All seasons</option></select>
        <span id="rk-weeks"></span>`;
      controls.querySelector('#rk-season').addEventListener('change', (e) => { sel.season = e.target.value; sel.week = null; drawControls(); draw(); });
      if (weeks.length) {
        if (sel.week === null || !weeks.some((w) => w.week === sel.week)) sel.week = weeks[weeks.length - 1].week;
        Site.pills(controls.querySelector('#rk-weeks'), {
          label: 'Week', size: 'xs', value: String(sel.week),
          options: weeks.map((w) => ({ id: String(w.week), label: `Wk${w.week} (${w.date})` })),
          onChange: (id) => { sel.week = Number(id); draw(); },
        });
      }
    }

    function draw() {
      SCOPES.forEach((scope) => {
        const own = weeksFor(scope, sel.season);
        const week = own.some((w) => w.week === sel.week) ? sel.week : null;
        const all = prepareRows(rowsFor(scope), sel.season, week);
        // "G" (games played) is published as a ranked column, but every team has played the same number of games,
        // so it is a wall of ties at #1 that buries the real categories. Left out of the one-season, ranked view.
        const games = sel.season ? all.filter((r) => r[scope.statField] === 'G') : [];
        const rows = games.length ? all.filter((r) => r[scope.statField] !== 'G') : all;
        root.querySelector(`#rk-${scope.id}-table`).innerHTML = rankTable(scope, rows, !!sel.season)
          + (games.length ? `<div class="data-note" style="padding:8px 12px;">${games.length} games-played (G) rows are hidden: every team has played the same number of games.</div>` : '');
        root.querySelector(`#rk-${scope.id}-summary`).textContent = `${rows.length} rows`;
        if (scope.id === 'national') {
          const card = root.querySelector('#rk-glance-card'), strip = rows.filter((r) => r.rank !== null && r.rank !== undefined);
          card.hidden = !(sel.season && strip.length);
          if (!card.hidden) root.querySelector('#rk-glance').innerHTML = rankStrip(strip);
          root.querySelector('#rk-glance-printlabel').textContent = sel.season ? `— ${sel.season}` : '';
        }
        const shownWeek = week !== null ? week : (own.length ? own[own.length - 1].week : null);
        root.querySelector(`#rk-${scope.id}-printlabel`).textContent = sel.season
          ? `— ${sel.season}${shownWeek !== null ? ` · Wk${shownWeek}` : ''}`
          : '— all seasons (real values only, no cross-year rank)';
      });
    }

    SCOPES.forEach((scope) => {
      root.querySelector(`#rk-${scope.id}-pdf`).addEventListener('click', () =>
        printCard(root.querySelector(`#rk-${scope.id}-card`), `${scope.label} Rankings - ${phase.label} - Carroll Football`));
    });
    drawControls();
    draw();
  }

  Site.mount({
    nav: 'rankings',
    title: 'Rankings',
    lead: 'Where Carroll stands in the CCIW and nationally (NCAA D3) in every published statistical category. Pick a season — and a week, during the current season — once; it carries across the tabs.',
    data: { rankings: '../data/rankings.json' },
    tabs: PHASES.map((p) => ({ id: p.id, label: p.label, render: (root) => render(root, p) })),
  });
})();
