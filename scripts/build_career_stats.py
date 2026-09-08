"""
Reads Special Teams Data's raw box-score JSONs (../Special Teams Data/raw/*.json
-- the same archive build_special_teams_data.py's own source project scrapes,
covering 2010-present) and Lifting Data's consolidated roster workbook, and
writes ../data/career-stats.json -- real per-player career/season totals for
Passing, Rushing, Receiving, and Individual Defensive Statistics.

This is genuinely NEW data for this site (found, not built, 2026-07-31 --
see README's "Real per-player box-score stats DO exist" note): every raw
game JSON has a `player_stats` key with real per-player lines by name, never
ingested anywhere on this site before now.

Deliberately does NOT cover Punting/Kickoffs/Kickoff-Return/Punt-Return/
PAT-FG here, even though the same raw JSONs also have those categories --
Special Teams Data's own build_workbook.py already parses those into a
clean, already-verified Excel pipeline this site already reads via
build_special_teams_data.py/data/special-teams.json. Re-deriving them here
from the messier raw player_stats categories (PATs/Field Goals/Kickoffs/
Punting/All Returns all have real per-category parsing quirks -- combo
fields like "TFL/Yds", inconsistent Made/Attempted semantics -- see this
project's own commit history) would duplicate effort AND risk a second,
possibly-disagreeing answer for numbers the site already gets right.

Real, confirmed source-data quirks found while building this (2026-09-08):
Individual Defensive Statistics keys Carroll by its FULL name ("Carroll
(WI)"/"Carroll"/"Carroll University"), not the short abbreviation code
every other category uses -- and that code itself isn't stable either
(CAR/CU/CARROLL/PIO all confirmed real, varying by scrape era). A first
pass hardcoded a short whitelist of spellings and silently dropped whole
seasons whose real code wasn't on it (e.g. every 2012-2013 game, whose
code turned out to be "CU") -- see carroll_key_for_game() below for the
dynamic per-game resolution that replaced it, driven by each game's own
JSON structure instead of a list that can only ever be as complete as
what's been checked so far.

Player-name matching (raw box score "Last,First" -> Lifting Data's own
`athlete_key`) uses 3 stages, in order, verified 2026-09-08 against the
real data (not assumed):
  1. Exact normalized last+first match -- 84.9% of real stat-lines (830/978).
  2. Unique-last-name fallback (a stat-line's last name matches exactly one
     roster athlete, regardless of first-name spelling/nickname -- e.g.
     "Coleman,Mikey" -> roster's "Michael Coleman") -- +5.7pp, 90.6% total.
     Only applied when unambiguous (2+ roster athletes sharing that last
     name are left unmatched rather than guessed).
  3. NAME_ALIASES, a small manual table for confirmed scrape-vs-roster typos
     found by fuzzy-matching every remaining name against the full roster
     and checking each candidate by hand (only "Kerkoff"/"Kerkhoff" turned
     out real -- every other fuzzy "close" match was a different actual
     person, e.g. "Michael Johnson" fuzzy-matching "Michael Wilson").
  The remaining ~9% (35 real players, mostly 1-3 career stat-lines each,
  spread across 2021-2026 -- confirmed NOT a pre-2021-roster-coverage
  artifact) have no Lifting Data entry at all, most plausibly because they
  never had a testing session captured in that program's own recording
  sheets. Per the user's explicit decision (2026-09-08): included in this
  output under their own scraped name, with position/class left blank
  rather than guessed -- never silently dropped.

Re-run whenever new raw game JSONs are added (i.e. after
carroll-special-teams-weekly-scrape or a manual Special Teams Data
scrape) or the Lifting Data roster changes:
    python build_career_stats.py
"""

import glob
import json
import re
from pathlib import Path

import openpyxl

RAW_GLOB = str(Path(__file__).resolve().parent.parent.parent / "Special Teams Data" / "raw" / "*.json")
ROSTER_SRC = Path(__file__).resolve().parent.parent.parent / "Lifting Data" / "output" / "Lifting_Consolidated_AllYears.xlsx"
OUT = Path(__file__).resolve().parent.parent / "data" / "career-stats.json"

