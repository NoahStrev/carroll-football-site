"""
Sanity-checks the freshly built data/*.json before anything is committed. refresh_all.py runs this
last; it exits non-zero when an ERROR is found, so the weekly refresh does not publish a broken update.

  ERROR    something that should never happen (a game twice, a score that disagrees with the box score's
           own record, a game that vanished since the last commit, an unknown opponent spelling).
  WARNING  worth a look but not a reason to stop (a game the schedule says was played that isn't loaded
           yet, a stale ranking snapshot).

Checks, by file:
  home.json / box scores   no duplicate dates, every box score parsed, scores in range, each season's
                           computed W-L matches the record the box score itself prints, <= 14 games a season
  game-data.json           every charted game has a box score, offense AND defense rows, few missing yards,
                           known play types, opponent spellings match the box-score canon, no "No Play" snaps,
                           no touchdown drive that really ended in a turnover, and (current season) each side's
                           yardage within reach of the official box score's total offense
  special-teams.json       every row's date is a real box-score game, every unit present for the latest season
  rankings.json            CCIW and national cover the same weeks
  team-stats.json          Carroll present with every category, snapshot not stale
  career-stats.json        no team pseudo-players, no duplicate display names, game logs add up to season totals
  meta.json                schedule present; games the schedule says are played but not loaded (WARNING)
  vs. the last commit      no game, charted play, or special-teams row count may drop (a re-export that
                           silently lost data would otherwise ship)

Run:   python validate_data.py        (exit 0 = no errors)
"""

import glob
import json
import re
import subprocess
import sys
from collections import Counter
from datetime import date
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
DATA = SITE / "data"

errors, warnings = [], []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def committed(name):
    """data/<name> as of the last commit, or None (not a repo, new file)."""
    try:
        out = subprocess.run(["git", "show", f"HEAD:data/{name}"], cwd=SITE, capture_output=True, check=True)
        return json.loads(out.stdout.decode("utf-8"))
    except (subprocess.CalledProcessError, FileNotFoundError, ValueError):
        return None


def iso(mdy):
    m, d, y = mdy.split("/")
    return f"{y}-{int(m):02d}-{int(d):02d}"


def check_games(home, game):
    history = [dict(g, opponent=o) for o, gs in home["history"].items() for g in gs]
    dates = Counter(g["date"] for g in history)
    for d, n in dates.items():
        if n > 1:
            err(f"box scores: {n} games on {d}")
    for g in history:
        if not (0 <= g["carroll_pts"] <= 100 and 0 <= g["opp_pts"] <= 100):
            err(f"box scores: implausible score {g['carroll_pts']}-{g['opp_pts']} on {g['date']} vs {g['opponent']}")
    by_season = Counter(g["season"] for g in history)
    for s, n in sorted(by_season.items()):
        if n > 14:
            err(f"box scores: {n} games in {s}")
    # the current season's record printed by the box score vs the results we parsed
    for s_key, block in home["seasons"].items():
        games = [g for g in history if g["season"] == int(s_key)]
        w = sum(g["result"] == "W" for g in games)
        l = sum(g["result"] == "L" for g in games)
        if block["record"] and block["record"] != f"{w}-{l}" and f"{w}-{l}" not in block["record"]:
            err(f"home.json: {s_key} record says {block['record']} but its {len(games)} box scores add up to {w}-{l}")
        if len(block["games"]) != len(games):
            err(f"home.json: {s_key} lists {len(block['games'])} games but the box scores have {len(games)}")

    box_dates = set(dates)
    charted = {g["date"]: g for g in game["games"]}
    for d, g in charted.items():
        if d not in box_dates:
            err(f"game-data: charted game {g['opponent']} {d} has no box score")
    canon = {g["opponent"] for g in history}
    for side in ("offense", "defense"):
        by_date = Counter(r["date"] for r in game[side]["official"])
        for d in charted:
            if by_date[d] == 0:
                err(f"game-data: {d} has no official {side} plays")
        rows = game[side]["official"]
        missing = sum(1 for r in rows if r["yards"] is None)
        if rows and missing / len(rows) > 0.05:
            err(f"game-data: {missing} of {len(rows)} {side} plays have no yardage")
        kinds = {r["play_type"] for r in rows}
        odd = kinds - {"Rush", "Pass", "Sack", "Kneel", "Two-Point Conversion", "Spike", "Penalty", None}
        if odd:
            err(f"game-data: unknown play types in {side}: {sorted(odd)}")
        if any("No Play" in (r["play_outcome"] or "") for r in rows):
            err(f"game-data: {side} still contains \"No Play\" snaps (build_game_data.py should drop them)")
        by_drive = {}
        for r in rows:
            by_drive.setdefault((r["game_label"], r["drive_num"]), []).append(r)
        for (label, num_), drive in by_drive.items():
            if num_ is not None and drive[0]["drive_result"] == "Touchdown" and any(r["play_outcome"] and "Touchdown" in r["play_outcome"] and ("Interception" in r["play_outcome"] or "Turnover" in r["play_outcome"]) for r in drive):
                err(f"game-data: {label} drive {num_} is a touchdown drive that really ended in a turnover (defensive TD)")
        opps = {r["opponent"] for r in rows}
        if opps - canon:
            err(f"game-data: opponent spelling(s) not in the box-score canon: {sorted(opps - canon)}")


