"""
Reads the sibling "Records & Awards" project's 2 scraped workbooks
(output/records.xlsx, output/awards.xlsx -- gopios.com's full record book
and award-winner history) plus this site's own already-built
data/career-stats.json, and writes data/records.json: the record book, the
award history, and a "Record Watch" cross-reference of current players'
real career totals against the scraped Career leaderboards.

Record Watch scope, deliberately limited to what's honestly derivable
today: only the categories with a real per-player career total already in
career-stats.json -- see RECORD_WATCH_MAP below. As of 2026-09-08 that's
Rushing/Passing/Receiving/Interceptions/Tackles/Sacks (from the raw
box-score archive) plus Field Goals/PATs/Punting/Kickoff+Punt Returns
(from this site's own already-verified data/special-teams.json, rolled up
into career totals by build_career_stats.py's accumulate_special_teams()).
Not every record-book category has a mapping -- rate-stat categories whose
title carries a "(Min. N Attempts)" qualifier (e.g. "Average Yards Per
Punt") are skipped, since that qualifier isn't consistent enough across
categories/seasons to key a lookup on safely.

"Current"/"active" (2026-09-08, per the user, tightened from the original
"2 most recent seasons") means the single most recent season year
actually present in career-stats.json (not a hardcoded year, so this
self-adjusts every season without a code change) -- a player with no
stat-line in that exact season has left the program, even if they played
last year, so showing them here would be misleading, not just stale.

Two parallel views, per the user ("there should be both a single season
and career subtab"): CAREER (an active player's all-time total vs. the
Career leaderboard) and SEASON (an active player's CURRENT season alone
vs. the Single-Season leaderboard, since a season and a career total
naturally chase two different records). Both use the same
RECORD_WATCH_MAP -- the record book uses identical statistic names for
both leaderboards (e.g. "Rushing Yards" appears under both "CAREER
RUSHING RECORDS" and "SINGLE-SEASON RUSHING RECORDS").

Only real, meaningful entries are ever included (per the user):
- Zero is excluded outright -- a player who's never attempted the stat at
  all isn't "chasing" the record, they just happen to share a category
  with someone who does.
- At most 5 shown per statistic, ranked by closeness to the current #5 --
  but cut off earlier the moment the gap crosses `GAP_CUTOFF_FRACTION` of
  the #5 value itself, so a token 1-attempt player 50 years behind the
  record doesn't pad the list out to 5 just to hit a round number. A
  player already ahead of the current #1 or already inside the current
  Top 5 always shows regardless of this cutoff -- they're not "chasing,"
  they've arguably already arrived.

Re-run whenever Records & Awards' scrapers or this site's own
career-stats.json are refreshed:
    python build_records_data.py
"""

import json
import re
from pathlib import Path

import openpyxl

from build_lib import sheet_rows

RECORDS_SRC = Path(__file__).resolve().parent.parent.parent / "Records & Awards" / "output" / "records.xlsx"
AWARDS_SRC = Path(__file__).resolve().parent.parent.parent / "Records & Awards" / "output" / "awards.xlsx"
CAREER_STATS_SRC = Path(__file__).resolve().parent.parent / "data" / "career-stats.json"
OUT = Path(__file__).resolve().parent.parent / "data" / "records.json"


def load_workbook_sheets(path):
    wb = openpyxl.load_workbook(path, read_only=True)
    return {name: sheet_rows(wb[name]) for name in wb.sheetnames}


