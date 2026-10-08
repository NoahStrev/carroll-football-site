"""
Runs the axe accessibility engine (the same rules Lighthouse uses) on every page and every tab, in the light and the dark
theme, and exits non-zero if anything is flagged: colour contrast, missing landmarks or labels, unnamed controls, scroll
areas the keyboard cannot reach. The GitHub Action runs it on every push.

    pip install playwright axe-playwright-python     # the second package just carries axe.min.js
    playwright install chromium                      # once
    python tests/run_axe.py

Set SMOKE_BROWSER_CHANNEL=msedge (or chrome) to use an installed browser, as with run_smoke.py.
"""

import os
import socket
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path

import axe_playwright_python
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
AXE = (Path(axe_playwright_python.__file__).parent / "axe.min.js").read_text(encoding="utf-8")
PAGES = ["home", "offense", "defense", "special-teams", "opponent-scouting", "rankings", "lifting-strength", "players", "glossary", "updates"]


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main():
    port = free_port()
    server = subprocess.Popen([sys.executable, str(ROOT / "scripts" / "serve.py"), str(port)], cwd=ROOT,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    found = defaultdict(lambda: {"nodes": 0, "help": "", "impact": "", "where": set(), "sample": ""})
    views = 0
    try:
        for _ in range(50):
            try:
                socket.create_connection(("127.0.0.1", port), timeout=0.2).close()
                break
            except OSError:
                time.sleep(0.1)
        with sync_playwright() as p:
            browser = p.chromium.launch(channel=os.environ.get("SMOKE_BROWSER_CHANNEL") or None)
            for scheme in ("light", "dark"):
                ctx = browser.new_context(viewport={"width": 1280, "height": 900}, color_scheme=scheme)
                for name in PAGES:
                    page = ctx.new_page()
                    page.goto(f"http://127.0.0.1:{port}/dashboards/{name}.html")
                    page.wait_for_timeout(1200)
                    tabs = page.eval_on_selector_all("#site-tabs .tabbtn", "els => els.map(e => e.dataset.tab)") or [None]
                    for tab in tabs:
                        if tab:
                            page.evaluate(f"location.hash = '{tab}'")
                            page.wait_for_timeout(500)
                        page.evaluate(AXE)
                        result = page.evaluate("axe.run(document, {resultTypes: ['violations']})")
                        views += 1
                        for v in result["violations"]:
                            f = found[(scheme, v["id"])]
                            f["nodes"] += len(v["nodes"])
                            f["help"], f["impact"] = v["help"], v["impact"]
                            f["where"].add(f"{name}#{tab}")
                            if not f["sample"]:
                                f["sample"] = v["nodes"][0]["html"][:150]
                    page.close()
                ctx.close()
            browser.close()
    finally:
        server.terminate()

    if not found:
        print(f"[ok] axe: no violations in {views} views (light and dark)")
        return
    for (scheme, rule), f in sorted(found.items()):
        print(f"[{f['impact']}] {scheme} {rule}: {f['help']} -- {f['nodes']} node(s) on {len(f['where'])} view(s), e.g. {f['sample']}")
        print(f"    where: {sorted(f['where'])[:6]}")
    sys.exit(1)


if __name__ == "__main__":
    main()
