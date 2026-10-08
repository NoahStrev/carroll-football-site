/*
  charts.js -- renderBar, renderStacked, renderScatter, renderHeatmap, renderSparkline,
  renderGroupedBar. Each renders into a container element using the classes in css/theme.css.
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

/* ------------------------------------------------------------- bar chart ---- */

/** categories: [name...]; values: [number...]; labelFmt(v): string for the cap.
 * colorFn(name, value, i): css color string. tooltipFmt(cat, value, i): full custom
 * tooltip HTML, overrides the default entirely if given. xlab2(cat, i): a sample-size
 * caption under the x-axis label -- also folded into the default tooltip automatically
 * (e.g. "n=85 punts") so hovering shows the same context as the caption. */
/** compact: true shrinks the plot to the 110px/14px-pad size used for the small
 * per-person charts on H2H tabs (FG makes by distance, Outcome mix) -- pass it
 * instead of wrapping the target container in its own static .barchart/.gridlines
 * markup. Real bug found 2026-07-31: those H2H mini-charts used to nest a static
 * .barchart shell around the container renderBar renders into, and renderBar
 * builds its own .barchart/.gridlines inside that -- same double-nested-class
 * bug as the heatmap fix earlier this session, and it left .barcol sized to its
 * own content (~50px) instead of stretching to the card, stuck at the left edge
 * with blank space to the right. */
/** A chart's columns can't shrink below a readable width, so on a narrow card (a phone) a chart with
 * many categories overflows its card -- which clips the right-hand bars. The chart box scrolls sideways
 * instead (CSS), and the gridlines are stretched to the full scrollable width so they don't stop short.
 * Call once the chart is attached to the page: scrollWidth isn't reliable on a detached element. */
function fitChartToCard(wrap, gridlines) {
  if (wrap.scrollWidth <= wrap.clientWidth + 1) return;
  gridlines.style.right = 'auto';
  gridlines.style.width = `${wrap.scrollWidth}px`;
}

/** scroll: true stops categories flex-shrinking to fit the card (which
 * squeezes every bar unreadably once there are more than ~8-10, e.g.
 * Opponent Scouting's "by opponent" charts across 10-15 real opponents) --
 * each .barcol gets a fixed colWidth instead, and the chart scrolls
 * horizontally within its own card once the columns overflow it. */
