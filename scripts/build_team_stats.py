"""
Builds data/team-stats.json -- every CCIW team's season totals and national rank in the headline team
categories, from the latest weekly national-ranking snapshot. It powers the "Their season so far"
card on Opponent Scouting's Next Opponent tab (an opponent next to Carroll, with national ranks).

Reads (the National Buddah Report scraper's raw CSVs):
  National Buddah Report/CCIW_D3_Football_Stats/raw/<season>/<snapshot date>/team/<category>.csv

Only conference teams appear in those files, so a non-conference opponent (St. Norbert, UW Eau Claire)
simply has no entry and the card says so. Each team's `games` is how many games the NCAA had counted
when the snapshot was taken -- it can trail Carroll's own schedule by a game, and the card shows it.

Run after the other build scripts (refresh_all.py does this):
    python build_team_stats.py
"""

import csv
import json
from pathlib import Path

from build_home_data import load_names, team_key

SITE = Path(__file__).resolve().parent.parent
RAW = SITE.parent / "National Buddah Report" / "CCIW_D3_Football_Stats" / "raw"
OUT = SITE / "data" / "team-stats.json"

# (category, file name, group). The value shown is each file's last column (PPG, YPG, Pct, Avg, ...);
# the file's TrueRank column is the national rank (1 = best).
CATEGORIES = [
    ("Scoring Offense", "offense"), ("Total Offense", "offense"), ("Passing Offense", "offense"),
    ("Rushing Offense", "offense"), ("3rd Down Conversion Pct", "offense"), ("Red Zone Offense", "offense"),
    ("Team Passing Efficiency", "offense"),
    ("Scoring Defense", "defense"), ("Total Defense", "defense"), ("Passing Yards Allowed", "defense"),
    ("Rushing Defense", "defense"), ("3rd Down Conversion Pct Defense", "defense"), ("Red Zone Defense", "defense"),
    ("Team Sacks", "defense"),
    ("Turnover Margin", "other"), ("Net Punting", "other"),
]


def latest_snapshot():
    season = max((d for d in RAW.iterdir() if d.is_dir() and d.name.isdigit()), key=lambda d: int(d.name))
    snap = max((d for d in season.iterdir() if d.is_dir()), key=lambda d: d.name)
    return int(season.name), snap


def main():
    if not RAW.exists():
        print(f"WARNING: {RAW} not found -- team-stats.json not updated")
        return
    names = load_names()
    season, snap = latest_snapshot()
    teams, stats = {}, []
    for category, group in CATEGORIES:
        path = snap / "team" / f"{category}.csv"
        if not path.exists():
            print(f"WARNING: {path.name} missing from the {snap.name} snapshot")
            continue
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            stat = reader.fieldnames[-1]
            stats.append({"category": category, "group": group, "stat": stat})
            for row in reader:
                key = team_key(row["Team"])
                name = names.get(key) or ("Carroll" if key == "carroll" else row["Team"])
                teams.setdefault(name, {})[category] = {
                    "games": int(row["G"]),
                    "value": float(row[stat]),
                    "rank": int(row["TrueRank"]),
                }
    out = {"season": season, "snapshot_date": snap.name, "categories": stats, "teams": dict(sorted(teams.items()))}
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{season} snapshot {snap.name}: {len(teams)} teams x {len(stats)} categories -> {OUT}")
    print("  teams: " + ", ".join(out["teams"]))


if __name__ == "__main__":
    main()
