"""
Builds data/home.json and data/meta.json.

home.json is the summary behind the Home page and the Next Opponent tab: the current season's record,
scoring, game log, and headline efficiency numbers next to the prior-seasons average, plus every
Carroll box-score result since 2010 grouped by opponent (`history`).

meta.json is small and loaded by every page: when each dataset's data runs through (the "Data through"
label under each page title) and the season schedule (so a page can say "a game was played that isn't
loaded yet").

Reads (all already built by the other scripts / sibling projects):
  - data/game-data.json        official play-by-play (yards, success, turnovers) per game
  - data/special-teams.json    Value/Score rows for every special teams unit
  - data/rankings.json, data/lifting.json   how fresh each is
  - Special Teams Data/raw/*.json   each box score's `game_info` (final score, home/away,
                                    Carroll's overall + conference record after the game)
  - Schedule/schedule.json     the season schedule (kept current by that project's own scraper)

Run after the other build scripts (refresh_all.py does this):
    python build_home_data.py

Definitions match the dashboards exactly so the Home numbers agree with Offense/Defense/Special Teams:
Yards/Play = mean yards over every official snap; Success Rate = Successful or Explosive snaps over
snaps with a classified efficiency; ST score = mean Value/Score over every unit's rows.
"""

import glob
import json
import re
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path

from build_game_data import canonical_opponent

SITE = Path(__file__).resolve().parent.parent
DATA = SITE / "data"
RAW_GLOB = str(SITE.parent / "Special Teams Data" / "raw" / "*.json")
SCHEDULE = SITE.parent / "Schedule" / "schedule.json"
OUT = DATA / "home.json"
META_OUT = DATA / "meta.json"

SUCCESS = {"Successful", "Explosive"}
SCORE_RE = re.compile(r"^(.+?)\s+(\d+)-(\d+)\s+(.+)$")
RECORD_RE = re.compile(r"Carroll(?: University)?(?: \(WI\))?\s*\((\d+-\d+)\s*,\s*(\d+-\d+)\)")  # "Carroll (WI) (3-1 , 2-0)" or, in the Millikin game, "Carroll University (WI) (4-1 , 3-0)"


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


# --- opponent naming ---------------------------------------------------------------------------
# Box scores spell the same school many ways ("Millikan", "MILLIKIN", "Wheaton College", "#6 Wheaton
# (IL)") and the schedule spells it a third way ("Wheaton College (Ill.)"). team_key() collapses all of
# them to one comparison key; display names come from the play-by-play archive's own canonical names
# where it has one, so the Next Opponent tab's opponent matches the rest of Opponent Scouting.
TYPOS = {"millikan": "millikin", "lackeland": "lakeland", "univeristy": "university", "lacrosse": "la crosse"}
DISPLAY_OVERRIDES = {"illinois": "Illinois College", "uw la crosse": "UW La Crosse", "cornell": "Cornell College"}
KEY_ALIASES = {"washington": "wash u", "washu": "wash u", "wis lutheran": "wisconsin lutheran", "ill wesleyan": "illinois wesleyan"}


def team_key(name):
    n = re.sub(r"^#\d+\s*", "", name.lower())
    n = re.sub(r"\([^)]*\)", "", n)
    n = n.replace("university of wisconsin-", "uw ").replace("wis.-", "uw ").replace("uw-", "uw ")
    for bad, good in TYPOS.items():
        n = n.replace(bad, good)
    n = re.sub(r"\b(college|university|univ)\b", " ", n)
    n = re.sub(r"\bu\.", " ", n)
    n = " ".join(re.sub(r"[^a-z0-9 ]", " ", n).split())
    return KEY_ALIASES.get(n, n)


def display_names(box, canonical):
    """key -> display name: the play-by-play archive's spelling when it has one, else the most common
    box-score spelling with 'College'/'University' dropped."""
    names = {team_key(c): c for c in canonical}
    raw = defaultdict(Counter)
    for g in box:
        raw[team_key(g["opponent"])][g["opponent"]] += 1
    for key, counts in raw.items():
        if key not in names:
            best = re.sub(r"^#\d+\s*", "", counts.most_common(1)[0][0].strip())
            best = re.sub(r"\s+(College|University|U\.)$", "", best, flags=re.I)
            names[key] = best.title() if best.isupper() else best
    return {key: DISPLAY_OVERRIDES.get(key, name) for key, name in names.items()}


