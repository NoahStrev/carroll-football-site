/* The record-book half of Players & Records: Record Book (every program record), Record Watch (current players
   closing in on one), and Awards History (all-conference, all-region, all-American, and the rest).

   Data is data/records.json (build_records_data.py), already shaped by the build; these tabs only lay it out.
   Scraped cells that are genuinely blank in the source arrive as JSON null, so every raw field goes through blank().
   Loaded before players.js, which mounts them as tabs. */
const RecordsTabs = (function () {
  const esc = Site.esc;
  const blank = (v) => (v === null || v === undefined || v === '' ? '—' : esc(v));

    /* ========================================================= Record Book == */

    const RECORD_BOOK_VIEWS = [
      { id: 'single_game', label: 'Single-Game' },
      { id: 'single_season', label: 'Single-Season (Team)' },
      { id: 'career', label: 'Career (Individual)' },
      { id: 'season', label: 'Single-Season (Individual)' },
    ];

    function groupBySection(rows) {
      const map = new Map();
      rows.forEach((r) => {
        const key = r.section || '';
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(r);
      });
      return map;
    }

    const recordsTable = (head, body) => `<div class="tbl-scroll"><table class="mini records-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;

    function singleGameHTML(individualRows, teamRows) {
      const iBy = groupBySection(individualRows), tBy = groupBySection(teamRows);
      return [...new Set([...iBy.keys(), ...tBy.keys()])].map((sec) => `
        <div class="record-section-title">${esc(sec)}</div>
        <div class="cards">
          <div class="card table-card"><div class="card-head"><h2>Individual</h2></div><div class="card-body flush">
            ${recordsTable(['Statistic', 'Value', 'Player', 'Opponent', 'Date'], (iBy.get(sec) || []).map((r) => `<tr><td class="name">${blank(r.statistic)}</td><td>${blank(r.value)}</td><td>${blank(r.player)}</td><td>${blank(r.opponent)}</td><td>${blank(r.date)}</td></tr>`).join(''))}
          </div></div>
          <div class="card table-card"><div class="card-head"><h2>Team</h2></div><div class="card-body flush">
            ${recordsTable(['Statistic', 'Value', 'Opponent', 'Date'], (tBy.get(sec) || []).map((r) => `<tr><td class="name">${blank(r.statistic)}</td><td>${blank(r.value)}</td><td>${blank(r.opponent)}</td><td>${blank(r.date)}</td></tr>`).join(''))}
          </div></div>
        </div>`).join('');
    }

    function singleSeasonTeamHTML(rows) {
      return [...groupBySection(rows).entries()].map(([sec, secRows]) => `
        <div class="record-section-title">${esc(sec)}</div>
        <div class="card table-card"><div class="card-body flush">
          ${recordsTable(['Statistic', 'Value', 'Season'], secRows.map((r) => `<tr><td class="name">${blank(r.statistic)}</td><td>${blank(r.value)}</td><td>${blank(r.season)}</td></tr>`).join(''))}
        </div></div>`).join('');
    }

    function leaderboardRecordsHTML(rows) {
      const byCategory = new Map();
      rows.forEach((r) => {
        if (!byCategory.has(r.category)) byCategory.set(r.category, new Map());
        const stats = byCategory.get(r.category);
        if (!stats.has(r.statistic)) stats.set(r.statistic, []);
        stats.get(r.statistic).push(r);
      });
      let html = '';
      byCategory.forEach((stats, category) => {
        html += `<div class="record-section-title">${esc(category)}</div><div class="cards">`;
        stats.forEach((entries, statistic) => {
          html += `
            <div class="card table-card"><div class="card-head"><h2>${esc(statistic)}</h2></div><div class="card-body flush">
              <table class="mini records-table"><thead><tr><th>Rank</th><th>Player</th><th>Value</th><th>Years</th></tr></thead>
              <tbody>${entries.map((e) => `<tr><td>${blank(e.rank_label)}</td><td class="name">${blank(e.player)}</td><td>${blank(e.value)}</td><td>${blank(e.years)}</td></tr>`).join('')}</tbody></table>
            </div></div>`;
        });
        html += '</div>';
      });
      return html;
    }

    function recordBookTab(root, { sub }) {
      root.innerHTML = `
        <section class="panel">
          <div class="body">
            <div class="toolbar-row"><div id="rb-views"></div><button type="button" class="download-btn no-print push-right" id="rb-pdf">&#8595; PDF</button></div>
            <div id="rb-content"></div>
          </div>
          <div class="footer-note">Source: Carroll Athletics' own gopios.com record book (Records &amp; Awards project's scrape of the site's All-Time Records pages). Shown exactly as published, including any real ties.</div>
        </section>`;
      const R = Site.data.records.records;
      const views = {
        single_game: () => singleGameHTML(R.SingleGameIndividual, R.SingleGameTeam),
        single_season: () => singleSeasonTeamHTML(R.SingleSeasonTeam),
        career: () => leaderboardRecordsHTML(R.CareerIndividual),
        season: () => leaderboardRecordsHTML(R.SeasonIndividual),
      };
      const start = views[sub] ? sub : 'single_game';
      const draw = (id) => { root.querySelector('#rb-content').innerHTML = views[id](); };
      Site.pills(root.querySelector('#rb-views'), { options: RECORD_BOOK_VIEWS, value: start, onChange: (id) => { Site.setSub(id); draw(id); } });
      root.querySelector('#rb-pdf').addEventListener('click', () => printPage('Record Book - Carroll Football'));
      draw(start);
    }

    /* ======================================================== Record Watch == */

    const watchRowHTML = (e) => `<tr><td class="name">${esc(e.player)}</td><td>${esc(e.position || '—')}</td><td>${fmt(e.current_value, Number.isInteger(e.current_value) ? 0 : 1)}</td><td>${recordWatchStatusHTML(e)}</td></tr>`;

    // build_records_data.py already filters to active players, drops zero entries, and
    // caps each statistic at 5 (see its GAP_CUTOFF_FRACTION) -- this is pure rendering.
    function watchSectionHTML(entriesByStat, totalLabel) {
      const stats = Object.keys(entriesByStat);
      if (!stats.length) return `<div class="insight">No current player is close enough to a real ${totalLabel.toLowerCase()} record yet to show here.</div>`;
      return stats.map((stat) => `
        <div class="record-section-title">${esc(stat)}</div>
        <div class="card table-card"><div class="card-body flush">
          <table class="mini records-table"><thead><tr><th>Player</th><th>Position</th><th>${totalLabel}</th><th>Status</th></tr></thead>
          <tbody>${entriesByStat[stat].map(watchRowHTML).join('')}</tbody></table>
        </div></div>`).join('');
    }

    const WATCH_VIEWS = [
      { id: 'career', label: 'Career', totalLabel: 'Career Total' },
      { id: 'season', label: 'Single Season', totalLabel: 'Season Total' },
    ];

    function recordWatchTab(root, { sub }) {
      const rw = Site.data.records.record_watch;
      root.innerHTML = `
        <section class="panel">
          <div class="body">
            <div class="toolbar-row"><div id="rw-views"></div></div>
            <div class="insight" style="margin-bottom:14px;">Only players with a real ${rw.current_season} stat-line (still on the team, not just active sometime recently) are shown, and only when they're genuinely within range of the current Top 5 — up to 5 per statistic.</div>
            <div id="rw-content"></div>
          </div>
          <div class="footer-note">Career/season totals from this site's own build_career_stats.py (real box-score archive, 2010-present, joined to the roster). Record book values from the scraped Career/Single-Season leaderboards. Covers Rushing, Passing, Receiving, Interceptions, Tackles, Sacks, Field Goals, PATs, Punting, and Kickoff/Punt Returns — the categories with a real per-player total already built. Rate-stat records (e.g. "Average Yards Per Punt") aren't compared here, only counting stats.</div>
        </section>`;
      const draw = (id) => {
        const view = WATCH_VIEWS.find((v) => v.id === id);
        root.querySelector('#rw-content').innerHTML = watchSectionHTML(rw[view.id], view.totalLabel);
      };
      const start = WATCH_VIEWS.some((v) => v.id === sub) ? sub : 'career';
      Site.pills(root.querySelector('#rw-views'), { options: WATCH_VIEWS, value: start, onChange: (id) => { Site.setSub(id); draw(id); } });
      draw(start);
    }

    /* ===================================================== Awards History == */

    const AWARD_VIEWS = [
      { id: 'AllConference', label: 'All-Conference', cols: [['player', 'Player'], ['year', 'Year'], ['recognition', 'Recognition'], ['conference', 'Conference']] },
      { id: 'AllRegion', label: 'All-Region', cols: [['player', 'Player'], ['year', 'Year'], ['position', 'Position'], ['class_year', 'Class'], ['team', 'Team']] },
      { id: 'AllAmerican', label: 'All-American', cols: [['player', 'Player'], ['year', 'Year'], ['position', 'Position'], ['class_year', 'Class'], ['team', 'Team'], ['affiliation', 'Affiliation']] },
    ];

    function awardsTab(root, { sub }) {
      root.innerHTML = `
        <section class="panel">
          <div class="body">
            <div class="toolbar-row">
              <div id="aw-views"></div>
              <input type="text" class="name-search push-right" id="aw-search" placeholder="Search player name…" autocomplete="off" spellcheck="false" aria-label="Search award winners">
              <button type="button" class="download-btn no-print" id="aw-pdf">&#8595; PDF</button>
            </div>
            <div id="aw-content"></div>
          </div>
          <div class="footer-note">Source: Carroll Athletics' own gopios.com award-winner history (Records &amp; Awards project's scrape). Shown exactly as published, including real historical spelling/formatting quirks in older entries.</div>
        </section>`;
      const state = { view: AWARD_VIEWS.some((v) => v.id === sub) ? sub : 'AllConference' };
      const search = root.querySelector('#aw-search');
      function draw() {
        const view = AWARD_VIEWS.find((v) => v.id === state.view);
        const q = search.value.trim().toLowerCase();
        let rows = Site.data.records.awards[state.view];
        if (q) rows = rows.filter((r) => (r.player || '').toLowerCase().includes(q));
        root.querySelector('#aw-content').innerHTML = `
          <div class="insight" style="margin-bottom:10px;">${rows.length} entries</div>
          <div class="tbl-scroll"><table class="mini records-table">
            <thead><tr>${view.cols.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead>
            <tbody>${rows.map((r) => `<tr>${view.cols.map(([key], i) => `<td${i === 0 ? ' class="name"' : ''}>${esc(r[key] || '—')}</td>`).join('')}</tr>`).join('')}</tbody>
          </table></div>`;
      }
      Site.pills(root.querySelector('#aw-views'), { options: AWARD_VIEWS, value: state.view, onChange: (id) => { state.view = id; Site.setSub(id); draw(); } });
      search.addEventListener('input', draw);
      root.querySelector('#aw-pdf').addEventListener('click', () => printPage(`${AWARD_VIEWS.find((v) => v.id === state.view).label} - Carroll Football`));
      draw();
    }

  return { recordBookTab, recordWatchTab, awardsTab };
})();
