"""
Local dev server for the static site: like `python -m http.server`, but sends
Cache-Control: no-store so edits to css/js/data show up on a plain reload.

    python scripts/serve.py [port]        # serves the site root (default 8731)
"""

import functools
import http.server
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8731
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("", port), handler) as srv:
        print(f"Serving {ROOT} on http://localhost:{port}")
        srv.serve_forever()