def carroll_key_for_game(data, teams):
    """Resolves whichever of a category's ~2 real team-dict keys is
    Carroll's for THIS specific game -- dynamically, from the game's own
    JSON structure, instead of a fixed whitelist of abbreviation spellings.
    Built this way on purpose (2026-09-08, after a whitelist-based first
    pass kept missing real games): this archive uses at least 8 different
    real abbreviation codes for Carroll depending on scrape era --
    "CAR"/"CU"/"CARROLL"/"PIO" confirmed directly across a random sample of
    real files -- so any fixed list is guaranteed to eventually miss a
    still-unseen one (exactly what happened: an early version only checked
    "CAR", silently dropping every 2012-2013 game, whose real code turned
    out to be "CU").

    Two real conventions, resolved separately:
    - "Individual Defensive Statistics" keys by the literal team NAME, not
      an abbreviation, and Carroll's own name always contains "Carroll"
      (checked directly: "Carroll (WI)"/"Carroll"/"Carroll University" all
      do; no real opponent name ever does) -- the simplest, fully general
      check for this one category.
    - Every other category keys by a short code that varies enough
      (CAR/CU/CARROLL/PIO/...) that substring-matching "carroll" would
      miss most of them. These all agree with the game's own top-level
      `home_away` field (`{"away_abbr": ..., "home_abbr": ...}`, confirmed
      identical to team_stats' own keys for the same game) -- resolved by
      checking `game_info.matchup` for which side (listed as "AWAY -VS-
      HOME") is Carroll, then taking that side's abbr.
    """
    for k in teams:
        if "carroll" in k.lower():
            return k
    matchup = data.get("game_info", {}).get("matchup", "")
    parts = re.split(r"-VS-", matchup)
    if len(parts) == 2:
        ha = data.get("home_away", {})
        code = ha.get("away_abbr") if "carroll" in parts[0].lower() else ha.get("home_abbr")
        if code in teams:
            return code
    return None

NAME_ALIASES = {
    ("Kerkoff", "Nick"): ("Kerkhoff", "Nick"),
    ("Hartman", "Hayden"): ("Hartmann", "Hayden"),
    ("Wilkes", "Joshua"): ("Wilkes", "Josh"),
}


def norm(s):
    return re.sub(r"[^a-z]", "", s.lower())


def load_roster():
    wb = openpyxl.load_workbook(ROSTER_SRC, read_only=True)
    ws = wb["Data"]
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    idx = {h: i for i, h in enumerate(header)}
    by_key, last_name_to_keys, position_counts = {}, {}, {}
    for r in rows:
        key = r[idx["athlete_key"]]
        first, last, pos = r[idx["first_name"]], r[idx["last_name"]], r[idx["position"]]
        by_key[key] = {"first_name": first, "last_name": last}
        last_name_to_keys.setdefault(last.lower(), set()).add(key)
        if pos:
            position_counts.setdefault(key, {}).setdefault(pos, 0)
            position_counts[key][pos] += 1
    # Most-common charted position per athlete -- a player's listed position
    # can vary slightly session to session (e.g. a de facto position change
    # never formally re-charted); take the mode rather than "whichever
    # session happened to be read last."
    for key, counts in position_counts.items():
        by_key[key]["position"] = max(counts.items(), key=lambda kv: kv[1])[0]
    return by_key, last_name_to_keys


def split_raw_name(raw_name):
    """Every raw "player" field value -> (last, first), handling the 3 real
    formats confirmed across this archive (2026-09-08) -- returns (None,
    None) for something unparseable (never seen in practice, but a raw
    field is still just scraped text) rather than raising.

    - "Last,First" -- the majority convention.
    - "First Last" (no comma, exactly 2 words) -- a real, pervasive
      alternate format coexisting within the SAME seasons, not a clean
      year cutoff (e.g. the very first check of this script's real output
      showed Lamont Williams' entire 2014 Rushing total silently missing
      because every one of his rows that year read "Lamont Williams", not
      "Williams,Lamont", and a comma-only parser skipped them all without
      even attempting a match).
    - A bare last name alone, no first name/initial at all (e.g. just
      "Burlingame") -- real for some seasons' Passing rows specifically;
      returns first="" rather than failing, since merge_key_for_unmatched/
      resolve_unmatched_identities need to see this row exists at all even
      though it carries no first-name signal of its own.

    "Last, Jr.,First" (a suffix landing in its own comma-separated segment,
    seen once) is also handled -- last becomes "Last Jr.", not just "Last".
    """
    if not raw_name or raw_name.strip().isdigit():
        return None, None  # a real (rare) scrape artifact -- a bare jersey number instead of a name
    if "," not in raw_name:
        bits = raw_name.split()
        if len(bits) == 2:
            return bits[1], bits[0]
        if len(bits) == 1:
            return bits[0], ""
        return None, None
    parts = [p.strip() for p in raw_name.split(",")]
    if len(parts) == 3:
        return f"{parts[0]} {parts[1]}", parts[2]
    return parts[0], parts[1] if len(parts) > 1 else ""


