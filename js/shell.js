/*
  Shared page shell for every dashboard: site nav, page header, tab bar with
  hash routing, data loading, and a small declarative "view" engine that
  renders filters + KPI tiles + cards from a spec.

  A dashboard page is just:
      <body></body>
      <script src="../js/lib/core.js"></script>   // plus data.js, charts.js, filters.js (see js/lib/)
      <script src="../js/shell.js"></script>
      <script src="../js/views/<page>.js"></script>   // calls Site.mount({...})

  Nothing here knows about any specific dataset -- chart primitives live in
  js/lib/charts.js, page-specific analytics in js/views/*.js.
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

  const esc = escapeHTML; // js/lib/core.js

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
    let raw = location.hash.replace(/^#/, '');
    try { raw = decodeURIComponent(raw); } catch (e) { /* a stray % in a hand-typed link: use it as typed */ }
    const [tab, ...rest] = raw.split('/');
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


  /* ----------------------------------------------------------- freshness --- */
  // "Data through ..." under the page title, from data/meta.json (build_home_data.py). If the
  // schedule says a game has been played since the latest one the data knows about, say so -- the
  // pages quietly run a game behind otherwise. Never blocks the page: no meta.json, no label.

  const GAME_PAGES = new Set(['home', 'offense', 'defense', 'scouting', 'special-teams', 'players']);
  const CHARTED_PAGES = new Set(['offense', 'defense', 'scouting']); // fed by the hand-charted Hudl exports, which arrive after the box score

  // Local calendar date as YYYY-MM-DD. (toISOString() is UTC, which is already "tomorrow" on a
  // Saturday evening in the US, so it would call a game played tonight a finished one.)
  const today = () => new Date().toLocaleDateString('sv-SE');
  /** "Oct 10", or with opts (an Intl.DateTimeFormat options object) e.g. { weekday: 'short', month: 'short', day: 'numeric' }. */
  const dayLabel = (iso, opts = { month: 'short', day: 'numeric' }) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', opts);

  const EMPTY_META = { pages: {}, latest_game: null, schedule: [] };

  /** meta.json never blocks a page: if it is missing, views get an empty one and the label is skipped. */
  function loadMeta() {
    return fetch('../data/meta.json').then((r) => (r.ok ? r.json() : EMPTY_META)).catch(() => EMPTY_META);
  }

  function showFreshness(navKey, meta) {
    const el = document.getElementById('site-asof');
    const page = meta.pages[navKey];
    if (!el || !page) return;
    let html = `<span class="asof-through">${esc(page.text)}</span>`;
    if (GAME_PAGES.has(navKey)) {
      // Measured against THIS page's own data: the box score can be in while the hand-charted play-by-play is not.
      const through = page.through || (meta.latest_game && meta.latest_game.date);
      const missing = through ? meta.schedule.filter((g) => g.date < today() && g.date > through) : [];
      if (missing.length) {
        const charted = CHARTED_PAGES.has(navKey);
        html += ` <span class="asof-warn" title="The schedule shows this game has been played; ${charted ? 'its Hudl charting has' : 'its box score has'} not been loaded yet.">${missing.map((g) => `${esc(g.opponent)} (${dayLabel(g.date)})`).join(', ')} ${charted ? 'not charted yet' : 'not loaded yet'}</span>`;
      }
    }
    el.innerHTML = html;
    el.hidden = false;
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
    // The tab/icon: the "CU" mark as an inline SVG, so the browser never asks for a /favicon.ico that does not exist.
    if (!document.querySelector('link[rel="icon"]')) {
      document.head.insertAdjacentHTML('beforeend', '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect width=%2732%27 height=%2732%27 rx=%277%27 fill=%27%23121d3f%27/%3E%3Ctext x=%2716%27 y=%2722%27 font-family=%27Arial,sans-serif%27 font-size=%2714%27 font-weight=%27700%27 fill=%27white%27 text-anchor=%27middle%27%3ECU%3C/text%3E%3C/svg%3E">');
    }
    document.body.innerHTML = `
      <a class="skip-link" href="#site-stage">Skip to content</a>
      <div class="page">
        ${navHTML(cfg.nav)}
        <header class="pagehead"><h1>${esc(cfg.title)}${cfg.badge ? `<span class="h1-badge">${esc(cfg.badge)}</span>` : ''}</h1>${cfg.lead ? `<p>${cfg.lead}</p>` : ''}<div class="asof" id="site-asof" hidden></div></header>
        <div class="tabbar" id="site-tabs" role="tablist" aria-label="${esc(cfg.title)} views"></div>
        <main class="stage" id="site-stage" tabindex="-1"><div class="loading">Loading data…</div></main>
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
      const activeBtn = tabbar.querySelector('.tabbtn.active');
      if (activeBtn && tabbar.scrollWidth > tabbar.clientWidth) activeBtn.scrollIntoView({ inline: 'center', block: 'nearest' });
      // Bookmarks, history, and a printout's file name should say which tab this is.
      document.title = `${cfg.tabs.length > 1 ? `${tab.label} · ` : ''}${cfg.title} — Carroll Football Analytics`;
      stage.innerHTML = '';
      const root = document.createElement('div');
      stage.appendChild(root);
      try {
        tab.render(root, { sub: sub || null });
      } catch (err) {
        // One broken view must not leave a blank page with the only clue in the console.
        console.error(err);
        root.innerHTML = `<div class="card"><div class="card-body">Something went wrong drawing this view (${esc(err.message || err)}). Try another tab, or reload the page.</div></div>`;
      }
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

    const activeLink = document.querySelector('.sitenav .links a.active');
    if (activeLink) activeLink.scrollIntoView({ inline: 'center', block: 'nearest' }); // narrow screens scroll the nav row

    const names = Object.keys(cfg.data || {});
    Promise.all([loadMeta(), ...names.map((n) => fetch(cfg.data[n]).then((r) => { if (!r.ok) throw new Error(`${cfg.data[n]}: HTTP ${r.status}`); return r.json(); }))])
      .then(([meta, ...results]) => {
        state.data.meta = meta; // every page gets Site.data.meta (the schedule, per-page "data through" text)
        names.forEach((n, i) => { state.data[n] = results[i]; });
        showFreshness(cfg.nav, meta);
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

  /** <option>s for a spec.selects entry; options with the same `group` (consecutive) share an <optgroup>. */
  function selectOptionsHTML(sel) {
    let html = '', open = null;
    sel.options.forEach((o) => {
      if ((o.group || null) !== open) { html += open ? '</optgroup>' : ''; open = o.group || null; html += open ? `<optgroup label="${esc(open)}">` : ''; }
      html += `<option value="${esc(o.value)}"${o.value === sel.value ? ' selected' : ''}>${esc(o.label)}</option>`;
    });
    return html + (open ? '</optgroup>' : '');
  }

  /**
   * Renders a filters + KPIs + cards dashboard into `root`.
   *
   * spec: {
   *   filters:  { defs: [...filter defs], values: {field: [options]} }  (optional)
   *   selects:  [{ id, label, options: [{value, label, group?}], value }]   single-select controls in the
   *             shelf; their values arrive in prepare()'s state under `id`
   *   actions:  [{ label, onClick(state) }]    buttons at the right of the shelf (e.g. PDF)
   *   source:   short caption shown at the right of the filter shelf (optional)
   *   prepare:  (state) => ctx        -- builds every row set the KPIs/cards need
   *   summary:  (ctx) => string       -- the "N plays in view" text
   *   intro:    string | (ctx) => string    -- an .insight note between the KPIs and the cards
   *   kpis:     [{ label, dot, glossary, value: (ctx) => [value, foot?] }]
   *   cards:    [{ title, wide, noPrint, render(el, ctx), note, extra } |      // noPrint: leave it off a printout (links)
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
        <div class="print-head" id="${uid}-printhead"></div>
        ${hasShelf ? `<div class="shelf">
          <span class="shelf-filters">
            ${selects.map((sel) => `<label class="pill-label" for="${uid}-sel-${sel.id}">${esc(sel.label)}</label><select class="select-sm" id="${uid}-sel-${sel.id}">${selectOptionsHTML(sel)}</select>`).join('')}
            <span id="${uid}-shelf" class="shelf-filters"></span>
          </span>
          <span class="shelf-right">${spec.source ? `<span class="shelf-source">${esc(spec.source)}</span>` : ''}${actions.map((a, i) => `<button type="button" class="download-btn no-print" id="${uid}-act-${i}">${a.label}</button>`).join('')}</span>
        </div>` : ''}
        <div class="body">
          ${kpis.length ? `<div class="${kpiCls[kpis.length] || 'kpirow'}">${kpis.map((k, i) => kpiHTML(`${uid}-k${i}`, k.label, k.dot, k.glossary)).join('')}</div>` : ''}
          ${spec.intro ? `<div class="insight view-intro" id="${uid}-intro"></div>` : ''}
          <div class="cards">
            ${cards.map((c, i) => {
              if (c.section) return `<h2 class="cards-heading">${c.section}</h2>`;
              const cls = `${c.wide ? 'card wide' : 'card'}${c.table ? ' table-card' : ''}${c.noPrint ? ' no-print' : ''}`;
              if (c.raw) return `<div class="${cls}" id="${uid}-c${i}"></div>`;
              return `<div class="${cls}"><div class="card-head"><h2>${c.title}</h2>${c.extra || ''}</div><div class="card-body" id="${uid}-c${i}"></div>${c.note ? `<div class="insight card-note">${c.note}</div>` : ''}</div>`;
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

    // The line at the top of a printout: which page, tab, game or opponent, what the filters leave in view,
    // how current the data is, and the date it was printed (the page chrome and controls don't print).
    function fillPrintHead() {
      const tab = document.querySelector('#site-tabs .tabbtn.active');
      const picks = selects.map((sel) => document.getElementById(`${uid}-sel-${sel.id}`).selectedOptions[0]).filter(Boolean).map((o) => o.text);
      const asof = document.getElementById('site-asof');
      const view = summaryEl ? summaryEl.textContent : '';
      document.getElementById(`${uid}-printhead`).innerHTML =
        `<div class="ph-title">Carroll Football — ${esc(state.cfg.title)}${tab && state.cfg.tabs.length > 1 ? ` · ${esc(tab.textContent)}` : ''}</div>`
        + (picks.length ? `<div class="ph-sub">${picks.map(esc).join(' · ')}</div>` : '')
        + `<div class="ph-meta">${[view, asof && !asof.hidden ? asof.firstElementChild.textContent : '', `Printed ${dayLabel(today(), { month: 'long', day: 'numeric', year: 'numeric' })}`].filter(Boolean).map(esc).join(' · ')}</div>`;
    }

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
      fillPrintHead();
    }
    refresh();
    return { refresh };
  }

  return {
    mount, view, pills, tableHTML, esc, setSub, today, dayLabel,
    get data() { return state.data; },
  };
})();