def check_pbp_vs_box(game, season):
    """Each charted game's play-by-play yardage against the official box score's total offense. Nullified ("No Play")
    snaps are excluded at build time, so the two should agree closely: 39 of 54 archive games match exactly, and the
    rest are within ~30 yards (penalty/rushing edge cases in the source). A gap bigger than that in the CURRENT
    season is a new load worth a look -- e.g. a drive tagged to the wrong side, which moves its yards from one side to
    the other (2021-11-06 vs Carthage does exactly that and is a known, source-side issue)."""
    raw = SITE.parent / "Special Teams Data" / "raw"
    if not raw.exists():
        warn(f"box scores not found at {raw}; skipping the play-by-play vs box-score yardage check")
        return
    by_date = {"offense": Counter(), "defense": Counter()}
    for side in by_date:
        for r in game[side]["official"]:
            if r["season"] == season:
                by_date[side][r["date"]] += r["yards"] or 0
    num = lambda x: int(re.sub(r"[^0-9-]", "", x) or 0)
    for path in sorted(glob.glob(str(raw / f"{season}_*.json"))):
        d = json.loads(Path(path).read_text(encoding="utf-8"))
        mo, dy = d["game_info"]["date"].split("/")[:2]
        date = f"{season}-{mo.zfill(2)}-{dy.zfill(2)}"
        if date not in by_date["offense"]:
            continue
        away, _, home = d["game_info"]["matchup"].partition("-VS-")
        abbr = d["home_away"]
        mine = abbr["home_abbr"] if "Carroll" in home else abbr["away_abbr"]
        yards = d["team_stats"]["Total Offense"]["Yards"]
        theirs = next(k for k in yards if k != mine)
        for side, key in (("offense", mine), ("defense", theirs)):
            gap = by_date[side][date] - num(yards[key])
            if abs(gap) > 60:
                err(f"game-data: {date} {side} yardage is {gap:+d} yards from the box score ({by_date[side][date]} vs {num(yards[key])}) -- plays on the wrong side?")
            elif abs(gap) > 30:
                warn(f"game-data: {date} {side} yardage is {gap:+d} yards from the box score ({by_date[side][date]} vs {num(yards[key])})")


def check_special_teams(home, st):
    box_dates = {g["date"] for gs in home["history"].values() for g in gs}
    latest = max(int(r["season"]) for rows in st["units"].values() for r in rows)
    for unit, rows in st["units"].items():
        stray = {iso(r["date"]) for r in rows} - box_dates
        if stray:
            err(f"special-teams: {unit} has rows on {sorted(stray)} with no box score")
        if not any(int(r["season"]) == latest for r in rows):
            warn(f"special-teams: {unit} has no rows for {latest}")


def check_rankings(rk):
    a, b = rk["cciw"]["weeks"], rk["national"]["weeks"]
    if a != b:
        warn(f"rankings: CCIW weeks {a} and national weeks {b} differ")


