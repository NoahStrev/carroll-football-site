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
                           no turnover flagged on a drive that went on to score or punt (WARNING),
                           known play types, opponent spellings match the box-score canon, no "No Play" snaps,
                           no touchdown drive that really ended in a turnover, and (every season) each side's
                           yardage within reach of the official box score's total offense
  special-teams.json       every row's date is a real box-score game, every unit present for the latest season,
                           and per game Carroll's punts, PATs, field goals and deep kickoffs match the box score
  game-data.json (sides)   the charted plays split offense/defense like the official play-by-play (a block of
                           defensive snaps coded as offense once moved a whole half to the wrong side)
  game-data.json (turnovers) per game, giveaways and takeaways (snaps plus punt/kickoff fumbles and muffs) equal the
                           box score's fumbles lost plus interceptions for each team
  rankings.json            CCIW and national cover the same weeks
  team-stats.json          Carroll present with every category, snapshot not stale
  career-stats.json        no team pseudo-players, no duplicate display names, game logs add up to season totals,
                           every season's passing/rushing/receiving/defense totals equal the box scores' player
                           lines, and each punter's punts/yards and kicker's field goals match the box score
  lifting (source data)    no athlete split in two by a name typo (close spelling, same position, never in the same
                           session -- WARNING, the fix is a NAME_TYPO_FIXES entry in Lifting Data)
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
        wins = sum(g["result"] == "W" for g in games)
        losses = sum(g["result"] == "L" for g in games)
        computed = f"{wins}-{losses}"
        if block["record"] and block["record"] != computed and computed not in block["record"]:
            err(f"home.json: {s_key} record says {block['record']} but its {len(games)} box scores add up to {computed}")
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
        # A lost ball ends the drive, so a turnover flag on a drive that went on to punt, kick, or score is a source
        # mistake (a fumble the offense recovered, or a wrong drive label). The reviewed ones are overrides in
        # build_game_data.py; a new one needs a look at the box score's play text.
        for (label, num_), drive in by_drive.items():
            result = drive[0]["drive_result"]
            if num_ is not None and result not in ("Turnover", "End of Game", None) and any(r["is_turnover"] for r in drive):
                warn(f"game-data: {label} drive {num_} ({side}) has a turnover flagged but its result is {result!r} -- check the box score's play text")
        opps = {r["opponent"] for r in rows}
        if opps - canon:
            err(f"game-data: opponent spelling(s) not in the box-score canon: {sorted(opps - canon)}")


# Gaps the official box score itself contains (its drive chart, team stats, and play text disagree), reviewed by hand
# and not worth a warning on every refresh. Anything new is reported.
KNOWN_BOX_GAPS = {
    ("2024-10-12", "offense"): "-32: the box score's team-stats total is 32 yards over its own play text",
}


def check_pbp_vs_box(game):
    """Each charted game's play-by-play yardage against the official box score's total offense. Nullified ("No Play")
    snaps are excluded at build time, so the two should agree closely: 32 of 57 archive games match exactly on both
    sides, 83 of 114 sides match, and every side is within 30 yards except one reviewed case (KNOWN_BOX_GAPS) -- the
    rest are inconsistencies inside the box scores. A bigger gap in any season is worth a look, e.g. a drive tagged to
    the wrong side, which moves its yards from one side to the other (2021-11-06 vs Carthage did exactly that and is
    fixed by MANUAL_DRIVE_SIDE_OVERRIDES in build_game_data.py)."""
    raw = SITE.parent / "Special Teams Data" / "raw"
    if not raw.exists():
        warn(f"box scores not found at {raw}; skipping the play-by-play vs box-score yardage check")
        return
    by_date = {"offense": Counter(), "defense": Counter()}
    for side in by_date:
        for r in game[side]["official"]:
            by_date[side][r["date"]] += r["yards"] or 0
    num = lambda x: int(re.sub(r"[^0-9-]", "", x) or 0)
    for path in sorted(glob.glob(str(raw / "*_*.json"))):
        d = json.loads(Path(path).read_text(encoding="utf-8"))
        mo, dy = d["game_info"]["date"].split("/")[:2]
        date = f"{Path(path).name.split('_')[0]}-{mo.zfill(2)}-{dy.zfill(2)}"
        if date not in by_date["offense"]:
            continue  # a box score with no play-by-play charting
        away, _, home = d["game_info"]["matchup"].partition("-VS-")
        abbr = d["home_away"]
        mine = abbr["home_abbr"] if "Carroll" in home else abbr["away_abbr"]
        yards = d["team_stats"]["Total Offense"]["Yards"]
        theirs = next(k for k in yards if k != mine)
        for side, key in (("offense", mine), ("defense", theirs)):
            gap = by_date[side][date] - num(yards[key])
            known = KNOWN_BOX_GAPS.get((date, side))
            note = f"{date} {side} yardage is {gap:+d} yards from the box score ({by_date[side][date]} vs {num(yards[key])})"
            if known and str(gap) in known:
                continue
            if abs(gap) > 60:
                err(f"game-data: {note} -- plays on the wrong side?")
            elif abs(gap) > 30:
                warn(f"game-data: {note}")