# Maps a CAREER record-book `statistic` string to where its real-time
# equivalent lives in career-stats.json (category, field). Only categories
# with an actual per-player career total today are listed -- see module
# docstring. Values intentionally match the record book's own exact
# statistic text (case-sensitive) so a lookup is a plain dict hit, not a
# fuzzy string match that could silently pair the wrong two things.
RECORD_WATCH_MAP = {
    "Rushing Yards": ("Rushing", "net"),
    "Rushing Touchdowns": ("Rushing", "td"),
    "Rushing Attempts": ("Rushing", "att"),
    "Passing Yards": ("Passing", "yds"),
    "Passing Touchdowns": ("Passing", "td"),
    "Passing Completions": ("Passing", "cmp"),
    "Passing Attempts": ("Passing", "att"),
    "Receiving Yards": ("Receiving", "yds"),
    "Receptions": ("Receiving", "rec"),
    "Receiving Touchdowns": ("Receiving", "td"),
    "Interceptions": ("Individual Defensive Statistics", "int"),
    "Total Tackles": ("Individual Defensive Statistics", "tot"),
    "Solo Tackles": ("Individual Defensive Statistics", "solo"),
    "Assisted Tackles": ("Individual Defensive Statistics", "ast"),
    "Sacks": ("Individual Defensive Statistics", "sacks"),
    # Added 2026-09-08 alongside the new Punting/Kickoffs/Return/PAT-FG
    # career totals. Deliberately excludes the record book's own rate-stat
    # categories here (e.g. "Average Yards Per Punt (Min. 50 Attempts)") --
    # those titles carry a parenthetical minimum-attempts qualifier that
    # isn't consistent across categories/seasons, so a plain string-key
    # lookup would be a real, silent mismatch risk; only the counting
    # stats (no qualifier in the name) are mapped.
    "Field Goals Made": ("PATFG", "fg_made"),
    "Field Goals Attempted": ("PATFG", "fg_att"),
    "PATs Made": ("PATFG", "exp_made"),
    "PATs Attempted": ("PATFG", "exp_att"),
    "Total Punts": ("Punting", "att"),
    "Punting Yards": ("Punting", "gross_yds"),
    "Kickoff Returns": ("KickoffReturn", "att"),
    "Kickoff Return Yards": ("KickoffReturn", "yds"),
    "Punt Returns": ("PuntReturn", "att"),
    "Punt Return Yards": ("PuntReturn", "yds"),
}


MAX_SHOWN_PER_STAT = 5
GAP_CUTOFF_FRACTION = 0.5  # see module docstring


def _name_key(s):
    """Loose match for comparing a display_name against the record book's
    own `player` text -- lowercase, letters only, so trivial formatting
    differences ("Keon Miller" vs "Miller, Keon" vs stray whitespace)
    don't cause a false non-match."""
    return re.sub(r"[^a-z]", "", (s or "").lower())


