"""
The weekly update, in one command. Run it when you want the site brought up to date after a game:

    python scripts/weekly_update.py                 # everything, in order
    python scripts/weekly_update.py --dry-run       # say what it WOULD do; changes nothing
    python scripts/weekly_update.py --only box,hudl,site       # just those steps
    python scripts/weekly_update.py --hudl "C:/path/PlaylistData_2026-10-15.xlsx"

Steps (each is skippable with --only; they run in this order):
  guard  is it in season? (also refreshes Schedule/schedule.json)
  box    scrape any NEW box score from gopios.com into Special Teams Data/raw, rebuild its workbooks, and stop if
         the build reports a problem with the new game (a parse warning, or an opponent name it does not know)
  cciw   CCIW.org weekly snapshot + progression workbooks
  ncaa   NCAA.com national weekly snapshot + trend workbooks (several minutes; skipped if today's already exists)
  hudl   file a Hudl "PlaylistData_*.xlsx" from Downloads into Game Analysis/raw under the right name, then run the
         append-only combiner (never --rebuild)
  site   refresh_all.py (every site JSON, then the validator)

It never commits or pushes, never maps a new opponent name, and never fixes a parse problem on its own: anything that
needs a decision is collected under "NEEDS YOUR DECISION" at the end and the exit code is 2. Exit 0 = clean,
1 = a step failed.

This is the same sequence the weekly scheduled tasks describe -- it is not scheduled; you run it on request.
"""

import argparse
import datetime as dt
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
FOOTBALL = SITE.parent
ST_DIR = FOOTBALL / "Special Teams Data"
GA_DIR = FOOTBALL / "Game Analysis"
CCIW_DIR = FOOTBALL / "CCIW Buddah Report"
NCAA_DIR = FOOTBALL / "National Buddah Report" / "CCIW_D3_Football_Stats"
SCHEDULE_DIR = FOOTBALL / "Schedule"
DOWNLOADS = Path.home() / "Downloads"
STEPS = ["guard", "box", "cciw", "ncaa", "hudl", "site"]

decisions = []   # things only the user can decide
notes = []       # what happened, for the closing summary


def say(msg=""):
    print(msg, flush=True)


def run(cmd, cwd, capture=True, check=False):
    """Run a command, return (returncode, combined output)."""
    proc = subprocess.run(cmd, cwd=str(cwd), capture_output=capture, text=True, encoding="utf-8", errors="replace")
    out = (proc.stdout or "") + (proc.stderr or "")
    if check and proc.returncode != 0:
        raise SystemExit(f"command failed ({proc.returncode}): {' '.join(map(str, cmd))}\n{out[-2000:]}")
    return proc.returncode, out


def step_header(name, text):
    say(f"\n=== {name}: {text} ===")


# ------------------------------------------------------------------------------------------------- guard

def step_guard(args):
    step_header("guard", "in season?")
    code, out = run([sys.executable, str(SCHEDULE_DIR / "check_in_season.py")], SCHEDULE_DIR)
    say(out.strip())
    if code != 0:
        raise SystemExit("Not in season (or the schedule could not be read) -- nothing to update.")
    m = re.search(r"(\d{4}) season", out)
    return int(m.group(1)) if m else dt.date.today().year


# ------------------------------------------------------------------------------------------------- box score

def find_new_box_links(year):
    req = urllib.request.Request(f"https://gopios.com/sports/football/schedule/{year}", headers={"User-Agent": "Mozilla/5.0"})
    html = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", errors="replace")
    links = sorted(set(re.findall(rf"/sports/football/stats/{year}/([a-z0-9-]+)/boxscore/(\d+)", html)))
    have = {Path(p).name for p in glob.glob(str(ST_DIR / "raw" / f"{year}_*.json"))}
    return [(slug, gid) for slug, gid in links if f"{year}_{slug}_{gid}.json" not in have]


