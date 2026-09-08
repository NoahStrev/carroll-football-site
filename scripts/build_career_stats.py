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

Punting/Kickoffs/Kickoff-Return/Punt-Return/PAT-FG/snapping career totals
(added 2026-09-08, per the user) are NOT derived from the raw player_stats
JSON's own versions of those categories -- PATs/Field Goals/Kickoffs/
Punting/All Returns all have real per-category parsing quirks there
(combo fields like "TFL/Yds", inconsistent Made/Attempted semantics) that
would duplicate effort AND risk a second, possibly-disagreeing answer for
numbers this site already gets right elsewhere. Instead, `accumulate_
special_teams()` reads this site's OWN already-clean, already-verified
`data/special-teams.json` (Special Teams Data's own build_workbook.py
output, read the same way build_special_teams_data.py already does) --
real per-attempt rows, just never rolled up into a running career total
before. Its punter/kicker/returner/snapper name fields turned out to mix
ALL 3 raw formats the box-score categories already handle ("Last,First",
"First Last", bare surname alone) -- a first pass assumed bare-surname-
only, based on the first game's data happening to look that way, and
silently mismatched most rows as a result (confirmed 2026-09-08: ~85% of
real occurrences are actually "First Last"). `match_player()` is reused
directly for these fields too, same as every box-score category -- see
SPECIAL_TEAMS_UNITS' own comment.

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

