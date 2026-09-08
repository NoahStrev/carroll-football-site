"""
Reads the sibling "Records & Awards" project's 2 scraped workbooks
(output/records.xlsx, output/awards.xlsx -- gopios.com's full record book
and award-winner history) plus this site's own already-built
data/career-stats.json, and writes data/records.json: the record book, the
award history, and a "Record Watch" cross-reference of current players'
real career totals against the scraped Career leaderboards.

Record Watch scope, deliberately limited to what's honestly derivable
today: only the 5 categories with a real per-player career total already
in career-stats.json (Rushing/Passing/Receiving/Interceptions/Tackles/
Sacks -- see RECORD_WATCH_MAP below). Kicking/Punting/Return records exist
in the scraped record book but have no per-player career-total pipeline
yet (data/special-teams.json has real per-attempt rows, not accumulated
career totals) -- out of scope for this pass, called out explicitly on the
page rather than silently absent.

"Current" is the 2 most recent season years actually present in
career-stats.json (not a hardcoded year) -- self-adjusts every season
without a code change, same "derive the window from real data" principle
Schedule/check_in_season.py already established for the raw scrapers.

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
}


def build_record_watch(records, career_stats):
    players = career_stats["players"]
    all_seasons = sorted({s["season"] for p in players for cat in p["categories"].values() for s in cat["seasons"]})
    active_seasons = set(all_seasons[-2:]) if all_seasons else set()

    career_by_category = {}
    for row in records["CareerIndividual"]:
        career_by_category.setdefault(row["category"], []).append(row)

    watch = []
    for stat, (cat, field) in RECORD_WATCH_MAP.items():
        leaders = [r for cat_rows in career_by_category.values() for r in cat_rows if r["statistic"] == stat]
        leaders.sort(key=lambda r: r["rank"] if r["rank"] is not None else 999)
        if not leaders:
            continue
        fifth_value = leaders[-1]["value"] if len(leaders) >= 5 else None
        top_value = leaders[0]["value"]

        for p in players:
            if not p["athlete_key"] or cat not in p["categories"]:
                continue
            seasons_played = {s["season"] for s in p["categories"][cat]["seasons"]}
            if not (seasons_played & active_seasons):
                continue  # not a current player -- has no recent stat-line in this category
            value = _current_value(p, cat, field)
            if value is None:
                continue
            entry = {
                "statistic": stat, "player": p["display_name"], "position": p["position"],
                "current_value": value, "top_value": _numeric(top_value),
                "fifth_value": _numeric(fifth_value) if fifth_value is not None else None,
                "leaderboard": [{"rank": r["rank"], "player": r["player"], "value": r["value"]} for r in leaders],
            }
            watch.append(entry)
    return {"active_seasons": sorted(active_seasons), "entries": watch}


def _current_value(player, category, field):
    return player["categories"][category]["career"].get(field)


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
    print(f"record_watch: {len(record_watch['entries'])} entries, active seasons {record_watch['active_seasons']}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