def step_box(args, year):
    step_header("box", "new box scores from gopios.com")
    new = find_new_box_links(year)
    if not new:
        say("No new box scores (everything on the schedule page is already in raw/).")
        notes.append("box: no new box score")
        return []
    say("New: " + ", ".join(f"{slug} ({gid})" for slug, gid in new))
    if args.dry_run:
        say("(dry run: would fetch these and rebuild the special-teams workbooks)")
        return [slug for slug, _ in new]
    for slug, gid in new:
        url = f"https://gopios.com/sports/football/stats/{year}/{slug}/boxscore/{gid}"
        code, out = run([sys.executable, "fetch_raw.py", url], ST_DIR)
        say(out.strip().splitlines()[-1] if out.strip() else "(no output)")
        if code != 0:
            raise SystemExit(f"fetch_raw.py failed for {url}:\n{out[-1500:]}")
    if os.name == "nt":
        run(["taskkill", "/IM", "EXCEL.EXE", "/F"], ST_DIR)  # a workbook left open in Excel blocks the write
    names = []
    for slug, gid in new:
        raw = json.loads((ST_DIR / "raw" / f"{year}_{slug}_{gid}.json").read_text(encoding="utf-8"))
        names.append(raw["game_info"].get("score", slug))
    outputs = []
    for cmd in ([sys.executable, "build_workbook.py", "raw/*.json"],
                [sys.executable, "build_workbook.py", "raw/*.json", "Carroll_Special_Teams_2021_Current.xlsx", "--min-season=2021"]):
        code, out = run(cmd, ST_DIR)
        outputs.append(out)
        if code != 0:
            raise SystemExit(f"build_workbook.py failed:\n{out[-2000:]}")
    text = "\n".join(outputs)
    # Problems with the NEW game only (the archive prints many old, known notes every run).
    keys = {slug.split("-")[0] for slug, _ in new}
    for line in text.splitlines():
        low = line.lower()
        if "doesn't match the canonical opponent list" in low:
            decisions.append(f"box: new opponent name needs a decision (never auto-mapped): {line.strip()}")
        elif "found 0 " in low and any(k in low for k in keys):
            decisions.append(f"box: the new game parsed with ZERO plays of a kind (new text format?): {line.strip()}")
    say("Rebuilt workbooks." + ("" if not decisions else " -- but see NEEDS YOUR DECISION below."))
    notes.append("box: scraped " + ", ".join(names))
    return [slug for slug, _ in new]


# ------------------------------------------------------------------------------------------------- CCIW.org

def step_cciw(args, year):
    step_header("cciw", "CCIW.org weekly snapshot")
    if args.dry_run:
        say("(dry run: would run scrape_weekly_snapshot.py and both build_weekly_progression.py calls)")
        return
    code, out = run([sys.executable, "scrape_weekly_snapshot.py"], CCIW_DIR)
    say("\n".join(out.strip().splitlines()[-4:]))
    if code != 0:
        raise SystemExit(f"scrape_weekly_snapshot.py failed:\n{out[-1500:]}")
    if "saved " not in out:
        say("Neither dataset changed since the last snapshot -- progression workbooks left as they are.")
        notes.append("cciw: no change since last snapshot")
        return
    for prefix in ("Carroll_Football", "CCIW_TopPerformer"):
        code, out = run([sys.executable, "build_weekly_progression.py", "--year", str(year), "--prefix", prefix,
                         "--out", f"output_carroll/{prefix}_{year}_Weekly.xlsx"], CCIW_DIR)
        if code != 0:
            raise SystemExit(f"build_weekly_progression.py ({prefix}) failed:\n{out[-1500:]}")
    notes.append("cciw: new snapshot written, progression workbooks rebuilt")


# ------------------------------------------------------------------------------------------------- NCAA