function renderBar(container, { categories, values, labelFmt = (v) => fmt(v, 1), colorFn, tooltipFmt, xlab2, tooltipExtra, seriesName, compact = false, scroll = false, colWidth = 78 }) {
  container.innerHTML = '';
  const wrap = el('div', 'barchart');
  if (compact) { wrap.style.height = '110px'; wrap.style.paddingTop = '14px'; }
  const max = Math.max(1e-9, ...values.filter((v) => v !== null && !Number.isNaN(v)));
  const gridlines = el('div', 'gridlines');
  for (let i = 0; i < 4; i++) gridlines.appendChild(document.createElement('div'));
  wrap.appendChild(gridlines);

  // xlab2 is a second, always-visible caption line under the bar (e.g. "avg 5.2 yds").
  // tooltipExtra is hover-only supplementary context (e.g. sample size) that doesn't
  // deserve permanent on-chart real estate -- shown in the tooltip alongside the value.
  function defaultTooltip(cat, v, i) {
    if (v === null || Number.isNaN(v)) return `<b>${cat}</b><br>No data`;
    const rows = [`<div class="tt-title">${cat}${seriesName ? ` — ${seriesName}` : ''}</div>`,
      `<div class="tt-row"><span>${labelFmt(v)}</span></div>`];
    if (xlab2) rows.push(`<div class="tt-row tt-muted">${xlab2(cat, i)}</div>`);
    if (tooltipExtra) rows.push(`<div class="tt-row tt-muted">${tooltipExtra(cat, i)}</div>`);
    return rows.join('');
  }

  categories.forEach((cat, i) => {
    const v = values[i];
    const col = el('div', 'barcol');
    if (scroll) col.style.flex = `0 0 ${colWidth}px`;
    const plot = el('div', 'barplot');
    const barH = v === null || Number.isNaN(v) ? 0 : Math.max(2, (v / max) * 100);
    const bar = el('div', 'bar');
    bar.style.height = `${barH}%`;
    if (colorFn) bar.style.background = colorFn(cat, v, i);
    if (v !== null && !Number.isNaN(v)) bar.appendChild(el('span', 'cap', labelFmt(v)));
    const tt = () => (tooltipFmt ? tooltipFmt(cat, v, i) : defaultTooltip(cat, v, i));
    attachTooltip(bar, tt);
    plot.appendChild(bar);
    col.appendChild(plot);
    const xlabEl = el('div', 'xlab', cat);
    xlabEl.title = cat;
    col.appendChild(xlabEl);
    if (xlab2) {
      const xlab2Text = xlab2(cat, i);
      const xlab2El = el('div', 'xlab2', xlab2Text);
      xlab2El.title = xlab2Text;
      col.appendChild(xlab2El);
    }
    wrap.appendChild(col);
  });
  container.appendChild(wrap);
  enableChartKeys(container);
  // Real bug found 2026-08-05, per the user ("when i scroll to the right on
  // some of the vizes in the by opponent section the lines disappear"):
  // .gridlines is `position: absolute; inset: 20px 0 34px 0` (theme.css) --
  // `right: 0` resolves against .barchart's own CSS width (its visible
  // viewport, unchanged by scrolling), not the full scrollable content width
  // once `scroll: true` makes .barchart's content wider than the box itself.
  // So the gridlines only ever spanned the columns visible at scroll
  // position 0 -- scroll right past that and you're looking at bars with no
  // reference lines behind them at all. Fixed by giving gridlines an
  // explicit width matching wrap's actual rendered content width (read via
  // scrollWidth -- measured only now that `wrap` is attached to `container`,
  // since a detached element's scrollWidth isn't reliable; recomputing from
  // colWidth * count instead would also undercount by ignoring .barchart's
  // own flex `gap`) and clearing `right` so the explicit width wins over the
  // inset shorthand's `right: 0`. Measured before gridlines itself has a
  // width, so it can't inflate its own measurement.
  fitChartToCard(wrap, gridlines); // covers scroll: true and a card too narrow for the columns
}

/* ------------------------------------------------------------ stacked bar --- */

/** categories: [name...]; series: {seriesName: [value per category]}; order matters
 * for stack order (first = bottom). colors: {seriesName: cssColor}. */
function renderStacked(container, { categories, series, order, colors, legend = true }) {
  container.innerHTML = '';
  if (legend) {
    const lg = el('div', 'legend');
    order.forEach((name) => {
      const sw = el('span', 'sw');
      const dot = el('span', 'dot');
      dot.style.background = colors[name];
      sw.appendChild(dot);
      sw.appendChild(document.createTextNode(name));
      lg.appendChild(sw);
    });
    container.appendChild(lg);
  }
  const wrap = el('div', 'stacked');
  const totals = categories.map((_, i) => order.reduce((s, name) => s + (series[name][i] || 0), 0));
  const max = Math.max(1e-9, ...totals);
  const gridlines = el('div', 'gridlines');
  for (let i = 0; i < 4; i++) gridlines.appendChild(document.createElement('div'));
  wrap.appendChild(gridlines);
  categories.forEach((cat, i) => {
    const col = el('div', 'stackcol');
    const total = totals[i];
    col.appendChild(el('div', 'cap', total ? String(total) : ''));
    const plot = el('div', 'stackplot');
    const bar = el('div', 'stackbar');
    bar.style.height = `${Math.max(2, (total / max) * 100)}%`;
    order.forEach((name) => {
      const v = series[name][i] || 0;
      if (!v) return;
      const seg = el('div', 'seg');
      seg.style.background = colors[name];
      seg.style.height = `${(v / total) * 100}%`;
      const share = total ? v / total : 0;
      const tt = () => [
        `<div class="tt-title">${cat}</div>`,
        `<div class="tt-row"><span>${name}</span><span>${v}</span></div>`,
        `<div class="tt-muted">${pct(share, 0)} of ${total} in this group</div>`,
      ].join('');
      attachTooltip(seg, tt);
      bar.appendChild(seg);
    });
    plot.appendChild(bar);
    col.appendChild(plot);
    const xlabEl = el('div', 'xlab', cat);
    xlabEl.title = cat;
    col.appendChild(xlabEl);
    wrap.appendChild(col);
  });
  container.appendChild(wrap);
  enableChartKeys(container);
  fitChartToCard(wrap, gridlines);
}

