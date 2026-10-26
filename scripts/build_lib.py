"""
Small shared helpers used by more than one of this site's own build_*.py
scripts. Hoisted 2026-09-08 after finding `distinct()` copy-pasted
byte-for-byte identically in build_special_teams_data.py, build_game_data.py,
and build_rankings_data.py -- same pattern as the sibling "Records & Awards"
project's own scrape_lib.py for its 2 scrape scripts.

Deliberately kept minimal: each build script's own row-shaping logic (which
columns mean what, how a unit's rows get assembled) stays entirely separate
per script, matching this project's established convention of NOT merging
whole per-source-format functions just because they're superficially
similar -- only genuinely identical, pure, no-context-needed logic belongs
here.
"""


def distinct(rows, field):
    """Sorted distinct non-empty values of `field` across `rows`, for a
    dashboard's own filter-option lists. Sorts by string form -- some
    fields mix types (e.g. quarter is int 1-4 but "OT" is a str), and
    Python can't compare int/str directly (crashes sorted() on any unit/
    sheet that has an OT-style row)."""
    return sorted({r[field] for r in rows if r.get(field) not in (None, "")}, key=str)


def sheet_rows(ws):
    """Every data row of an openpyxl worksheet as header-name -> value
    dicts, reading row 1 as the header. Returns a list, not a generator --
    a caller that just needs len(rows) (e.g. a per-sheet row-count print)
    shouldn't have to remember to wrap this in list() itself.

    Consolidated 2026-09-08 -- 3 build scripts each had their own
    functionally-identical version of this (one read cell-by-cell via
    ws.cell(r, c), which works but is noticeably slower than iter_rows()
    for a large sheet; the other two already used iter_rows() but one
    returned a generator instead of a list). This keeps the fastest
    (iter_rows(values_only=True)) approach as the one shared version."""
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    return [dict(zip(header, r)) for r in rows]


# --- turnovers on punts and kickoffs (2026-10-25) ------------------------------------------------------------------
# The official play-by-play has offensive and defensive snaps only, so a fumble or muff on a punt or kickoff that the
# KICKING team recovers -- a turnover the box score counts in "Fumbles - Lost" -- was missing from every turnover
# total (17 of 57 games were one or two short). With these added, giveaways and takeaways match the box score in all
# 57 games (validate_data.py keeps checking that).
import re as _re  # noqa: E402

_CARROLL_LABELS = {"CAR", "CU", "CUP", "CARROLL", "CARROL", "CARR", "PIO", "PIOS", "CAU"}
_NOT_CARROLL = {"CARTH", "CART", "CARTHAGE"}  # Carthage labels that start with Carroll's "CAR"
_KICK_RE = _re.compile(r"^\s*(?:\(\d+:\d+\)\s*)?(?P<kicker>.+?)\s+(?P<kind>punt|kickoff)\b", _re.I)
_LOOSE_RE = _re.compile(r"\bfumble|\bmuffed\b", _re.I)
_RECOVER_RE = _re.compile(r"recovered by\s+([A-Za-z]+)\b")


def _last_name(raw):
    raw = (raw or "").strip()
    return (raw.split(",")[0] if "," in raw else raw.split()[-1] if raw.split() else "").strip().lower()


def box_iso_date(box, path_name):
    """A raw box score's date as YYYY-MM-DD (the year comes from the file name: a few old files have a bare M/D)."""
    mo, dy = box["game_info"]["date"].split("/")[:2]
    return f"{path_name[:4]}-{mo.zfill(2)}-{dy.zfill(2)}"


def kick_turnovers(box):
    """Turnovers on punts and kickoffs in one raw box score: the ball came loose (fumbled or muffed) and the kicking
    team recovered it. Returns [{"side": "given" | "taken", "quarter", "kind", "play"}] from Carroll's point of view.
    Carroll kicked when the kicker is in Carroll's own Punting or Kickoffs table."""
    ha = box["home_away"]
    home_side = box["game_info"]["matchup"].partition("-VS-")[2]
    mine = ha["home_abbr"] if "Carroll" in home_side else ha["away_abbr"]
    opp = ha["away_abbr"] if mine == ha["home_abbr"] else ha["home_abbr"]
    ours = {_last_name(r.get("player")) for t in ("Punting", "Kickoffs") for r in (box["player_stats"].get(t) or {}).get(mine) or []}
    out = []
    for p in box.get("play_by_play", []):
        text = p.get("play") or ""
        m = _KICK_RE.match(text)
        recovered = _RECOVER_RE.findall(text)
        if not m or not recovered or not _LOOSE_RE.search(text) or "NO PLAY" in text:
            continue
        who = recovered[-1].upper()
        carroll_recovered = who not in _NOT_CARROLL and who != opp.upper() and (
            who == mine.upper() or who.startswith(mine.upper()) or who in _CARROLL_LABELS)
        carroll_kicked = _last_name(m.group("kicker")) in ours
        if carroll_kicked != carroll_recovered:
            continue  # the receiving team kept the ball
        kick = m.group("kind").lower()
        muffed = bool(_re.search(r"\bmuffed\b", text, _re.I))
        out.append({
            "side": "taken" if carroll_kicked else "given",
            "quarter": p.get("quarter") or "",
            "kind": f"Muffed {kick}" if muffed else f"{kick.capitalize()} return fumble",
            "play": text.strip(),
        })
    return out