# Opponent 4th-down tries the box score counts that the play-by-play does not have (an uncharted snap, or a penalty first
# down the box counts as a conversion), each one try off: (date, side).
KNOWN_FOURTH_GAPS = {("2022-11-12", "defense"), ("2026-09-19", "defense"), ("2026-09-26", "defense")}


def check_fourth_downs(game):
    """Fourth-down tries and conversions in the play-by-play against the box score's "4th Down Conversions" line.
    Carroll's side matches the box exactly in all 57 archive games, and the opponent's in 54 (the rest are the reviewed
    one-try gaps above). A new difference means a snap went missing or landed on the wrong side."""
    raw = SITE.parent / "Special Teams Data" / "raw"
    if not raw.exists():
        return
    stats = {"offense": {}, "defense": {}}  # side -> date -> [tries, made]
    for side in stats:
        for r in game[side]["official"]:
            if r["down"] == 4 and r["play_type"] in ("Rush", "Pass", "Sack") and not r["is_penalty"]:
                t = stats[side].setdefault(r["date"], [0, 0])
                t[0] += 1
                t[1] += 1 if (r["is_first_down"] or r["is_touchdown"]) else 0
    charted = {r["date"] for r in game["offense"]["official"]}
    for path in sorted(glob.glob(str(raw / "*_*.json"))):
        d = json.loads(Path(path).read_text(encoding="utf-8"))
        mo, dy = d["game_info"]["date"].split("/")[:2]
        date = f"{Path(path).name.split('_')[0]}-{mo.zfill(2)}-{dy.zfill(2)}"
        if date not in charted:
            continue
        home = d["game_info"]["matchup"].partition("-VS-")[2]
        ab = d["home_away"]
        mine = ab["home_abbr"] if "Carroll" in home else ab["away_abbr"]
        conv = d["team_stats"]["Miscellaneous"].get("4th. Down Conversions")
        if not conv:
            continue
        theirs = next(k for k in conv if k != mine)
        for side, key in (("offense", mine), ("defense", theirs)):
            box_made, box_tries = (int(x) for x in re.findall(r"\d+", conv[key])[:2])
            tries, made = stats[side].get(date, [0, 0])
            if (tries, made) == (box_tries, box_made) or (date, side) in KNOWN_FOURTH_GAPS:
                continue
            msg = f"game-data: {date} {side} 4th downs are {made} of {tries} in the play-by-play but {box_made} of {box_tries} in the box score"
            (err if abs(tries - box_tries) > 1 else warn)(msg)


KNOWN_FIELD_GOAL_GAPS = {("2021-10-30", "defense")}  # the box score lists a field-goal try the drive log does not


