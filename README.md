# Carroll Football Analytics Site

Static HTML/CSS/JS, no build step. Replaced `dashboards-site-poc` (an earlier
proof-of-concept covering only the 5 special-teams position pages, never deployed
live) once this site's coverage caught up and surpassed it — removed 2026-07-30.
Visual language originates from the `Special Teams Data/mockups/*.html` prototypes.

## Structure

- `index.html` — landing page, links to every dashboard (built or planned)
- `css/theme.css` — shared design system (colors, KPI tiles, cards, hand-drawn
  chart components) extracted from the five existing `Special Teams Data/mockups/`
  dashboards, which all independently converged on the identical CSS — that's the
  established, confirmed-good visual language for this whole site, not a new
  invention. Every new page should link this file rather than re-declare its own
  copy of these tokens/components.
- `dashboards/` — one HTML file per dashboard page
- `data/` — JSON data files consumed by the dashboards (built from the various
  projects' Excel outputs)
- `scripts/` — data-prep scripts, one per dashboard, that read an Excel workbook
  from a sibling project and write the matching JSON into `data/`

## Plan

1. **Phase 1 — unit-level overview**:
   - **Special Teams Overview — done** (`dashboards/special-teams-overview.html`).
     Rebuilt from the user's actual Tableau screenshots (9 images: Money Unit, Punt,
     Punt Return, Kickoff, Kickoff Return, plus the 4-tab Offseason Lifting
     dashboard used for Lifting below). Same metrics/charts/filters as the
     original, modernized styling per the `dataviz` skill. Two metrics from the
     original aren't in the current data pipeline and are explicitly flagged
     rather than faked: **Snap Rating** (no such column exists in
     `Carroll_Special_Teams_2021_Current.xlsx`) and the exact L/Short miss-location
     breakdown (only "Blocked" is tracked as a miss reason currently). See
     `scripts/build_special_teams_data.py` for exactly which source column feeds
     which chart, including several derived fields (Punt Return's outcome bucket,
     Kickoff Return's return-location) that don't exist as single columns in the
     source and had to be built from other real fields.
   - **Lifting & Strength — done** (`dashboards/lifting-strength.html`). 4 tabs:
     All Time / Last Session, Senior/Junior, Sophomore/Freshman (leaderboard grids,
     every qualifying athlete per Combined Total/Bench/Squat/Clean in a scrollable
     sticky-header list — was a top-12 cutoff, changed 2026-07-30 per the user), and
     Class Comparison
     (athlete-vs-athlete line charts across every metric including Height/Weight).
     Class year isn't its own field in the Lifting Data output — derived from
     `years_with_program` (confirmed by that project to match the source's own
     class field exactly), which only exists 2023-24 onward, so 2021-22/2022-23
     sessions only ever appear in the All Time / Last Session tab. "Att Date" from
     the original is shown as testing session (football year + period) since the
     source tracks by session, not an exact calendar date. See
     `scripts/build_lifting_data.py`.
     **Known follow-up, not fixed here** (belongs to the Lifting Data project, out
     of scope for this dashboard task): the Class Comparison athlete list surfaced
     several apparent spelling-variant duplicates that Lifting Data's own name
     normalization didn't catch (only handled parenthetical-suffix and
     Jr/Sr/II-style patterns, not general misspellings) — e.g. "Benjamin Lichucki"
     vs "Benjamin Lichuki", "Colin Chappel" vs "Collin Chappel", "Dominic Caruso"
     vs "Dominick Caruso", "Cameran Banks" vs "Camren Banks", "Evan Griffiths" vs
     "Evan Grifftihs", "Quintin Fisher" vs "Qunitin Fisher". Each pair is probably
     the same person split across two identities — worth a pass in that project
     before trusting cross-year totals for anyone on this list.
