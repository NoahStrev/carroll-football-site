/*
  filters.js -- the checkbox filter panel (buildFilterPanel / wireFilterPanel /
  readFilterState / applyFilters) and the searchable combobox.
  Part of the shared library every dashboard loads, in this order (see any page in dashboards/):
    js/lib/core.js      helpers, formatting, tooltip, glossary + KPI tiles
    js/lib/data.js      row helpers: special-teams buckets, grouping, play-data constants
    js/lib/charts.js    chart renderers (bar, stacked, scatter, heatmap, sparkline, grouped bar)
    js/lib/filters.js   checkbox filter panel, searchable combobox
  These are classic scripts sharing one global scope, so load order matters only for code that runs
  at load time; everything else is called later by js/shell.js and js/views/*.js.

  Categorical color always comes from --cat-1..--cat-8 in that fixed order (never cycled or
  reassigned), sequential magnitude uses --seq-*, status uses --good/--warning/--serious/--critical,
  and every chart with >=2 series ships a legend plus a hover tooltip.
*/

/* ============================================================================
   FILTER PANEL
   ============================================================================
   A checkbox-list panel: every option is visible with a real checkbox (no hidden ctrl-click
   multi-select), All/None per group, a live count badge on the Filters button showing how many
   groups are narrowed, and a search box on any group with more than 8 options.
   Filter state is a plain object {field: Set(selected values)}; applyFilters() applies it.
*/

function buildFilterPanel(tabId, filterDefs, filterValues) {
  const groups = filterDefs.map(({ field, label, defaultLatestOnly }) => {
    const values = filterValues[field] || [];
    const searchable = values.length > 8;
    // defaultLatestOnly (2026-07-31, per the user: "all dashboards should be
    // preset with the most recent year selected") -- every other field still
    // defaults to fully checked; only a field opting into this (every page's
    // `season` filter def) starts pre-narrowed to its single highest value.
    // Sorted fresh rather than trusting incoming order, since it only needs
    // to hold for 4-digit year strings, which sort correctly as plain strings.
    const latestValue = defaultLatestOnly && values.length ? [...values].sort().at(-1) : null;
    const rows = values.map((v) => `<label class="fp-chk"><input type="checkbox" data-field="${field}" value="${escapeHTML(String(v))}"${defaultLatestOnly ? (v === latestValue ? ' checked' : '') : ' checked'}>${escapeHTML(String(v))}</label>`).join('');
    return `
      <div class="fp-group" data-group="${field}">
        <div class="fp-label-row">
          <div class="fp-label">${label}</div>
          <div class="fp-quick">
            <button type="button" class="fp-quick-btn" data-all="${field}">All</button>
            <button type="button" class="fp-quick-btn" data-none="${field}">None</button>
          </div>
        </div>
        ${searchable ? `<input type="text" class="fp-search" placeholder="Search…" aria-label="Search ${label}" data-search="${field}">` : ''}
        <div class="fp-chk-list${searchable ? ' fp-chk-list-scroll' : ''}" data-list="${field}">${rows}</div>
      </div>`;
  }).join('');
  return `
    <div class="filters-control">
      <button class="filters-btn" id="${tabId}-filters-btn">Filters <span class="filter-badge" id="${tabId}-badge" hidden>0</span></button>
      <div class="filters-panel filters-panel-wide" id="${tabId}-filters-panel">
        <div class="fp-groups">${groups}</div>
        <div class="fp-actions"><button class="fp-reset" data-reset="${tabId}">Reset all filters</button></div>
      </div>
    </div>
    <span class="filters-summary" id="${tabId}-summary"></span>`;
}

function wireFilterPanel(tabId, filterDefs, onChange) {
  const btn = document.getElementById(`${tabId}-filters-btn`);
  const panel = document.getElementById(`${tabId}-filters-panel`);
  const badge = document.getElementById(`${tabId}-badge`);

  btn.addEventListener('click', () => panel.classList.toggle('open'));
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) panel.classList.remove('open');
  });

  function updateBadge() {
    let narrowed = 0;
    filterDefs.forEach(({ field }) => {
      const all = panel.querySelectorAll(`input[data-field="${field}"]`).length;
      const checked = panel.querySelectorAll(`input[data-field="${field}"]:checked`).length;
      if (checked < all) narrowed++;
    });
    if (narrowed) { badge.hidden = false; badge.textContent = String(narrowed); } else { badge.hidden = true; }
  }

  panel.querySelectorAll('input[type="checkbox"][data-field]').forEach((cb) => {
    cb.addEventListener('change', () => { onChange(); updateBadge(); });
  });
  panel.querySelectorAll('[data-all]').forEach((b) => b.addEventListener('click', () => {
    panel.querySelectorAll(`input[data-field="${b.dataset.all}"]`).forEach((cb) => { cb.checked = true; });
    onChange(); updateBadge();
  }));
  panel.querySelectorAll('[data-none]').forEach((b) => b.addEventListener('click', () => {
    panel.querySelectorAll(`input[data-field="${b.dataset.none}"]`).forEach((cb) => { cb.checked = false; });
    onChange(); updateBadge();
  }));
  panel.querySelectorAll('input[data-search]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const q = inp.value.toLowerCase();
      panel.querySelectorAll(`.fp-chk-list[data-list="${inp.dataset.search}"] .fp-chk`).forEach((label) => {
        label.style.display = label.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  });
  panel.querySelector('[data-reset]').addEventListener('click', () => {
    panel.querySelectorAll('input[type="checkbox"][data-field]').forEach((cb) => { cb.checked = true; });
    panel.querySelectorAll('input[data-search]').forEach((inp) => { inp.value = ''; });
    panel.querySelectorAll('.fp-chk').forEach((l) => { l.style.display = ''; });
    onChange(); updateBadge();
  });

  updateBadge();
}