def match_player(raw_name, roster, last_name_to_keys, unmatched_display):
    """Raw "player" field -> (athlete_key or None, display_name). Never
    guesses across a genuine ambiguity -- see module docstring for the
    roster-matching stages and their verified real match rate, and
    resolve_unmatched_identities() for how an unmatched player's own
    across-season name variants get merged into one identity."""
    last, first = split_raw_name(raw_name)
    if last is None:
        return None, None  # unparseable/jersey-number artifact -- caller skips the row entirely
    last, first = NAME_ALIASES.get((last, first), (last, first))
    for key, person in roster.items():
        if norm(person["last_name"]) == norm(last) and norm(person["first_name"]) == norm(first):
            return key, f"{person['first_name']} {person['last_name']}"
    cands = last_name_to_keys.get(last.lower(), set())
    if len(cands) == 1:
        key = next(iter(cands))
        person = roster[key]
        return key, f"{person['first_name']} {person['last_name']}"
    if len(cands) > 1 and first:
        # A same-last-name group is otherwise ambiguous, but a box-score
        # first-INITIAL only (e.g. "K." for "K. Miller", real -- gopios.com
        # sometimes only charts an initial) can still resolve uniquely if
        # exactly one candidate in the group starts with that letter.
        # Verified real 2026-09-08: 4 Millers on the roster, only "Keon"
        # starts with K, so "K. Miller" -> Keon Miller safely, while a
        # genuinely ambiguous initial (2+ candidates sharing it) still
        # correctly falls through unmatched rather than guessing.
        initial = first.rstrip(".").strip().lower()
        if len(initial) == 1:
            starts = [k for k in cands if roster[k]["first_name"].lower().startswith(initial)]
            if len(starts) == 1:
                person = roster[starts[0]]
                return starts[0], f"{person['first_name']} {person['last_name']}"
    resolved = unmatched_display.get(merge_key_for_unmatched(last, first))
    display = resolved if resolved else (f"{first} {last}".strip() if first else last)
    return None, display


def num(v):
    """Raw box-score cells use "-" for zero/none and are otherwise plain
    digit strings (occasionally with a decimal, e.g. Avg. columns this
    script doesn't sum anyway) -- never a thousands-separator comma the way
    the gopios.com record-book scrape's Value column can be."""
    if v is None or v == "-" or v == "":
        return 0
    try:
        return float(v) if "." in str(v) else int(v)
    except ValueError:
        return 0


# Per category: which raw column(s) to sum, which to take the max of (a
# "longest play" stat), and the 2+ real historical spellings a few columns
# have used across the archive's 15+ scrape years (e.g. "Int." vs "INT").
CATEGORY_SPECS = {
    "Passing": {
        "sum": {"att": ["Att."], "cmp": ["Cmp"], "yds": ["Yds."], "td": ["TD"], "int": ["Int.", "INT"], "sack": ["Sack"]},
        "max": {"long": ["Long"]},
    },
    "Rushing": {
        "sum": {"att": ["Att."], "gain": ["Gain"], "loss": ["Loss"], "net": ["Net"], "td": ["TD"]},
        "max": {"long": ["Lg."]},
    },
    "Receiving": {
        "sum": {"rec": ["Rec."], "yds": ["Yds."], "td": ["TD"]},
        "max": {"long": ["Long"]},
    },
    "Individual Defensive Statistics": {
        "sum": {"solo": ["Solo"], "ast": ["Ast"], "tot": ["Tot"], "ff": ["FF"], "int": ["INT"], "brup": ["BrUp"], "blkd": ["Blkd"], "qh": ["QH"]},
        "max": {},
        # "2.0/5" (TFL count/yards) and "0-0" (FR-yds -- recoveries-yards) --
        # split-and-sum each half separately rather than treating the whole
        # cell as one opaque string.
        "split": {"tfl": ("TFL/Yds", "/", 0), "tfl_yds": ("TFL/Yds", "/", 1),
                  "sacks": ("Sack/Yds", "/", 0), "sack_yds": ("Sack/Yds", "/", 1),
                  "fr": ("FR-Yds", "-", 0), "fr_yds": ("FR-Yds", "-", 1)},
    },
}


