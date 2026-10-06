/*
  Shared page shell for every dashboard: site nav, page header, tab bar with
  hash routing, data loading, and a small declarative "view" engine that
  renders filters + KPI tiles + cards from a spec.

  A dashboard page is just:
      <body></body>
      <script src="../js/charts.js"></script>
      <script src="../js/shell.js"></script>
      <script src="../js/views/<page>.js"></script>   // calls Site.mount({...})

  Nothing here knows about any specific dataset -- chart primitives live in
  js/charts.js, page-specific analytics in js/views/*.js.
*/

const Site = (() => {
  /* ---------------------------------------------------------------- nav --- */

  const PAGES = [
    { key: 'offense', href: 'offense.html', label: 'Offense' },
    { key: 'defense', href: 'defense.html', label: 'Defense' },
    { key: 'special-teams', href: 'special-teams.html', label: 'Special Teams' },
    { key: 'scouting', href: 'opponent-scouting.html', label: 'Opponent Scouting' },
    { key: 'rankings', href: 'rankings.html', label: 'Rankings' },
    { key: 'lifting', href: 'lifting-strength.html', label: 'Lifting & Strength' },
    { key: 'players', href: 'players.html', label: 'Players & Records' },
  ];
  const UTILITY = [
    { key: 'glossary', href: 'glossary.html', label: 'Glossary' },
    { key: 'updates', href: 'updates.html', label: 'Updates' },
  ];

  const esc = escapeHTML; // js/charts.js

  function navHTML(active) {
    const link = (p) => `<a href="${p.href}"${p.key === active ? ' class="active" aria-current="page"' : ''}>${esc(p.label)}</a>`;
    return `
      <nav class="sitenav" aria-label="Site">
        <a class="brand" href="home.html"><span class="mark">CU</span> Carroll Football Analytics</a>
        <div class="links">${PAGES.map(link).join('')}</div>
        <div class="links utility">${UTILITY.map(link).join('')}</div>
      </nav>`;
  }

  /* ------------------------------------------------------------- routing --- */
  // Hash format: #tab or #tab/sub (sub may itself contain slashes). `sub` is owned by
  // whichever tab sets it (e.g. a role picker) via Site.setSub().

  function parseHash() {
    const [tab, ...rest] = decodeURIComponent(location.hash.replace(/^#/, '')).split('/');
    return { tab: tab || null, sub: rest.join('/') || null };
  }

  let currentTab = null;
  function setSub(sub) {
    if (!currentTab) return;
    history.replaceState(null, '', `#${currentTab}${sub ? `/${sub}` : ''}`);
  }

  /* --------------------------------------------------------------- pills --- */

  /** Segmented pill control (sub-selectors inside a tab). Returns {set(id)}. */
  function pills(container, { options, value, onChange, size = 'sm', label }) {
    container.innerHTML = `${label ? `<span class="pill-label">${esc(label)}</span>` : ''}<div class="pillbar ${size}" role="tablist"></div>`;
    const bar = container.querySelector('.pillbar');
    let current = value;
    bar.innerHTML = options.map((o) => `<button type="button" class="pill${o.id === current ? ' active' : ''}" role="tab" aria-selected="${o.id === current}" data-id="${esc(o.id)}">${esc(o.label)}</button>`).join('');
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('.pill');
      if (!b || b.dataset.id === current) return;
      set(b.dataset.id);
      onChange(current);
    });
    function set(id) {
      current = id;
      bar.querySelectorAll('.pill').forEach((b) => {
        const on = b.dataset.id === id;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
      });
    }
    return { set, get value() { return current; } };
  }

  /* --------------------------------------------------------------- mount --- */

  const state = { data: {}, cfg: null };

  /**
   * cfg: {
   *   nav:   key of the active top-nav page,
   *   title: page <h1> / document title,
   *   badge: small pill next to the <h1> (optional),
   *   lead:  one-line description under the title (optional),
   *   data:  { name: url } -- fetched in parallel into Site.data[name],
   *   tabs:  [{ id, label, render(root, { sub }) }],
   * }
   */
  function mount(cfg) {
    state.cfg = cfg;
    document.title = `${cfg.title} — Carroll Football Analytics`;
    document.body.innerHTML = `
      <div class="page">
        ${navHTML(cfg.nav)}
        <header class="pagehead"><h1>${esc(cfg.title)}${cfg.badge ? `<span class="h1-badge">${esc(cfg.badge)}</span>` : ''}</h1>${cfg.lead ? `<p>${cfg.lead}</p>` : ''}</header>
        <div class="tabbar" id="site-tabs" role="tablist" aria-label="${esc(cfg.title)} views"></div>
        <main class="stage" id="site-stage"><div class="loading">Loading data…</div></main>
      </div>`;

    const tabbar = document.getElementById('site-tabs');
    const stage = document.getElementById('site-stage');
    if (cfg.tabs.length < 2) tabbar.hidden = true;
    tabbar.innerHTML = cfg.tabs.map((t) => `<button type="button" class="tabbtn" role="tab" id="tab-${esc(t.id)}" data-tab="${esc(t.id)}">${esc(t.label)}</button>`).join('');

    function show(id, sub) {
      const tab = cfg.tabs.find((t) => t.id === id) || cfg.tabs[0];
      currentTab = tab.id;
      tabbar.querySelectorAll('.tabbtn').forEach((b) => {
        const on = b.dataset.tab === tab.id;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
      });
      hideTooltip();
      stage.innerHTML = '';
      const root = document.createElement('div');
      stage.appendChild(root);
      tab.render(root, { sub: sub || null });
    }

    tabbar.addEventListener('click', (e) => {
      const b = e.target.closest('.tabbtn');
      if (!b) return;
      location.hash = b.dataset.tab;
    });
    tabbar.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const btns = [...tabbar.querySelectorAll('.tabbtn')];
      const i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      const next = btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length];
      next.focus();
      next.click();
    });

    const names = Object.keys(cfg.data || {});
    Promise.all(names.map((n) => fetch(cfg.data[n]).then((r) => { if (!r.ok) throw new Error(`${cfg.data[n]}: HTTP ${r.status}`); return r.json(); })))
      .then((results) => {
        names.forEach((n, i) => { state.data[n] = results[i]; });
        const render = () => { const h = parseHash(); show(h.tab, h.sub); };
        window.addEventListener('hashchange', render);
        render();
      })
      .catch((err) => {
        stage.innerHTML = `<div class="card"><div class="card-body">Couldn't load this page's data — ${esc(err.message || err)}. Run scripts/refresh_all.py, and serve the site over http:// rather than file://.</div></div>`;
      });
  }

  /* ------------------------------------------------------------- tables --- */

  /** head: ['Col', ...] or [{label, align}]; rows: [[cell, ...]] (cells are
   * trusted HTML strings -- escape data-derived text with Site.esc). First
   * column gets the bold .name style. */
  function tableHTML({ head, rows, empty = 'No data in the current filter.', extraClass = '' }) {
    const cols = head.map((h) => (typeof h === 'string' ? { label: h } : h));
    const th = cols.map((c) => `<th${c.align ? ` style="text-align:${c.align}"` : ''}>${c.label}</th>`).join('');
    const body = rows.length
      ? rows.map((r) => `<tr>${r.map((cell, i) => `<td${i === 0 ? ' class="name"' : ''}${cols[i] && cols[i].align ? ` style="text-align:${cols[i].align}"` : ''}>${cell}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${cols.length}" class="empty">${esc(empty)}</td></tr>`;
    return `<table class="mini ${extraClass}"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
  }

  /* ---------------------------------------------------------- view engine --- */

  let viewSeq = 0;

  /**
   * Renders a filters + KPIs + cards dashboard into `root`.
   *
   * spec: {
   *   filters:  { defs: [...filter defs], values: {field: [options]} }  (optional)
   *   selects:  [{ id, label, options: [{value, label}], value }]   single-select controls in the
   *             shelf; their values arrive in prepare()'s state under `id`
   *   actions:  [{ label, onClick(state) }]    buttons at the right of the shelf (e.g. PDF)
   *   source:   short caption shown at the right of the filter shelf (optional)
   *   prepare:  (state) => ctx        -- builds every row set the KPIs/cards need
   *   summary:  (ctx) => string       -- the "N plays in view" text
   *   intro:    string | (ctx) => string    -- an .insight note between the KPIs and the cards
   *   kpis:     [{ label, dot, glossary, value: (ctx) => [value, foot?] }]
   *   cards:    [{ title, wide, render(el, ctx), note, extra } |
   *              { title, wide, table: { head, rows: (ctx) => [[...]], empty }, note } |
   *              { raw: true, wide, render(el, ctx) } |     // card body is the whole card (trend cards)
   *              { section: 'Heading' }]                    // full-width heading between card groups
   *   footer:   string | (ctx) => string
   * }
   * Returns { refresh() }.
   */
  function view(root, spec) {
    const uid = `v${++viewSeq}`;
    const kpiCls = { 4: 'kpirow', 5: 'kpirow-5', 6: 'kpirow-6' };
    const kpis = spec.kpis || [];
    const cards = spec.cards || [];
    const selects = spec.selects || [];
    const actions = spec.actions || [];
    const hasShelf = spec.filters || spec.source || selects.length || actions.length;

    root.innerHTML = `
      <section class="panel">
        ${hasShelf ? `<div class="shelf">
          <span class="shelf-filters">
            ${selects.map((sel) => `<label class="pill-label" for="${uid}-sel-${sel.id}">${esc(sel.label)}</label><select class="select-sm" id="${uid}-sel-${sel.id}">${sel.options.map((o) => `<option value="${esc(o.value)}"${o.value === sel.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`).join('')}
            <span id="${uid}-shelf" class="shelf-filters"></span>
          </span>
          <span class="shelf-right">${spec.source ? `<span class="shelf-source">${esc(spec.source)}</span>` : ''}${actions.map((a, i) => `<button type="button" class="download-btn no-print" id="${uid}-act-${i}">${a.label}</button>`).join('')}</span>
        </div>` : ''}
        <div class="body">
          ${kpis.length ? `<div class="${kpiCls[kpis.length] || 'kpirow'}">${kpis.map((k, i) => kpiHTML(`${uid}-k${i}`, k.label, k.dot, k.glossary)).join('')}</div>` : ''}
          ${spec.intro ? `<div class="insight view-intro" id="${uid}-intro"></div>` : ''}
          <div class="cards">
            ${cards.map((c, i) => {
              if (c.section) return `<h3 class="cards-heading">${c.section}</h3>`;
              const cls = `${c.wide ? 'card wide' : 'card'}${c.table ? ' table-card' : ''}`;
              if (c.raw) return `<div class="${cls}" id="${uid}-c${i}"></div>`;
              return `<div class="${cls}"><div class="card-head"><h3>${c.title}</h3>${c.extra || ''}</div><div class="card-body" id="${uid}-c${i}"></div>${c.note ? `<div class="insight card-note">${c.note}</div>` : ''}</div>`;
            }).join('')}
          </div>
        </div>
        ${spec.footer ? `<div class="footer-note" id="${uid}-footer"></div>` : ''}
      </section>`;

    let summaryEl = null;
    if (spec.filters) {
      document.getElementById(`${uid}-shelf`).innerHTML = buildFilterPanel(uid, spec.filters.defs, spec.filters.values);
      wireFilterPanel(uid, spec.filters.defs, refresh);
      summaryEl = document.getElementById(`${uid}-summary`);
    }
    selects.forEach((sel) => document.getElementById(`${uid}-sel-${sel.id}`).addEventListener('change', refresh));

    function readState() {
      const st = spec.filters ? readFilterState(uid, spec.filters.defs) : {};
      selects.forEach((sel) => { st[sel.id] = document.getElementById(`${uid}-sel-${sel.id}`).value; });
      return st;
    }
    actions.forEach((a, i) => document.getElementById(`${uid}-act-${i}`).addEventListener('click', () => a.onClick(readState())));

    function refresh() {
      const ctx = spec.prepare(readState());
      if (summaryEl && spec.summary) summaryEl.textContent = spec.summary(ctx);
      if (spec.intro) document.getElementById(`${uid}-intro`).innerHTML = typeof spec.intro === 'function' ? spec.intro(ctx) : spec.intro;
      kpis.forEach((k, i) => {
        const [v, foot] = k.value(ctx);
        setKPI(`${uid}-k${i}`, v, foot === undefined ? '' : foot);
      });
      cards.forEach((c, i) => {
        if (c.section) return;
        const el = document.getElementById(`${uid}-c${i}`);
        if (c.table) {
          const t = c.table;
          el.innerHTML = tableHTML({ head: t.head, rows: t.rows(ctx), empty: typeof t.empty === 'function' ? t.empty(ctx) : t.empty, extraClass: t.extraClass });
        } else {
          c.render(el, ctx);
        }
      });
      if (spec.footer) {
        document.getElementById(`${uid}-footer`).textContent = typeof spec.footer === 'function' ? spec.footer(ctx) : spec.footer;
      }
    }
    refresh();
    return { refresh };
  }

  return {
    mount, view, pills, tableHTML, esc, setSub,
    get data() { return state.data; },
  };
})();