def step_ncaa(args, year):
    step_header("ncaa", "NCAA.com national snapshot (several minutes)")
    today = dt.date.today().isoformat()
    folder = NCAA_DIR / "raw" / str(year) / today
    if (folder / f"SCRAPE_SUMMARY_{year}.csv").exists() and not args.force:
        say(f"Today's snapshot ({today}) already exists -- skipping (use --force to redo it).")
        notes.append("ncaa: today's snapshot already existed")
        return
    if args.dry_run:
        say(f"(dry run: would scrape ~415 pages into {folder} and rebuild the weekly trend workbooks)")
        return
    folder.mkdir(parents=True, exist_ok=True)
    if os.name == "nt":
        run(["taskkill", "/IM", "EXCEL.EXE", "/F"], NCAA_DIR)
    scrape = NCAA_DIR / "scrape_conference.ps1"
    log = folder / "log.txt"
    # Direct "&" invocation inside -Command: the form this project's notes say works here (not -File / -ExecutionPolicy).
    cmd = ["powershell", "-NoProfile", "-Command", f"& '{scrape}' -Year {year} -SnapshotDate {today} *> '{log}'"]
    code, out = run(cmd, NCAA_DIR)
    if code != 0:
        raise SystemExit(f"NCAA scrape failed ({code}):\n{out[-1500:]}")
    import csv
    summary = folder / f"SCRAPE_SUMMARY_{year}.csv"
    if not summary.exists():
        raise SystemExit(f"NCAA scrape wrote no summary at {summary}; see {log}")
    rows = list(csv.DictReader(open(summary, newline="", encoding="utf-8")))
    zero = sum(1 for r in rows if int(r["Matches"]) == 0)
    say(f"{len(rows)} categories, {zero} with zero matches.")
    if rows and zero / len(rows) > 0.25:
        decisions.append(f"ncaa: {zero} of {len(rows)} categories found nothing -- likely a site-side issue (happened for all of 2022). Do not publish this snapshot as-is.")
    code, out = run(["powershell", "-NoProfile", "-Command", f"& '{NCAA_DIR / 'build_weekly_trends.ps1'}' -Year {year}"], NCAA_DIR)
    if code != 0:
        raise SystemExit(f"build_weekly_trends.ps1 failed:\n{out[-1500:]}")
    notes.append(f"ncaa: snapshot {today} ({len(rows)} categories, {zero} empty), trend workbooks rebuilt")


# ------------------------------------------------------------------------------------------------- Hudl

def played_games_without_charting(year):
    """Schedule dates (this season) that have a box score but no Game Analysis export yet."""
    out = []
    for path in sorted(glob.glob(str(ST_DIR / "raw" / f"{year}_*.json"))):
        d = json.loads(Path(path).read_text(encoding="utf-8"))
        mo, dy = d["game_info"]["date"].split("/")[:2]
        stamp = f"{int(mo)}_{int(dy)}_{str(year)[2:]}"
        if not glob.glob(str(GA_DIR / "raw" / f"*{stamp}.xlsx")) and not glob.glob(str(GA_DIR / "raw" / f"*{int(mo):02d}_{int(dy):02d}_{str(year)[2:]}.xlsx")):
            away, _, home = d["game_info"]["matchup"].partition("-VS-")
            opp = re.sub(r"\s*\(.*?\)", "", (away if "carroll" in home.lower() else home)).strip()
            out.append({"stamp": stamp, "opponent": opp, "date": f"{year}-{int(mo):02d}-{int(dy):02d}"})
    return out


def short_opponent(opp):
    sys.path.insert(0, str(SITE / "scripts"))
    import build_home_data as bh
    names = bh.load_names()
    return names.get(bh.team_key(opp), opp)


def new_hudl_files(year):
    """PlaylistData_*.xlsx in Downloads that are from this season and not already filed (older exports stay in
    Downloads after they are copied, so a byte-identical copy in Game Analysis/raw means "already done")."""
    import hashlib
    digest = lambda p: hashlib.sha1(Path(p).read_bytes()).hexdigest()
    filed = {digest(p) for p in glob.glob(str(GA_DIR / "raw" / "*.xlsx"))}
    season_start = dt.datetime(year, 6, 1).timestamp()
    found = [p for p in DOWNLOADS.glob("PlaylistData_*.xlsx") if p.stat().st_mtime >= season_start and digest(p) not in filed]
    return sorted(found, key=lambda p: p.stat().st_mtime)