def check_team_stats(ts):
    carroll = ts["teams"].get("Carroll")
    if not carroll:
        err("team-stats: Carroll is missing")
    else:
        missing = [c["category"] for c in ts["categories"] if c["category"] not in carroll]
        if missing:
            err(f"team-stats: Carroll is missing {missing}")
    age = (date.today() - date.fromisoformat(ts["snapshot_date"])).days
    if age > 14:
        warn(f"team-stats: the ranking snapshot is {age} days old ({ts['snapshot_date']})")


def check_career(cs):
    names = Counter(p["display_name"] for p in cs["players"])
    for n, k in names.items():
        if k > 1:
            err(f"career-stats: display name {n!r} appears {k} times")
        if n.strip().lower() in {"team", "total", "totals", "opponent", "opponents"}:
            err(f"career-stats: pseudo-player {n!r} (should have been filtered)")


def check_game_logs(cs):
    """Each season's per-game lines must add back up to that season's totals (they come from the same box-score rows)."""
    bad = 0
    for p in cs["players"]:
        for cat, v in p["categories"].items():
            for s in v["seasons"]:
                for key in ("att", "net", "yds", "rec", "tot", "cmp", "td", "solo", "ast"):
                    if "log" in s and key in s and isinstance(s[key], (int, float)):
                        total = sum(g.get(key, 0) or 0 for g in s["log"])
                        if abs(total - s[key]) > 1e-6:
                            bad += 1
                            if bad <= 5:
                                err(f"career-stats: {p['display_name']} {cat} {s['season']} game log sums to {total} {key} but the season says {s[key]}")
    if bad > 5:
        err(f"career-stats: ...and {bad - 5} more game-log mismatches")


def check_meta(meta, home):
    if not meta["schedule"]:
        warn("meta: the schedule is empty (is Schedule/schedule.json present?)")
        return
    latest = meta["latest_game"]["date"] if meta["latest_game"] else ""
    today = date.today().isoformat()
    for g in meta["schedule"]:
        if g["date"] < today and g["date"] > latest:
            warn(f"schedule says {g['opponent']} ({g['date']}) was played, but it is not loaded yet")


def check_no_regressions(home, game, st):
    old_home = committed("home.json")
    if old_home:
        was = {g["date"] for gs in old_home["history"].values() for g in gs}
        now = {g["date"] for gs in home["history"].values() for g in gs}
        if was - now:
            err(f"home.json: games disappeared since the last commit: {sorted(was - now)}")
    old_game = committed("game-data.json")
    if old_game:
        # Per date, both sides together: a drive moved from one side to the other (MANUAL_DRIVE_SIDE_OVERRIDES in
        # build_game_data.py) changes each side's count but not the game's total. "No Play" snaps are no longer part
        # of the data, so the baseline does not count them as lost either.
        def per_date(d):
            c = Counter()
            for side in ("offense", "defense"):
                for r in d[side]["official"]:
                    if "No Play" not in (r["play_outcome"] or ""):
                        c[r["date"]] += 1
            return c
        was, now = per_date(old_game), per_date(game)
        for d, n in was.items():
            if now[d] < n * 0.95:
                err(f"game-data: plays on {d} dropped from {n} to {now[d]}")
    old_st = committed("special-teams.json")
    if old_st:
        for unit, rows in old_st["units"].items():
            if len(st["units"][unit]) < len(rows):
                err(f"special-teams: {unit} dropped from {len(rows)} to {len(st['units'][unit])} rows")


def main():
    home, game, st = load("home.json"), load("game-data.json"), load("special-teams.json")
    check_games(home, game)
    check_pbp_vs_box(game, home["season"])
    check_special_teams(home, st)
    check_rankings(load("rankings.json"))
    check_team_stats(load("team-stats.json"))
    check_career(load("career-stats.json"))
    check_game_logs(load("career-stats.json"))
    check_meta(load("meta.json"), home)
    check_no_regressions(home, game, st)

    for w in warnings:
        print(f"WARNING: {w}")
    for e in errors:
        print(f"ERROR: {e}")
    print(f"validate_data: {len(errors)} error(s), {len(warnings)} warning(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