/* ------------------------------------------------------------- scatter ------ */

/** points: [{x, y, group, label}]. colorMap: {group: cssColor}. */
function renderScatter(container, { points, xLabel, yLabel, colorMap, xDomain, yDomain }) {
  container.innerHTML = '';
  const W = 600, H = 150, PAD_L = 34, PAD_B = 18, PAD_T = 6, PAD_R = 6;
  const xs = points.map((p) => p.x).filter((v) => v !== null && v !== undefined);
  const ys = points.map((p) => p.y).filter((v) => v !== null && v !== undefined);
  if (!xs.length || !ys.length) {
    container.appendChild(el('div', 'foot', 'No data in current filters.'));
    return;
  }
  const [xMin, xMax] = xDomain || [Math.min(...xs), Math.max(...xs)];
  const [yMin, yMax] = yDomain || [Math.min(...ys), Math.max(...ys)];
  const sx = (v) => PAD_L + ((v - xMin) / (xMax - xMin || 1)) * (W - PAD_L - PAD_R);
  const sy = (v) => H - PAD_B - ((v - yMin) / (yMax - yMin || 1)) * (H - PAD_B - PAD_T);

  const svgns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Scatter chart of ${yLabel || 'value'} against ${xLabel || 'position'}, ${xs.length} points`);
  svg.style.width = '100%';
  svg.style.height = `${H}px`;

  // gridlines (y-axis, 3 lines)
  for (let i = 0; i <= 2; i++) {
    const gy = PAD_T + (i * (H - PAD_B - PAD_T)) / 2;
    const line = document.createElementNS(svgns, 'line');
    line.setAttribute('x1', PAD_L); line.setAttribute('x2', W - PAD_R);
    line.setAttribute('y1', gy); line.setAttribute('y2', gy);
    line.setAttribute('stroke', cssVar('--grid')); line.setAttribute('stroke-width', '1');
    svg.appendChild(line);
    const label = document.createElementNS(svgns, 'text');
    label.setAttribute('x', PAD_L - 4); label.setAttribute('y', gy + 3);
    label.setAttribute('text-anchor', 'end'); label.setAttribute('font-size', '9');
    label.setAttribute('fill', cssVar('--muted'));
    label.textContent = fmt(yMax - (i * (yMax - yMin)) / 2, 0);
    svg.appendChild(label);
  }

  points.forEach((p) => {
    if (p.x === null || p.y === null || p.x === undefined || p.y === undefined) return;
    const c = document.createElementNS(svgns, 'circle');
    c.setAttribute('cx', sx(p.x)); c.setAttribute('cy', sy(p.y)); c.setAttribute('r', 4);
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke', (colorMap && colorMap[p.group]) || cssVar('--cat-1'));
    c.setAttribute('stroke-width', '1.6');
    c.style.cursor = 'pointer';
    const defaultTt = () => [
      p.group ? `<div class="tt-title">${p.group}</div>` : '',
      `<div class="tt-row"><span>${xLabel}</span><span>${fmt(p.x)}</span></div>`,
      `<div class="tt-row"><span>${yLabel}</span><span>${fmt(p.y)}</span></div>`,
    ].join('');
    const tt = () => p.label || defaultTt();
    attachTooltip(c, tt);
    svg.appendChild(c);
  });

  const wrap = el('div', 'linewrap');
  wrap.appendChild(svg);
  const axis = el('div', 'axis-x');
  axis.appendChild(el('span', null, xLabel));
  axis.appendChild(el('span', null, yLabel));
  container.appendChild(wrap);
  container.appendChild(axis);
  enableChartKeys(container);
}

/* ------------------------------------------------------------- heatmap ------ */

const SEQ_STEPS = ['--seq-100', '--seq-200', '--seq-300', '--seq-400', '--seq-500', '--seq-600'];

/** rowLabels/colLabels: [string...]. cellFor(row, col): {pct: 0..1, n, made} or
 * null/undefined for "no data in this cell" (rendered as a dash on --grid, not a
 * fabricated 0%). Sequential single-hue ramp per the dataviz skill -- magnitude
 * only, sorted rows/cols stay in the order given (caller's job, e.g. sortBuckets
 * for a distance bucket axis). */
function renderHeatmap(container, { rowLabels, colLabels, cellFor, title = (r, c) => `${r} × ${c}` }) {
  container.innerHTML = '';
  container.classList.add('heat-scroll');
  const grid = el('div', 'heat');
  // Real bug found 2026-07-31: 1fr stretched every data column to fill
  // whatever's left of the card's width -- fine for a 5-season heatmap on a
  // half-width card, but on a full-width card with only 4 columns (Offense/
  // Defense's Down x Distance grid) each cell ballooned to ~280px wide for a
  // 3-4 character value. minmax() sizes columns to their actual content
  // instead; .heat's justify-content:center (theme.css) keeps the now-
  // compact grid from sitting left-stuck with empty space to its right.
  grid.style.gridTemplateColumns = `minmax(70px, 130px) repeat(${colLabels.length}, minmax(46px, 100px))`;
  grid.appendChild(el('div', 'rowlabel', ''));
  colLabels.forEach((c) => grid.appendChild(el('div', 'collabel', c)));
  rowLabels.forEach((r) => {
    grid.appendChild(el('div', 'rowlabel', r));
    colLabels.forEach((c) => {
      const cell = cellFor(r, c);
      const div = el('div', 'hcell');
      if (!cell || !cell.n) {
        div.style.background = cssVar('--grid');
        div.style.color = cssVar('--muted');
        div.textContent = '—';
      } else {
        const step = Math.min(SEQ_STEPS.length - 1, Math.floor(cell.pct * SEQ_STEPS.length));
        div.style.background = cssVar(SEQ_STEPS[step]);
        div.style.color = step >= 4 ? '#fff' : cssVar('--text-primary');
        div.innerHTML = `${pct(cell.pct, 0)}<span class="n">${cell.made}/${cell.n}</span>`;
        const html = `<div class="tt-title">${title(r, c)}</div><div class="tt-row"><span>${pct(cell.pct, 0)}</span><span>${cell.made}/${cell.n}</span></div>`;
        attachTooltip(div, html);
        div.style.cursor = 'pointer';
      }
      grid.appendChild(div);
    });
  });
  container.appendChild(grid);
  enableChartKeys(container);
}

/* ------------------------------------------------------------ sparkline ----- */

/** values: [number...] (chronological); labels: [string...] same length. Colors
 * each segment green if it's rising toward/above the running average, red if
 * falling below -- matches the reference dashboards' red/green trend lines. */
function renderSparkline(container, { values, labels, unit = '', seasons, opponents }) {
  container.innerHTML = '';
  const pts = values.map((v, i) => ({ v, l: labels[i], season: seasons && seasons[i], opponent: opponents && opponents[i] })).filter((p) => p.v !== null && p.v !== undefined);
  if (pts.length < 2) {
    container.appendChild(el('div', 'foot', 'Not enough data points.'));
    return;
  }
  const W = 560, H = 140, PAD = 8;
  const avg = mean(pts.map((p) => p.v));
  const vMin = Math.min(...pts.map((p) => p.v), avg);
  const vMax = Math.max(...pts.map((p) => p.v), avg);
  const sx = (i) => PAD + (i / (pts.length - 1)) * (W - PAD * 2);
  const sy = (v) => H - PAD - ((v - vMin) / (vMax - vMin || 1)) * (H - PAD * 2 - 14) - 6;

  const svgns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Game-by-game trend, ${pts.length} games: ${fmt(pts[0].v)}${unit} in the first, ${fmt(pts[pts.length - 1].v)}${unit} in the latest, ${fmt(avg)}${unit} on average`);
  svg.style.width = '100%';
  svg.style.height = `${H}px`;

  const avgLine = document.createElementNS(svgns, 'line');
  avgLine.setAttribute('x1', PAD); avgLine.setAttribute('x2', W - PAD);
  avgLine.setAttribute('y1', sy(avg)); avgLine.setAttribute('y2', sy(avg));
  avgLine.setAttribute('stroke', cssVar('--baseline')); avgLine.setAttribute('stroke-width', '1');
  avgLine.setAttribute('stroke-dasharray', '3,3');
  svg.appendChild(avgLine);
  const avgLabel = document.createElementNS(svgns, 'text');
  avgLabel.setAttribute('x', PAD); avgLabel.setAttribute('y', sy(avg) - 4);
  avgLabel.setAttribute('font-size', '9'); avgLabel.setAttribute('fill', cssVar('--muted'));
  avgLabel.textContent = 'Average';
  svg.appendChild(avgLabel);

  for (let i = 1; i < pts.length; i++) {
    const seg = document.createElementNS(svgns, 'line');
    seg.setAttribute('x1', sx(i - 1)); seg.setAttribute('y1', sy(pts[i - 1].v));
    seg.setAttribute('x2', sx(i)); seg.setAttribute('y2', sy(pts[i].v));
    const rising = pts[i].v >= pts[i - 1].v;
    seg.setAttribute('stroke', rising ? cssVar('--good') : cssVar('--critical'));
    seg.setAttribute('stroke-width', '2');
    seg.setAttribute('stroke-linecap', 'round');
    svg.appendChild(seg);
  }
  pts.forEach((p, i) => {
    const c = document.createElementNS(svgns, 'circle');
    c.setAttribute('cx', sx(i)); c.setAttribute('cy', sy(p.v)); c.setAttribute('r', 3);
    c.setAttribute('fill', cssVar('--surface-1'));
    c.setAttribute('stroke', p.v >= avg ? cssVar('--good') : cssVar('--critical'));
    c.setAttribute('stroke-width', '2');
    c.style.cursor = 'pointer';
    const prev = i > 0 ? pts[i - 1].v : null;
    const delta = prev !== null ? p.v - prev : null;
    const vsAvg = p.v - avg;
    const html = () => [
      `<div class="tt-title">${p.l}${p.season ? `, ${p.season}` : ''}</div>`,
      p.opponent ? `<div class="tt-row"><span>Opponent</span><span>${p.opponent}</span></div>` : '',
      `<div class="tt-row"><span>Value</span><span>${fmt(p.v)}${unit}</span></div>`,
      delta !== null ? `<div class="tt-row"><span>Vs previous</span><span style="color:${delta >= 0 ? 'var(--delta-good)' : 'var(--critical-text)'}">${delta >= 0 ? '+' : ''}${fmt(delta)}${unit}</span></div>` : '',
      `<div class="tt-muted">${vsAvg >= 0 ? '+' : ''}${fmt(vsAvg)}${unit} vs average (${fmt(avg)}${unit})</div>`,
    ].join('');
    attachTooltip(c, html);
    svg.appendChild(c);
  });

  const wrap = el('div', 'linewrap');
  wrap.appendChild(svg);
  container.appendChild(wrap);
  const axis = el('div', 'axis-x');
  axis.appendChild(el('span', null, pts[0].l));
  axis.appendChild(el('span', null, pts[pts.length - 1].l));
  container.appendChild(axis);
  enableChartKeys(container);
}

