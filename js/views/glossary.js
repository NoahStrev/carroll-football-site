/* Presentation-only grouping/ordering for the Glossary page -- the definition
   text always comes from the shared GLOSSARY object in js/charts.js (also what
   powers the inline "?" hover hints on KPI tiles), so there's exactly one place
   a definition ever needs updating. */
const GLOSSARY_CATEGORIES = [
  {
    title: 'Efficiency & Situational Terms',
    terms: ['Explosive Play', 'Success Rate', 'Stuffed', 'Play Efficiency', 'Money Down', 'Passing Down',
      'Standard Down', 'Field Zone', 'Red Zone', 'Points / Drive (approx.)', 'Turnover Rate', 'Takeaway Rate',
      'Drive Result Mix', 'Play Outcome'],
  },
  { title: 'Offense & Defense Schematics', terms: ['Personnel', 'Coverage', 'Coverage Shell', 'Direction', 'Pass Depth', 'Hash'] },
  { title: 'Special Teams', terms: ['Value / Score', 'Snap Location', 'Net Punt', 'Inside-20 (I20)', 'Inside-25 (I25)', 'Touchback', 'Operation Time'] },
  { title: 'Rankings', terms: ['CCIW', 'National (NCAA D3) Rankings'] },
  { title: 'Lifting & Strength', terms: ['Strength Score / Athleticism Score', 'Pro Agility'] },
];

Site.mount({
  nav: 'glossary',
  title: 'Glossary',
  lead: 'Plain-language definitions for the terms used across the dashboards. Hover the “?” on any KPI tile for the same definition in place.',
  data: {},
  tabs: [{
    id: 'terms',
    label: 'Terms',
    render(root) {
      root.innerHTML = `
        <div class="glossary-wrap">
          <input type="text" class="glossary-search" id="glossary-search" placeholder="Search terms…" autocomplete="off" spellcheck="false" aria-label="Search glossary terms">
          <div id="glossary-sections"></div>
        </div>`;
      const sectionsEl = root.querySelector('#glossary-sections');
      function render(query) {
        const q = (query || '').trim().toLowerCase();
        const html = GLOSSARY_CATEGORIES.map((cat) => {
          const rows = cat.terms
            .filter((t) => !q || t.toLowerCase().includes(q) || (GLOSSARY[t] || '').toLowerCase().includes(q))
            .map((t) => `<div class="glossary-term-row"><div class="glossary-term">${Site.esc(t)}</div><div class="glossary-def">${GLOSSARY[t] || '—'}</div></div>`).join('');
          return rows ? `<div class="glossary-section"><div class="glossary-section-title">${cat.title}</div><div class="card">${rows}</div></div>` : '';
        }).join('');
        sectionsEl.innerHTML = html || '<div class="glossary-empty">No terms match your search.</div>';
      }
      root.querySelector('#glossary-search').addEventListener('input', (e) => render(e.target.value));
      render('');
    },
  }],
});