2. **Phase 2 — position-level (special teams)**: placekicker, kickoff kicker,
   punter, short snapper, long snapper — individual-analysis versions of Phase 1's
   unit-level view. `Special Teams Data/mockups/*.html` has a first pass at these;
   migrated/adapted into `dashboards/` here rather than rebuilt from scratch.
   - **Placekicker — done** (`dashboards/placekicker.html`, 2026-08-01). 3 tabs:
     Executive Scorecard, Kicker Head-to-Head (any two kickers, searchable
     combobox), Situational Deep Dive (quarter/season/hash breakdowns, distance ×
     season heatmap, kicker detail table). **Deliberately does not port the
     mockup's fabricated widgets** — the mockup used a hash-based jitter model to
     invent Operation Time, Hash Kicked From, snap quality/accuracy, and a
     miss-reason split, all tagged "sample data," because those fields were blank
     when the mockup was drafted. They aren't blank anymore: `Snap to Catch`/
     `Catch to Kick`/`Hash Kicked From`/`Snap Location` are hand-charted by the
     coaching staff and real from 2023 onward (0% charted 2021-2022, ~90-100%
     2024-2025, confirmed by checking the actual workbook column-by-column before
     building anything) — so this page charts the **real** values wherever
     charted, same "never average-padded with blanks" rule as Phase 1's Money
     Unit tab, instead of fabricating a statistical model. **Correction,
     2026-08-01**: an earlier version of this page (and this README) incorrectly
     said "snap quality" had no real equivalent — it does: `Snap Location` (a 1-3
     rating on both the PAT-FG and Punt sheets) is exactly that field, just missed
     on the first pass. Added back as "FG make % by Snap Location," shown as
     buckets "1"/"2"/"3" without relabeling them "good/bad," since the
     `Special Teams Data` project's own docs say that scale's meaning isn't
     resolved upstream yet (~zero correlation found with anything tested so far).
     The one exception still genuinely dropped: full miss-reason direction (still
     only "Blocked" vs. everything else, matching Phase 1 — no column anywhere
     records wide-left/wide-right/short). Also surfaces `PAT/FG Value`/`Score` —
     a real, fully-computed "points added over expectation" metric already in the
     source workbook (see `Special Teams Data/rules/carroll_pat_fg_rules.md`) that
     no dashboard on this site had used before. `scripts/build_special_teams_data.py`
     extended to extract it. Added a shared `renderHeatmap()` and hoisted
     `kpiHTML`/`setKPI` into `js/charts.js` (was duplicated in
     `special-teams-overview.html`) for reuse across the remaining 4 position
     pages.
   - **Kickoff Kicker — done** (`dashboards/kickoff-kicker.html`, 2026-08-01). Same
     3-tab shape and same real-data discipline as Placekicker: Touchback rate,
     Inside-25 rate, distance, return allowed, and onside recovery are all
     box-score-derived and 100% real for every row; Hangtime and Hash Kicked From
     are hand-charted and real from 2023 onward (same phase-in pattern as every
     other manually-charted field in this project — 0% in 2021-2022, ~90-100% by
     2024-2025, verified column-by-column before building). Surfaces the real
     `Kickoff Value`/`Score` metric the same way Placekicker surfaces `PAT/FG
     Value`/`Score`. Distance and return-allowed are charted as two separate
     single-metric bar charts rather than one dual-axis chart, per the dataviz
     skill's "never two y-scales" rule. **Known data issue, not fixed here**: the
     source has two spellings for what's almost certainly the same kicker —
     `"Scofield"` (6 rows, 2021) and `"Sebastian Scofield"` (6 rows, 2021-2022) —
     left as two separate kickers rather than silently merged, since resolving a
     name-parsing gap is the `Special Teams Data` project's job (see that
     project's `SKILL.md` "Overall/Season Number"/name-enrichment mechanism), not
     something to guess at from this dashboard. Same category of issue as the
     Lifting Data project's known spelling-variant duplicates. Hoisted
     `renderTwoLine` (the two-series line chart from Placekicker's Head-to-Head)
     into `js/charts.js` for reuse here.
   - **Punter — done** (`dashboards/punter.html`, 2026-08-01). Same 3-tab shape
     and real-data discipline as the other two: gross/net distance (net = gross −
     return yardage), Inside-20 rate, touchback rate, and outcome mix (Downed/Fair
     Catch/Touchback/Out of Bounds/Return/Return Touchdown/Muff, read directly from
     the sheet's own `Kick Outcome` column) are 100% box-score-real; Hangtime,
     Snap to Catch, Catch to Kick, and Hash Kicked From are hand-charted and real
     from 2023 onward, same phase-in pattern as every other manually-charted field
     in this project. Surfaces the real `Punt Value`/`Score`. **Known data issue,
     not fixed here**: a bare-surname capture, `"Streveler"` (4 rows, 2021 only),
     alongside the full name `"Noah Streveler"` (145 rows, 2022-2024) — almost
     certainly the same person, split by the exact bare-last-name parsing gap the
     `Special Teams Data` project's own `SKILL.md` already documents (bug #8) but
     hasn't fully backfilled for this one punter's 2021 games. Left unmerged, same
     policy as the Kickoff Kicker page's `"Scofield"`/`"Sebastian Scofield"`.
   - **Short Snapper — done** (`dashboards/short-snapper.html`, 2026-08-01). Uses
     the `Long Snapper` column on the **Carroll PAT-FG** sheet — despite the
     column's name, it's the FG/PAT ("short") snap, not the punt snap (that one's
     the Punt sheet's own `Snapper Name`, tracked on the upcoming Long Snapper
     page instead). Snapper is only credited on 175/236 attempts (2021 and part
     of 2022 predate crediting) — excluded from snapper-specific views, but PAT/FG
     make-rate KPIs still use every attempt. Same real-data discipline: Snap to
     Catch (snap time) and Snap Location are hand-charted and real from 2023
     onward. **Per the user, explicitly builds the full comparison UI even where
     current data is sparse** — only 4 snappers are credited so far (2 with just
     1 attempt each), so Head-to-Head's searchable-combobox infrastructure is
     built exactly like Placekicker's, not simplified down, since more attempts
     will get a snapper credited over time and the page should already work once
     they do. Verified this doesn't crash or misbehave with genuine 1-row
     samples. **Also fixed on this page and Placekicker** (and added to Punter):
     `Snap Location` (a real 1-3 rating, previously incorrectly written off as
     having no source column — see the Placekicker entry above) now has its own
     chart on all three.
   - **Long Snapper — done** (`dashboards/long-snapper.html`, 2026-08-01). Uses
     the **Carroll Punt** sheet's own `Snapper Name` column — the true "long
     snap" (~13-15 yards), distinct from Short Snapper's PAT-FG "short snap"
     despite the confusingly similar column names. Only 122/247 punts have a
     snapper credited (mostly 2023 onward), and **only one snapper, Brayden
     Partlow, is credited at all so far** — same standing instruction as Short
     Snapper: the full 3-tab structure (including Head-to-Head) is built anyway,
     not reduced to 2 tabs the way the original mockup did (which had no
     Head-to-Head tab, presumably because it was drafted when there was
     obviously only one real snapper) — verified both sides of a Head-to-Head
     comparison correctly show the same person's data with no crash when only
     one name exists. Adds real `Blocked?`/`Punter Tackle?` fields (both
     box-score-derived, 100% populated) to `build_special_teams_data.py`'s
     `build_punt()` for protection-quality tracking, the whole point of a
     snapper-focused page. **This completes Phase 2** — all 5 position pages
     (Placekicker, Kickoff Kicker, Punter, Short Snapper, Long Snapper) are live.

   **Snap Location scale correction (2026-08-01, per the user, after Long
   Snapper)**: it's a snap-quality ranking the coaching staff is actively
   charting, and the scale may end up 1-3 or 1-5 depending on how it's
   finalized — not a fixed 1-3 as every page above initially assumed. Added
   `snapLocationScale()` to `js/charts.js` (computes the real distinct values
   from the full unit's data, sorted numerically, rather than a hardcoded
   `['1','2','3']`) and updated all 6 call sites across Placekicker, Punter,
   Short Snapper, and Long Snapper to use it, so a future 4 or 5 shows up
   automatically without another code change. Verified with a simulated 5-point
   scale that the dynamic logic handles gaps correctly (e.g. real values
   `[1,2,3,5]` with no 4 charted yet shows exactly those four buckets, not five).
   Direction (which end means "better") still isn't asserted anywhere, since
   that's still unconfirmed upstream.
3. **Phase 3 — offense &amp; defense — done** (`dashboards/offense.html`,
   `dashboards/defense.html`, 2026-07-30). No existing Tableau/mockup reference for
   either, designed from scratch against the real `Game Analysis` project's
   `combined_play_data.xlsx` — per the user, split into two tabs each,
   **Executive Scorecard** (built from the official scraped play-by-play:
   yards/play, success rate, explosive rate, turnover/takeaway rate, Red Zone
   TD%, an approximate points-per-drive, down/distance efficiency heatmap, a
   yards-per-play game trend, and a full game log) and **Play-Calling &amp;
   Tendencies** (built from the coaching staff's own hand-charted play-by-play:
   run/pass mix by down and situation, formation/personnel usage, and either the
   opponent's defensive front/coverage shown to Carroll's offense, or Carroll's
   own defensive front/blitz calls, depending on the page).
   - **Only the 50 real Carroll games are used** (2021-2025) — 5 additional raw
     files are self-scout charting of *other* teams' games (e.g. "Aurora vs
     SNC"), correctly flagged as unmatched in the source's own `GameMatchLog`
     sheet and excluded entirely, not treated as a 3rd category of O/D.
   - **A real semantic correction made before writing any dashboard code**: the
     source project's own `SKILL.md` was checked for what `ODK='D'` rows
     actually carry, and independently re-verified against real fill rates on
     the 50-game set — confirmed `PERSONNEL`/`OFF FORM`/`OFF STR`/`BACKFIELD`/
     `MOTION`/`PROTECTION` are Carroll's own offense, charted on `'O'` rows
     (and correspondingly under 1% filled on `'D'` rows) — NOT the opponent's
     formation charted while Carroll is on defense, which a first read of the
     column names might suggest. This means the Defense page has no
     opponent-formation/personnel chart at all (explicitly called out in its
     intro text as a structural gap in the self-scout charting workflow, not a
     "still being charted, will fill in" gap like Snap Location elsewhere on
     this site) — only Carroll's own defensive call
     (`FRONT (D)`/`TAG (D)`/`MOVEMENT`/`BLITZ (D)`) is real on `'D'` rows.
   - **Red Zone TD%** is computed by deduping to distinct drives (via a
     `game_label|drive_num` key) that had at least one Red-Zone snap, not by
     counting plays — a play-count-based version would over-weight drives with
     more red-zone snaps.
   - **"Points per Drive" is a labeled approximation** (6 for a touchdown, 3 for
     a made field goal, 0 otherwise) — doesn't add PAT/two-point value on top;
     called out as such in both pages' intro text rather than presented as an
     exact number.
   - **Formation/personnel/play-call/defensive-front/coverage names are shown
     exactly as charted, including real data-entry typos** (e.g. "COPVER 3
     STRONG", "C0VER 0") — not silently normalized, same policy as the
     Kickoff Kicker/Punter pages' known duplicate-name callouts. `play_call`
     alone has 260+ distinct real values, so its usage charts and the Play
     Call detail table use `topKeysByCount()` (`js/charts.js`, new) to show the
     top N by volume rather than every value.
   - **Hoisted `gameTrend()`/`renderTrendCard()`** from `special-teams-overview.html`
     into `js/charts.js` (needed again by both new pages) — generalized the date
     parsing to handle both this project's existing `"M/D/YYYY"` dates and the
     new `combined_play_data.xlsx`'s ISO `"YYYY-MM-DD"` dates without going
     through the `Date` constructor's timezone-dependent parsing (an ISO string
     parses as UTC midnight, which can shift a day in negative-UTC timezones).
     `.trend-body` moved from that page's local `<style>` block into
     `css/theme.css` alongside it.
   - See `scripts/build_game_data.py` for the exact column mapping (including
     which `OfficialPlayByPlay` fields feed the Executive Scorecard vs. which
     `Plays` fields feed Tendencies) and `data/game-data.json` for the row-level
     output — same "row-level JSON, filter/aggregate client-side" pattern as
     every other dashboard on this site.
   - **Extended 2026-07-31**: both pages grew from 2 tabs to 7 — a **Play
     Outcomes** tab (breakdown of `play_outcome` by volume) plus 4
     **position-group coach views** each (Defensive Line/Linebackers/
     Cornerbacks/Safeties on Defense; Quarterbacks/Running Backs/Receivers/
     Offensive Line on Offense) — see the dedicated 2026-07-31 section below
     for the full detail, including why these are schematic/situational
     views rather than individual-player stat pages (no player-level
     attribution exists in this data).
4. **Phase 4 — report ingestion &amp; downloads** (lowest priority, added 2026-07-30
   per the user): get the program's existing generated reports (CCIW Buddah Report,
   National Buddah Report, Game Analysis, National/CCIW Game Prep Report — the
   sibling projects under `Football/`) into this site and downloadable, not just
   living in each project's own output folder.
   - **Rankings — done, first report** (`dashboards/rankings.html`,
     `scripts/build_rankings_data.py`, 2026-07-30). Four tabs — **Overall**,
     **Offensive**, **Defensive**, **Special Teams** (added same day, per the
     user, once the other three were confirmed working) — each showing
     Carroll's own CCIW conference rankings (cciw.org, out of 9-10 teams) and
     NCAA D3 national rankings (NCAA.com, out of ~200+ teams) side by side,
     both source workbooks downloadable in full. Special Teams here
     complements rather than duplicates the existing `special-teams-overview.html`
     dashboard (that page goes far deeper per-unit but has no CCIW/national
     ranking context of its own). Reads directly from the `CCIW Buddah Report` and
     `National Buddah Report` sibling projects' own already-scraped, already-
     classified output workbooks (`output_carroll/Carroll_Football_AllTime.xlsx`,
     `CCIW_D3_Football_Stats/Carroll/Carroll_AllYears.xlsx`) rather than
     re-scraping either source — per the user's own "since the data is already
     there make some updates so those reports are appearing" framing. Verified
     by directly reading (not just skimming the SKILL.md prose for) both
     projects' currently-generated PDFs before writing any code — this caught a
     real mismatch with the initial ask ("just an Overall section, need
     Offense/Defense") that didn't match either PDF's actual current state
     (CCIW's has Offense/Defense/Special Teams but no Overall; National's
     already has all four) — confirmed with the user before proceeding rather
     than guessing.
     - **Real, permanent asymmetry, not a bug**: CCIW's own classification
       (see that project's `classification-rules.md`) never produces an
       "Overall" phase — cciw.org doesn't publish Turnover Margin/Win%/
       Penalties as their own ranked category the way NCAA.com does. The
       Overall tab's CCIW panel is always empty by design, called out
       explicitly in the page's own intro text and empty-state message.
     - National's phase classification (Category string -&gt; Offense/Defense/
       Special Teams/Overall) has no first-class field of its own to read —
       ported verbatim from `National Game Prep Report/pull_matchup_data.ps1`'s
       50-metric `$Metrics` mapping (already proven correct against a real
       generated PDF), extended by a handful of near-duplicate categories that
       script doesn't cover (e.g. "Fewest Penalties" alongside its own
       "Fewest Penalties Per Game") using the same judgment-call pattern CCIW's
       own classification doc already established. Zero unmapped categories
       on the actual Carroll data (would print a warning at build time if a
       future season introduces a new one).
     - Team-level only for this first pass — no individual-leader rankings yet
       (Overall has no individual-player equivalent, so scoping the whole page
       to team-level keeps all three tabs symmetric).
     - **Not automated** — per the user's explicit scope call ("site ingestion
       only for now"), this reads a point-in-time copy of each source
       project's output; re-running `build_rankings_data.py` after either
       source refreshes is still manual. Both underlying scrape pipelines
       already run on a weekly cron (`cciw-org-conference-weekly-scrape`,
       `ncaa-d3-national-weekly-scrape`) — wiring this project's own rebuild +
       the report-generation step into that schedule is a deferred follow-up.
   - **Extended since the initial build** (undocumented here until this
     pass — backfilled 2026-07-31): the "Overall" tab was renamed
     **"Additional Metrics"** (reads as a catch-all otherwise) and moved to
     the *last* tab position, after Offensive/Defensive/Special Teams.
     Downloads switched from raw `.xlsx` links to a dynamic per-panel PDF
     export (`window.print()` + print CSS, isolating one card via a
     `print-target` class) so a coach can grab just the section/season they
     need instead of the whole source workbook. A **"This Week"** tab
     (`build_this_week()` in `build_rankings_data.py`, reads
     `../Schedule/schedule.json`) was added as the new default/first tab —
     Carroll vs. the next unplayed opponent, CCIW + National scope,
     rank-for-rank side by side; gracefully shows "no ranking data
     available" (never a guessed/empty table) when the opponent isn't
     tracked by either source (confirmed working for the real 2026 season:
     the next opponent, St. Norbert College, is non-conference and
     correctly flagged unavailable). This Week's own PDF export was later
     split into two scope-specific buttons (CCIW PDF / National PDF, each
     isolating that scope's cards across all 4 stacked phase sections via a
     `#rank-stage` print class) since This Week — unlike the phase tabs —
     has 4 separate rankgrids rather than one to isolate a single card
     within.
   - **This Week replaced by Opponent Scouting, then split into its own
     page** (2026-07-31, per the user: This Week's own rank tables just
     repeated each phase tab's Carroll row with the opponent's row bolted on
     next to it — not real new information). First landed as a new tab
     *inside* rankings.html; the same session, per the user ("opponent scout
     is supposed to be its own thing now, it doesn't make sense to have it
     under rankings"), pulled out into its own top-level page,
     `dashboards/opponent-scouting.html`, with its own nav entry (between
     Defense and Rankings on every page) and its own top-level tabbar — not
     nested under Rankings at all anymore. It reads `data/game-data.json`
     directly on page load, the same play-by-play file Offense/Defense
     already use, fetched the same eager way every other dashboard fetches
     its own data file (no more lazy-load-on-tab-open — that only existed to
     avoid paying for a ~7MB fetch on every rankings.html visit, which is
     moot now that this is its own page). Two tabs:
     - **By Opponent** — Yards/Play, Success Rate, Explosive Rate, and
       Turnover/Takeaway Rate, each as its own bar chart with opponent as the
       category axis (Offense and Defense grain, 4 charts each), Season-
       filtered like every other dashboard (defaults to the latest year).
     - **Scouting Report** — one team at a time by design (a coach on the
       sideline hits a scenario and wants that team's real percentage odds
       for it, not two teams overlaid). A single opponent dropdown drives two
       report panels, Offense (Carroll's own play-calling in games against
       that opponent) and Defense (that opponent's own play-calling against
       Carroll — real scouting signal for a rematch). Aggregates every season
       Carroll has played that opponent (no Season filter here — a single
       game's snap count is too thin to be a real tendency signal).
     rankings.html itself reverted to just its original 4 phase tabs
     (Offensive/Defensive/Special Teams/Additional Metrics), defaulting to
     Offensive now that there's no This Week/Opponent Scouting tab to land on
     first.
   - **Scouting Report rebuilt as a dense scenario table** (2026-08-01, same
     session — per the user, the bar-chart version wasn't what they had in
     mind: "this is a table view with percentages of a bunch of different
     scenarios that show different percentages of play type or call or
     whatnot", then "expand the amount of scenarios... there are a ton of
     different ways to break this down... the ultimate goal is for a coach
     to be on the sideline, look for a given scenario and be able to
     understand the odds"). Replaced the 3 Run/Pass bar charts (by down, by
     quarter, after an explosive play) with one `<table class="mini">` per
     side, one row per scenario, grouped into 10 section-header-delimited
     dimensions covering every scenario field the official play-by-play
     actually carries: By Down, By Distance (reuses the existing
     `distanceBucket()`/`DIST_BUCKETS`), By Down &amp; Distance (the full
     cross of the two — "3rd &amp; Long" is literally how a coach thinks
     about it), By Quarter, By Situation, By Field Zone, Goal-to-Go, By
     Score Situation (a new `scoreBucket()` — Leading/Trailing split at the
     real one-score-game line, ±8 points), Drive Context (first play of a
     drive vs. not — a new flag alongside the existing after-an-explosive-
     play one, same per-drive chronological-order pass), and Explosive-Play
     Context. Each row shows 3 independent percentage breakdowns with 3
     different denominators on purpose (one glance = the full picture for
     that scenario, not 3 separate tables to cross-reference): Play Type
     (Run/Pass, of every snap in the scenario), Direction (Left/Middle/
     Right, of just the charted-direction subset, ~74% site-wide), and Pass
     Depth (Deep/Short, of just the charted-depth subset among pass
     attempts, ~34% site-wide) — a `—` means nothing was charted for that
     cell, never a fabricated 0%. Scenario groups/rows with zero real
     Run/Pass/Sack snaps are dropped entirely (e.g. Augustana's Scouting
     Report has no "Goal-to-Go" row — 32 Goal-to-Go plays exist site-wide,
     none against that specific opponent). Verified against a 5-game
     opponent (full table, all 10 sections populated) and a 1-game 2021-22
     opponent (Direction/Pass Depth correctly show `—` throughout — those
     fields weren't charted that early, a known, already-documented data
     limitation), no console errors, table's own horizontal-scroll wrapper
     keeps the page from overflowing on mobile instead of squeezing 9
     columns unreadable.
   - **Opponent Scouting round 2** (2026-08-01, same session, per the user):
     - **Offense/Defense split into separate tabs.** The Scouting Report tab
       stacked both sides' full scenario tables on one page — per the user
       ("break the tables out into offense and defense... because these
       tables are so long the header isn't visible making it hard to
       remember"), each side is now its own top-level tab (Offense Report /
       Defense Report), each with its own opponent dropdown (independent of
       each other now that they're separate pages).
     - **Sticky table headers** — real bug found getting this working: any
       ancestor with `overflow-x: auto` (the table's own `.tbl-scroll`
       wrapper, or even theme.css's shared `.stage` two levels up, which
       every dashboard's tab content sits inside) forces that ancestor's
       `overflow-y` to compute to `auto` too per the CSS overflow spec — an
       author can't override it back to `visible` while `overflow-x` stays
       non-`visible`. That silently makes the ancestor a scroll container
       even though it never actually overflows, which is enough to hijack
       `position: sticky`'s positioning context away from the real page, so
       the header just sits frozen in place instead of tracking the
       viewport. Fixed by giving `.tbl-scroll` a real bounded height
       (`max-height: 65vh`) instead of fighting the cascade rule — a
       conventional frozen-header scrollable data table, unambiguously its
       own sticky context regardless of what `.stage` does. Print CSS resets
       it back to `max-height: none` so a PDF still lays the full table out
       across pages instead of clipping to one scrolled screenful.
     - **By Opponent charts scroll horizontally** instead of squeezing —
       per the user ("too many teams"), `renderBar()` in `js/charts.js`
       gained a `scroll` option (fixed `colWidth` per category instead of
       flex-shrinking, `overflow-x: auto` on the chart itself) used by all 8
       of this tab's charts; every other `renderBar()` call site site-wide
       is untouched (`scroll` defaults to `false`).
     - **PDF download restored** on all 3 tabs (By Opponent, Offense Report,
       Defense Report) — reuses rankings.html's `printPage()` pattern
       (`window.print()` + a temporary document-title swap for the saved
       filename); this page never needed rankings.html's per-card
       `print-target` isolation since each tab here is already one
       self-contained report.
     - **Custom Situation builder**, added to the bottom of both Offense
       Report and Defense Report — per the user: "a custom situation
       enterer, where they can input all the current criteria and get all
       of the percentages." 9 dropdowns (Down, Distance, Quarter, Situation,
       Field Zone, Goal-to-Go, Score Situation, Drive Context, Explosive-
       Play Context), each defaulting to "Any" (ignored); selections combine
       with AND. Reuses the same `scenarioRowHTML()` the scenario table
       already uses, so the one result row is the identical Play Type/
       Direction/Pass Depth shape, just for whatever exact combination the
       coach picked instead of a pre-built scenario.
   - Game Analysis and the two Game Prep Report PDFs (per-opponent scouting
     reports) aren't ingested yet. Design/scope TBD for those.

**Checked (not fixed — nothing to fix) same day**: whether rankings.html's
pre-existing `table.rank-table thead th { position: sticky; ... }` had the
same overflow bug just found and fixed in Opponent Scouting. It does not —
`.rank-scroll` (its own table wrapper) already had a real bounded
`max-height: 480px` with `overflow-y: auto` from the start, i.e. the same
genuine-scroll-container pattern the fix above uses, just arrived at
independently before this bug was ever found. Confirmed empirically
(`scrollHeight` 2486px vs. `clientHeight` 480px on the Offensive tab's CCIW
panel; header `th` stays pinned at its own viewport offset while scrolling
300px internally; same check repeated on the National panel) rather than
assumed either way.

## Phase 5 — Updates tab

Added 2026-08-01, per the user: "now that the site is live I also want to
add one last tab called Updates. Assume right now we are on v1.0.0 and I
want to update with any patches and effects." A new top-level page,
`dashboards/updates.html` (nav entry after Glossary, on every page), with a
hand-maintained `UPDATES` array — newest version first, each entry a
version/date/title plus a Change → Effect table (what shipped, and what it
actually changes for a coach using the site — user-facing, not a dev-log
dump; README's own dated history above is the exhaustive developer record).

**v1.0.0 ("Initial public launch") is the current site as of the GitHub
Pages launch** — one summary row per major area (site going live, Team &
Units, 5 Position pages, Offense & Defense, Opponent Scouting, Rankings,
Glossary), not a line-by-line diff of every session's work. **Going
forward**: every real patch to the live site should get a new entry here
(bump the patch version, e.g. 1.0.1) describing what changed and its
effect — this is meant to be kept current, the same way README's own
dated history is, just written for the people using the site instead of
whoever's developing it.

**v1.0.1 — opponent name merge** (2026-08-04, per the user, noticed
directly on the Opponent Scouting page's opponent dropdown: "some teams
have two different naming conventions (Wash U vs Washington University,
etc)"). The official box-score scrape used a different `OPPONENT` string
for the same school in different seasons — confirmed by cross-referencing
`GAME_LABEL` (which stayed consistent, e.g. always `"Carroll vs Wash U
..."`) against `OPPONENT` (which didn't), and by season exclusivity (each
pair never co-occurs in the same season): **"Washington (Mo.)"** (2021
only) / **"WashU"** (2022-2025), and **"Wisconsin Lutheran"** (2022 only)
/ **"Wis. Lutheran"** (2023 only). A new `OPPONENT_ALIASES` map in
`scripts/build_game_data.py`, applied once right after the
`OfficialPlayByPlay` sheet is read (mutating the row dicts in place so
every downstream consumer — the `games` list, filter lists, every
offense/defense play/official/drive row — inherits the canonical name
automatically). **Real bug caught mid-fix**: `classify_side()` compares
each row's own `POSSESSION_TEAM` against the now-canonicalized `OPPONENT`
to decide offense vs. defense — canonicalizing only `OPPONENT` broke that
comparison for the renamed games' defensive snaps (`POSSESSION_TEAM` still
said the old name), silently dropping 122 defense.official rows and 20
defense drives. Fixed by canonicalizing `possession_team` the same way
before comparing. Verified by diffing every row array (`offense.official`,
`defense.official`, both `.plays`, both `.drives`, `games`) against the
previously-committed `data/game-data.json`: identical row counts
everywhere, `opponent` is the only field that changed anywhere. 15 raw
opponent strings collapsed to 13 real opponents; confirmed live in-browser
(Opponent Scouting's dropdown, `offense.html`/`defense.html`'s own Opponent
filter) that "WashU" now shows all 5 seasons/games instead of 4+1 split
across two entries.

**v1.0.2 — Self Scout / Opponent Scout renamed and expanded** (2026-08-04,
per the user: "right now offense is technically a self scout, not an
opponent scout" — correct: **"Offense Report" was always Carroll's own
offensive tendencies scoped to one opponent's games, not a scout of that
opponent at all.** Renamed both existing report tabs to say what they
actually are (content/data source unchanged for either):
- **Offense Self Scout** (was "Offense Report") — `DATA.offense.official`,
  Carroll's own play-calling.
- **Offense Scout** (was "Defense Report") — `DATA.defense.official`,
  which was *already*, in substance, a scout of the other team's offense
  the whole time (it's literally their own snaps, run/pass/direction/depth
  of what they called) — just mislabeled "Defense" because of which side
  of the ball Carroll was on, not what the report is actually about.

Then a genuinely new fourth tab, **Defense Self Scout** — Carroll's own
defensive scheme calls (front, blitz, movement) in games against a
selected opponent. Structurally different from the other two tabs by
necessity: those schematic fields only exist on the hand-charted `Plays`
sheet (`DATA.defense.plays`), not the official play-by-play, so there's no
Quarter/Goal-to-Go/Score Situation/Drive Context/Explosive-Play Context
here (only 4 scenario dimensions: By Down, By Distance, By Situation, By
Field Zone — those official-only fields simply don't exist on this sheet).
Front/blitz/movement are also each a large open-ended vocabulary (60+ real
distinct calls, e.g. `"OVER"`/`"BEAR"`/`"BLACKHAWKS"` for fronts) rather
than a small fixed set like Run/Pass, so the scenario table shows the
single most-common real call per scenario ("Top Front/Blitz/Movement",
with its share of that scenario's charted snaps for that field) instead of
fixed percentage columns — paired with the same Top-10-by-volume bar
charts (`topKeysByCount` + `renderBar`) already established on
defense.html's Defensive Line/Linebackers tabs, and a 4-field Custom
Situation builder (Down/Distance/Situation/Field Zone) reusing the same
modal-value row renderer. `'-'` (the source sheet's own "charted, but
nothing called" placeholder) is excluded from "real call" everywhere,
matching the exact convention defense.html's own Tendencies/DL tabs
already use for these same fields. `sectionRowHTML()` (shared with the
other two tabs' 9-column table) gained an optional `colspan` param (default
9, this table passes 5) rather than hardcoding it. Verified in-browser: all
4 tabs render with no console errors; the two renamed tabs' KPI values are
byte-identical to before the rename (365/46.3% and 329/42.9%, unchanged);
Defense Self Scout tested against both a 5-game opponent (all 4 sections
populated) and a 1-game opponent (no crash, `"—"` shown correctly for an
unfilled scenario/field combo); sticky header and bounded-height scroll
(the fix from the previous round) carry over correctly since it reuses the
same `table.mini.scenario-table`/`.tbl-scroll` classes; no horizontal
overflow at 400px mobile width.

**v1.0.3 — hotfix: Defense Scout was scouting the wrong team** (2026-08-04,
per the user, immediately after v1.0.2 shipped: "offense scout should be
looking at the opponents offense self offense scout is looking at our own,
and the same principal should be applied to defense" — v1.0.2 had only
built the *self*-scout half of the defense side; there was no tab actually
showing what the opponent's own defense does). Refactored the two
scheme-vocabulary tabs onto one shared generic renderer:
`defenseSelfScoutTab`'s body (front/blitz/movement scenario table, top-10
charts, custom situation builder — all parameter-driven over a `fields`
array and an id `side` prefix) hoisted into a new `schemeScoutTab(root,
config)`, matching this project's established convention of hoisting pure,
parameter-driven helpers while keeping tab-renderer functions themselves
separate. `defenseSelfScoutTab` now just calls it with
`DATA.defense.plays` (Carroll's own calls); a new `defenseScoutTab` calls
the same renderer with `DATA.offense.plays` (`def_front`/`blitz`/`coverage`
— the *opponent's* defensive calls charted while facing Carroll's
offense), completing the intended 2×2 (Self/Opponent × Offense/Defense).
Tab bar and `TAB_RENDERERS` gained a 5th "Defense Scout" entry.

**Real bug caught while first testing the new tab**: its Blitz Rate KPI
read 100.0% on the very first opponent checked. `defenseSelfScoutTab`'s
original formula (`rate(charted rows, r => r[field] !== '-')`) is only
correct because `defense.plays.blitz_d` uses a literal `'-'` for
"charted, nothing called" (966 real occurrences in the data) — but
`offense.plays.blitz` (the field the new tab reads) has **zero** `'-'`
occurrences; blank/null is what marks "no blitz" there instead. Copying
the old formula verbatim meant "charted" (non-null) was structurally
guaranteed to always exclude nothing, i.e. always compute 100%. Added a
`blitzUsesDash` flag to `schemeScoutTab`'s config: `true` preserves the
original charted-rows-minus-dash formula for Defense Self Scout (still
43.8%, 185/356 charted — unchanged, confirming no regression), `false`
computes the rate directly against all rows in view for Defense Scout
(correctly 14.1%, 55/391). Verified in-browser: all 5 tabs click through
with no console errors; new tab tested against a 1-game opponent
(Benedictine) with no crash, `"—"` shown correctly throughout when a
scenario/field combo has no real (non-`'-'`) calls charted; no horizontal
overflow at 400px mobile width.

**v1.0.4 — All Opponents combined view, Season filter, 2 more scheme
scenarios** (2026-08-04, same day, per the user: "make it able to use the
combined data of all teams, along with another filter which will be a
checkbox of what years to select, have the default be all years, add this
to all the defense scout, offense scout, defense self scout, and offense
self scout"). Both `opponentReportTab()` and `schemeScoutTab()` (the 2
shared shells behind all 4 per-opponent tabs) changed from taking a
`dataFn(opponent)` closure to taking the raw `sourceRows` array directly,
with a new shared `filterByOpponentSeason(rows, opponent, seasonSet)`
doing the actual filtering — needed because the opponent filter is no
longer the only thing narrowing the data. Each tab's Opponent `<select>`
gained a new first option, **"All Opponents (Combined)"** (sentinel value
`'__ALL__'`, which can't collide with any real team name), now the
default selection on all 4 tabs — every KPI/table/chart on the page reads
across every opponent's games at once until a specific team is picked.
Each tab also gained a **Season** checkbox filter, reusing the exact same
`buildFilterPanel`/`wireFilterPanel`/`readFilterState` component the By
Opponent tab's own Season filter already uses — unlike that one, this
filter does NOT set `defaultLatestOnly`, so every season starts checked
per the user's explicit "default be all years." Verified: Offense Self
Scout defaults to 3075 snaps / 50 games (all opponents, all seasons);
unchecking 2021 drops it to 2432 snaps / 40 games; re-checking 2021 and
switching to a specific opponent (WashU) correctly narrows to 326 snaps /
5 games, matching the exact number the v1.0.1 opponent-name-merge fix
confirmed for that team.

**Also this round, per the user's immediate follow-up** ("the custom
situation for defense has way less options than offense, lets see what
can be improved there"): Defense Self Scout and Defense Scout only had 4
scenario dimensions (Down/Distance/Situation/Field Zone) against the
official-play-by-play tabs' 10, because Quarter/Goal-to-Go/Score
Situation/Drive Context/Explosive-Play Context are all fields that
genuinely don't exist on the hand-charted Plays sheet — a real structural
gap, not an oversight (already documented in the code before this
round). But checking the actual columns on `offense.plays`/`defense.plays`
found 2 more fields that DO exist on both and were simply never
surfaced: `hash` (L/M/R, ~78-80% filled) and `play_type` (Run/Pass/
Timeout/Unknown — Timeout/Unknown excluded as real scenario values, the
same exclusion pattern the official tabs already use for Kneel/Two-Point
Conversion). Added both as a 5th/6th scenario-table section ("By Play
Type", "By Hash") and as 2 more Custom Situation dropdowns on both
scheme tabs, bringing them to 6 scenario dimensions total. Verified in
browser: both new dropdowns render and filter correctly (e.g. selecting
Run + L Hash together on Defense Self Scout narrows to 258 real snaps
with a sensible top-front breakdown); all 5 tabs click through with zero
console errors at both desktop and 400px mobile width; Defense Scout
tested against a 1-game opponent (Benedictine) with the new All
Opponents/Season controls in place, no crash.

**v1.0.5 — thorough re-check found a real data-drop bug, plus print/empty-state
cleanup** (2026-08-04, same day, per the user: "lets double check through
everything we've done, see if theres anything that can be fixed or cleaned
up or improved, be thorough"). Re-read the whole file, cross-checked KPI
values against raw Python counts, and tested edge cases the new All
Opponents/Season controls make newly reachable. Found 3 real issues:

1. **Silent data drop in `withScenarioFlags()`** (real bug, not introduced
   this session — present since the Scouting Report tabs were first built).
   `groupBy()` deliberately skips any row whose grouping key is
   null/undefined, which is correct for a real categorical breakdown (e.g.
   grouping by `front_d` should skip uncharted rows) but wrong here:
   `withScenarioFlags()` uses `groupBy(rows, 'game_label')` then
   `groupBy(gameRows, 'drive_num')` purely to PARTITION every row into its
   game/drive so it can compute `_afterExplosive`/`_firstPlayOfDrive` — it
   needs every row to survive, not just the ones with a real key. 4 rows in
   `offense.official` (all from the 2021 Benedictine game) and 10 rows in
   `defense.official` (all from the 2021 WashU game) have no charted
   `drive_num` at all (a charting gap for those specific games), and were
   silently vanishing from `flagged` — which meant they were missing from
   EVERY scenario section on Offense Self Scout/Offense Scout (not just a
   Drive Context row, which is the only section that actually needs
   `drive_num` to mean anything), and from the Custom Situation builder's
   results too. Caught by cross-checking the new "All Opponents" combined
   1st-Down row against a raw Python count: table showed 1327, Python said
   1329. Fixed by adding any row missing `game_label`/`drive_num` back into
   `flagged` with a default (not fabricated) `false` drive-sequence flag,
   instead of letting `groupBy()` drop it. Verified: 1st Down now reads
   1329 (offense) / 1429 (defense), matching Python exactly.
2. **Season filter not hidden when printing.** The new Season filter's
   button/panel (built via the shared `buildFilterPanel`, same component
   the pre-existing By Opponent tab's own Season filter already used) had
   no `@media print` rule hiding it, unlike the Opponent `<select>` next to
   it — a printed/downloaded PDF would show a stray "Filters" button in the
   header. This existed for By Opponent's own Season filter too, just
   never triggered before since printing that tab was less commonly
   exercised in testing. Fixed by adding `.filters-control, .filters-summary`
   to the existing print hide-list — one CSS change covers all 5 tabs.
3. **Bare header-only table on zero-result combinations.** Picking a
   single-season opponent (e.g. Benedictine, 2021 only) and unchecking that
   season via the new Season filter is a completely normal path through the
   new UI, not a deliberately adversarial edge case — it rendered a table
   with headers but zero rows, reading like a broken render rather than "no
   data for this combination." `wireCustomSituation()`/
   `wireSchemeCustomSituation()` already had a proper empty-state message
   for the exact same situation; `renderScenarioTable()` and
   `renderSchemeScenarioTable()` now show the same kind of message instead
   of an empty table body.

All 5 tabs re-verified in-browser after the fixes: zero console errors, no
horizontal overflow at 400px, and the empty-state/print fixes confirmed
working on both a report tab (Offense Self Scout) and a scheme tab
(Defense Scout). **Noted but not fixed this round**: `wireFilterPanel()`
(shared in `js/charts.js`) adds a new `document.addEventListener('click', ...)`
each time it's called, and every per-opponent tab here calls it fresh on
every tab-switch (not just once per page load) — switching tabs repeatedly
leaks one harmless-but-permanent document-level click listener per switch.
Pre-existing pattern (By Opponent tab had this before today), now present
on 4 more tabs on this page. Low real-world impact (each leaked listener
is a cheap no-op check against a detached DOM node), but a genuine cleanup
candidate for `wireFilterPanel()` itself since it's shared by every
dashboard on the site that uses the filter panel component across tab
switches — flagged as a follow-up rather than bundled into this change.

## Testing notes (Special Teams Overview)

Real bugs found and fixed while testing in the browser (not just eyeballing the
code) — worth re-checking for the same class of issue when building Lifting next:
- **Filters silently dropped rows with a blank value on the filtered field**, even
  with every real option selected (e.g. Money Unit defaulted to 172/236 kicks, not
  236, because ~61 rows have no Long Snapper charted). Fixed: a blank/null value
  now always passes every filter on that field — "no info charted" isn't the same
  as "excluded by selection."
- **A hardcoded filter-option list (`quarter: ['1','2','3','4']`) silently excluded
  real `'OT'` rows** from ever being selectable, so they vanished from every
  default view with no error. Fixed by computing every unit's quarter/is_home
  filter options from its own actual data instead of hardcoding.
- **One chart's title didn't match what it actually computed** (Kickoff Return's
  "Drive Success by Return Location" was rendering average field position, not a
  success rate) — caught by systematically re-reading every chart title against
  its render call, not just visually spot-checking a couple.

## Testing notes (Lifting & Strength)

- **12 athletes showed up as "null null"** in the Class Comparison dropdown.
  Cause: athlete metadata (name/position/class) was only being captured from rows
  matching the four leaderboard metrics, so any athlete whose only data in a given
  football year was Height/Weight (no lift attempt logged that season) got no name
  attached for that year. Fixed by building the metadata lookup from every row,
  not just the leaderboard-metric ones.
- Verified rendering (not just absence of console errors) by inspecting the actual
  SVG output via `javascript_tool` — confirmed real, non-NaN coordinates and both
  athletes' distinct colors present in each Class Comparison chart, since the
  chart values don't show up in a plain text-extraction check the way KPI numbers
  and table cells do.
- Leaderboard values spot-checked against numbers already independently verified
  in the Lifting Data project itself (e.g. Adam Anderson's December/January/April
  2023-24 Combined Totals) — exact matches.

## UX/design overhaul (2026-07-30, per the user's feedback)

Four pieces of feedback after the first version of both dashboards: filtering
wasn't intuitive, tooltips needed more content, the design overall needed more
polish, and the Special Teams trend cards' comparison basis was wrong.

- **Filters rebuilt as checkbox panels**, not native `<select multiple>`. The
  original required ctrl-click to multi-select with no visible "what's currently
  chosen" affordance — most people don't know that interaction exists. Now every
  option is a real checkbox, with per-group All/None buttons, a live count badge
  on the Filters button so you can tell at a glance whether anything's narrowed
  without opening the panel, and a search box on any group with more than 8
  options. Built once in `js/charts.js` (`buildFilterPanel`/`wireFilterPanel`/
  `readFilterState`) and shared by both dashboards — previously each dashboard
  had its own near-duplicate copy of this logic, which is exactly how the
  blank-value filter bug happened in the first place (fixed once, still needed a
  second fix in `lifting-strength.html`'s position filter, which had its own
  separate hand-rolled copy of the same bug — now both use the one shared,
  fixed implementation).
- **Athlete A/B selection also got a search combobox** (`makeSearchCombobox` in
  `js/charts.js`) instead of a plain `<select>` — scrolling through 230+ names
  alphabetically was the same "not intuitive" complaint applied to a single-select
  picker.
- **Tooltips enriched across every chart type**: bar charts now auto-include their
  sample size (`n=`) in the hover, not just visually beside the bar; stacked bars
  show % of that category's total; sparkline points show the delta vs the previous
  point AND vs the average; the five Special Teams scatter charts (the richest
  per-play data available) now show the full play context on hover — opponent,
  date, quarter, outcome, hash — not just the two plotted values. Tooltip styling
  itself rebuilt as a structured title/rows/divider layout (`.tt-title`/`.tt-row`/
  `.tt-muted`/`.tt-divider` classes) rather than one plain text line, and is now
  viewport-aware (flips to avoid clipping off the right/bottom edge).
- **Visual polish pass**: consistent 10-12px border-radius scale (was a mix of
  4/8/10px across different components), card/KPI elevation with hover lift,
  color-aware KPI accent bars (a "critical" KPI like Kicks Blocked now gets a red
  accent, not the default blue), a gradient + bottom accent on the navy unit
  headers, sticky/blurred site nav, bar and leaderboard-row hover states, bolder
  typography on headings and KPI values.
- **Special Teams trend cards fixed**: "Last vs Season Avg" is now "Last vs
  Previous Game" — true week-over-week, comparing the most recent game to the one
  immediately before it, matching what the original Tableau dashboards' "Last
  Week vs Avg" actually meant (the original build misread "Avg" as season
  average).

All changes tested in the browser (not just read back) after landing: filter
narrowing/reset, search-box filtering, tooltip content via direct DOM
inspection (chart values don't show up in plain text extraction), and both
light/dark mode, across every tab of both dashboards.

## Scrollable leaderboards + responsive reflow (2026-07-30, per the user)

- **Lifting leaderboard cards show every qualifying athlete**, not a top-12 cutoff —
  sorted list in a sticky-header scroll region (`.lb-scroll-wrap`/`.lb-scroll`,
  `dashboards/lifting-strength.html`), with a count badge on the card header. "Every
  qualifying athlete" is genuinely all of them, not just non-zero ones — the Lifting
  Data pipeline never emits a zero-value row in the first place (confirmed by
  checking `data/lifting.json` directly), so there was nothing extra to filter.
- **The whole site now reflows on tablet/mobile instead of horizontal-scrolling a
  fixed 1280px canvas.** `.slide` (`css/theme.css`) changed from a hardcoded
  `width: 1280px` to fluid `width: 100%; max-width: 1280px`, plus breakpoints for
  every grid component actually in use (`.grid2`/`.colcard-2` in theme.css;
  `.kpirow-6`/`.chartgrid`/`.trend-body` in `special-teams-overview.html`;
  `.lbgrid`/`.comparegrid` in `lifting-strength.html`). Verified zero horizontal
  overflow at 375px/768px/1280px across every tab of both dashboards, the filters
  panel, and the landing page. Component classes re-declared per-page keep their
  breakpoints in that same file, since a shared theme.css rule at equal specificity
  would lose to the page's own unconditional declaration.

## Validation pass + real bugs found (2026-07-30, per the user's "validate there
aren't any issues" request)

Browser-tested (not just read back) after the above changes: console errors across
every tab of both dashboards, filter narrowing/reset/search, the searchable
combobox (including selecting the same athlete for both A and B — renders fine, no
NaN coordinates), dark/light theme toggle, and re-ran both `scripts/build_*.py`
against source and diffed against the committed `data/*.json` (byte-identical, no
drift). Two real, confirmed bugs found and fixed:

- **Clicking "None" on any filter group showed every row instead of zero.**
  `applyFilters()` (`js/charts.js`) treated an empty checked-set the same as "no
  filter applied" (`if (!set.size) return true`) rather than "exclude everything" —
  backwards from what clicking "None" should do. Fixed to `return false` in that
  branch; a normal (non-empty) selection is unaffected.
- **`lifting-strength.html`'s position filter wasn't actually using the shared,
  fixed `applyFilters` at all**, despite the 2026-07-30 UX-overhaul section above
  claiming both dashboards were unified on one implementation. `classGroupHTML`/
  `allTimeGroupHTML` had their own inline condition
  (`!positionFilter.size || !r.position || positionFilter.has(r.position)`) with the
  identical "empty selection passes everything" bug, invisible to a test of
  `applyFilters()` alone since that function was never called from this file. Fixed
  by routing both functions through the shared `applyFilters` instead of duplicating
  the logic — confirmed via a QB-only filter test that the row count (15) exactly
  matches an independent count of QB-tagged-or-blank-position athletes in
  `data/lifting.json`.

## Class Comparison realigned by career-year, not calendar date (2026-07-30, per
the user)

The chart used to plot both athletes' points by literal `session_label`, so a
2021-22 freshman and a 2024-25 freshman landed at completely different x-positions
even though both were being tested in their freshman year. Rebuilt around each
athlete's own chronological year-in-program instead: `athleteYearOrder()`
(`dashboards/lifting-strength.html`) ranks an athlete's distinct football_years as
"Year 1, Year 2, ..." (their first, second, ... recorded season in this dataset),
and points are keyed/sorted by `(yearIdx, testing_period)` rather than the raw
calendar label. A real class label (Freshman/Sophomore/Junior/Senior) is layered
into the tooltip wherever it's known (`CLASS_LOOKUP`, built once from
`leaderboard_rows`, populated 2023-24 onward only — same gap noted elsewhere in this
file) without claiming it for years it isn't. Verified: Evan Holm's "Year 1 (January
2021-22)" and Brayden Albee's "Year 1 (January 2024-25, Freshman)" now plot at the
identical x-coordinate despite being three calendar years apart, across all 6
metrics, with no NaN coordinates for any tested athlete pair.

## Code streamlining (2026-07-30)

- **`.unit-header` (and its brandmark/crest/h2/sub rules) moved into
  `css/theme.css`** — it was declared byte-identically in both dashboards' local
  `<style>` blocks, directly against this file's own "shared design system" rule
  above. Its responsive override also standardized on one breakpoint (640px); the
  two dashboards had drifted to 640px/560px respectively during the same-day
  responsive pass.
- **Removed `renderKPI()` from `js/charts.js`** — defined but never called from
  either dashboard (each builds its own KPI markup directly).
- **`--series-1`/`--series-2` renamed to `--accent`** (`css/theme.css`,
  `index.html`) — leftover chart-series naming from the Special Teams mockups.
  `--series-1` had long since become the site's general interactive/accent color
  (active tab, focus rings, active nav link, default bar color) with zero actual
  chart-series usages left; `--series-2` was completely unused everywhere and
  just dropped.
- **Removed the decorative `⋮⋮` "grip" icon** from all ~22 chart cards in
  `special-teams-overview.html` (and the now-unused `.grip` rule in theme.css) —
  copied from the mockups, implied drag-to-reorder that was never built. The
  Lifting leaderboard cards already got this treatment incidentally when their
  header gained a real count badge earlier this session.

## Phase 2 validation + streamlining pass (2026-08-01)

Re-validated Placekicker and Kickoff Kicker after landing them: tab-switch state
(filters correctly reset per tab, no leakage), every filter's None/All/search
interaction (not just Deep Dive's), the same-kicker-for-both-sides Head-to-Head
edge case, tablet width (768px), and tooltip content on the heatmap/trend-line
charts — all cross-checked against independent Python recomputation, all clean.
Re-ran `build_special_teams_data.py` and diffed against committed
`data/special-teams.json` — byte-identical, no drift.

One real finding from this pass, **fixed 2026-08-01** (was flagged but not yet
fixed when first found): every chart color across the whole site was resolved
to a literal RGB value at render time via `cssVar()` and baked into an inline
style or SVG attribute, so toggling `data-theme` didn't repaint an
already-rendered chart until the next filter change or tab switch re-ran its
`render()`. Before fixing it site-wide, tested directly in the browser whether
an SVG presentation attribute (e.g. `fill="var(--cat-1)"`, set via
`setAttribute`, not `.style`) actually re-evaluates a custom property live —
confirmed it does in this project's target browsers, contradicting the
original assumption that SVG attributes don't reliably support `var()`.
Audited every `cssVar()` call site first (`grep -rn "cssVar("` across the whole
`Carroll Football Site` tree) and confirmed all ~70 of them are used exclusively
to set a color (a CSS property or an SVG presentation attribute), never in any
numeric/comparison logic — so the fix was safe to apply globally in one place:
`cssVar()` (`js/charts.js`) now returns the string `var(${name})` instead of
resolving it via `getComputedStyle`, matching the pattern `catColor()` (used for
per-name categorical colors) already used correctly. Verified end-to-end on the
live page after the fix: a bar chart's color now changes instantly when
`data-theme` toggles, with no re-render needed. Re-checked every tab of every
dashboard (console errors, NaN, and no raw `"var(--...)"` string leaking into
visible text) after the change — all clean.

Streamlining found in the two new pages:
- **A real naming/semantics bug**: `kickoff-kicker.html` reused `.illus-tag` (the
  site-wide "this is fabricated/illustrative data" marker) to badge a "2023+"
  coverage caveat on genuinely real data — the exact opposite of what that class
  means everywhere else. Replaced with a plain muted-text note, matching how
  Placekicker already handled the identical situation with prose instead of a
  badge.
- **Three duplications caught at 2 occurrences** (this project's now-established
  practice: fix at the second copy, don't wait for a third): `initials()` was
  byte-identical in both new files → hoisted into `js/charts.js`. A page-local
  `.kk-chartgrid2` in `kickoff-kicker.html` turned out to be an exact duplicate of
  theme.css's existing `.grid2` → removed, callers use `.grid2` directly. A
  page-local `.pk-trend-svg` class (Placekicker) and inline
  `style="display:block; width:100%; height:150px; overflow:visible;"` (Kickoff
  Kicker, ×2) both duplicated theme.css's existing `.linewrap svg` rule, which
  already applies automatically to any `<svg>` nested in a `.linewrap` div (both
  trend charts already use that wrapper) → both removed as dead weight.
- One dead local variable (`maxDist`, computed and never read) removed from
  `kickoff-kicker.html`.

## Full Phase 2 re-validation + second streamlining pass (2026-08-01)

Re-checked all 5 position pages plus both Phase 1 dashboards after Long Snapper
landed: every KPI on every page re-verified against independent Python
recomputation (all exact matches, including the Kickoff Kicker "Best Quarter"
KPI specifically, since it touched the variable-shadowing fix below), console
errors and NaN-checks across every tab of all 7 dashboards, filter None/All and
Head-to-Head same-entity edge cases spot-checked, and `build_special_teams_data.py`
re-run with no drift against committed `data/special-teams.json`.

Real duplication found and fixed — building 5 position pages independently let
the same helper logic drift into near-copies without anyone noticing at
build time:
- `rate(rows, pred)` (generic predicate version) was byte-identical in Punter
  and Long Snapper. **Kickoff Kicker had its own inconsistent 2-arg version**,
  `rate(rows, field)` (field-truthiness only, less capable than a predicate) —
  standardized every page on the predicate version and retrofitted Kickoff
  Kicker's ~14 call sites (`rate(g, 'touchback')` → `rate(g, (r) => r.touchback)`).
  This also surfaced a variable-shadowing readability issue in Kickoff Kicker's
  "Best Quarter" KPI (`const r = rate(g, (r) => r.touchback)` — the arrow
  function's own `r` parameter shadowed the outer `const r`; functionally
  correct in JS but confusing, renamed to `tbRate`).
- `fgs`/`pats`/`makes`/`makeRate` (money_unit-specific row helpers) were
  byte-identical in Placekicker and Short Snapper.
- `netOf`/`avgNet`/`PUNT_OUTCOMES` (punt-specific) were byte-identical in
  Punter and Long Snapper.
- `FG_DIST_BUCKETS`/`fgDistBucket` (FG distance-bucket logic) existed in three
  places: `special-teams-overview.html` (function-scoped, inside `moneyUnitTab`'s
  `render()`), and `placekicker.html` (top-level) — both identical.

All five hoisted into `js/charts.js`, each with a comment at both the shared
definition and every call site noting which pages share it — the same
discipline this project has followed all along for cross-page duplication
(`kpiHTML`/`initials`/`renderHeatmap`/`renderTwoLine`/`snapLocationScale`
before this pass), just applied a second time now that there are 5 similarly-
shaped pages instead of 2 to compare against each other.

## Optimization + dataviz-skill review pass (2026-07-30, after Phase 3)

Ran the `dataviz` skill's anti-pattern checklist against every chart on the
site (color/encoding, form, marks/chrome, interaction/accessibility) — nothing
flagged. The categorical/sequential/status palette in `css/theme.css` is
already that skill's validated reference instance (confirmed prior session),
so no re-validation needed there. Legends, tooltips, table-view-equivalent
heatmap cell text, and single-axis charts were all already in place site-wide.

Code duplication found and hoisted into `js/charts.js`:
- `distanceBucket()`/`DIST_BUCKETS`/`DOWNS`/`SITUATIONS`/`FIELD_ZONES`/
  `isSuccess()` — byte-identical in `offense.html` and `defense.html`.
- `bestByGroup()` — a near-identical inline "best-scoring group with a minimum
  sample size" loop existed separately in Placekicker/Kickoff Kicker/Punter/
  Short Snapper/Long Snapper's "Best Quarter" KPI (5 occurrences, each with
  its own metric function baked in).
- `HASH_ORDER` (`['L','LM','M','RM','R']`) — duplicated verbatim in
  `special-teams-overview.html`, `placekicker.html`, `kickoff-kicker.html`,
  and `punter.html`.
- `special-teams-overview.html`'s Money Unit tab had its own inline
  re-implementation of `fgs()`/`pats()`/`makes()` (predating those being
  hoisted for Placekicker/Short Snapper) with local variable names that
  happened to shadow the global functions — functionally harmless but a
  silent duplicate of logic that already lived in one shared place. Now calls
  the shared helpers directly.

Performance check: a full filter-triggered re-render on `defense.html`
(the largest dataset, ~3,250 official rows + ~3,500 play rows) measured
~46ms via `performance.now()` — well within an instant-feeling interaction,
no optimization needed there.

Re-verified all 9 dashboard pages in the browser after the refactor (console
errors, KPI values cross-checked against pre-refactor values) — all clean,
no regressions. One dev-environment-only false alarm hit during this pass:
the preview browser served a stale cached copy of `js/charts.js` from
mid-edit, throwing `ReferenceError: HASH_ORDER is not defined` — confirmed
via `curl` that the actual server response was correct the whole time; the
documented cache-bust-the-script-src workaround (see workflow notes)
resolved it for verification, and the temporary `?cbtest=1` suffix was
removed again before landing.

## Special Teams Team Overview + Lifting athletic-testing metrics (2026-07-30, per the user)

Two enhancement requests: "add what can get added" to Special Teams Overview
(explicitly meant to be a whole-units view, not just five separate tabs) and
"reporting dashboards of the other metrics" for Lifting, added onto the
existing class/grade structure rather than a new one.

**Special Teams — new "Team Overview" tab** (`dashboards/special-teams-overview.html`,
now the default/first tab): the only place all 5 units get compared directly,
using each unit's own real "points added over expectation" Value/Score metric
(0–100 rescale) — 5 KPI tiles (avg Score per unit), Avg Score by Unit and by
Season bar charts, a snap/play volume-by-unit bar, and a Unit × Season table
that deliberately ignores the tab's own Season filter (documented in its own
insight text, same "explicitly say what a filter does and doesn't touch"
policy as the Offense/Defense Points-per-Drive KPIs) since its whole point is
comparing every season at once. **Real data gap found and fixed while
building this**: Punt Return and Kickoff Return both have real `Value`/`Score`
columns on their source sheets (confirmed against the actual workbook headers)
that `build_special_teams_data.py` never extracted — Money Unit/Punt/Kickoff
already had theirs wired up, so this was a silent, same-shaped gap to the
"Snap Location" one caught earlier in this project. Fixed by adding the same
two-field pattern to `build_punt_return()`/`build_kickoff_return()`. First
real insight the new tab surfaced: Punt Return's avg Score is consistently
low (7–16 out of 100) across all 5 seasons — a real, persistent pattern, not
a one-off — while every other unit sits in the mid-50s-to-60s range.

**Lifting & Strength — Strength/Athleticism Score + Broad Jump/Vertical/Pro
Agility** (`dashboards/lifting-strength.html`, `scripts/build_lifting_data.py`):
the Lifting Data pipeline already computes two composite z-score percentiles
(Strength Score, Athleticism Score — see that project's SKILL.md "Scores"
section) and tracks three raw testing metrics never surfaced here before.
Added onto the *existing* leaderboard structure (All Time/Last Session,
Senior/Junior, Sophomore/Freshman) rather than a new tab, per the user's own
suggestion — each class group's `.lbgrid` split into two labeled sections,
**Strength** (Combined Total/Bench/Squat/Clean/Strength Score) and
**Athletic Testing** (Broad Jump/Vertical/Pro Agility/Athleticism Score), and
all 5 new metrics added to the Class Comparison tab's chart list too.
Team-scope scores only (not Position-scope) for this first pass — a
position-scope version exists in the source data and could be added later.
Pro Agility is a timed sprint, the one metric on this whole page where
*lower* ranks first — `LOWER_IS_BETTER` threaded through the leaderboard sort,
the All-Time best-session reduction, and the Class Comparison series
reduction. **Real bug found while wiring this up**: the All Time tab's
"one row per athlete, their best session" reduction was hardcoded to
"bigger value wins" — without the Pro Agility fix, an athlete's All-Time
"best" Pro Agility would have shown their *slowest* charted time. Caught and
fixed before shipping, not left for a later pass. `METRIC_UNITS` — declared
in the original build but never actually read anywhere (dead code) — is now
real: every leaderboard/comparison value renders with its correct unit
(`lbs`/`in`/`s`, or nothing for a percentile) instead of a bare number.

Both pages re-verified live after landing (console errors, KPI/table values,
filter interactions, mobile width, dark mode) — clean, no regressions on the
pre-existing tabs/metrics.

## Sitewide navigation restructure: Positions as its own top-level section (2026-07-31)

The 5 Special Teams position pages (Placekicker, Kickoff Kicker, Punter,
Short Snapper, Long Snapper) were only reachable from `index.html`'s card
tiles — no other page linked to them or to each other, so once a coach
navigated away to any other dashboard there was no way back except returning
to the homepage. Fixed in stages, the final shape:

- A shared position sub-nav (`.subnav-label` + a `.tabbar` of `<a>` links,
  reusing the same pill styling as every in-page tab bar) added to Special
  Teams Overview and all 5 position pages, so they're all one click apart.
- **"Positions" promoted to its own top-level `sitenav` link** (landing on
  `placekicker.html`), separate from "Special Teams" — the position pages
  have their own 3-tab structure (Executive Scorecard/Head-to-Head/
  Situational Deep Dive) entirely unlike Special Teams Overview's in-page
  unit tabs, so marking "Special Teams" active on them mischaracterized them
  as nested inside that page rather than a section of their own alongside
  it. The position sub-nav's self-referencing "Team Overview" pill was
  renamed to just "Overview" to stop colliding with Special Teams Overview's
  own "Team Overview" unit tab one row below it on that page.
- The now-redundant position sub-nav was removed from Special Teams Overview
  itself once "Positions" existed as its own sitenav link — that single
  top-nav button is the one way to cross over, not a duplicated 6-pill row.
- `index.html`'s "Special Teams · By Position" tile section renamed to
  "Positions" to match.

## Sitewide chart/tooltip/filtering audit (2026-07-31, per the user)

A full pass across every dashboard, prompted by direct feedback ("graphs
don't fill up the full space," "overlap with the blue strip," "I want to
know who we're playing," combobox spellcheck popups, and a general "double
check everything" ask). Real, confirmed bugs found and fixed — same
"actually click through and inspect real values" discipline as every
earlier validation pass on this site, not a re-read of the diff:

- **Offense/Defense's "Drive Result Mix" chart was counting play-rows, not
  drives.** `drive_result` is copied onto every play of a drive (the same
  reason the Red Zone TD% KPI already dedupes via a
  `game_label|drive_num` key), so a 15-play touchdown drive outweighed a
  3-and-out punt 5-to-1 — Touchdown looked like the top outcome (1046 rows,
  34%) when Punt is actually the most common real result (244/607 distinct
  drives, 40%; Touchdown is second at 173/607, 28%). Fixed with a new
  `uniqueByKey(rows, keyFn)` in `js/charts.js`.
- **`.stacked` (the stacked-bar component) had no `justify-content`, and
  `.stackcol` caps at `max-width: 90px`** (unlike `.barcol`'s uncapped
  `flex: 1`) — any stacked chart with few categories (the position pages'
  H2H "Op time build-up" chart always has exactly 2) left-hugged with all
  the leftover space dumped on the right. Now centered.
- **`renderTrendCard`'s mini "Last Game Avg"/"Last vs Previous Game" KPI
  tiles zeroed out `.kpi`'s padding/border/background inline but never
  suppressed its `::before` accent strip**, which kept rendering flush at
  the now-padding-less left edge, sitting directly under the label/value
  text. Added a `.kpi-plain` modifier class that hides the strip.
- **The shared `makeSearchCombobox` had no `spellcheck`/`autocomplete`/
  `autocorrect` attributes** — an athlete/kicker/punter name the browser's
  dictionary doesn't recognize (most of them) could pop the native
  spellcheck UI and eat a quick click meant to select a dropdown item.
  **It also hard-capped rendered matches at 40** regardless of how many
  existed — this function's own docstring cites "230+ athlete names" as the
  reason it exists, yet silently hid anything past the first 40 unfiltered
  results (confirmed: Lifting & Strength's roster is 237 names, all now
  render and scroll correctly).
- **Every per-game trend/sparkline tooltip showed only a bare date, no
  opponent** — `gameTrend()` now also returns `opponents` (every dataset
  it's called on already carries the field on each row, just wasn't
  surfaced) and `seasons` (fixes a latent ambiguity too: a trend spanning
  multiple seasons could show the same day/month label for two different
  years with nothing to tell them apart).
- Filter-panel completeness re-audited field-by-field against each page's
  real data schema (same method as the Hash/Direction/Play Type gap below):
  Special Teams Overview's Punt Return tab was missing a **Kick Outcome**
  filter (already charted, just never exposed); every position page's
  Situational Deep Dive tab was missing **Home/Away**; Punter/Long Snapper/
  Kickoff Kicker's Deep Dive tabs were also missing **Opponent** (present in
  their underlying punt/kickoff data — Placekicker/Short Snapper's
  `money_unit` data genuinely has no opponent column, a real data
  limitation, not an oversight left unfixed).
- **Every Season filter site-wide now defaults to only the most recent
  year checked**, not every year — `buildFilterPanel` (`js/charts.js`)
  gained an opt-in `defaultLatestOnly` flag (every other field still
  defaults fully checked), applied to all 25 season filter definitions
  across every dashboard. Rankings' "All seasons" dropdown option also
  dropped its "(no rank shown)" qualifier.

Delegated a duplication/consistency subagent pass alongside the manual
browser verification (a pattern worth reusing for future large audits):
confirmed the new `outcomesTab` duplication between `offense.html`/
`defense.html` (below) matches this project's long-standing, deliberate
choice to keep whole-tab renderer functions per-page rather than hoisted —
only the pure, parameter-driven helpers underneath get shared — and found
zero dead code, zero missed `defaultLatestOnly` instances, and no other
newly-introduced duplication.

## Offense & Defense: Hash/Direction/Play Type filters, Play Outcomes tab, position-group coach views (2026-07-31, per the user)

**Filter completion**: re-audited Offense/Defense's filter panels against
`game-data.json`'s actual field list and found `hash`/`play_type`
(hand-charted `Plays` sheet) and `direction` (official play-by-play) existed
in the data but were never exposed as filters — added Hash/Play Type to both
pages' Play-Calling & Tendencies tab and Direction to both pages' Executive
Scorecard tab (matching which dataset each tab actually reads).

**Play Outcomes tab** (`outcomesTab`, both pages): a third tab, per the
user asking for a dashboard "filtered by play type... shows the breakdown
of the outcome of the play." Reuses Tendencies' exact filter set (Play Type
already included) and the same `Plays` sheet, but the main chart groups by
`play_outcome` itself (Touchdown, Interception, Sack, Complete, Incomplete,
Fumble, ...) via the existing `topKeysByCount()` — same real-but-messy-value
treatment already given to Play Call/Formation/Personnel (some rows are
compound strings like `"Rush, TD"`, shown exactly as charted, not split or
normalized). Each page's tab has a KPI row, the outcome-breakdown bar chart,
an outcome-by-play-type stacked chart, and a full detail table. Defense's
turnover KPI reads "Takeaway Rate" (`--good`) rather than "Turnover Rate"
(`--critical`) — a turnover on a defensive snap is a Carroll takeaway, not
a giveaway, matching the Executive Scorecard tab's own framing.

**Position-group coach views** (8 new tabs, 4 per page): per the user —
*"getting specific views for each position group... from the view of a
linebacker coach, or a corner coach"*, explicitly **not** individual-player
stat pages. Checked first, before building anything: no player-level
attribution exists anywhere in this data — `Game Analysis`'s own `SKILL.md`
confirms `Plays`/`OfficialPlayByPlay` are charted at the play level (who
ran what call, not who touched the ball) — a genuine box-score `player_stats`
key with real per-player rushing/receiving/passing/tackle lines *does* exist
in the sibling `Special Teams Data` project's already-scraped raw game JSONs
(`../Special Teams Data/raw/*.json`), and a rough name-match against the
Lifting Data roster's own `position` field got ~79% coverage — but the user
confirmed they didn't want individual-player data at all, just each
position group's own schematic/situational lens on the same charted fields
already on this site. That made the whole cross-project player-name-matching
question moot; these 8 tabs read only `game-data.json`, already loaded.

- **Defense** (`defense.html`): Defensive Line (front calls, run efficiency
  allowed by front, sack rate, movement/stunt calls), Linebackers (run
  efficiency/explosive-rate allowed by front and hash, blitz calls),
  Cornerbacks (pass efficiency/explosive-rate allowed by direction and
  depth, pass-yards trend by game), Safeties (explosive-rate allowed by
  field zone and play type, yards-allowed trend by game).
- **Offense** (`offense.html`): Quarterbacks (pass efficiency by coverage
  faced, protection calls, sack rate), Running Backs (run efficiency by
  front faced and formation, backfield alignment), Receivers (coverage
  shell faced, pass efficiency by personnel, formation usage on pass
  plays), Offensive Line (fronts/stunts faced, run efficiency by front,
  sack rate allowed).
- Defensive Line/Linebackers/Quarterbacks/Running Backs/Receivers/
  Offensive Line read the hand-charted `Plays` sheet (front/blitz/
  protection/coverage/personnel/formation only exist there); Cornerbacks/
  Safeties read the official play-by-play instead, since direction/
  pass_depth/field_zone (their relevant fields) only exist there — there's
  no separate "coverage type" field for Carroll's own defensive calls
  (`front_d`/`tag_d`/`movement`/`blitz_d` are Carroll's own playbook call
  *names*, e.g. fronts named `OVER`/`ODD`/`BEAR`, blitzes named after
  states/cities — not a `Cover 2`-style scheme label the way the offense's
  `coverage`/`cov_shell` fields are for what opponents show Carroll).

All 8 new tabs plus the filter/Play Outcomes changes verified live in the
browser (console errors, real KPI/chart values, filter narrowing, mobile
width for both pages' now-7-tab bars) before committing.

## Lifting & Strength: up to 4 athletes in Class Comparison (2026-07-31, per the user)

Was hardcoded to exactly two athletes (A/B). Now 4 combobox slots
(`COMPARE_SLOT_COUNT`) — the first two default to real athletes like
before, the last two default to a real `"— None —"` option so a coach can
compare 2, 3, or 4 without being forced into 4. Colors switched from an
ad-hoc pair (`--cat-6`/`--cat-3`) to the dataviz skill's fixed
`--cat-1`..`--cat-4` categorical order, needed anyway once there's more
than 2 series — `renderCompareChart` and `render()` generalized to loop
over however many slots have a real athlete picked, rather than two
hardcoded A/B variables.

## Data sources

- `../Lifting Data/output/` — lifting/strength testing (Combined Total, Athleticism
  Score, Strength Score, all four Team/Position variants — see that project's
  README/SKILL.md for the full schema)
- `../Special Teams Data/*.xlsx` — punt, punt return, PAT/FG, kickoff, kickoff
  return
- `../Game Analysis/processed/combined_play_data.xlsx` — offense/defense
  play-by-play (self-scout `Plays` sheet + official scraped `OfficialPlayByPlay`
  sheet, matched per game via that project's own `GameMatchLog` sheet) — see
  that project's `SKILL.md` for the full column reference and known data gaps.
- `../CCIW Buddah Report/output_carroll/Carroll_Football_AllTime.xlsx` — CCIW
  conference rankings (cciw.org), already classified into Offense-Team/
  Defense-Team/SpecialTeams-Team sheets by that project's own scraper.
- `../National Buddah Report/CCIW_D3_Football_Stats/Carroll/Carroll_AllYears.xlsx` —
  NCAA D3 national rankings (NCAA.com), `Team Stats` sheet, phase-classified by
  this project's own `scripts/build_rankings_data.py` (see that script's
  `CATEGORY_SECTION` mapping, ported from `National Game Prep Report`'s own
  metric classification).

## Running locally

No build step — open `index.html` directly, or serve the folder. A launch config
already exists at the `Football/` root (`.claude/launch.json`, name "carroll-site",
port 8731); otherwise:

```bash
python -m http.server 8731
```

## Git

Initialized but had no commits until 2026-07-30's validation pass — first commit
covers everything through that pass (Phase 1 dashboards, design system, all UX/bugfix
rounds below). Going forward, changes land as their own commits when requested.
