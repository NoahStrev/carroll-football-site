"""
Runs this site's own 6 build scripts in sequence for routine updates:
build_special_teams_data.py, build_career_stats.py, build_records_data.py,
build_lifting_data.py, build_game_data.py, build_rankings_data.py.

This only covers this site's own rebuild step. The upstream sibling projects
each source data from (Special Teams Data, Lifting Data, Game Analysis, CCIW
Buddah Report, National Buddah Report, Records & Awards) still need their own
build/scrape step run first when they have new source data -- each has its
own judgment calls about readiness, so that is not automated here.

The first 3 scripts run in a fixed dependency order, not just declaration
order: build_career_stats.py reads build_special_teams_data.py's own output
(data/special-teams.json) plus the raw box-score archive, and
build_records_data.py reads build_career_stats.py's output (data/career-
stats.json) plus the Records & Awards project's scraped record/award
workbooks, for Record Watch's "current players vs. the record book" section.
Added 2026-09-08 -- these 2 scripts existed for a while before anyone
noticed they'd never actually been wired into this list, so every weekly
run was silently rebuilding Rankings/Special Teams/Lifting/Game Data while
Career Stats and Record Watch quietly went stale. The remaining 3 scripts
have no dependency on each other or on the first 3, so their relative order
doesn't matter.

Continues past a failing script (so one bad workbook doesn't block the
others) and reports a pass/fail summary at the end. Exits non-zero if any
script failed.

Run weekly, after the upstream projects have been refreshed:
    python refresh_all.py
"""

import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent

BUILD_SCRIPTS = [
    "build_special_teams_data.py",
    "build_career_stats.py",
    "build_records_data.py",
    "build_lifting_data.py",
    "build_game_data.py",
    "build_rankings_data.py",
]


def main():
    results = []
    for name in BUILD_SCRIPTS:
        print(f"\n=== {name} ===")
        proc = subprocess.run([sys.executable, str(SCRIPTS_DIR / name)])
        results.append((name, proc.returncode == 0))

    print("\n=== Summary ===")
    for name, ok in results:
        print(f"{'OK  ' if ok else 'FAIL'}  {name}")

    if not all(ok for _, ok in results):
        sys.exit(1)


if __name__ == "__main__":
    main()