def check_field_goals(game):
    """Field goals made and tried, from how drives ended, against the box score's "Field Goals" line. Made matches in every
    archive game and tries in all but one, so any new difference is a drive tagged to the wrong side or a mislabelled result."""
    raw = SITE.parent / "Special Teams Data" / "raw"
    if not raw.exists():
        return
    drives = {"offense": {}, "defense": {}}  # side -> date -> [tries, made]
    for side in drives:
        for dr in game[side]["drives"]:
            t = drives[side].setdefault(dr["date"], [0, 0])
            t[0] += 1 if (dr["result"] or "").startswith("Field Goal") else 0
            t[1] += 1 if dr["result"] == "Field Goal Good" else 0
    for path in sorted(glob.glob(str(raw / "*_*.json"))):
        d = json.loads(Path(path).read_text(encoding="utf-8"))
        mo, dy = d["game_info"]["date"].split("/")[:2]
        date = f"{Path(path).name.split('_')[0]}-{mo.zfill(2)}-{dy.zfill(2)}"
        fg = d["team_stats"]["Miscellaneous"].get("Field Goals: Total - Made")
        if not fg or date not in drives["offense"]:
            continue
        home = d["game_info"]["matchup"].partition("-VS-")[2]
        ab = d["home_away"]
        mine = ab["home_abbr"] if "Carroll" in home else ab["away_abbr"]
        theirs = next(k for k in fg if k != mine)
        for side, key in (("offense", mine), ("defense", theirs)):
            a, b = (int(x) for x in re.findall(r"\d+", fg[key])[:2])
            box_made, box_tries = min(a, b), max(a, b)  # the source writes the pair in either order
            tries, made = drives[side].get(date, [0, 0])
            if (tries, made) != (box_tries, box_made) and (date, side) not in KNOWN_FIELD_GOAL_GAPS:
                err(f"game-data: {date} {side} field goals are {made} of {tries} in the drive log but {box_made} of {box_tries} in the box score")


def check_special_teams(home, st):
    box_dates = {g["date"] for gs in home["history"].values() for g in gs}
    latest = max(int(r["season"]) for rows in st["units"].values() for r in rows)
    for unit, rows in st["units"].items():
        stray = {iso(r["date"]) for r in rows} - box_dates
        if stray:
            err(f"special-teams: {unit} has rows on {sorted(stray)} with no box score")
        if not any(int(r["season"]) == latest for r in rows):
            warn(f"special-teams: {unit} has no rows for {latest}")


def box_pair(text):
    """'5 - 6' / '1 of 2' -> (tries, made); the source writes 'Total - Made' pairs in either order."""
    a, b = (int(x) for x in re.findall(r"\d+", text)[:2])
    return max(a, b), min(a, b)


def check_special_teams_vs_box(st):
    """Per game, Carroll's punts, PATs, field goals, and deep kickoffs in the special-teams sheets against the box score's
    team stats (box scores leave onside kicks out of the kickoff count). All four match in every 2021+ game as of
    2026-10-23, so any difference is a row missing from (or doubled in) the sheet, or a game charted under the wrong date."""
    raw = SITE.parent / "Special Teams Data" / "raw"
    if not raw.exists():
        return
    first = min(int(r["season"]) for rows in st["units"].values() for r in rows)
    sheet = {}  # date -> {stat: count}

    def bump(d, key, n=1):
        sheet.setdefault(iso(d), Counter())[key] += n
    for r in st["units"]["punt"]:
        bump(r["date"], "punts")
    for r in st["units"]["kickoff"]:
        if "onside" not in str(r["kick_type"] or "").lower():
            bump(r["date"], "kickoffs")
    for r in st["units"]["money_unit"]:
        kind = "pat" if r["fg_exp"] == "EXP" else "fg"
        bump(r["date"], f"{kind}_tries")
        bump(r["date"], f"{kind}_made", 1 if r["make"] else 0)
    for path in sorted(glob.glob(str(raw / "*_*.json"))):
        season = int(Path(path).name.split("_")[0])
        if season < first:
            continue
        d = json.loads(Path(path).read_text(encoding="utf-8"))
        mo, dy = d["game_info"]["date"].split("/")[:2]
        day = f"{season}-{mo.zfill(2)}-{dy.zfill(2)}"
        home = d["game_info"]["matchup"].partition("-VS-")[2]
        ab = d["home_away"]
        mine = ab["home_abbr"] if "Carroll" in home else ab["away_abbr"]
        ts = d["team_stats"]
        box = {"punts": int(re.findall(r"\d+", ts["Punting"]["Punts - Yds."][mine])[0]),
               "kickoffs": int(re.findall(r"\d+", ts["Kickoffs"]["Total - Yds."][mine])[0])}
        for kind, key in (("pat", "PAT: Total - Made"), ("fg", "Field Goals: Total - Made")):
            box[f"{kind}_tries"], box[f"{kind}_made"] = box_pair(ts["Miscellaneous"].get(key, {}).get(mine, "0 - 0"))
        mine_sheet = sheet.get(day, Counter())
        diffs = [f"{k} {mine_sheet[k]} vs {v}" for k, v in box.items() if mine_sheet[k] != v]
        if diffs:
            err(f"special-teams: {day} sheet vs box score: {', '.join(diffs)}")