def step_hudl(args, year):
    step_header("hudl", "Hudl export")
    waiting = played_games_without_charting(year)
    candidates = [Path(args.hudl)] if args.hudl else new_hudl_files(year)
    if not candidates:
        msg = "no PlaylistData_*.xlsx in Downloads"
        say(f"Nothing to file: {msg}." + (f" Still waiting on charting for: {', '.join(g['opponent'] + ' ' + g['date'] for g in waiting)}." if waiting else ""))
        notes.append(f"hudl: {msg}" + (f"; waiting on {', '.join(g['opponent'] for g in waiting)}" if waiting else ""))
        return
    if len(candidates) > 1:
        decisions.append(f"hudl: {len(candidates)} PlaylistData files in Downloads ({', '.join(c.name for c in candidates)}) -- say which game each is, or pass one with --hudl.")
        return
    src = candidates[0]
    if len(waiting) != 1:
        decisions.append(f"hudl: found {src.name} but {len(waiting)} played games lack charting ({', '.join(g['opponent'] + ' ' + g['date'] for g in waiting) or 'none'}) -- cannot tell which game it is; rename it to 'Carroll vs <Opponent> M_D_YY.xlsx' in Game Analysis/raw yourself.")
        return
    game = waiting[0]
    import openpyxl
    ws = openpyxl.load_workbook(src, read_only=True).active
    header = [c for c in next(ws.iter_rows(values_only=True))]
    reference = next(iter(sorted(glob.glob(str(GA_DIR / "raw" / f"Carroll vs * {str(year)[2:]}.xlsx")))), None)
    if reference:
        ref_header = [c for c in next(openpyxl.load_workbook(reference, read_only=True).active.iter_rows(values_only=True))]
        if header != ref_header:
            decisions.append(f"hudl: {src.name} has different columns than earlier exports (expected {len(ref_header)}, got {len(header)}) -- not filed.")
            return
    target = GA_DIR / "raw" / f"Carroll vs {short_opponent(game['opponent'])} {game['stamp']}.xlsx"
    say(f"{src.name} -> {target.name}   (the only played game without charting: {game['opponent']} {game['date']})")
    if target.exists():
        decisions.append(f"hudl: {target.name} already exists -- not overwritten.")
        return
    if args.dry_run:
        say("(dry run: would move it there and run the append-only combiner)")
        return
    shutil.move(str(src), str(target))
    code, out = run([sys.executable, "scripts/build_combined_dataset.py"], GA_DIR)  # append-only; never --rebuild
    say("\n".join(out.strip().splitlines()[-5:]))
    if code != 0:
        raise SystemExit(f"build_combined_dataset.py failed:\n{out[-2000:]}")
    if "Official play-by-play" in out and "0/1" in out:
        decisions.append(f"hudl: {target.name} loaded but its official play-by-play did NOT match a box score -- check the file name/date.")
    notes.append(f"hudl: filed {target.name}")


# ------------------------------------------------------------------------------------------------- site

def step_site(args):
    step_header("site", "rebuild every data file, then validate")
    if args.dry_run:
        say("(dry run: would run scripts/refresh_all.py)")
        return
    code, out = run([sys.executable, "scripts/refresh_all.py"], SITE)
    summary = out[out.rfind("=== Summary ==="):] if "=== Summary ===" in out else out[-1500:]
    say(summary.strip())
    for line in out.splitlines():
        if line.startswith("ERROR:"):
            decisions.append("site: " + line)
        elif line.startswith("WARNING:") and "Zank" not in line and "Keon Miller" not in line:
            notes.append("site " + line[:200])
    if code != 0:
        if any(d.startswith("site: ERROR") for d in decisions):
            return  # the validator found something; it is listed under NEEDS YOUR DECISION
        raise SystemExit("refresh_all.py failed -- do NOT publish. See the output above.")
    code, out = run(["git", "status", "--short", "data"], SITE)
    say("\nChanged data files:\n" + (out.strip() or "(none)"))


# ------------------------------------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description="Run the weekly update in one command.")
    ap.add_argument("--only", help="comma-separated steps to run: " + ",".join(STEPS))
    ap.add_argument("--dry-run", action="store_true", help="show what would happen; change nothing")
    ap.add_argument("--hudl", help="a specific Hudl PlaylistData xlsx (default: the one in Downloads)")
    ap.add_argument("--force", action="store_true", help="redo the NCAA snapshot even if today's exists")
    args = ap.parse_args()
    wanted = [s.strip() for s in args.only.split(",")] if args.only else STEPS
    bad = [s for s in wanted if s not in STEPS]
    if bad:
        raise SystemExit(f"unknown step(s): {bad}; choose from {STEPS}")

    year = step_guard(args) if "guard" in wanted else dt.date.today().year
    if "box" in wanted:
        step_box(args, year)
    if "cciw" in wanted:
        step_cciw(args, year)
    if "ncaa" in wanted:
        step_ncaa(args, year)
    if "hudl" in wanted:
        step_hudl(args, year)
    if "site" in wanted:
        step_site(args)

    say("\n=== Summary ===")
    for n in notes:
        say(f"  - {n}")
    if decisions:
        say("\nNEEDS YOUR DECISION (nothing below was changed automatically):")
        for d in decisions:
            say(f"  * {d}")
        say("\nNot committed or pushed. Resolve the above, re-run, then commit and push when you're happy.")
        sys.exit(2)
    say("\nDone. Nothing was committed or pushed -- review `git status`, then commit and push when you're ready.")


if __name__ == "__main__":
    main()