function readFilterState(tabId, filterDefs) {
  const panel = document.getElementById(`${tabId}-filters-panel`);
  const state = {};
  filterDefs.forEach(({ field }) => {
    state[field] = new Set([...panel.querySelectorAll(`input[data-field="${field}"]:checked`)].map((cb) => cb.value));
  });
  return state;
}

/** Re-applies every filter in `state` except forces the Season group open to the full
 * `allSeasons` list -- for "X x season" heatmaps whose columns always show every season (only the
 * other filters narrow them). */
function reopenSeasons(dataset, state, allSeasons) {
  return applyFilters(dataset, { ...state, season: new Set(allSeasons) });
}

/** Builds parallel {values, counts} arrays for a fixed season axis from already-filtered rows:
 * groups by season and applies metricFn to each season's rows (null for a season with no rows),
 * plus the raw per-season row count so a chart can show a real n= in its tooltip. */
function seasonSeries(rows, seasons, metricFn) {
  const byS = groupBy(rows, 'season');
  const values = seasons.map((s) => { const g = byS.get(s); return g && g.length ? metricFn(g) : null; });
  const counts = seasons.map((s) => { const g = byS.get(s); return g ? g.length : 0; });
  return { values, counts };
}

function applyFilters(rows, state) {
  // A blank/null value on a row always passes every filter on that field -- "no
  // info charted for this dimension" isn't the same as "excluded by the user's
  // selection." (Real bug found and fixed 2026-07-29: the default, everything-
  // checked view must show every row, not silently drop the ones missing one field.)
  return rows.filter((r) => Object.entries(state).every(([field, set]) => {
    // Only checkbox-filter entries are Sets; anything else in the state (e.g. a single-select
    // control's value that Site.view mixes in) isn't a filter on this field.
    if (!(set instanceof Set)) return true;
    // An empty set means the user explicitly hit "None" on this group -- unlike
    // a normal narrowed selection, that should exclude everything on this field
    // (including blank/null rows), not fall through to "no filter applied."
    // Real bug found and fixed 2026-07-30: this used to `return true` here, so
    // clicking "None" silently showed every row instead of zero.
    if (!set.size) return false;
    const v = r[field];
    if (v === null || v === undefined || v === '') return true;
    return set.has(String(v));
  }));
}

/* ------------------------------------------------------- searchable combobox --- */

/** A single-select text input with a live-filtered dropdown list -- for choosing
 * one item out of a long list (e.g. 230+ athlete names) where a plain <select>
 * forces scrolling through everything alphabetically with no way to type-ahead. */
function makeSearchCombobox(container, { options, value, onChange, placeholder = 'Search…' }) {
  const wrap = el('div', 'combobox');
  const input = el('input', 'combobox-input');
  input.type = 'text';
  input.placeholder = placeholder;
  input.setAttribute('aria-label', placeholder.replace(/…$/, ''));
  // Real bug found 2026-07-31: with no spellcheck/autocomplete attributes, a
  // name the browser's dictionary doesn't recognize (most athlete names) gets
  // underlined and can pop the browser's native spellcheck/autocorrect UI on a
  // quick click, competing with (and sometimes eating) the click meant to pick
  // a dropdown item. None of this input's own values are ever submitted or
  // autofilled, so all of these are safe to disable outright.
  input.spellcheck = false;
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('autocapitalize', 'off');
  const list = el('div', 'combobox-list');
  wrap.appendChild(input);
  wrap.appendChild(list);
  container.innerHTML = '';
  container.appendChild(wrap);

  let current = value;
  function labelFor(v) { return (options.find((o) => o.value === v) || {}).label || ''; }
  input.value = labelFor(current);

  function renderList(query) {
    const q = (query || '').toLowerCase();
    // No cap here -- was a hard-coded slice(0, 40) (real bug found 2026-07-31:
    // this exact function's own docstring cites "230+ athlete names" as the
    // reason it exists, yet silently hid anything past the first 40 unfiltered
    // matches; .combobox-list's max-height/overflow-y:auto in theme.css can
    // scroll through any number of rendered rows, the cap was the only thing
    // actually preventing you from reaching the rest by scrolling or typing).
    const matches = options.filter((o) => o.label.toLowerCase().includes(q));
    list.innerHTML = matches.map((o) => `<div class="combobox-item" data-value="${escapeHTML(String(o.value))}">${escapeHTML(String(o.label))}</div>`).join('');
    list.querySelectorAll('.combobox-item').forEach((item) => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        current = item.dataset.value;
        input.value = item.textContent;
        list.classList.remove('open');
        onChange(current);
      });
    });
    list.classList.toggle('open', matches.length > 0);
  }

  input.addEventListener('focus', () => renderList(''));
  input.addEventListener('input', () => renderList(input.value));
  input.addEventListener('blur', () => {
    setTimeout(() => {
      list.classList.remove('open');
      if (input.value !== labelFor(current)) input.value = labelFor(current); // revert if left mid-search
    }, 120);
  });

  return { get value() { return current; }, set value(v) { current = v; input.value = labelFor(v); } };
}