Every stage above is also gated on season_plausible() (added 2026-09-08,
per the user: "we also may want to add effective dates since two people
can have the same name") -- a name-only match can't tell 2 DIFFERENT real
people with the same name apart across different eras, and this was
confirmed actually happening, not hypothetical: the roster's "Brody Wood"
only ever tested in 2025-26 (a true freshman) but was silently merged
with a completely different "Brody Wood" from 2016-2018 box scores;
"Ethan Steiner" (roster: 2024-26) merged with a 2010 stat-line, 14+ years
before he was ever tested. A match is only accepted if the box-score
row's own season falls within +/-2 years of that roster athlete's known
tested years (SEASON_MATCH_BUFFER) -- generous enough to cover a real
gap (Lifting Data missing someone's freshman or senior year), but firmly
rejects an 8+ year gap that's obviously a different person. A rejected
candidate falls through to the SAME unmatched/cross-format-merge path
every other unmatched name uses -- it doesn't silently disappear, it's
just correctly kept separate from the current roster athlete. Not fully
solved: 2 different NON-roster (unmatched) people who happen to share a
name still merge under one raw display bucket, since the unmatched-merge
path (resolve_unmatched_identities) has no roster season data to check
against for that case -- a real, smaller residual gap, flagged rather
than silently claimed solved.

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
SPECIAL_TEAMS_SRC = Path(__file__).resolve().parent.parent / "data" / "special-teams.json"
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
    # Confirmed 2026-09-08 by the thorough-check fuzzy-name scan: these are
    # all NON-roster players (no Lifting Data entry), so unlike the 3
    # above they were never merged by the roster-matching stage at all --
    # each spelling pair fragmented one real person into 2 separate
    # career-stats.json entries. Verified real (not 2 different people)
    # by checking season spans overlap/are adjacent for the same shared
    # first name, then picking the more frequent raw spelling as
    # canonical (row-count tiebreak noted per entry).
    ("Piekrski", "Austin"): ("Piekarski", "Austin"),  # 40 raw rows vs 96 for "Piekarski"
    ("Piekrski", "A."): ("Piekarski", "A."),
    ("Kraczyk", "Billy"): ("Krawczyk", "Billy"),  # 47 vs 193 for "Krawczyk"
    ("Meliahn", "Eric"): ("Meilahn", "Eric"),  # 11 vs 32 for "Meilahn"
    ("Konty", "Justin"): ("Kontny", "Justin"),  # 25 vs 262 for "Kontny"
    ("Luedtke", "Lucas"): ("Luedke", "Lucas"),  # 24 vs 42 for "Luedke"
    ("Spratted", "Mark"): ("Spratte", "Mark"),  # 33 vs 113 for "Spratte"
    ("Fuchas", "Ryan"): ("Fuchs", "Ryan"),  # 4 rows vs 44 for "Fuchs"
    ("Schmitt", "Ryan"): ("Schmidt", "Ryan"),  # only 1 season each (2010/2011) -- "Schmidt" kept as the
    # family's established spelling (2 other real Carroll Schmidts on record: Jason, Sean)
    ("Allen", "Issac"): ("Allen", "Isaac"),  # 12 rows vs 31 for "Isaac"
    ("Smith", "Diquan"): ("Smith", "Daquan"),  # 4 rows vs 10 for "Daquan"
    ("Fields", "Eliot"): ("Fields", "Elliot"),  # 6 rows vs 9 for "Elliot"
    ("Sain", "Jon"): ("Sain", "John"),  # 3 vs 4 rows -- near-even, kept the fuller spelling
    ("Wech", "Zachery"): ("Wech", "Zachary"),  # 1 row vs 8 for "Zachary"
}


def norm(s):
    return re.sub(r"[^a-z]", "", s.lower())


SEASON_MATCH_BUFFER = 2  # see season_plausible()'s own docstring


def football_year_to_season(fy):
    """"2021-22" -> 2021 -- the roster's own football_year format always
    starts with the fall (charting) season's real calendar year."""
    m = re.match(r"^(\d{4})", str(fy or ""))
    return int(m.group(1)) if m else None


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
        by_key.setdefault(key, {"first_name": first, "last_name": last, "known_years": set()})
        year = football_year_to_season(r[idx["football_year"]])
        if year is not None:
            by_key[key]["known_years"].add(year)
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


def season_plausible(person, season):
    """Real, confirmed bug found 2026-09-08 (per the user: "we also may
    want to add effective dates since two people can have the same name"):
    name-only matching (exact, unique-last-name, or initial) has no way to
    tell two DIFFERENT real people with the same name apart across
    different eras -- confirmed actually happening, not hypothetical: the
    CURRENT roster's "Brody Wood" only ever tested in 2025-26 (a true
    freshman), but name-only matching merged him with a completely
    different "Brody Wood" from 2016-2018 box scores; "Ethan Steiner"
    (roster: 2024-26) got merged with a 2010 stat-line, 14+ years before
    he was ever tested. A normal college career is 4-5 real years;
    Lifting Data's own testing coverage can miss the first or last year or
    two of it (freshman year untested, senior year skipped, etc.), so
    SEASON_MATCH_BUFFER (2) is generous enough not to reject genuine edge
    seasons while still firmly catching an 8+ year gap that's obviously a
    different person. A roster entry with NO known_years at all (shouldn't
    happen for a real Lifting Data row, but defensive) or `season` itself
    unknown always passes -- nothing to validate against, so this check
    can't be the reason a real match gets rejected."""
    if season is None or not person.get("known_years"):
        return True
    lo, hi = min(person["known_years"]) - SEASON_MATCH_BUFFER, max(person["known_years"]) + SEASON_MATCH_BUFFER
    return lo <= season <= hi


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


def match_player(raw_name, roster, last_name_to_keys, unmatched_display, season=None):
    """Raw "player" field -> (athlete_key or None, display_name). Never
    guesses across a genuine ambiguity -- see module docstring for the
    roster-matching stages and their verified real match rate,
    resolve_unmatched_identities() for how an unmatched player's own
    across-season name variants get merged into one identity, and
    season_plausible() for why `season` (the box-score row's own year, if
    known) gets checked at every stage: a name-only match has no way to
    tell 2 different real people with the same name apart across
    different eras -- confirmed actually happening (see that function's
    own docstring for 2 real examples), not hypothetical. A stage that
    finds a name match rejected on season implausibility does NOT fall
    back to a looser stage for the SAME rejected candidate -- it's
    excluded everywhere in this call, exactly as if the name had never
    matched it at all, and the row proceeds to whichever stage (or the
    final unmatched fallback) would apply next."""
    last, first = split_raw_name(raw_name)
    if last is None:
        return None, None  # unparseable/jersey-number artifact -- caller skips the row entirely
    last, first = NAME_ALIASES.get((last, first), (last, first))
    exact = [
        (key, person) for key, person in roster.items()
        if norm(person["last_name"]) == norm(last) and norm(person["first_name"]) == norm(first)
    ]
    exact_plausible = [(k, p) for k, p in exact if season_plausible(p, season)]
    if len(exact_plausible) == 1:
        key, person = exact_plausible[0]
        return key, f"{person['first_name']} {person['last_name']}"
    if len(exact_plausible) > 1:
        # A genuine exact-name match to 2+ roster people, all season-
        # plausible -- can't happen on the CURRENT roster (checked
        # 2026-09-08, zero duplicate full names exist in it), but a
        # correct fallback if it ever does rather than an IndexError or a
        # silent pick-the-first-one guess.
        return None, f"{first} {last}"

    cands = last_name_to_keys.get(last.lower(), set())
    cands = {k for k in cands if season_plausible(roster[k], season)}
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
    resolved = unmatched_display.get((first, last))
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
    row). Returns {(first, last): display_name or None} -- one verdict PER
    RAW VARIANT, not one blanket verdict for the whole last-name group
    (changed 2026-09-08, found during a routine re-audit: a single stray
    "Campbell, G." amid many real "Campbell, H"/"H."/"Hunter" rows -- almost
    certainly a one-off scrape typo for the same Hunter Campbell, but not
    confirmable -- was blocking the otherwise-completely-clear H/H./Hunter
    merge too, because the old per-last-name version gave up entirely the
    moment ANY variant contradicted the group's real full name). The
    outlier itself still resolves to None here (kept as its own separate,
    un-merged identity, never guessed into the dominant cluster) -- only
    the genuinely-consistent variants merge.

    A first-name variant that's just an initial -- one letter ("K."), or a
    COMPOUND initial like "J.R"/"J.R."/"JR" (all 3 real, confirmed
    2026-09-08: the same real person's money_unit rows spelled it 3
    different ways across different games) -- is always treated as
    compatible with any full name it's a real prefix of, and multiple
    initial variants that reduce to the same letters are treated as the
    SAME initial, not competing identities. `initial_letters()` strips
    everything but letters and uppercases, so "J.R", "J.R.", and "JR" all
    normalize to "JR" -- only a genuinely different letter sequence (e.g.
    "K." vs "J.") counts as a real conflict.

    2+ DIFFERENT full names under one last name (e.g. a real "Hunter
    Campbell" and a real, different "Garret Campbell") does NOT give up on
    every variant the way a first version of this function did -- each
    initial still resolves to whichever ONE of the multiple full names it
    uniquely matches ("H"/"H." -> Hunter, "G." -> Garret), and only a
    truly ambiguous initial (matching 2+ of the real full names, or
    matching none of them) or a bare row stays unresolved."""
    resolved = {}
    for last_key, pairs in raw_groups.items():
        last = next(iter(pairs))[1]  # real spelling -- identical across every pair by construction (same norm() key)
        firsts = {p[0] for p in pairs}
        full_names = {f for f in firsts if f and len(initial_letters(f)) > 3}

        if full_names:
            # Two "full names" (both > 3 letters) aren't necessarily two
            # different real people -- a nickname/formal-name pair like
            # "Clay."/"Clayton" both clear the length bar, but "Clay" is
            # just a shorthand spelling of "Clayton" (confirmed 2026-09-08:
            # found alongside a genuinely different "Ty Zimmerman" in the
            # same last-name group -- Ty correctly stays unresolved on its
            # own since it isn't a prefix of Clayton, while "C." previously
            # matched BOTH "Clay." and "Clayton" and was wrongly dropped as
            # ambiguous). Cluster full names where one's letters are a
            # prefix of another's before doing initial-matching, so an
            # initial checks against each real IDENTITY once, not once per
            # spelling of the same identity. Longest spelling in a cluster
            # wins as canonical (more complete, so more likely the given
            # name rather than a nickname).
            canon_for = {}  # spelling -> canonical spelling for its cluster
            canon_anchor = {}  # canonical spelling -> its initial_letters
            for f in sorted(full_names, key=lambda f: -len(initial_letters(f))):
                key = initial_letters(f)
                match = next((c for c, a in canon_anchor.items() if a[: len(key)] == key), None)
                if match:
                    canon_for[f] = match
                else:
                    canon_for[f] = f
                    canon_anchor[f] = key
            canonicals = set(canon_for.values())
            sole_full_name = next(iter(canonicals)) if len(canonicals) == 1 else None
            for p in pairs:
                first = p[0]
                if not first:
                    # A bare row is only safely mergeable when there's
                    # exactly one real identity to attach it to -- with
                    # 2+, there's no way to tell which person it belongs to.
                    resolved[p] = f"{sole_full_name} {last}" if sole_full_name else None
                    continue
                if first in full_names:
                    resolved[p] = f"{canon_for[first]} {last}"
                    continue
                key = initial_letters(first)
                matches = [c for c in canonicals if 1 <= len(key) <= 3 and canon_anchor[c][: len(key)] == key]
                resolved[p] = f"{matches[0]} {last}" if len(matches) == 1 else None
            continue

        # No full first name anywhere in this group -- merge same-initial
        # variants only (still per-variant: an initial that matches the
        # group's single dominant cluster merges, a genuinely different
        # one does not).
        initial_groups = {}
        for p in pairs:
            key = initial_letters(p[0])
            if 1 <= len(key) <= 3:
                initial_groups.setdefault(key, []).append(p)
        if len(initial_groups) == 1:
            # A bare row (first="") carries no contradicting information --
            # merges into the one real cluster found, same as an initial
            # merges into a real full name above.
            letters = next(iter(initial_groups))
            canonical = f"{''.join(f'{c}.' for c in letters)} {last}"
            for p in pairs:
                resolved[p] = canonical
        else:
            for p in pairs:
                resolved[p] = None
    return resolved


def initial_letters(s):
    """"K." -> "K", "J.R" -> "JR", "J.R." -> "JR", "JR" -> "JR", "Kyle" ->
    "KYLE" -- strips everything but letters and uppercases, so every
    spelling variant of the same initial (or the same full name) reduces
    to one comparable key. Callers distinguish "a real initial" from "a
    full name" by length (<=3 letters covers every real compound initial
    seen in this archive; nothing that short is a genuine first name)."""
    return re.sub(r"[^A-Za-z]", "", s).upper()


def bump(bucket, key, amount=1):
    bucket[key] = bucket.get(key, 0) + amount


def bump_max(bucket, key, value):
    bucket[key] = max(bucket.get(key, 0), value or 0)


# (unit key in data/special-teams.json, field holding the player's name,
# output category name). Every one of these name fields turns out to mix
# ALL 3 raw formats match_player()/split_raw_name() already handle for the
# box-score categories -- "Last,First", "First Last", and a bare surname
# alone -- confirmed by counting real occurrences of each 2026-09-08
# (a first pass wrongly assumed every field here was bare-surname-only,
# based on the first game's data happening to look that way; the real
# archive is ~85% "First Last", with both other formats mixed in too,
# even within the SAME field). match_player() (with the SAME
# unmatched_display cross-format merge every box-score category already
# gets) is reused directly rather than a separate bare-surname-only
# resolver, so a specialist named 3 different ways across different rows
# merges into one identity here exactly the same way "K. Burlingame"/
# "Kyle Burlingame"/"Burlingame" did for the box-score categories.
SPECIAL_TEAMS_UNITS = [
    ("punt", "punter", "Punting"),
    ("kickoff", "kicker", "Kickoffs"),
    ("punt_return", "returner", "PuntReturn"),
    ("kickoff_return", "returner", "KickoffReturn"),
    ("money_unit", "kicker", "PATFG"),
]


def accumulate_one_special_teams_row(category, bucket, row):
    if category == "Punting":
        bump(bucket, "att")
        gross = row.get("total_distance") or 0
        ret = row.get("return_length") or 0
        bump(bucket, "gross_yds", gross)
        bump(bucket, "net_yds", gross - ret)
        bump_max(bucket, "long", gross)
        if row.get("i20"):
            bump(bucket, "i20")
        if row.get("blocked"):
            bump(bucket, "blocked")
    elif category == "Kickoffs":
        bump(bucket, "att")
        bump(bucket, "yds", row.get("total_distance") or 0)
        bump_max(bucket, "long", row.get("total_distance") or 0)
        if row.get("touchback"):
            bump(bucket, "tb")
        if row.get("out_of_bounds"):
            bump(bucket, "ob")
        if row.get("inside_25"):
            bump(bucket, "inside_25")
    elif category in ("PuntReturn", "KickoffReturn"):
        bump(bucket, "att")
        bump(bucket, "yds", row.get("return_length") or 0)
        bump_max(bucket, "long", row.get("return_length") or 0)
    elif category == "PATFG":
        is_fg = row.get("fg_exp") == "FG"
        bump(bucket, "fg_att" if is_fg else "exp_att")
        if row.get("make"):
            bump(bucket, "fg_made" if is_fg else "exp_made")


def add_special_teams_derived(cat, bucket):
    if cat == "Punting" and bucket.get("att"):
        bucket["gross_avg"] = round(bucket["gross_yds"] / bucket["att"], 1)
        bucket["net_avg"] = round(bucket["net_yds"] / bucket["att"], 1)
    elif cat == "Kickoffs" and bucket.get("att"):
        bucket["avg"] = round(bucket["yds"] / bucket["att"], 1)
    elif cat in ("PuntReturn", "KickoffReturn") and bucket.get("att"):
        bucket["avg"] = round(bucket["yds"] / bucket["att"], 1)
    elif cat == "PATFG":
        if bucket.get("fg_att"):
            bucket["fg_pct"] = round(100 * bucket.get("fg_made", 0) / bucket["fg_att"], 1)
        if bucket.get("exp_att"):
            bucket["exp_pct"] = round(100 * bucket.get("exp_made", 0) / bucket["exp_att"], 1)


def accumulate_special_teams(players, roster, last_name_to_keys, unmatched_display):
    """Mutates `players` (the same dict main() builds from the box-score
    categories) in place, adding Punting/Kickoffs/PuntReturn/
    KickoffReturn/PATFG career+season totals from this site's own
    data/special-teams.json. A player already present from a box-score
    category (matched to the same athlete_key, so displayed under the
    same canonical roster name) gets these as additional categories on
    their existing entry; a special-teams-only player (e.g. a pure
    kicker/punter with no offensive/defensive box-score line at all) gets
    a new entry."""
    if not SPECIAL_TEAMS_SRC.exists():
        print(f"  WARNING: {SPECIAL_TEAMS_SRC} not found -- skipping special-teams career stats")
        return
    with open(SPECIAL_TEAMS_SRC, encoding="utf-8") as f:
        st = json.load(f)
    for unit_key, name_field, category in SPECIAL_TEAMS_UNITS:
        for row in st["units"].get(unit_key, []):
            raw_name = row.get(name_field)
            if not raw_name:
                continue  # e.g. money_unit rows with no credited snapper -- not this row's kicker, unrelated to this unit's own name field
            season = int(row["season"]) if row.get("season") else None
            athlete_key, display = match_player(raw_name, roster, last_name_to_keys, unmatched_display, season)
            if display is None:
                continue
            game_label = f"{row.get('season')}|{row.get('opponent')}|{row.get('date')}"
            player = players.setdefault(display, {"athlete_key": athlete_key, "categories": {}})
            cat_bucket = player["categories"].setdefault(category, {"career": {}, "seasons": {}, "career_games": set(), "season_games": {}})
            accumulate_one_special_teams_row(category, cat_bucket["career"], row)
            cat_bucket["career_games"].add(game_label)
            if season is not None:
                season_bucket = cat_bucket["seasons"].setdefault(season, {})
                accumulate_one_special_teams_row(category, season_bucket, row)
                cat_bucket["season_games"].setdefault(season, set()).add(game_label)

    # Snapping is tracked separately from the kicker's own PATFG stats --
    # money_unit's `long_snapper` field (the PAT/FG "short" snap, despite
    # its confusing column name -- see Special Teams Data's own SKILL.md)
    # and punt's own `snapper` field (the true "long" snap). Both are bare
    # surnames. A snap "attempt" here just means "this row credits a
    # snapper at all" -- neither sheet tracks snap quality/grade as a
    # per-snapper aggregate stat, only the per-attempt charted fields
    # (Snap Location, Snap to Catch) that dashboards/short-snapper.html
    # and long-snapper.html already chart directly from the row-level data.
    for unit_key, name_field, category in [("money_unit", "long_snapper", "ShortSnapping"), ("punt", "snapper", "LongSnapping")]:
        for row in st["units"].get(unit_key, []):
            raw_name = row.get(name_field)
            if not raw_name:
                continue
            season = int(row["season"]) if row.get("season") else None
            athlete_key, display = match_player(raw_name, roster, last_name_to_keys, unmatched_display, season)
            if display is None:
                continue
            game_label = f"{row.get('season')}|{row.get('opponent')}|{row.get('date')}"
            player = players.setdefault(display, {"athlete_key": athlete_key, "categories": {}})
            cat_bucket = player["categories"].setdefault(category, {"career": {}, "seasons": {}, "career_games": set(), "season_games": {}})
            bump(cat_bucket["career"], "att")
            cat_bucket["career_games"].add(game_label)
            if season is not None:
                bump(cat_bucket["seasons"].setdefault(season, {}), "att")
                cat_bucket["season_games"].setdefault(season, set()).add(game_label)


def main():
    roster, last_name_to_keys = load_roster()
    files = glob.glob(RAW_GLOB)

    # First pass: collect every raw (last, first) variant seen for players
    # that DON'T match the roster, purely to resolve a canonical display
    # name per last name before any stats are actually accumulated (see
    # resolve_unmatched_identities -- needs the full picture across every
    # file before deciding anything, so this has to be a separate pass,
    # not folded into the main accumulation loop below). Scans BOTH the
    # box-score archive and data/special-teams.json's own name fields --
    # a specialist with no offensive/defensive box-score line at all still
    # needs their special-teams-only name variants merged the same way
    # (found 2026-09-08: special-teams.json's punter/kicker/returner/
    # snapper fields mix all 3 raw-name formats too, not just a bare
    # surname as first assumed -- see SPECIAL_TEAMS_UNITS' own comment).
    def collect_unmatched_variant(raw_name, season, unmatched_variants):
        last, first = split_raw_name(raw_name)
        if last is None:
            return
        key, _ = match_player(raw_name, roster, last_name_to_keys, {}, season)
        if key is not None:
            return
        # Apply the same NAME_ALIASES correction match_player() applies
        # internally -- otherwise a last-name-typo alias whose TARGET
        # isn't a roster name (found 2026-09-08: several confirmed
        # scrape-typo pairs like "Piekrski"/"Piekarski" where neither
        # spelling is on the roster) never reaches match_player's own
        # alias lookup here, so the two spellings would still fragment
        # into separate raw_groups buckets by last name and never get a
        # chance to merge in resolve_unmatched_identities.
        last, first = NAME_ALIASES.get((last, first), (last, first))
        lk = merge_key_for_unmatched(last, first)
        unmatched_variants.setdefault(lk, set()).add((first, last))

    unmatched_variants = {}
    for fn in files:
        with open(fn, encoding="utf-8") as f:
            data = json.load(f)
        year = season_year(data.get("game_info", {}).get("date"))
        ps = data.get("player_stats", {})
        for category in CATEGORY_SPECS:
            teams = ps.get(category, {})
            if not isinstance(teams, dict):
                continue
            car_key = carroll_key_for_game(data, teams)
            if car_key is None:
                continue
            for row in teams[car_key]:
                collect_unmatched_variant(row.get("player", ""), year, unmatched_variants)
    if SPECIAL_TEAMS_SRC.exists():
        with open(SPECIAL_TEAMS_SRC, encoding="utf-8") as f:
            st = json.load(f)
        for unit_key, name_field, _category in SPECIAL_TEAMS_UNITS:
            for row in st["units"].get(unit_key, []):
                if row.get(name_field):
                    season = int(row["season"]) if row.get("season") else None
                    collect_unmatched_variant(row[name_field], season, unmatched_variants)
        for unit_key, name_field in [("money_unit", "long_snapper"), ("punt", "snapper")]:
            for row in st["units"].get(unit_key, []):
                if row.get(name_field):
                    season = int(row["season"]) if row.get("season") else None
                    collect_unmatched_variant(row[name_field], season, unmatched_variants)
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
                athlete_key, display = match_player(raw_name, roster, last_name_to_keys, unmatched_display, year)
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

    accumulate_special_teams(players, roster, last_name_to_keys, unmatched_display)

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
        add_special_teams_derived(cat, bucket)

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