/* ------------------------------------------------------------ grouped bar -- */

/** Grouped (paired) bar chart -- two bars per category, for direct two-person
 * comparison. Replaces the old two-line season trend chart (renderTwoLine,
 * removed 2026-07-31 per the user): with only a handful of high-school-career
 * seasons per person, a connected line implies a continuous trend that isn't
 * really there, and two overlaid lines whose active seasons don't overlap
 * read as more directly comparable than they are. Side-by-side bars per
 * season compare the same thing without that implication -- a season one
 * person didn't play just shows an empty slot instead of a misleading gap
 * in a line. */
function renderGroupedBar(container, { categories, valuesA, valuesB, colorA, colorB, nameA, nameB, labelFmt = (v) => fmt(v, 1), countsA, countsB }) {
  container.innerHTML = '';
  const wrap = el('div', 'barchart');
  const all = [...valuesA, ...valuesB].filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  const max = Math.max(1e-9, ...all);
  const gridlines = el('div', 'gridlines');
  for (let i = 0; i < 4; i++) gridlines.appendChild(document.createElement('div'));
  wrap.appendChild(gridlines);

  function tooltip(name, v, n) {
    if (v === null || v === undefined || Number.isNaN(v)) return `<div class="tt-title">${name}</div><div class="tt-row tt-muted">No data</div>`;
    const nRow = n !== undefined && n !== null ? `<div class="tt-muted">n=${n}</div>` : '';
    return `<div class="tt-title">${name}</div><div class="tt-row"><span>${labelFmt(v)}</span></div>${nRow}`;
  }

  categories.forEach((cat, i) => {
    const col = el('div', 'barcol');
    const plot = el('div', 'barplot');
    plot.style.gap = '6px';
    [[valuesA[i], colorA, nameA, countsA], [valuesB[i], colorB, nameB, countsB]].forEach(([v, color, name, counts]) => {
      const bar = el('div', 'bar');
      const h = v === null || v === undefined || Number.isNaN(v) ? 0 : Math.max(2, (v / max) * 100);
      bar.style.height = `${h}%`;
      bar.style.background = color;
      if (v !== null && v !== undefined && !Number.isNaN(v)) bar.appendChild(el('span', 'cap', labelFmt(v)));
      const html = tooltip(name, v, counts ? counts[i] : undefined);
      attachTooltip(bar, html);
      plot.appendChild(bar);
    });
    col.appendChild(plot);
    const xlabEl = el('div', 'xlab', cat);
    xlabEl.title = cat;
    col.appendChild(xlabEl);
    wrap.appendChild(col);
  });
  container.appendChild(wrap);
  enableChartKeys(container);
  fitChartToCard(wrap, gridlines);
}