def get_field(row, aliases):
    for a in aliases:
        if a in row:
            return row[a]
    return None


def season_year(date_str):
    """"9/18/2010" -> 2010 -- a D3 football season never crosses a calendar
    year boundary, same convention build_game_data.py's own parse_label_date
    already relies on."""
    m = re.search(r"/(\d{4})$", date_str or "")
    return int(m.group(1)) if m else None


def accumulate(bucket, spec, row):
    for out_key, aliases in spec.get("sum", {}).items():
        bucket[out_key] = bucket.get(out_key, 0) + num(get_field(row, aliases))
    for out_key, aliases in spec.get("max", {}).items():
        bucket[out_key] = max(bucket.get(out_key, 0), num(get_field(row, aliases)))
    for out_key, (field, sep, part) in spec.get("split", {}).items():
        raw = row.get(field, "")
        pieces = str(raw).split(sep)
        v = num(pieces[part]) if len(pieces) > part else 0
        bucket[out_key] = bucket.get(out_key, 0) + v


def merge_key_for_unmatched(last, first):
    """A player never matched to the roster has no stable identity to key
    on -- and a real one found while verifying this script (2026-09-08):
    the SAME real, unmatched person shows up under 3 different raw
    spellings across different seasons ("K. Burlingame", "Kyle
    Burlingame", "Burlingame" bare-last-name-only), which a naive
    display-name key would silently fragment into 3 separate, each
    badly-incomplete buckets (caught because the fragmented total, 39 TD,
    didn't match the independently-scraped career record of 56 -- the
    bare "Burlingame" and initial-only "K. Burlingame" buckets were never
    found until this exact discrepancy was chased down). Groups purely by
    normalized last name instead -- the real merge/no-merge decision (is
    "Kyle" compatible with a bare "K." row, or does this last name
    actually cover 2 unrelated real people) happens in resolve_unmatched_
    identities() below, once every variant for a given last name is known."""
    return norm(last)


def resolve_unmatched_identities(raw_groups):
    """raw_groups: {last_name_key: {(first, last), ...}} -- every real
    (first, last) pair seen for that normalized last name (last preserves
    its real spelling/capitalization; first is "" for a bare-last-name-only
    row). Returns {last_name_key: display_name or None} -- None means
    "don't merge, treat every variant under this last name as its own
    separate identity" (a real ambiguity: 2+ DIFFERENT full first names
    share this last name, so guessing which rows belong to which person
    would risk merging 2 unrelated players' stats together, the opposite
    failure from the one this whole function exists to fix).

    A first-name variant that's just an initial (one letter, optionally
    with a trailing ".") or blank is always treated as compatible with any
    full name -- it narrows nothing on its own, so it never counts toward
    "how many distinct people share this last name."""
    resolved = {}
    for last_key, pairs in raw_groups.items():
        last = next(iter(pairs))[1]  # real spelling -- identical across every pair by construction (same norm() key)
        firsts = {p[0] for p in pairs}
        full_names = {f for f in firsts if f and len(f.rstrip(".")) > 1}
        initials = {f.rstrip(".").lower() for f in firsts if f and len(f.rstrip(".")) == 1}
        if len(full_names) > 1:
            resolved[last_key] = None  # genuine ambiguity -- don't guess
            continue
        if len(full_names) == 1:
            full = next(iter(full_names))
            if initials and not all(full[0].lower() == i for i in initials):
                resolved[last_key] = None  # an initial contradicts the one full name found -- don't guess
                continue
            resolved[last_key] = f"{full} {last}"
        else:
            # No full first name ever appeared for this last name (every
            # row was an initial or fully bare) -- nothing better to show
            # than the bare last name itself.
            resolved[last_key] = None
    return resolved


