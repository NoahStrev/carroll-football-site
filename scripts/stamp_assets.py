"""
Puts a version on every script and stylesheet the pages load: <script src="../js/shell.js?v=3fa91c2b">.

GitHub Pages lets a browser keep a file for 10 minutes. Without a version in the address, a visitor who opens the
site just after an update can get a new page with an old script (or the reverse) and a half-working view. With
`?v=<hash of the file's content>` the address changes whenever the file does, so a page always asks for exactly the
version it was written against, and an unchanged file keeps its cached copy.

The hash is of the file with line endings normalised, so it is the same on Windows and in the GitHub Action.

    python scripts/stamp_assets.py            # rewrite the pages (refresh_all.py does this too)
    python scripts/stamp_assets.py --check    # exit 1 if any page is out of date (the GitHub Action runs this)
"""

import hashlib
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
PAGES = sorted((SITE / "dashboards").glob("*.html")) + [SITE / "index.html"]
# <script src="..."> and <link rel="stylesheet" href="..."> pointing at a local file
ASSET = re.compile(r'(<script src="|<link rel="stylesheet" href=")([^"?]+)(\?v=[0-9a-f]+)?(")')


def digest(path):
    data = path.read_bytes().replace(b"\r\n", b"\n")
    return hashlib.sha1(data).hexdigest()[:8]


def stamp(page):
    text = page.read_text(encoding="utf-8")

    def sub(m):
        prefix, url, _old, quote = m.groups()
        if url.startswith(("http:", "https:", "//")):
            return m.group(0)
        target = (page.parent / url).resolve()
        if not target.exists():
            raise SystemExit(f"{page.name}: {url} does not exist")
        return f"{prefix}{url}?v={digest(target)}{quote}"

    return ASSET.sub(sub, text)


def main():
    check = "--check" in sys.argv
    stale = []
    for page in PAGES:
        old = page.read_text(encoding="utf-8")
        new = stamp(page)
        if new != old:
            stale.append(page.name)
            if not check:
                page.write_text(new, encoding="utf-8", newline="\n")
    if check and stale:
        print(f"stamp_assets: out of date: {', '.join(stale)} -- run python scripts/stamp_assets.py")
        sys.exit(1)
    print(f"stamp_assets: {'all pages current' if not stale else 'updated ' + ', '.join(stale)}")


if __name__ == "__main__":
    main()
