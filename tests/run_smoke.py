"""
Runs tests/smoke.html in a headless browser at phone, tablet and desktop width, prints every failing
view, and exits non-zero if any failed. This is what the GitHub Action (.github/workflows/smoke.yml)
runs on every push; you can run it yourself too:

    pip install playwright
    playwright install chromium          # once
    python tests/run_smoke.py

Set SMOKE_BROWSER_CHANNEL=msedge (or chrome) to use a browser that is already installed instead of
downloading Chromium. Set SMOKE_WIDTHS=390 to run just one width, and SMOKE_SCHEME=dark to run in the dark theme.
"""

import os
import socket
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
WIDTHS = [int(w) for w in os.environ.get("SMOKE_WIDTHS", "320,390,820,1280").split(",")]
RUN_TIMEOUT_MS = 8 * 60 * 1000  # one width takes about a minute and a half; leave plenty of room


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main():
    port = free_port()
    server = subprocess.Popen([sys.executable, str(ROOT / "scripts" / "serve.py"), str(port)], cwd=ROOT,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    failed_total = 0
    try:
        for _ in range(50):  # wait for the server to accept connections
            try:
                socket.create_connection(("127.0.0.1", port), timeout=0.2).close()
                break
            except OSError:
                time.sleep(0.1)
        with sync_playwright() as p:
            channel = os.environ.get("SMOKE_BROWSER_CHANNEL") or None
            for width in WIDTHS:
                # A fresh browser per width keeps memory flat (the page loads ~70 documents and 8 MB of JSON
                # each pass), and a crashed tab gets one retry rather than failing the whole run.
                for attempt in (1, 2):
                    browser = p.chromium.launch(channel=channel)
                    try:
                        page = browser.new_page(color_scheme=os.environ.get("SMOKE_SCHEME") or "light")
                        page.goto(f"http://127.0.0.1:{port}/tests/smoke.html?width={width}&autorun=1")
                        page.wait_for_function("window.__smoke && window.__smoke.done", timeout=RUN_TIMEOUT_MS)
                        result = page.evaluate("window.__smoke")
                        break
                    except Exception as err:  # noqa: BLE001 -- browser/tab crash: retry once, then fail loudly
                        print(f"[retry] {width}px attempt {attempt}: {str(err).splitlines()[0]}")
                        if attempt == 2:
                            raise
                    finally:
                        browser.close()
                status = "FAIL" if result["failures"] else "ok"
                print(f"[{status}] {width}px: {result['checks'] - result['failures']}/{result['checks']} views passed")
                for line in result["failed"]:
                    print(f"    {line}")
                failed_total += result["failures"]
    finally:
        server.terminate()
    if failed_total:
        print(f"\n{failed_total} view check(s) failed.")
        sys.exit(1)
    print("\nAll views passed at every width.")


if __name__ == "__main__":
    main()