def check_charted_sides(game):
    """The charted (Hudl) plays and the official play-by-play should split a game between offense and defense the same
    way. Every game is within 2.5 points of offense share as of 2026-10-23; Wash U 2023-11-11 was ~15 points off before
    a block of defensive snaps coded "O" was fixed (fix_miscoded_defense in Game Analysis/build_combined_dataset.py)."""
    count = lambda rows: Counter(r["date"] for r in rows)
    charted = {s: count(game[s]["plays"]) for s in ("offense", "defense")}
    official = {s: count(game[s]["official"]) for s in ("offense", "defense")}
    for d in sorted(set(charted["offense"]) | set(charted["defense"])):
        c_total = charted["offense"][d] + charted["defense"][d]
        o_total = official["offense"][d] + official["defense"][d]
        if not c_total or not o_total:
            continue
        gap = charted["offense"][d] / c_total - official["offense"][d] / o_total
        msg = (f"game-data: {d} charted plays are {charted['offense'][d]} offense / {charted['defense'][d]} defense but the "
               f"official play-by-play is {official['offense'][d]} / {official['defense'][d]} -- snaps coded to the wrong side?")
        if abs(gap) > 0.10:
            err(msg)
        elif abs(gap) > 0.05:
            warn(msg)


def check_turnovers_vs_box(game):
    """Giveaways and takeaways per game against the box score (fumbles lost + interceptions thrown, each team). The
    snaps come from the official play-by-play; turnovers on punts and kickoffs (st_turnovers, from build_lib.
    kick_turnovers) are added. All 57 games matched when this was added (2026-10-25)."""
    raw = SITE.parent / "Special Teams Data" / "raw"
    if not raw.exists():
        return
    snaps = {s: Counter(r["date"] for r in game[s]["official"] if r["is_turnover"]) for s in ("offense", "defense")}
    kicks = {g["date"]: g.get("st_turnovers", []) for g in game["games"]}
    nums = lambda s: [int(x) for x in re.findall(r"\d+", s or "")]
    for path in sorted(glob.glob(str(raw / "*_*.json"))):
        d = json.loads(Path(path).read_text(encoding="utf-8"))
        mo, dy = d["game_info"]["date"].split("/")[:2]
        day = f"{Path(path).name[:4]}-{mo.zfill(2)}-{dy.zfill(2)}"
        if day not in kicks:
            continue
        home = d["game_info"]["matchup"].partition("-VS-")[2]
        ab = d["home_away"]
        mine = ab["home_abbr"] if "Carroll" in home else ab["away_abbr"]
        ts = d["team_stats"]
        theirs = next(k for k in ts["Total Offense"]["Fumbles - Lost"] if k != mine)
        box = lambda t: nums(ts["Total Offense"]["Fumbles - Lost"][t])[1] + nums(ts["Passing"]["Comp.-Att.-Int."][t])[2]
        given = snaps["offense"][day] + sum(t["side"] == "given" for t in kicks[day])
        taken = snaps["defense"][day] + sum(t["side"] == "taken" for t in kicks[day])
        if (given, taken) != (box(mine), box(theirs)):
            err(f"game-data: {day} turnovers are {given} given / {taken} taken but the box score says {box(mine)} / {box(theirs)}")


def check_latest_file(game):
    """game-data-latest.json (what Offense/Defense draw first) must be exactly the full file's latest season."""
    path = DATA / "game-data-latest.json"
    if not path.exists():
        err("game-data-latest.json is missing (build_game_data.py writes it)")
        return
    light = json.loads(path.read_text(encoding="utf-8"))
    season = light.get("partial_season")
    for side in ("offense", "defense"):
        for key in ("plays", "official", "drives"):
            want = [r for r in game[side][key] if r["season"] == season]
            if light[side][key] != want:
                err(f"game-data-latest.json: {side} {key} differ from game-data.json's {season} rows ({len(light[side][key])} vs {len(want)}) -- rebuild with build_game_data.py")
    if light["games"] != game["games"] or light["filters"] != game["filters"]:
        err("game-data-latest.json: games or filter options differ from game-data.json")


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