def load_names():
    """key -> display name for every opponent in the box scores and play-by-play (what the other build
    scripts need to spell a team the way the rest of the site does)."""
    game_data = json.loads((DATA / "game-data.json").read_text(encoding="utf-8"))
    box = [g for g in map(parse_game_info, glob.glob(RAW_GLOB)) if g]
    return display_names(box, {g["opponent"] for g in game_data["games"]})


def parse_schedule(names):
    """Season schedule -> [{date, opponent, home, conference, time, venue, city, completed, result}]."""
    if not SCHEDULE.exists():
        # Without it Home has no "next game", the Next Opponent tab loses its default, and the
        # "game not loaded yet" warning can never appear -- say so loudly instead of shipping quietly.
        print(f"WARNING: {SCHEDULE} not found -- meta.json will have an empty schedule")
        return []
    sched = json.loads(SCHEDULE.read_text(encoding="utf-8"))
    out = []
    for g in sched["games"]:
        m = re.match(r"([A-Za-z]{3})\w*\.? (\d{1,2})", g["date_text"] or "")
        if not m:
            continue
        d = datetime.strptime(f"{m.group(1)} {m.group(2)} {g['season']}", "%b %d %Y").date()
        out.append({
            "date": d.isoformat(),
            "opponent": names.get(team_key(g["opponent"])) or re.sub(r"\s+(College|University)$", "", g["opponent"]),
            "home": g["home_away"] == "home",
            "conference": bool(g["is_conference"]),
            "time": g["time_text"],
            "venue": g["venue"],
            "city": g["city"],
            "completed": bool(g["completed"]),
            "result": g["result"],
        })
    return sorted(out, key=lambda x: x["date"])


def fmt_day(iso):
    d = date.fromisoformat(iso)
    return f"{d.strftime('%b')} {d.day}"


def write_meta(game_data, st, latest, names):
    """data/meta.json: per-page "data through" text plus the schedule, for the freshness label."""
    pbp = max(game_data["games"], key=lambda g: g["date"])
    st_last = max(f"{y}-{int(m):02d}-{int(d):02d}" for rows in st["units"].values() for r in rows for m, d, y in [r["date"].split("/")])
    weeks = json.loads((DATA / "rankings.json").read_text(encoding="utf-8"))["cciw"]["weeks"]
    season = max(weeks, key=int)
    wk = weeks[season][-1]
    lift = json.loads((DATA / "lifting.json").read_text(encoding="utf-8"))["last_session"]["label"]
    box_through = f"{latest['opponent']}, {fmt_day(latest['date'])}" if latest else "(no games yet this season)"
    charted = {"through": pbp["date"], "text": f"Charted through {pbp['opponent']}, {fmt_day(pbp['date'])}"}
    meta = {
        "pages": {
            "home": {"through": latest["date"] if latest else None, "text": f"Games through {box_through}"},
            "offense": charted,
            "defense": charted,
            "scouting": charted,
            "special-teams": {"through": st_last, "text": f"Box scores through {fmt_day(st_last)}"},
            "players": {"through": latest["date"] if latest else None, "text": f"Career stats through {box_through}"},
            "rankings": {"through": wk["date"], "text": f"Rankings through Week {wk['week']} ({fmt_day(wk['date'])})"},
            "lifting": {"through": None, "text": f"Testing through {lift}"},
        },
        "latest_game": {"date": latest["date"], "opponent": latest["opponent"]} if latest else None,
        "schedule": parse_schedule(names),
    }
    META_OUT.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"meta -> {META_OUT}")


