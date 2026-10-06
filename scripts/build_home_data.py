"""
Builds data/home.json -- the small summary behind the Home page: the current season's record,
scoring, game log, and headline efficiency numbers next to the prior-seasons average.

Reads (all already built by the other scripts / sibling projects):
  - data/game-data.json        official play-by-play (yards, success, turnovers) per game
  - data/special-teams.json    Value/Score rows for every special teams unit
  - Special Teams Data/raw/*.json   each box score's `game_info` (final score, home/away,
                                    Carroll's overall + conference record after the game)

Run after the other build scripts (refresh_all.py does this):
    python build_home_data.py

Definitions match the dashboards exactly so the Home numbers agree with Offense/Defense/Special Teams:
Yards/Play = mean yards over every official snap; Success Rate = Successful or Explosive snaps over
snaps with a classified efficiency; ST score = mean Value/Score over every unit's rows.
"""

import glob
import json
import re
from collections import defaultdict
from pathlib import Path

from build_game_data import canonical_opponent

SITE = Path(__file__).resolve().parent.parent
DATA = SITE / "data"
RAW_GLOB = str(SITE.parent / "Special Teams Data" / "raw" / "*.json")
OUT = DATA / "home.json"

SUCCESS = {"Successful", "Explosive"}
SCORE_RE = re.compile(r"^(.+?)\s+(\d+)-(\d+)\s+(.+)$")
RECORD_RE = re.compile(r"Carroll(?: \(WI\))?\s*\((\d+-\d+)\s*,\s*(\d+-\d+)\)")


def mean(values):
    vals = [v for v in values if v is not None]
    return sum(vals) / len(vals) if vals else None


def rate(rows, pred):
    return sum(1 for r in rows if pred(r)) / len(rows) if rows else None


def r4(v):
    return None if v is None else round(v, 4)


def side_metrics(rows):
    """Yards/play, success rate, explosive rate, and turnover count for one side's official snaps."""
    classified = [r for r in rows if r.get("play_efficiency") is not None]
    return {
        "plays": len(rows),
        "ypp": r4(mean([r.get("yards") for r in rows])),
        "success": r4(rate(classified, lambda r: r["play_efficiency"] in SUCCESS)),
        "explosive": r4(rate(classified, lambda r: r["play_efficiency"] == "Explosive")),
        "turnovers": sum(1 for r in rows if r.get("is_turnover")),
    }


def parse_game_info(path):
    """One Carroll box score -> dict (or None if it isn't a scored Carroll game)."""
    info = json.loads(Path(path).read_text(encoding="utf-8")).get("game_info", {})
    m = SCORE_RE.match(info.get("score") or "")
    matchup = info.get("matchup") or ""
    if not m or "Carroll" not in matchup:
        return None
    team_a, pts_a, pts_b, team_b = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)
    carroll_first = "Carroll" in team_a
    mine, theirs = (pts_a, pts_b) if carroll_first else (pts_b, pts_a)
    opponent = canonical_opponent((team_b if carroll_first else team_a).strip())
    # Date is MM/DD/YYYY -- but a few older box scores carry a bare "M/D", so the year comes from
    # the file name's season prefix ("2022_wheaton....json"), which is always present.
    # Matchup is "AWAY -VS- HOME" with each side's (overall , conference) record.
    yr = Path(path).name[:4]
    mo, dy = info["date"].split("/")[:2]
    mo, dy = mo.zfill(2), dy.zfill(2)
    away, _, home = matchup.partition("-VS-")
    rec = RECORD_RE.search(matchup)
    return {
        "season": int(yr),
        "date": f"{yr}-{mo}-{dy}",
        "opponent": opponent,
        "home": "Carroll" in home,
        "carroll_pts": mine,
        "opp_pts": theirs,
        "record_after": rec.group(1) if rec else None,
        "conf_record_after": rec.group(2) if rec else None,
    }


def main():
    game_data = json.loads((DATA / "game-data.json").read_text(encoding="utf-8"))
    st = json.loads((DATA / "special-teams.json").read_text(encoding="utf-8"))

    season = max(g["season"] for g in game_data["games"])
    box = sorted((g for g in map(parse_game_info, glob.glob(RAW_GLOB)) if g), key=lambda g: g["date"])
    # "Prior" = the seasons the play-by-play archive covers (so every compared number spans the same
    # window as the dashboards), not every box score back to 2010.
    first_season = min(g["season"] for g in game_data["games"])
    current = [g for g in box if g["season"] == season]
    prior = [g for g in box if first_season <= g["season"] < season]

    # Official play-by-play rows grouped by ISO date (one Carroll game per date).
    off_by_date, def_by_date = defaultdict(list), defaultdict(list)
    for r in game_data["offense"]["official"]:
        off_by_date[r["date"]].append(r)
    for r in game_data["defense"]["official"]:
        def_by_date[r["date"]].append(r)

    # Special teams Value/Score by ISO date (rows carry M/D/YYYY).
    st_by_date = defaultdict(list)
    for rows in st["units"].values():
        for r in rows:
            m, d, y = r["date"].split("/")
            st_by_date[f"{y}-{int(m):02d}-{int(d):02d}"].append(r["score"])

    games = []
    for g in current:
        off, dfn = side_metrics(off_by_date.get(g["date"], [])), side_metrics(def_by_date.get(g["date"], []))
        charted = off["plays"] > 0
        games.append({
            "date": g["date"],
            "opponent": g["opponent"],
            "home": g["home"],
            "carroll_pts": g["carroll_pts"],
            "opp_pts": g["opp_pts"],
            "result": "W" if g["carroll_pts"] > g["opp_pts"] else "L" if g["carroll_pts"] < g["opp_pts"] else "T",
            "charted": charted,
            "offense": off if charted else None,
            "defense": dfn if charted else None,
            "st_score": r4(mean(st_by_date.get(g["date"], []))),
        })

    def pooled(season_filter):
        off = [r for r in game_data["offense"]["official"] if season_filter(r["season"])]
        dfn = [r for r in game_data["defense"]["official"] if season_filter(r["season"])]
        st_scores = [r["score"] for rows in st["units"].values() for r in rows if season_filter(int(r["season"]))]
        return {"offense": side_metrics(off), "defense": side_metrics(dfn), "st_score": r4(mean(st_scores))}

    def per_game(box_games, key):
        return r4(sum(g[key] for g in box_games) / len(box_games)) if box_games else None

    latest = current[-1] if current else None
    out = {
        "generated_from": "game-data.json, special-teams.json, Special Teams Data box scores",
        "season": season,
        "prior_label": f"{first_season}–{season - 1}" if prior else None,
        "record": latest["record_after"] if latest else None,
        "conference_record": latest["conf_record_after"] if latest else None,
        "games": games,
        "season_stats": {
            **pooled(lambda s: s == season),
            "pts_for_pg": per_game(current, "carroll_pts"),
            "pts_against_pg": per_game(current, "opp_pts"),
        },
        "prior_stats": {
            **pooled(lambda s: first_season <= s < season),
            "pts_for_pg": per_game(prior, "carroll_pts"),
            "pts_against_pg": per_game(prior, "opp_pts"),
        },
    }
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"season {season}: {out['record']} ({out['conference_record']} CCIW), {len(games)} games -> {OUT}")
    for g in games:
        print(f"  {g['date']} {g['result']} {g['carroll_pts']}-{g['opp_pts']} {'vs' if g['home'] else '@'} {g['opponent']}")


if __name__ == "__main__":
    main()