def check_same_person_value_mismatches(players, career_leaders, warnings):
    """For every RECORD_WATCH_MAP stat, if THE SAME real person is the #1
    leader in both this site's own computed career totals (across ALL
    players, active or not -- unlike Record Watch, which only looks at
    current players) AND the record book's own scraped Career leaderboard,
    but the two sources disagree on the actual value, that's a much
    stronger signal of a real data-completeness gap than merely "my #1
    isn't the record book's #1" (which is often just explained by the
    box-score/special-teams archive's 2010-present coverage window not
    reaching a genuinely older record-holder's full, or entire, career).

    Added 2026-09-08 after finding exactly this case by hand: Keon Miller
    is correctly the #1 in both this site's own Kickoff Return computed
    totals AND the official Kickoff Returns/Kickoff Return Yards records
    -- a fully 2021-2023 career, entirely within this archive's stated
    coverage -- yet undercounts by 15 real attempts / 279 real yards
    (16-19%) versus the official number for the SAME person. Confirmed
    this isn't a bug in this site's own accumulation (data/special-
    teams.json's own raw kickoff_return rows for him already sum to
    exactly the undercounted total) -- the gap is further upstream, most
    likely missing rows in the sibling Special Teams Data project's own
    hand-charted workbook for some of his real games. Not fixable from
    here; this check exists to make sure a future instance of this exact
    pattern gets surfaced automatically instead of requiring another
    manual leaderboard-by-leaderboard comparison to notice."""
    # First real season anywhere in this site's own box-score/special-teams
    # archive -- a player whose earliest season sits right at this boundary
    # plausibly has real pre-archive seasons this site simply doesn't (and
    # structurally can't) cover, which is an expected, already-documented
    # limitation, not a new anomaly. ARCHIVE_START_BUFFER gives a little
    # slack (a true freshman season sometimes has few/no qualifying stat
    # lines, so "earliest season on record" can already be a year or two
    # into a real career that itself started at the archive boundary).
    all_seasons = sorted({s["season"] for p in players for c in p["categories"].values() for s in c["seasons"]})
    archive_start = all_seasons[0] if all_seasons else None
    ARCHIVE_START_BUFFER = 2

    for stat, (cat, field) in RECORD_WATCH_MAP.items():
        leaders = career_leaders.get(stat)
        if not leaders:
            continue
        official_value = _numeric(leaders[0]["value"])
        official_key = _name_key(leaders[0]["player"])
        if official_value is None or not official_key:
            continue
        best_value, best_name, best_bucket = None, None, None
        for p in players:
            c = p["categories"].get(cat)
            if not c:
                continue
            v = c["career"].get(field)
            if v and (best_value is None or v > best_value):
                best_value, best_name, best_bucket = v, p["display_name"], c
        if best_value is None or _name_key(best_name) != official_key:
            continue  # different people lead each list -- not this check's concern
        if best_value != official_value:
            earliest = min((s["season"] for s in best_bucket["seasons"]), default=None)
            near_boundary = (
                archive_start is not None and earliest is not None
                and earliest <= archive_start + ARCHIVE_START_BUFFER
            )
            explanation = (
                f"plausibly explained by a real career that started at/near this archive's own "
                f"{archive_start} coverage start (their earliest season on record here is {earliest}) "
                f"-- likely just missing pre-archive seasons, not necessarily a new issue"
                if near_boundary else
                f"NOT explained by archive coverage (their earliest season on record here is "
                f"{earliest}, well after this archive's {archive_start} start) -- this one is worth "
                f"a closer look, not just an expected pre-archive gap"
            )
            warnings.append(
                f"{stat}: {best_name} is the #1 leader in BOTH this site's own career "
                f"total ({best_value}) and the record book ({official_value}) for the "
                f"same statistic, but the two values disagree by {abs(official_value - best_value)} -- "
                f"{explanation}. Before assuming this is purely an upstream archive gap, check "
                f"whether this specific person's own raw rows in data/special-teams.json or the "
                f"box-score archive already sum to the undercounted total (they did for the case "
                f"that prompted this check, Keon Miller's Kickoff Return Yards, confirmed 2026-09-08) "
                f"-- if they DON'T, that's a real bug in this site's own accumulation, not an upstream gap."
            )


def check_season_value_mismatches(players, season_rows, warnings):
    """Like check_same_person_value_mismatches(), but checks EVERY listed
    entry on the record book's own Single-Season leaderboard (all ~5 per
    statistic, not just #1), cross-referencing by (player name, exact
    season year) rather than "whoever leads each list." A season is a much
    stronger match than a career total -- there's no "maybe their career
    started before this archive" excuse for a single specific year, so a
    mismatch here is a stronger, more specific signal.

    Added 2026-09-09 after this exact check (run once, by hand, not yet
    automated) found the season_year() bug just above (a bare "M/D" date
    with no year at all in 2 of 151 raw games silently excluded from every
    player's SEASON-level totals that game, while still correctly counting
    toward their CAREER total -- which is exactly why the career-level
    check above didn't catch it) and the "M. Johnson"/Marcus Johnson
    misattribution in NAME_ALIASES' own comment. Both are now fixed, but
    this check stays in permanently -- it's a stronger, more specific
    signal than the career-level check and clearly catches real bugs the
    career-level version can't."""
    for stat, (cat, field) in RECORD_WATCH_MAP.items():
        for r in season_rows:
            if r["statistic"] != stat:
                continue
            official_value = _numeric(r["value"])
            year_m = re.match(r"^(\d{4})", str(r.get("years") or ""))
            if official_value is None or not year_m:
                continue
            season = int(year_m.group(1))
            official_key = _name_key(r["player"])
            for p in players:
                if _name_key(p["display_name"]) != official_key:
                    continue
                c = p["categories"].get(cat)
                if not c:
                    continue
                bucket = next((s for s in c["seasons"] if s["season"] == season), None)
                if not bucket:
                    continue
                mine = bucket.get(field)
                if mine is not None and mine != official_value:
                    warnings.append(
                        f"{stat} {season}: {p['display_name']}'s single-season total here "
                        f"({mine}) disagrees with the record book's own {r['rank_label']} entry "
                        f"for this exact same player and season ({official_value}) -- unlike a "
                        f"career-total mismatch, a single season has no 'their career started "
                        f"before this archive' excuse, so this is a stronger signal of a real "
                        f"gap or bug (missing/incomplete game data for this specific person in "
                        f"this specific season) worth investigating directly, not just noting."
                    )


