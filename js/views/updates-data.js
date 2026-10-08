/* Hand-maintained changelog -- per the user (2026-08-01): "Assume right now
   we are on v1.0.0 and I want to update with any patches and effects."
   Each entry should be a real patch, described as change -> effect (what
   shipped, what it actually changes for a coach using the site) -- not a
   dev-log dump of every internal fix (that\'s what README.md\'s dated
   history is for). Newest version first.

   Changed 2026-08-04, per the user ("lets also make each version on the
   updates page a summary of the day of work, instead of every single
   commit"): a version bump used to happen per real patch/commit within a
   session (v1.0.1 through v1.0.5 were all separate entries from the same
   day). Going forward, one version = one day of shipped work -- write a
   single entry summarizing everything real that landed that day, once,
   at the end of the day\'s work, instead of bumping per fix as you go.
   Small same-day follow-up fixes get folded into that day\'s one entry
   rather than becoming their own version. */
const UPDATES = [
  {
    version: '1.4.0',
    date: 'October 8, 2026',
    title: 'A simpler site with a new Home page, game-week tools, and a data-accuracy pass',
    changes: [
      { change: 'New Fourth Down tab on Offense and Defense: how often Carroll (and opponents against the Carroll defense) go for it on 4th down, how often it works by distance to go, field zone, run or pass, and score, with every try listed; the opponent what-to-expect list adds a line when they go for it more or less than other teams', effect: 'Know the 4th-and-short habits before game day, yours and theirs.' },
      { change: 'Chart and phone polish: tooltips work from the keyboard (tab to a chart, arrow between bars) and screen readers read them; bars are wider, long names wrap, and a rate over just a few plays is drawn faded; down labels read 1st to 4th; Rankings hides the games-played rows that were all tied for first; Lifting values read 1,390 lbs; the heatmap has a colour key; Rankings opens with a bar chart of Carroll\'s national rank in every category; a player profile groups its honors into awards, record book, and record watch with a show-all button; on a phone the headline numbers sit two across and the page description is shortened; every page has a description for link previews; the by-season charts for Special Teams athletes show every season instead of one lonely bar; printouts of player profiles and rankings carry the page title and date; and a new season counts as current as soon as its first box score is loaded, before it is charted', effect: 'Easier to read at a glance, usable without a mouse, and harder to over-read a small sample.' },
      { change: 'Loaded Week 5 (Millikin, 31-28 win): box score, Hudl charting, CCIW and national rankings; the box-score source now spells opponents out (Millikin University) and Carroll as Carroll University (WI), which are standardized to the short names used everywhere else', effect: 'The newest game is in every page, under one consistent school name.' },
      { change: 'A new Home page and a simpler menu: Home shows the season at a glance (record, scoring, headline efficiency against the 2021-2025 average, game log, rankings with weekly movement, closest to a record), has a season picker for any year since 2021, and a Compare Seasons tab that sets any two seasons side by side. The menu went from 11 sections to 7: Special Teams positions became one Athletes tab, Career Stats and Records became Players & Records, and Offense/Defense position groups are one tab each', effect: 'Open the site and know how the season is going, with fewer places to look.' },
      { change: 'Game week tools in Opponent Scouting: a Next Opponent tab (what to expect, a national-rank matchup card, past meetings, how they attack the Carroll defense, their season totals), a printable two-page Game Plan, and a Game Review recap of any game since 2021. Home links straight to each', effect: 'Prepare before a game and review after it from the same place, with one sheet to print and mark up.' },
      { change: 'New Tells tab on Offense and Defense: the situations where Carroll is easiest to read (run/pass leans, differences from how opponents call the same spot, blitz and front habits)', effect: 'See what an opponent scout would see.' },
      { change: 'Players & Records: Career Stats is now a player profile (honors, record book, record watch, strength testing, and a game-by-game log for each stat), plus a Season Leaders tab with the top 15 in 13 stats for any season', effect: 'Who is producing, and how each player did game by game.' },
      { change: 'Links and printing: every filtered view has an address that reopens exactly that view, with a Copy link button; PDF and print give a clean letter-size page with a header saying which page, game, or opponent it is and how current the data is', effect: 'Send a coach one link, or hand out one clean page.' },
      { change: 'Data accuracy against the official box scores: nullified Penalty, No Play snaps and interception/fumble-return touchdowns were being counted as real plays and touchdown drives, opponent score situations (Leading by 9+, Trailing by 9+) were backwards, fumble recoveries and one 2021 Carthage drive were credited to the wrong side, and Career Stats listed TEAM as a player. All fixed, and every weekly refresh now ends with automatic checks against the box scores', effect: 'Offense and defense numbers now match the official box scores, apart from a few gaps inside the box scores themselves.' },
      { change: 'Every page says what its data runs through and warns when a played game has not been loaded; empty charts explain why (opponent front and coverage were only charted 2021-2024); phone charts scroll sideways instead of cutting off; links and active tabs are easier to read, especially in dark mode; fresh data shows on the next visit instead of up to ten minutes later; and a built-in test now opens every view at phone, tablet, and desktop width', effect: 'A page you can trust at a glance, on any screen.' },
    ],
  },
  {
    version: '1.3.1',
    date: 'October 1, 2026',
    title: 'Weeks 2–4 data, three newly charted games, and a data-quality pass',
    changes: [
      { change: 'Loaded Weeks 2, 3, and 4 (UW Eau Claire, Elmhurst, Carthage): box scores, CCIW and national rankings, and the hand-charted play-by-play for all three games', effect: 'Offense, Defense, Opponent Scouting, Special Teams, Rankings, and Records all reflect the 2026 season through the Carthage game.' },
      { change: 'Opponent names in the play-by-play data were unified (WashU / Washington (Mo.), Wisconsin Lutheran / Wis. Lutheran, UW Eau Claire, and several state-tagged names), and a handful of blank phantom defensive rows were filtered out', effect: 'Each opponent appears once everywhere on the site, and no empty rows inflate play counts.' },
      { change: 'Several special teams scraping rules were corrected (hyphenated "out-of-bounds" text, fair catches with no stated location, a few players\' names split across games, a free kick after a safety), and the record-book cross-check was made specific to each stat category\'s own coverage window', effect: 'Career totals, return/punt counts, and the Records "closest to a record" list are more accurate. A re-audit confirmed the remaining differences from the athletics record book are in the record book itself, not this site.' },
    ],
  },
  {
    version: '1.3.0',
    date: 'September 8, 2026',
    title: 'Season opener, plus new Records & Career Stats pages',
    changes: [
      { change: 'Restored the weekly automated data-refresh routines (rankings scrapes, Carroll\'s own box-score scrape, and this site\'s own rebuild + deploy) after they\'d silently stopped running for over a month, caught up the missed Week 1 data, and made sure every one of this site\'s data-build scripts — including the 2 brand new ones below — are actually wired into that weekly refresh', effect: 'Every part of the site, including the newest additions, will keep updating automatically every Monday during the season going forward — no more silent gaps.' },
      { change: 'Added the St. Norbert game (2026 season opener, a Carroll win) to Offense, Defense, and Opponent Scouting, and made the game-count footer note on those pages compute itself instead of a hardcoded number', effect: 'The 2026 opener shows up correctly everywhere alongside the full 2021-2025 history, and that footer note will stay accurate on its own as new games get added.' },
      { change: 'Added Takeaway % and Sack % to Defense Self Scout and Defense Scout\'s scenario tables and Custom Situation builder', effect: 'See not just what front/blitz/movement Carroll (or an opponent) tends to call in a given scenario, but how often it actually forces a turnover or gets to the quarterback.' },
      { change: 'New "Records" page: the program\'s full all-time record book (Single-Game, Single-Season, and Career leaderboards), a Record Watch tab showing current players\' real progress against those records — active players only, capped to realistic contenders, separate Career/Single Season subtabs, an exact distance shown once a player\'s inside the Top 5 — and the complete All-Conference/All-Region/All-American award history', effect: 'See the program\'s full history and exactly who on the current roster is closing in on a spot in it, in one place, instead of only living on the athletics department\'s own site.' },
      { change: 'New "Career Stats" page: real career totals for every player with a box-score line since 2010 (including Punting, Kickoffs, Kickoff/Punt Returns, and PAT/FG kicking), filtered to only the categories relevant to each player\'s own position, plus a Compare Players tab to see any 2 players side by side', effect: 'A coach can look up any single player and get a clean, position-relevant career snapshot, or compare two players head to head, without hunting across several stat-category tables.' },
      { change: 'Found and fixed several real player-identity bugs across the day\'s work where the same real person\'s stats were silently splitting across 2-5 separate entries instead of combining into one career total (special-teams specialists, a name shared with a much older former player, nickname/initial variants, and confirmed scrape typos)', effect: 'Career totals are now correctly combined into one real total per person, sitewide — no more players quietly shown as partial fragments of themselves, or mixed up with an unrelated person who happened to share their name.' },
      { change: 'Multiple full sitewide re-checks throughout the day (data-build scripts re-verified against raw sources, all 16 pages clicked through for console errors and phone-width layout issues), plus some behind-the-scenes cleanup consolidating a few pieces of duplicated code into single shared versions', effect: 'Everything checked out clean each time — no data drift, drops, or page errors found — and a few small pieces of the site\'s plumbing are now easier to keep in sync, with no visible change to any numbers.' },
    ],
  },
  {
    version: '1.2.0',
    date: 'August 5, 2026',
    title: 'Data cleanup, player search, and a Two-Minute Drill filter',
    changes: [
      { change: 'Fixed a data-completeness bug where 388 real offense/defense snaps (spread fairly evenly across all 5 seasons) were silently missing from every official-play-by-play view — Offense Self Scout, Offense Scout, and By Opponent — caused by a scraping quirk in the source data that this site\'s own build script couldn\'t previously work around', effect: 'Every real charted snap counts now — every KPI, percentage, and scenario breakdown built from official play-by-play data across those tabs is slightly more accurate than before.' },
      { change: 'Fixed scenario tables (Opponent Scouting\'s 4 per-opponent tabs) losing the row label (e.g. "3rd Down") off-screen when scrolling sideways on a phone', effect: 'The Scenario column now stays visible while scrolling right to see the rest of a row\'s percentages on a phone — you always know which scenario you\'re looking at.' },
      { change: 'Full audit of every underlying dataset for duplicate or double-counted records, on top of the earlier missing-record check', effect: 'The data behind every dashboard is now confirmed clean — no duplicated or double-counted records found anywhere on this site. One real issue was found and flagged in the source Lifting Data spreadsheet (a likely typo in one athlete\'s height) for the coaching staff to correct at the source.' },
      { change: 'Added a player-name search box to Lifting & Strength\'s All Time/Last Session and Senior-Junior/Sophomore-Freshman tabs', effect: 'Search for a specific player and instantly see their real rank on every leaderboard, instead of scrolling through the full roster to find them each time.' },
      { change: 'Added "Clock Situation" (Two-Minute Drill vs. Other Snaps) as a new scenario breakdown and Custom Situation filter on Offense Self Scout and Offense Scout', effect: 'See real hurry-up tendencies for the last 2 minutes of either half — e.g. run/pass mix swings sharply toward pass in a two-minute drill, now visible at a glance instead of hidden in the full-game numbers.' },
      { change: 'Added 1st Down %, Success %, and Explosive % to Offense Self Scout and Offense Scout\'s scenario tables (plus Success %/Explosive % on Defense Self Scout and Defense Scout)', effect: 'See not just what a team tends to call in a given scenario, but how well it actually works for them — all in the same row.' },
      { change: 'Fixed the reference gridlines disappearing on the By Opponent charts when scrolling sideways to see more opponents', effect: 'Every bar now has its reference gridlines behind it no matter how far you scroll, not just the ones visible before you started scrolling.' },
      { change: 'Opponent Scouting\'s By Opponent tab now defaults to all 5 seasons selected, matching the other 4 tabs (it previously defaulted to just the most recent season)', effect: 'By Opponent opens showing every season\'s data by default, consistent with the rest of the page.' },
      { change: 'Athleticism Score now only needs 5 of its 6 required tests instead of all 6', effect: 'Real scores now exist for seasons that were previously missing entirely (2021-22, 2022-23, 2024-25) because exactly one test wasn\'t run that year — Athleticism Score coverage went from 239 to 760 team-scope scores.' },
    ],
  },
  {
    version: '1.1.0',
    date: 'August 4, 2026',
    title: 'Opponent Scouting overhaul: real opponent names, self vs. opponent scouting, and combined views',
    changes: [
      { change: 'Merged duplicate opponent names caused by a naming change in the source data ("WashU"/"Washington (Mo.)" and "Wisconsin Lutheran"/"Wis. Lutheran" were the same schools, split into two entries)', effect: 'Opponent Scouting, and every Opponent filter site-wide, now shows one real opponent instead of two — picking "WashU" shows all 5 seasons of games against them instead of only 4.' },
      { change: 'Renamed "Offense Report"/"Defense Report" to "Offense Self Scout"/"Offense Scout" (accurate names, same data), then added the 2 missing tabs — "Defense Self Scout" and "Defense Scout"', effect: 'Full coverage on both sides of the ball: what Carroll tends to call, and what each opponent tends to call, for both offense and defense — not just offense.' },
      { change: 'Added an "All Opponents (Combined)" view (now the default) plus a Season checkbox filter to all 4 scouting tabs', effect: 'See tendencies across every opponent and year at once, or narrow to specific seasons, instead of only ever looking at one team at a time.' },
      { change: 'Added "Play Type" (Run/Pass) and "Hash" (Left/Middle/Right) as 2 more scenario breakdowns and Custom Situation filters on the defensive scheme tabs', effect: 'Defense Self Scout and Defense Scout now cover 6 real scenario dimensions instead of 4, closing most of the gap with the offense-side tabs.' },
      { change: 'Fixed a bug (found via thorough re-checking, not reported) where a handful of real snaps were silently missing from some scenario tables and Custom Situation results, plus print output and empty-result-set cleanup', effect: 'Every real snap now counts everywhere it should; downloaded PDFs and narrowed-to-nothing searches both look correct instead of broken.' },
      { change: 'Removed the outdated homepage for now — the site root and every page\'s nav go straight to this Updates page instead', effect: 'No more landing on a stale, out-of-date homepage. A real new homepage is planned but not built yet.' },
    ],
  },
  {
    version: '1.0.0',
    date: 'August 1, 2026',
    title: 'Initial public launch',
    changes: [
      { change: 'Site published live on GitHub Pages', effect: 'The full site is reachable at a real public link for the first time, instead of only running locally during development.' },
      { change: 'Team & Units: Special Teams Overview and Lifting & Strength', effect: 'Money Unit, Punt, Punt Return, Kickoff, Kickoff Return, and lifting leaderboards with athlete-vs-athlete comparison, all in one place.' },
      { change: '5 Position pages: Placekicker, Kickoff Kicker, Punter, Short Snapper, Long Snapper', effect: 'Each has an Executive Scorecard, a head-to-head athlete comparison, and a Situational Deep Dive.' },
      { change: 'Offense & Defense: Executive Scorecard, Play-Calling & Tendencies, Play Outcomes, and 8 position-group coach views', effect: 'A QB, RB, WR, OL, DL, LB, CB, or S coach each gets a schematic view built around what their own position group actually cares about.' },
      { change: 'Opponent Scouting: by-opponent charts, plus a per-opponent Scouting Report and Custom Situation builder', effect: "Look up any past opponent\'s real tendencies (run/pass by down, distance, quarter, situation, score, and more), or build any exact combination on the fly and get the real percentages." },
      { change: 'Rankings: CCIW and National standings across Offensive/Defensive/Special Teams/Additional Metrics', effect: "Carroll\'s conference and national standing is visible in one place without digging through either source report." },
      { change: 'Glossary with searchable terms and inline hover hints', effect: 'A new coach unfamiliar with a stat (e.g. "explosive play") can look it up without ever leaving the page they\'re on.' },
    ],
  },
];
