/* Special Teams -- the Athletes tab: one place for every special-teams role instead of a page
   per role. Pick a role (Placekicker, Kickoff Kicker, Punter, Short Snapper, Long Snapper)
   and a view:
     Scorecard      headline KPIs + the role's key metric by season
     Head-to-Head   any two athletes side by side
     Deep Dive      situational splits (quarter, hash, snap location, home/away), an
                    athlete x season heatmap, and a detail table

   A role is a unit's sheet (money_unit / kickoff / punt) viewed by one athlete column
   (kicker / long_snapper / punter / snapper). The three view builders below are shared;
   each role only supplies its metrics. "Short snapper" is the PAT/FG snapper (the sheet's
   `long_snapper` column on money_unit); "long snapper" snaps punts. */
(function () {
  const ST = window.ST;
  const U = ST.U;
  const esc = Site.esc;
  const SEASON_LATEST = ST.SEASON_LATEST;
  const A_COLOR = '--cat-6', B_COLOR = '--cat-3';
  const { ROLES, years } = ST; // defined in st-roles.js


  /* ------------------------------------------------------------- view builders == */

  const credit = (R, rows) => (R.credited ? rows.filter((r) => r[R.field]) : rows);

  function scorecardView(root, R) {
    const D = U(), S = R.scorecard;
    Site.view(root, {
      filters: { defs: [SEASON_LATEST, { field: S.filterField, label: S.filterLabel }], values: D.filters[R.unit] },
      source: `${R.label} scorecard`,
      prepare(st) { return { rows: applyFilters(D.units[R.unit], st) }; },
      summary: ({ rows }) => R.summary(rows.length),
      kpis: S.kpis.map((k) => ({ ...k, value: ({ rows }) => k.value(rows) })),
      cards: S.cards(R),
      footer: ({ rows }) => `${ST.source(R.unit, R.sheet, S.footFn ? S.footFn(rows) : S.footExtra)}`,
    });
  }

  function miniKpi(label, sub, value) {
    return `<div class="mini-kpi"><div class="l">${label}${sub ? ` <span class="mini-sub">${sub}</span>` : ''}</div><div class="v">${value}</div></div>`;
  }

  function h2hView(root, R) {
    const D = U(), H = R.h2h;
    const athletes = D.filters[R.unit][R.field];
    // Default A/B to the athletes with the most activity in the latest season (then overall),
    // so the first view isn't two names with nothing in the default season.
    const rowsAll = credit(R, D.units[R.unit]);
    const latest = D.filters[R.unit].season.slice().sort().at(-1);
    const activity = (a) => [rowsAll.filter((r) => r[R.field] === a && String(r.season) === latest).length, rowsAll.filter((r) => r[R.field] === a).length];
    const ranked = athletes.slice().sort((x, y) => { const [x1, x2] = activity(x), [y1, y2] = activity(y); return y1 - x1 || y2 - x2 || x.localeCompare(y); });
    const sel = (id, label, value) => ({ id, label, options: athletes.map((a) => ({ value: a, label: a })), value });
    const sideCard = (key, color) => ({
      raw: true,
      render(el, ctx) {
        const name = ctx[key];
        const g = ctx.rows.filter((r) => r[R.field] === name);
        el.classList.add('athlete-card');
        el.innerHTML = `
          <div class="h2h-head"><div class="avatar" style="background:var(${color});">${esc(initials(name || ''))}</div>
            <div class="h2h-sel"><b>${esc(name)}</b><div class="yrs">${g.length ? years(g) : `no ${R.h2hNoun || R.noun} in range`}</div></div></div>
          <div class="h2h-body">
            <div class="mini-kpi-row">${H.mini.map((m) => miniKpi(m.label, m.sub, m.value(g))).join('')}</div>
            <div class="card-head compact"><h2>${H.outcome.title}</h2></div><div class="h2h-chart"></div>
          </div>`;
        H.outcome.draw(el.querySelector('.h2h-chart'), g, key);
      },
    });
    const trendCard = (T) => ({
      title: T.title,
      render(el, ctx) {
        const seasons = D.filters[R.unit].season;
        const mine = (name) => (T.subset || ((r) => r))(ctx.rows.filter((r) => r[R.field] === name));
        const sA = seasonSeries(mine(ctx.a), seasons, T.metric), sB = seasonSeries(mine(ctx.b), seasons, T.metric);
        el.innerHTML = `<div class="legend"><span class="sw"><span class="dot" style="background:var(${A_COLOR})"></span>${esc(ctx.a)}</span><span class="sw"><span class="dot" style="background:var(${B_COLOR})"></span>${esc(ctx.b)}</span></div><div class="trend-slot"></div>`;
        renderGroupedBar(el.querySelector('.trend-slot'), { categories: seasons, valuesA: sA.values, valuesB: sB.values, colorA: cssVar(A_COLOR), colorB: cssVar(B_COLOR), nameA: ctx.a, nameB: ctx.b, labelFmt: T.labelFmt, countsA: sA.counts, countsB: sB.counts });
      },
    });
    const extra = H.extra === 'optime' ? [{
      title: 'Operation time build-up, snap → kick',
      note: `Only charted 2023 onward — bars use whichever of the selected ${R.word}s' rows actually have Snap to Catch/Catch to Kick logged, never padded with blanks for 2021–2022.`,
      render(el, ctx) {
        const pair = [ctx.a, ctx.b];
        const op = ctx.rows.filter((r) => pair.includes(r[R.field]));
        renderStacked(el, {
          categories: pair,
          series: { 'Snap → catch': pair.map((p) => mean(op.filter((r) => r[R.field] === p).map((r) => r.snap_to_catch)) || 0), 'Catch → kick': pair.map((p) => mean(op.filter((r) => r[R.field] === p).map((r) => r.catch_to_kick)) || 0) },
          order: ['Snap → catch', 'Catch → kick'], colors: { 'Snap → catch': cssVar('--cat-1'), 'Catch → kick': cssVar('--cat-4') },
        });
      },
    }] : H.extra === 'snaploc' ? [{
      title: 'Snap Location distribution',
      note: 'Charted 2023 onward only. Snap Location is a snap-quality ranking (scale may be 1-3 or 1-5) -- which end means "better" isn\'t confirmed yet, shown as-is.',
      render(el, ctx) {
        const rows = ctx.rows.filter((r) => (r[R.field] === ctx.a || r[R.field] === ctx.b) && r.snap_location);
        if (!rows.length) { el.innerHTML = `<div class="data-note">No charted Snap Location data for either ${R.word} in the current filter (2023 onward only).</div>`; return; }
        const locs = snapLocationScale(D.units[R.unit]);
        const count = (name, sl) => rows.filter((r) => r[R.field] === name && String(r.snap_location) === sl).length;
        renderStacked(el, { categories: locs, series: { [ctx.a]: locs.map((sl) => count(ctx.a, sl)), [ctx.b]: locs.map((sl) => count(ctx.b, sl)) }, order: [ctx.a, ctx.b], colors: { [ctx.a]: cssVar(A_COLOR), [ctx.b]: cssVar(B_COLOR) } });
      },
    }] : [];

    Site.view(root, {
      filters: { defs: [SEASON_LATEST], values: D.filters[R.unit] },
      selects: [sel('a', `${R.word[0].toUpperCase()}${R.word.slice(1)} A`, ranked[0]), sel('b', `${R.word[0].toUpperCase()}${R.word.slice(1)} B`, ranked[1] || ranked[0])],
      source: `${R.label} head-to-head`,
      prepare(st) { return { rows: credit(R, applyFilters(D.units[R.unit], st)), a: st.a, b: st.b }; },
      summary: ({ rows }) => (R.credited ? R.creditedSummary : R.summary)(rows.length),
      cards: [sideCard('a', A_COLOR), sideCard('b', B_COLOR), ...H.trends.map(trendCard), ...extra],
      footer: () => {
        if (!R.credited) return ST.source(R.unit, R.sheet);
        const n = new Set(D.units[R.unit].map((r) => r[R.field]).filter(Boolean)).size;
        return `${ST.source(R.unit, R.sheet)} ${n} ${R.word}${n === 1 ? ' is' : 's are'} credited so far -- pick any two; the comparison works the same as more ${R.unit === 'punt' ? 'punts' : 'attempts'} get a ${R.word} charted.`;
      },
    });
  }

  function deepView(root, R) {
    const D = U(), Dp = R.deep;
    const built = Dp.build(R, D);
    Site.view(root, {
      filters: { defs: Dp.filters, values: D.filters[R.unit] },
      source: `${R.label} deep dive`,
      prepare(st) {
        const rows = credit(R, applyFilters(D.units[R.unit], st));
        return { rows, ...built.prepare(rows, st) };
      },
      summary: ({ rows }) => (R.credited ? R.creditedSummary : R.summary)(rows.length),
      kpis: Dp.kpis,
      cards: [
        ...built.cards,
        {
          title: built.table.title, wide: true, note: built.table.note,
          render(el, ctx) {
            const t = built.table.build(ctx.rows);
            el.innerHTML = Site.tableHTML({ head: t.head, rows: t.rows, empty: `No ${R.word}s in current filter.` });
          },
        },
      ],
      footer: () => ST.source(R.unit, R.sheet, R.credited ? `${U().units[R.unit].filter((r) => r[R.field]).length} have a credited ${R.word}.` : ''),
    });
  }

  /* ----------------------------------------------------------------- the tab == */

  const VIEWS = [{ id: 'scorecard', label: 'Scorecard' }, { id: 'head-to-head', label: 'Head-to-Head' }, { id: 'deep-dive', label: 'Deep Dive' }];

  ST.athletesTab = function (root, { sub }) {
    const [roleId, viewId] = (sub || '').split('/');
    const state = { role: ROLES.some((r) => r.id === roleId) ? roleId : ROLES[0].id, view: VIEWS.some((v) => v.id === viewId) ? viewId : 'scorecard' };
    root.innerHTML = '<div class="subbar"><span id="at-role"></span><span id="at-view"></span></div><div id="at-body"></div>';
    function show() {
      Site.setSub(`${state.role}/${state.view}`);
      const R = ROLES.find((r) => r.id === state.role);
      const body = root.querySelector('#at-body');
      ({ scorecard: scorecardView, 'head-to-head': h2hView, 'deep-dive': deepView })[state.view](body, R);
    }
    Site.pills(root.querySelector('#at-role'), { options: ROLES, value: state.role, label: 'Role', onChange: (id) => { state.role = id; show(); } });
    Site.pills(root.querySelector('#at-view'), { options: VIEWS, value: state.view, label: 'View', size: 'xs', onChange: (id) => { state.view = id; show(); } });
    show();
  };
})();