def _leaders_by_statistic(rows):
    # Renamed from `sheet_rows` 2026-09-08 -- shadowed the `sheet_rows()`
    # function now imported from build_lib into this same file (harmless,
    # since this never calls the imported one, but confusing to read).
    by_category = {}
    for row in rows:
        by_category.setdefault(row["category"], []).append(row)
    by_statistic = {}
    for rows in by_category.values():
        for r in rows:
            by_statistic.setdefault(r["statistic"], []).append(r)
    for rows in by_statistic.values():
        rows.sort(key=lambda r: r["rank"] if r["rank"] is not None else 999)
    return by_statistic


def _trim_to_meaningful(entries):
    """At most MAX_SHOWN_PER_STAT, cut off early past a real gap -- see
    module docstring. Entries already sorted by ascending gap (closest
    first) by the caller; an entry with gap None (already ahead of the
    record, or no 5th-place threshold exists to measure against at all)
    always keeps its place rather than being cut."""
    out = []
    for e in entries:
        if len(out) >= MAX_SHOWN_PER_STAT:
            break
        if e["gap"] is not None and e["fifth_value"] and e["gap"] > e["fifth_value"] * GAP_CUTOFF_FRACTION:
            break
        out.append(e)
    return out


def _build_watch_entries(players, leaders_by_statistic, current_season, value_fn, view_label, warnings):
    """value_fn(player, category, field) -> that player's value for this
    view (career total, or current-season-only total) or None/0 if they
    don't have one. Shared by both the Career and Season views -- only
    what supplies the comparison value differs.

    `warnings` (a shared list, appended to, not returned) collects a
    message any time an active player's own real value already matches or
    exceeds the record book's own scraped #1 -- added 2026-09-08. The
    record book (`records.xlsx`) is a static one-time scrape of Carroll
    Athletics' own site, only ever re-scraped when the user asks (see the
    sibling `Records & Awards` project's own SKILL.md) -- unlike every
    other data source this site rebuilds weekly, nothing re-fetches it on
    a schedule. If a real record actually gets broken mid-season, this
    site's own Record Watch total can end up ahead of the scraped
    leaderboard's own #1 well before anyone remembers to re-scrape it.
    This can't tell "genuinely broke the real record" apart from "the
    record book just hasn't been re-scraped in a while and this player
    was always this good" -- it only flags the specific, checkable
    condition (this site's own number vs. the last scraped #1), which is
    exactly the signal worth a human's attention either way."""
    watch = {}
    for stat, (cat, field) in RECORD_WATCH_MAP.items():
        leaders = leaders_by_statistic.get(stat)
        if not leaders:
            continue
        fifth_value = _numeric(leaders[-1]["value"]) if len(leaders) >= 5 else None
        top_value = _numeric(leaders[0]["value"])

        candidates = []
        for p in players:
            if not p["athlete_key"] or cat not in p["categories"]:
                continue
            if current_season not in {s["season"] for s in p["categories"][cat]["seasons"]}:
                continue  # not active this season -- no current stat-line in this category at all
            value = value_fn(p, cat, field)
            if not value:
                continue  # a real 0 (or no value) isn't a player "chasing" this record
            if top_value is not None and value >= top_value:
                verb = "TIED" if value == top_value else "SURPASSED"
                warnings.append(
                    f"{view_label} {stat}: {p['display_name']} has {value}, {verb} the record book's "
                    f"scraped #1 ({leaders[0]['player']}, {leaders[0]['value']}) -- consider re-scraping "
                    f"Records & Awards to confirm and update the record book"
                )
            gap = (fifth_value - value) if (fifth_value is not None and value <= fifth_value) else None
            candidates.append({
                "statistic": stat, "player": p["display_name"], "position": p["position"],
                "current_value": value, "top_value": top_value, "fifth_value": fifth_value, "gap": gap,
                # value_numeric alongside the raw display value (e.g.
                # "3,844") -- added 2026-09-08 so the page can compute an
                # exact distance to whichever rank a player is closest to
                # beating, not just the current #1/#5, without
                # re-implementing _numeric()'s comma/percent stripping in
                # JS a second time.
                "leaderboard": [{"rank": r["rank"], "player": r["player"], "value": r["value"], "value_numeric": _numeric(r["value"])} for r in leaders],
            })
        # Ahead-of-record entries (gap None because value > fifth_value, or
        # no top_value/fifth_value comparison even applies) sort first;
        # among genuine chasers, closest gap first.
        candidates.sort(key=lambda e: (e["gap"] is not None, e["gap"] if e["gap"] is not None else 0))
        trimmed = _trim_to_meaningful(candidates)
        if trimmed:
            watch[stat] = [{k: v for k, v in e.items() if k != "gap"} for e in trimmed]
    return watch