# Box-score differences reviewed by hand: (season, last name, stat) -> why.
KNOWN_CAREER_BOX_GAPS = {
    (2025, "swink", "gross_yds"): "2025-10-25 at Elmhurst: the box score counts his 41-yard punt (returned, with an "
                                       "Elmhurst holding penalty) as 0 yards; the play text and the punt sheet say 41",
}


def check_career_vs_box(cs):
    """Career Stats against the box scores it is built from.
    1. Every season's team total for each box-score category (passing, rushing, receiving, defense) must equal the sum
       of the box scores' Carroll player lines. A shortfall means lines were dropped by the name parser -- e.g. until
       2026-10-25 a three-word name with no comma ("Ted Van Thiel") was skipped, losing 19 tackles in 2012. TEAM lines
       and bare jersey numbers ("70", "9" -- four lines in 2011/2018) are not players, so they are left out of both sides.
    2. Punting and field goals come from the special-teams sheets, so per punter/kicker per season (2021+) they must
       match the box score's Punting table and Field Goals list (blocked punts are credited to TEAM in the box score and
       left out of a punter's punts). Kickoffs come from the box score itself; returns are not comparable (the sheets
       log every kick received, the box only returns)."""
    raw = SITE.parent / "Special Teams Data" / "raw"
    if not raw.exists():
        return
    import build_career_stats as bcs  # same folder; only needed when the box scores are present

    site_tot, box_tot = Counter(), Counter()
    for p in cs["players"]:
        for cat in bcs.CATEGORY_SPECS:
            for s in p["categories"].get(cat, {}).get("seasons", []):
                for key in bcs.CATEGORY_SPECS[cat]["sum"]:
                    if key not in bcs.UNEXPORTED_FIELDS:
                        site_tot[(int(s["season"]), cat, key)] += s.get(key, 0) or 0
    site_st, box_st = Counter(), Counter()
    for p in cs["players"]:
        bits = [b for b in p["display_name"].split() if b.lower().rstrip(".") not in bcs.NAME_SUFFIXES]
        who = bits[-1].lower()  # punters and kickers are matched by last name (box lines are "Last,First", "First Last" or "Last")
        for cat, keys in (("Punting", ("att", "gross_yds")), ("PATFG", ("fg_att", "fg_made"))):
            for s in p["categories"].get(cat, {}).get("seasons", []):
                for k in keys:
                    site_st[(int(s["season"]), who, k)] += s.get(k, 0) or 0
    first_st = 2021
    for path in sorted(glob.glob(str(raw / "*_*.json"))):
        d = json.loads(Path(path).read_text(encoding="utf-8"))
        season = bcs.season_year(d.get("game_info", {}).get("date"), Path(path).stem)
        ps = d.get("player_stats", {})
        for cat, spec in bcs.CATEGORY_SPECS.items():
            teams = ps.get(cat, {})
            if not isinstance(teams, dict) or not teams:
                continue
            key = bcs.carroll_key_for_game(d, teams)
            for row in teams.get(key) or [] if key else []:
                name = (row.get("player") or "").strip()
                if name.lower() in bcs.NON_PERSON_NAMES or name.isdigit():
                    continue
                bucket = {}
                bcs.accumulate(bucket, {"sum": spec["sum"]}, row)
                for k, v in bucket.items():
                    if k not in bcs.UNEXPORTED_FIELDS:
                        box_tot[(season, cat, k)] += v
        if season < first_st:
            continue
        for cat, rows_key in (("Punting", "Punting"), ("PATFG", "Field Goals")):
            teams = ps.get(rows_key, {})
            key = bcs.carroll_key_for_game(d, teams) if isinstance(teams, dict) and teams else None
            for row in teams.get(key) or [] if key else []:
                last, _first = bcs.split_raw_name(row.get("player") or "")
                if last is None:
                    continue  # TEAM (a blocked punt) or a jersey number
                who = last.split()[-1].lower() if last.split()[-1].lower().rstrip(".") not in bcs.NAME_SUFFIXES else last.split()[0].lower()
                if cat == "Punting":
                    box_st[(season, who, "att")] += bcs.num(row.get("Punts"))
                    box_st[(season, who, "gross_yds")] += bcs.num(row.get("Yds."))
                else:
                    box_st[(season, who, "fg_att")] += 1
                    box_st[(season, who, "fg_made")] += 1 if str(row.get("Result", "")).upper().startswith("GOOD") else 0
    for k in sorted(set(site_tot) | set(box_tot)):
        if abs(site_tot[k] - box_tot[k]) > 1e-6:
            err(f"career-stats: {k[0]} {k[1]} {k[2]} adds up to {site_tot[k]:g} but the box scores' player lines say {box_tot[k]:g} -- lines dropped or doubled?")
    for k in sorted(set(site_st) | set(box_st)):
        if site_st[k] != box_st[k] and k not in KNOWN_CAREER_BOX_GAPS:
            season, last, stat = k
            err(f"career-stats: {season} {last.title()} {stat} is {site_st[k]} but the box score says {box_st[k]}")


