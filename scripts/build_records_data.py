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
from pathlib import Path

import openpyxl

RECORDS_SRC = Path(__file__).resolve().parent.parent.parent / "Records & Awards" / "output" / "records.xlsx"
AWARDS_SRC = Path(__file__).resolve().parent.parent.parent / "Records & Awards" / "output" / "awards.xlsx"
CAREER_STATS_SRC = Path(__file__).resolve().parent.parent / "data" / "career-stats.json"
OUT = Path(__file__).resolve().parent.parent / "data" / "records.json"


def sheet_rows(ws):
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    return [dict(zip(header, r)) for r in rows]


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


def _leaders_by_statistic(sheet_rows):
    by_category = {}
    for row in sheet_rows:
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


def _build_watch_entries(players, leaders_by_statistic, current_season, value_fn):
    """value_fn(player, category, field) -> that player's value for this
    view (career total, or current-season-only total) or None/0 if they
    don't have one. Shared by both the Career and Season views -- only
    what supplies the comparison value differs."""
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
            gap = (fifth_value - value) if (fifth_value is not None and value <= fifth_value) else None
            candidates.append({
                "statistic": stat, "player": p["display_name"], "position": p["position"],
                "current_value": value, "top_value": top_value, "fifth_value": fifth_value, "gap": gap,
                "leaderboard": [{"rank": r["rank"], "player": r["player"], "value": r["value"]} for r in leaders],
            })
        # Ahead-of-record entries (gap None because value > fifth_value, or
        # no top_value/fifth_value comparison even applies) sort first;
        # among genuine chasers, closest gap first.
        candidates.sort(key=lambda e: (e["gap"] is not None, e["gap"] if e["gap"] is not None else 0))
        trimmed = _trim_to_meaningful(candidates)
        if trimmed:
            watch[stat] = [{k: v for k, v in e.items() if k != "gap"} for e in trimmed]
    return watch


def build_record_watch(records, career_stats):
    players = career_stats["players"]
    all_seasons = sorted({s["season"] for p in players for cat in p["categories"].values() for s in cat["seasons"]})
    current_season = all_seasons[-1] if all_seasons else None

    career_leaders = _leaders_by_statistic(records["CareerIndividual"])
    season_leaders = _leaders_by_statistic(records["SeasonIndividual"])

    career_watch = _build_watch_entries(
        players, career_leaders, current_season,
        value_fn=lambda p, cat, field: p["categories"][cat]["career"].get(field),
    )

    def season_value(p, cat, field):
        season_bucket = next((s for s in p["categories"][cat]["seasons"] if s["season"] == current_season), None)
        return season_bucket.get(field) if season_bucket else None

    season_watch = _build_watch_entries(players, season_leaders, current_season, value_fn=season_value)

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

    record_watch = build_record_watch(records, career_stats)

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


if __name__ == "__main__":
    main()