/** Card with a "Last Game" KPI + "Last vs Previous Game" delta + sparkline (compares to the
 * immediately-prior game, not a season average). `container` becomes the whole card. */
function renderTrendCard(container, rows, field, unit, title) {
  const { values, labels, seasons, opponents } = gameTrend(rows, field);
  const lastVal = values.length ? values[values.length - 1] : null;
  const prevVal = values.length > 1 ? values[values.length - 2] : null;
  const delta = lastVal !== null && prevVal !== null ? lastVal - prevVal : null;
  container.innerHTML = `
    <div class="card-head"><h2>${title}</h2></div>
    <div class="card-body trend-body">
      <div>
        <div class="kpi small kpi-plain" style="border:none; padding:0; background:none;">
          <div class="label">Last Game Avg</div>
          <div class="value">${fmt(lastVal)}${unit}</div>
        </div>
        <div class="kpi small kpi-plain" style="border:none; padding:0; background:none; margin-top:10px;">
          <div class="label">Last vs Previous Game</div>
          <div class="value" style="font-size:15px; color:${delta === null ? 'inherit' : (delta >= 0 ? 'var(--delta-good)' : 'var(--critical-text)')}">${delta === null ? '—' : (delta >= 0 ? '+' : '') + fmt(delta)}</div>
        </div>
      </div>
      <div class="trend-chart"></div>
    </div>`;
  renderSparkline(container.querySelector('.trend-chart'), { values, labels, unit, seasons, opponents });
}