def main():
    roster, last_name_to_keys = load_roster()
    files = glob.glob(RAW_GLOB)

    # First pass: collect every raw (last, first) variant seen for players
    # that DON'T match the roster, purely to resolve a canonical display
    # name per last name before any stats are actually accumulated (see
    # resolve_unmatched_identities -- needs the full picture across every
    # file before deciding anything, so this has to be a separate pass,
    # not folded into the main accumulation loop below).
    unmatched_variants = {}
    for fn in files:
        with open(fn, encoding="utf-8") as f:
            data = json.load(f)
        ps = data.get("player_stats", {})
        for category in CATEGORY_SPECS:
            teams = ps.get(category, {})
            if not isinstance(teams, dict):
                continue
            car_key = carroll_key_for_game(data, teams)
            if car_key is None:
                continue
            for row in teams[car_key]:
                raw_name = row.get("player", "")
                last, first = split_raw_name(raw_name)
                if last is None:
                    continue
                key, _ = match_player(raw_name, roster, last_name_to_keys, {})
                if key is not None:
                    continue
                lk = merge_key_for_unmatched(last, first)
                unmatched_variants.setdefault(lk, set()).add((first, last))
    unmatched_display = resolve_unmatched_identities(unmatched_variants)

    # players[display_name] -> {athlete_key, categories: {...}}
    players = {}
    unmatched_names = set()

    for fn in files:
        with open(fn, encoding="utf-8") as f:
            data = json.load(f)
        year = season_year(data.get("game_info", {}).get("date"))
        game_label = Path(fn).stem
        ps = data.get("player_stats", {})
        for category, spec in CATEGORY_SPECS.items():
            teams = ps.get(category, {})
            if not isinstance(teams, dict):
                continue
            car_key = carroll_key_for_game(data, teams)
            if car_key is None:
                continue
            for row in teams[car_key]:
                raw_name = row.get("player", "")
                athlete_key, display = match_player(raw_name, roster, last_name_to_keys, unmatched_display)
                if display is None:
                    continue  # unparseable/jersey-number artifact -- see split_raw_name
                if athlete_key is None:
                    unmatched_names.add(raw_name)
                player = players.setdefault(display, {"athlete_key": athlete_key, "categories": {}})
                cat_bucket = player["categories"].setdefault(category, {"career": {}, "seasons": {}, "career_games": set(), "season_games": {}})
                accumulate(cat_bucket["career"], spec, row)
                cat_bucket["career_games"].add(game_label)
                if year is not None:
                    season_bucket = cat_bucket["seasons"].setdefault(year, {})
                    accumulate(season_bucket, spec, row)
                    cat_bucket["season_games"].setdefault(year, set()).add(game_label)

    # Derived rate stats -- never a naive average of per-game rates, always
    # recomputed from the summed counting stats (this project's established
    # rule, e.g. makeRate() elsewhere on this site).
    def add_derived(cat, bucket):
        if cat == "Passing" and bucket.get("att"):
            bucket["completion_pct"] = round(100 * bucket["cmp"] / bucket["att"], 1)
            bucket["yards_per_att"] = round(bucket["yds"] / bucket["att"], 1)
        if cat == "Rushing" and bucket.get("att"):
            bucket["yards_per_carry"] = round(bucket["net"] / bucket["att"], 2)
        if cat == "Receiving" and bucket.get("rec"):
            bucket["yards_per_rec"] = round(bucket["yds"] / bucket["rec"], 1)

    out_players = []
    for display, pdata in players.items():
        entry = {
            "display_name": display, "athlete_key": pdata["athlete_key"],
            "position": roster.get(pdata["athlete_key"], {}).get("position"),
            "categories": {},
        }
        for cat, cat_bucket in pdata["categories"].items():
            add_derived(cat, cat_bucket["career"])
            for yr_bucket in cat_bucket["seasons"].values():
                add_derived(cat, yr_bucket)
            entry["categories"][cat] = {
                "career": cat_bucket["career"],
                "career_games": len(cat_bucket["career_games"]),
                "seasons": [
                    {"season": yr, **stats, "games": len(cat_bucket["season_games"].get(yr, []))}
                    for yr, stats in sorted(cat_bucket["seasons"].items())
                ],
            }
        out_players.append(entry)
    out_players.sort(key=lambda p: p["display_name"])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"players": out_players, "unmatched_names": sorted(unmatched_names)}, f, indent=1)

    matched = sum(1 for p in out_players if p["athlete_key"])
    print(f"players: {len(out_players)} ({matched} matched to roster, {len(out_players) - matched} unmatched)")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