def build_record_watch(records, career_stats, warnings):
    players = career_stats["players"]
    all_seasons = sorted({s["season"] for p in players for cat in p["categories"].values() for s in cat["seasons"]})
    current_season = all_seasons[-1] if all_seasons else None

    career_leaders = _leaders_by_statistic(records["CareerIndividual"])
    season_leaders = _leaders_by_statistic(records["SeasonIndividual"])

    career_watch = _build_watch_entries(
        players, career_leaders, current_season,
        value_fn=lambda p, cat, field: p["categories"][cat]["career"].get(field),
        view_label="career", warnings=warnings,
    )

    def season_value(p, cat, field):
        season_bucket = next((s for s in p["categories"][cat]["seasons"] if s["season"] == current_season), None)
        return season_bucket.get(field) if season_bucket else None

    season_watch = _build_watch_entries(
        players, season_leaders, current_season, value_fn=season_value,
        view_label="season", warnings=warnings,
    )

    return {"current_season": current_season, "career": career_watch, "season": season_watch}


def _numeric(v):
    """Record-book Value cells are strings, sometimes with a thousands
    comma ("3,844") or a trailing unit-free percent ("63.3%") -- strips
    both so Record Watch can do real numeric comparison against
    career-stats.json's own already-numeric totals."""
    if v is None:
        return None
    s = str(v).replace(",", "").replace("%", "")
    try:
        return float(s) if "." in s else int(s)
    except ValueError:
        return None


def main():
    records = load_workbook_sheets(RECORDS_SRC)
    awards = load_workbook_sheets(AWARDS_SRC)
    with open(CAREER_STATS_SRC, encoding="utf-8") as f:
        career_stats = json.load(f)

    warnings = []
    record_watch = build_record_watch(records, career_stats, warnings)
    check_same_person_value_mismatches(
        career_stats["players"], _leaders_by_statistic(records["CareerIndividual"]), warnings,
    )
    check_season_value_mismatches(career_stats["players"], records["SeasonIndividual"], warnings)

    out = {"records": records, "awards": awards, "record_watch": record_watch}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)

    for name, rows in {**records, **awards}.items():
        print(f"{name}: {len(rows)} rows")
    career_n = sum(len(v) for v in record_watch["career"].values())
    season_n = sum(len(v) for v in record_watch["season"].values())
    print(f"record_watch: current season {record_watch['current_season']}, "
          f"career {career_n} entries across {len(record_watch['career'])} stats, "
          f"season {season_n} entries across {len(record_watch['season'])} stats")
    print(f"wrote {OUT}")
    for w in warnings:
        print(f"WARNING: {w}")


if __name__ == "__main__":
    main()
