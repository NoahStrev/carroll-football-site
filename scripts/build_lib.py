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