# Pairs the near-duplicate lifting check flags that are really two different people: ((last, first), (last, first)).
LIFTING_DIFFERENT_PEOPLE = set()


def edit_distance(a, b):
    """Letters to add, drop, change, or swap (adjacent) to turn a into b, ignoring case."""
    a, b = a.lower(), b.lower()
    d = [[i + j if i * j == 0 else 0 for j in range(len(b) + 1)] for i in range(len(a) + 1)]
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] != b[j - 1]))
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[-1][-1]


def check_lifting_name_typos():
    """An athlete whose name a recording sheet misspelled for some sessions shows up as two athletes, each with half a
    progress line (five such splits were fixed by hand on 2026-10-23, a sixth -- Camren/Cameran Banks -- was found by
    this check). Flags two names that share a last name with first names 1-2 letters apart (or a first name with last
    names 1-2 letters apart), at the same position, that never appear in the same session. Reads the Lifting Data
    project's own output, so every athlete is covered, not just those with a chart on the site."""
    src = SITE.parent / "Lifting Data" / "output" / "Lifting_Consolidated_AllYears.xlsx"
    if not src.exists():
        return
    import openpyxl  # only needed when the sibling project is present
    import itertools
    rows = openpyxl.load_workbook(src, read_only=True)["Data"].iter_rows(values_only=True)
    ix = {h: i for i, h in enumerate(next(rows))}
    people = {}
    for r in rows:
        first, last = r[ix["first_name"]], r[ix["last_name"]]
        if not first or not last:
            continue
        p = people.setdefault((last, first), {"sessions": set(), "pos": set()})
        p["sessions"].add((r[ix["football_year"]], r[ix["testing_period"]]))
        if r[ix["position"]]:
            p["pos"].add(r[ix["position"]])
    for (a, pa), (b, pb) in itertools.combinations(sorted(people.items()), 2):
        (la, fa), (lb, fb) = a, b
        same_last = la.lower() == lb.lower() and min(len(fa), len(fb)) >= 4 and 0 < edit_distance(fa, fb) <= 2
        same_first = fa.lower() == fb.lower() and min(len(la), len(lb)) >= 4 and 0 < edit_distance(la, lb) <= 2
        if not (same_last or same_first) or (a, b) in LIFTING_DIFFERENT_PEOPLE or (b, a) in LIFTING_DIFFERENT_PEOPLE:
            continue
        if (pa["pos"] and pb["pos"] and not pa["pos"] & pb["pos"]) or pa["sessions"] & pb["sessions"]:
            continue
        warn(f"lifting: {fa} {la} and {fb} {lb} ({'/'.join(sorted(pa['pos'] | pb['pos'])) or 'no position'}) look like one athlete "
             f"split by a typo -- add the wrong spelling to NAME_TYPO_FIXES in Lifting Data/scripts/build_lifting_dataset.py "
             f"(or to LIFTING_DIFFERENT_PEOPLE here if they really are two people)")


def check_meta(meta):
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
    check_pbp_vs_box(game)
    check_fourth_downs(game)
    check_field_goals(game)
    check_special_teams(home, st)
    check_special_teams_vs_box(st)
    check_charted_sides(game)
    check_turnovers_vs_box(game)
    check_latest_file(game)
    check_rankings(load("rankings.json"))
    check_team_stats(load("team-stats.json"))
    check_career(load("career-stats.json"))
    check_game_logs(load("career-stats.json"))
    check_career_vs_box(load("career-stats.json"))
    check_lifting_name_typos()
    check_meta(load("meta.json"))
    check_no_regressions(home, game, st)

    for w in warnings:
        print(f"WARNING: {w}")
    for e in errors:
        print(f"ERROR: {e}")
    print(f"validate_data: {len(errors)} error(s), {len(warnings)} warning(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
