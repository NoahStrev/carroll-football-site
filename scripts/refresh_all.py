"""
Runs this site's own 4 build scripts in sequence for routine updates:
build_special_teams_data.py, build_lifting_data.py, build_game_data.py,
build_rankings_data.py.

This only covers this site's own rebuild step. The upstream sibling projects
each source data from (Special Teams Data, Lifting Data, Game Analysis, CCIW
Buddah Report, National Buddah Report) still need their own build/scrape step
run first when they have new source data -- each has its own judgment calls
about readiness, so that is not automated here.

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
