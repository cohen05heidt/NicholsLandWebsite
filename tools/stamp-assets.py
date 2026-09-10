#!/usr/bin/env python3
"""Re-stamp the ?v= cache busters on style.css and app.js.

Why this exists
---------------
GitHub Pages serves static assets with `Cache-Control: max-age=600`. HTML is
revalidated, but CSS and JS are not — so for ten minutes after a deploy a
returning visitor runs the NEW markup against their CACHED old stylesheet and
script. New features render as unstyled, inert stubs, then start working on
their own a few minutes later. That is a miserable thing to debug, and it
looks exactly like "the deploy didn't work".

Appending ?v=<hash of the file> makes a changed file a different URL, so the
browser has to fetch it. The hash is content-based rather than a timestamp:
a deploy that doesn't touch the CSS keeps the same URL and stays cached.

Run this after editing assets/css/style.css or assets/js/app.js, before
committing. Safe to run repeatedly — if nothing changed, nothing is rewritten.
"""
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ["index.html", "properties.html"]
ASSETS = {
    "css": (ROOT / "assets/css/style.css", r'href="assets/css/style\.css(?:\?v=[a-f0-9]+)?"',
            'href="assets/css/style.css?v={}"'),
    "js":  (ROOT / "assets/js/app.js",     r'src="assets/js/app\.js(?:\?v=[a-f0-9]+)?"',
            'src="assets/js/app.js?v={}"'),
}


def short_hash(path: Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()[:8]


def main() -> int:
    missing = [p for p, _, _ in ASSETS.values() if not p.exists()]
    if missing:
        print("Cannot stamp — asset not found:", *missing, sep="\n  ")
        return 1

    versions = {k: short_hash(p) for k, (p, _, _) in ASSETS.items()}
    changed = False

    for name in PAGES:
        page = ROOT / name
        if not page.exists():
            print(f"skip {name} (not found)")
            continue
        original = page.read_text(encoding="utf-8")
        text = original
        for key, (_, pattern, template) in ASSETS.items():
            text, n = re.subn(pattern, template.format(versions[key]), text)
            if n == 0:
                print(f"  warning: no {key} reference matched in {name}")
        if text != original:
            page.write_text(text, encoding="utf-8")
            changed = True
            print(f"stamped {name}")
        else:
            print(f"{name} already current")

    print(f"\nstyle.css -> {versions['css']}\napp.js    -> {versions['js']}")
    if not changed:
        print("Nothing to do; the pages already point at these versions.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
