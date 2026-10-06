/* Updates page: renders the changelog in js/views/updates-data.js (also read by the Home page). */
function versionCardHTML(u) {
  const rows = u.changes.map((c) => `<tr><td class="name change">${c.change}</td><td>${c.effect}</td></tr>`).join('');
  return `
    <div class="card version-card">
      <div class="card-head"><h3>v${u.version} — ${u.title} <span class="version-date">${u.date}</span></h3></div>
      <div class="card-body">
        <table class="mini">
          <thead><tr><th>Change</th><th>Effect</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

Site.mount({
  nav: 'updates',
  title: 'Updates',
  badge: `v${UPDATES[0].version}`,
  lead: "What's changed on this site, most recent first — every real patch and what it actually changes for you.",
  data: {},
  tabs: [{
    id: 'changelog',
    label: 'Changelog',
    render(root) {
      root.innerHTML = `<div class="updates-wrap">${UPDATES.map(versionCardHTML).join('')}</div>`;
    },
  }],
});
