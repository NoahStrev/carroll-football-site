/* Special Teams page: the Overview, the five unit dashboards, and the Athletes tab.
   Views live in st-units.js and st-athletes.js (both extend window.ST). */
Site.mount({
  nav: 'special-teams',
  title: 'Special Teams',
  lead: 'How every special teams unit is performing — the Overview compares all five on one Value/Score scale, each unit tab drills into it, and Athletes breaks it down by kicker, punter, and snapper.',
  data: { st: '../data/special-teams.json' },
  tabs: [
    { id: 'overview', label: 'Overview', render: ST.overviewTab },
    { id: 'money-unit', label: 'Money Unit', render: ST.moneyUnitTab },
    { id: 'punt', label: 'Punt', render: ST.puntTab },
    { id: 'punt-return', label: 'Punt Return', render: ST.puntReturnTab },
    { id: 'kickoff', label: 'Kickoff', render: ST.kickoffTab },
    { id: 'kickoff-return', label: 'Kickoff Return', render: ST.kickoffReturnTab },
    { id: 'athletes', label: 'Athletes', render: ST.athletesTab },
  ],
});
