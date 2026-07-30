"""
Phase 4, first report: reads the already-computed output of two sibling
projects -- CCIW Buddah Report (cciw.org, conference-only ranks) and National
Buddah Report (NCAA.com D3, national ranks) -- and writes ../data/rankings.json
for the new Rankings dashboard (Overall / Offensive / Defensive tabs, CCIW and
National shown side by side within each).

Per the user (2026-07-30): "i have a report that will be repopulated weekly
with the cciw rankings if they're playing a conference opponent and a
national one for whoever they play, i would like an overall section, an
offensive section, and a defensive section". This first pass does NOT
re-scrape either source live -- it reads the two sibling projects' own
already-scraped/classified workbooks, matching the user's own "since the data
is already there make some updates so those reports are appearing" framing
and "site ingestion only for now" scope decision (live weekly automation of
the report-generation step itself is a deferred follow-up, not built here).

Team-level only for this first pass (no individual-leader rows) -- "Overall"
metrics (Turnover Margin, Winning %, Penalties) have no individual-player
equivalent, so scoping the whole page to team-level keeps Overall/Offense/
Defense symmetric instead of Offense/Defense having an extra sub-section
Overall can't have.

Real, permanent asymmetry between the two sources, not a bug: CCIW Buddah
Report's own classification (see that project's classification-rules.md)
never produces an "Overall" phase at all -- cciw.org doesn't publish
Turnover Margin/Win%/Penalties as their own ranked category the way NCAA.com
does, so CCIW-scope data literally cannot populate the Overall tab. This is
called out explicitly in the dashboard rather than silently leaving it empty.

Sources (read directly, not copied into this project):
    ../CCIW Buddah Report/output_carroll/Carroll_Football_AllTime.xlsx
      -- sheets Offense-Team/Defense-Team/SpecialTeams-Team, columns
         Year/Category/Metric/Value/Rank/Out Of. Phase = sheet name directly
         (already classified upstream, see that project's own rules doc).
    ../National Buddah Report/CCIW_D3_Football_Stats/Carroll/Carroll_AllYears.xlsx
      -- sheet "Team Stats", columns Season/Category/Games/Stat/Value/Rank/
         RawRank/Context. Phase is NOT a column here (Category is a free-text
         NCAA.com stat name) -- classified below via CATEGORY_SECTION, ported
         from National Game Prep Report's pull_matchup_data.ps1 (the same
         50-metric Section mapping already proven correct by eye against a
         real generated PDF), plus a handful of near-duplicate categories
         that script doesn't map (e.g. "Fewest Penalties" vs its own
         "Fewest Penalties Per Game") extended by the same judgment-call
         pattern, documented inline below.

Also copies both source workbooks into data/downloads/ so the site can offer
them as direct downloads (per the user: "i would like these reports to be
downloadable if possible").

Re-run whenever either source project's output changes:
    python build_rankings_data.py
"""

import json
import shutil
from pathlib import Path

import openpyxl

FOOTBALL_ROOT = Path(__file__).resolve().parent.parent.parent
CCIW_SRC = FOOTBALL_ROOT / "CCIW Buddah Report" / "output_carroll" / "Carroll_Football_AllTime.xlsx"
NATIONAL_SRC = FOOTBALL_ROOT / "National Buddah Report" / "CCIW_D3_Football_Stats" / "Carroll" / "Carroll_AllYears.xlsx"
OUT = Path(__file__).resolve().parent.parent / "data" / "rankings.json"
DOWNLOADS_DIR = Path(__file__).resolve().parent.parent / "data" / "downloads"

CCIW_SHEET_TO_PHASE = {
    "Offense-Team": "offense",
    "Defense-Team": "defense",
    "SpecialTeams-Team": "special_teams",
}

