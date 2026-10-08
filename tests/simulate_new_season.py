"""
Rehearses the day a new season's first box score is loaded but not yet charted, which is when a site built around the
last season is most likely to break. It copies the site to a temp folder, adds a synthetic opener (a copy of this season's
first box score, re-dated into next year) and a next-year schedule, rebuilds home.json and meta.json from them, and runs the
smoke test against the copy. Needs the sibling projects (the box-score archive and Schedule), so it is a by-hand check, not
part of the GitHub Action.

    python tests/simulate_new_season.py            # prints where the copy is left, so you can serve and look at it

What it checks: the new season becomes "current" on Home even though it has no play-by-play yet, Home says the game has not
been charted, the compare tab and every other page still render, and nothing prints undefined or NaN.
"""

import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
RAW = SITE.parent / "Special Teams Data" / "raw"
SCHEDULE = SITE.parent / "Schedule" / "schedule.json"


def main():
    if not RAW.exists() or not SCHEDULE.exists():
        raise SystemExit("needs the Special Teams Data and Schedule sibling projects")
    sim = Path(tempfile.mkdtemp(prefix="carroll-sim-")) / "site"
    shutil.copytree(SITE, sim, ignore=shutil.ignore_patterns(".git", "__pycache__"))

    raw_dir = sim.parent / "raw"
    raw_dir.mkdir()
    for f in RAW.glob("*.json"):
        shutil.copy(f, raw_dir / f.name)
    seasons = sorted({int(f.name[:4]) for f in RAW.glob("*.json")})
    this, nxt = seasons[-1], seasons[-1] + 1
    first = min(RAW.glob(f"{this}_*.json"), key=lambda f: tuple(int(x) for x in json.loads(f.read_text(encoding="utf-8"))["game_info"]["date"].split("/")[:2]))
    box = json.loads(first.read_text(encoding="utf-8"))
    box["game_info"]["date"] = "9/4/" + str(nxt)
    (raw_dir / f"{nxt}_synthetic-opener.json").write_text(json.dumps(box), encoding="utf-8")

    sched = json.loads(SCHEDULE.read_text(encoding="utf-8"))
    games = [dict(g, season=nxt, completed=(i == 0)) for i, g in enumerate(g for g in sched["games"] if g["season"] == this)]
    (sim.parent / "schedule.json").write_text(json.dumps({**sched, "games": games}), encoding="utf-8")

    sys.path.insert(0, str(SITE / "scripts"))
    import build_home_data as b

    b.RAW_GLOB = str(raw_dir / "*.json")
    b.SCHEDULE = sim.parent / "schedule.json"
    b.OUT = sim / "data" / "home.json"
    b.META_OUT = sim / "data" / "meta.json"
    b.main()

    home = json.loads(b.OUT.read_text(encoding="utf-8"))
    assert home["season"] == nxt, f"the new season should be current, got {home['season']}"
    assert not home["seasons"][str(nxt)]["games"][0]["charted"], "the synthetic opener should be uncharted"
    print(f"\nHome treats {nxt} as the current season with its opener uncharted. Running the smoke test on {sim} ...")
    env = dict(os.environ, SMOKE_WIDTHS="1280,390")
    code = subprocess.run([sys.executable, str(sim / "tests" / "run_smoke.py")], env=env).returncode
    print(f"copy left at {sim}")
    sys.exit(code)


if __name__ == "__main__":
    main()