def main():
    game_data = json.loads((DATA / "game-data.json").read_text(encoding="utf-8"))
    st = json.loads((DATA / "special-teams.json").read_text(encoding="utf-8"))

    box = sorted((g for g in map(parse_game_info, glob.glob(RAW_GLOB)) if g), key=lambda g: g["date"])
    # The current season is the latest box score's, charted or not: a new season's opener has its box score days
    # before the Hudl charting arrives, and Home must show that game (and the "data through" labels must count it)
    # rather than keep presenting the finished season as current.
    season = max(g["season"] for g in box)
    names = display_names(box, {g["opponent"] for g in game_data["games"]})
    for g in box:
        g["opponent"] = names[team_key(g["opponent"])]
    # "Prior" = the earlier seasons the play-by-play archive covers (so every compared number spans the same
    # window as the dashboards), not every box score back to 2010.
    first_season = min(g["season"] for g in game_data["games"])

    # Every result since 2010, newest first, grouped by opponent (the Next Opponent tab's meetings table).
    history = defaultdict(list)
    for g in reversed(box):
        history[g["opponent"]].append({
            "date": g["date"], "season": g["season"], "home": g["home"],
            "carroll_pts": g["carroll_pts"], "opp_pts": g["opp_pts"],
            "result": "W" if g["carroll_pts"] > g["opp_pts"] else "L" if g["carroll_pts"] < g["opp_pts"] else "T",
        })

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

    def pooled(season_filter):
        off = [r for r in game_data["offense"]["official"] if season_filter(r["season"])]
        dfn = [r for r in game_data["defense"]["official"] if season_filter(r["season"])]
        st_scores = [r["score"] for rows in st["units"].values() for r in rows if season_filter(int(r["season"]))]
        return {"offense": side_metrics(off), "defense": side_metrics(dfn), "st_score": r4(mean(st_scores))}

    def per_game(box_games, key):
        return r4(sum(g[key] for g in box_games) / len(box_games)) if box_games else None

    def season_block(s):
        """One season's record, game log, and headline numbers next to the seasons before it (back to the
        start of the play-by-play archive). The first archive season has no earlier seasons to compare with."""
        mine = [g for g in box if g["season"] == s]
        before = [g for g in box if first_season <= g["season"] < s]
        games = []
        for g in mine:
            off, dfn = side_metrics(off_by_date.get(g["date"], [])), side_metrics(def_by_date.get(g["date"], []))
            charted = off["plays"] > 0
            games.append({
                "date": g["date"], "opponent": g["opponent"], "home": g["home"],
                "carroll_pts": g["carroll_pts"], "opp_pts": g["opp_pts"],
                "result": "W" if g["carroll_pts"] > g["opp_pts"] else "L" if g["carroll_pts"] < g["opp_pts"] else "T",
                "charted": charted, "offense": off if charted else None, "defense": dfn if charted else None,
                "st_score": r4(mean(st_by_date.get(g["date"], []))),
            })
        wins = sum(g["result"] == "W" for g in games)
        losses = sum(g["result"] == "L" for g in games)
        last = mine[-1] if mine else None
        return {
            "prior_label": (f"{first_season}–{s - 1}" if s - 1 > first_season else str(first_season)) if before else None,
            # the box score prints the record from 2019 on; before that it is just the results added up
            "record": (last["record_after"] if last and last["record_after"] else f"{wins}-{losses}") if last else None,
            "conference_record": last["conf_record_after"] if last else None,
            "games": games,
            "season_stats": {**pooled(lambda x: x == s), "pts_for_pg": per_game(mine, "carroll_pts"), "pts_against_pg": per_game(mine, "opp_pts")},
            "prior_stats": ({**pooled(lambda x: first_season <= x < s), "pts_for_pg": per_game(before, "carroll_pts"), "pts_against_pg": per_game(before, "opp_pts")} if before else None),
        }

    shown_seasons = sorted({g["season"] for g in game_data["games"]} | {season}, reverse=True)
    seasons = {str(s): season_block(s) for s in shown_seasons}
    latest = next((g for g in reversed(box) if g["season"] == season), None)
    out = {
        "generated_from": "game-data.json, special-teams.json, Special Teams Data box scores",
        "season": season,
        "history": dict(sorted(history.items())),
        "seasons": seasons,
    }
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    write_meta(game_data, st, latest, names)
    cur = seasons[str(season)]
    print(f"season {season}: {cur['record']} ({cur['conference_record']} CCIW), {len(cur['games'])} games; {len(seasons)} seasons -> {OUT}")
    for g in cur["games"]:
        print(f"  {g['date']} {g['result']} {g['carroll_pts']}-{g['opp_pts']} {'vs' if g['home'] else '@'} {g['opponent']}")


if __name__ == "__main__":
    main()
