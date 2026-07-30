# Carroll Football Analytics Site

Replaces `dashboards-site-poc` (kept around for reference for now; delete it once this
site fully covers what it did — see the special-teams position pages below).

Static HTML/CSS/JS, no build step, same approach as `dashboards-site-poc` and the
`Special Teams Data/mockups/*.html` prototypes this project's visual language is
based on.

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
3. **Phase 3 — offense &amp; defense**: no existing dashboard reference for either —
   design from scratch once we get here.
4. **Phase 4 — report ingestion &amp; downloads** (lowest priority, added 2026-07-30
   per the user): get the program's existing generated reports (CCIW Buddah Report,
   National Buddah Report, Game Analysis, National/CCIW Game Prep Report — the
   sibling projects under `Football/`) into this site and downloadable, not just
   living in each project's own output folder. Design/scope TBD once we get here —
   likely a per-report-type listing page with download links, possibly filterable
   by season/opponent; may need its own data/build step per report type the same
   way Phase 1 does.

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

## Data sources

- `../Lifting Data/output/` — lifting/strength testing (Combined Total, Athleticism
  Score, Strength Score, all four Team/Position variants — see that project's
  README/SKILL.md for the full schema)
- `../Special Teams Data/*.xlsx` — punt, punt return, PAT/FG, kickoff, kickoff
  return

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