# Ported verbatim from National Game Prep Report/pull_matchup_data.ps1's
# $Metrics array (TeamCat -> Section), the same 50-metric mapping already
# proven correct against a real generated PDF (Weekly Scouting Report). Only
# the TeamCat/Section columns are needed here -- Label/TeamId/IndivCat/IndivId
# are that project's own concern (individual leaders, live NCAA.com fetch IDs).
CATEGORY_SECTION = {
    "Scoring Offense": "offense", "Total Offense": "offense", "Rushing Offense": "offense",
    "Passing Offense": "offense", "Team Passing Efficiency": "offense", "Completion Percentage": "offense",
    "Passing Yards per Completion": "offense", "3rd Down Conversion Pct": "offense",
    "4th Down Conversion Pct": "offense", "Red Zone Offense": "offense", "First Downs Offense": "offense",
    "Time of Possession": "offense", "Turnovers Lost": "offense", "Sacks Allowed": "offense",
    "Tackles for Loss Allowed": "offense",
    "Scoring Defense": "defense", "Total Defense": "defense", "Rushing Defense": "defense",
    "Passing Yards Allowed": "defense", "Team Passing Efficiency Defense": "defense",
    "3rd Down Conversion Pct Defense": "defense", "4th Down Conversion Pct Defense": "defense",
    "Red Zone Defense": "defense", "First Downs Defense": "defense", "Team Sacks": "defense",
    "Team Tackles for Loss": "defense", "Defensive TDs": "defense", "Turnovers Gained": "defense",
    "Net Punting": "special_teams", "Punt Returns": "special_teams", "Kickoff Returns": "special_teams",
    "Punt Return Defense": "special_teams", "Kickoff Return Defense": "special_teams",
    "Blocked Kicks": "special_teams", "Blocked Kicks Allowed": "special_teams",
    "Blocked Punts": "special_teams", "Blocked Punts Allowed": "special_teams",
    "Turnover Margin": "overall", "Winning Percentage": "overall",
    "Fewest Penalties Per Game": "overall", "Fewest Penalty Yards Per Game": "overall",
    # Not in the curated 50-metric list (that script only kept the per-game
    # rate versions) -- same category family, same judgment call extended by
    # this project rather than left unclassified. See module docstring.
    "Fewest Penalties": "overall", "Fewest Penalty Yards": "overall",
    "Fumbles Lost": "offense",       # Carroll's own fumbles lost -- same bucket as "Turnovers Lost"
    "Fumbles Recovered": "defense",  # Carroll recovering a fumble -- same bucket as "Turnovers Gained"
    "Passes Had Intercepted": "offense",  # Carroll QB's own picks thrown -- same bucket as "Turnovers Lost"
    "Passes Intercepted": "defense",      # Carroll defense picking off the opponent -- same bucket as "Turnovers Gained"
}


def sheet_rows(ws):
    headers = [c.value for c in next(ws.iter_rows(min_row=1, max_row=1))]
    for r in ws.iter_rows(min_row=2, values_only=True):
        yield dict(zip(headers, r))


def build_cciw():
    wb = openpyxl.load_workbook(CCIW_SRC, read_only=True, data_only=True)
    rows = []
    for sheet_name, phase in CCIW_SHEET_TO_PHASE.items():
        for r in sheet_rows(wb[sheet_name]):
            if r["Rank"] is None or r["Out Of"] is None:
                continue
            rows.append({
                "phase": phase, "season": str(r["Year"]), "category": r["Category"], "metric": r["Metric"],
                "value": r["Value"], "rank": r["Rank"], "out_of": r["Out Of"],
            })
    wb.close()
    return rows


def build_national():
    wb = openpyxl.load_workbook(NATIONAL_SRC, read_only=True, data_only=True)
    rows = []
    unmapped = set()
    for r in sheet_rows(wb["Team Stats"]):
        phase = CATEGORY_SECTION.get(r["Category"])
        if phase is None:
            unmapped.add(r["Category"])
            continue
        if r["Rank"] is None:
            continue
        rows.append({
            "phase": phase, "season": str(r["Season"]), "category": r["Category"], "stat": r["Stat"],
            "value": r["Value"], "rank": r["Rank"], "context": r["Context"],
        })
    wb.close()
    if unmapped:
        print(f"WARNING: {len(unmapped)} National category(ies) with no phase mapping, skipped: {sorted(unmapped)}")
    return rows


def main():
    cciw_rows = build_cciw()
    national_rows = build_national()

    def distinct(rows, field):
        return sorted({r[field] for r in rows if r.get(field) not in (None, "")}, key=str)

    payload = {
        "generated_from": {"cciw": CCIW_SRC.name, "national": NATIONAL_SRC.name},
        "cciw": {
            "rows": cciw_rows,
            "seasons": distinct(cciw_rows, "season"),
        },
        "national": {
            "rows": national_rows,
            "seasons": distinct(national_rows, "season"),
        },
    }

    OUT.parent.mkdir(exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=0, default=str)

    DOWNLOADS_DIR.mkdir(exist_ok=True, parents=True)
    shutil.copy2(CCIW_SRC, DOWNLOADS_DIR / "CCIW_Rankings_AllTime.xlsx")
    shutil.copy2(NATIONAL_SRC, DOWNLOADS_DIR / "National_Rankings_AllYears.xlsx")

    for phase in ("offense", "defense", "special_teams", "overall"):
        c = sum(1 for r in cciw_rows if r["phase"] == phase)
        n = sum(1 for r in national_rows if r["phase"] == phase)
        print(f"{phase}: cciw={c} national={n}")


if __name__ == "__main__":
    main()
