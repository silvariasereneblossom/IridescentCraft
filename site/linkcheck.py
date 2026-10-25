#!/usr/bin/env python3
"""Check every internal link of the built site, including #fragments.

    python site/linkcheck.py site/_build                       # check the files on disk
    python site/linkcheck.py --url http://127.0.0.1:8000/   # crawl a running server

File mode reads every .html file in the build and resolves each href/src
(relative, or absolute under the path of "site_url" in pages.json) to a file. URL mode
starts at the given page, follows every link under that URL prefix, and
reports any response that is not 200. Both modes check that a #fragment
names an element id on the target page. External links are listed but not
fetched. Exit status is 1 when anything is broken.

Python 3.9+ standard library only.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from collections import deque
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urldefrag, urljoin, urlsplit

HERE = Path(__file__).resolve().parent


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links: list[str] = []
        self.ids: set[str] = set()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            self.ids.add(a["id"])
        if tag == "a" and a.get("name"):
            self.ids.add(a["name"])
        for key in ("href", "src"):
            if a.get(key) and tag in ("a", "link", "script", "img", "source", "iframe"):
                self.links.append(a[key])


def parse(text: str) -> LinkParser:
    p = LinkParser()
    p.feed(text)
    return p


def check_files(build: Path, base_path: str) -> tuple[list[str], int, int, set[str]]:
    build = build.resolve()
    pages = {p: parse(p.read_text(encoding="utf-8")) for p in build.rglob("*.html")}
    broken: list[str] = []
    external: set[str] = set()
    checked = 0
    reachable: set[Path] = set()
    for page, parsed in pages.items():
        for link in parsed.links:
            parts = urlsplit(link)
            if parts.scheme in ("http", "https", "mailto") or link.startswith("//"):
                external.add(link)
                continue
            if parts.scheme:
                broken.append(f"{page.relative_to(build)}: unsupported scheme {link}")
                continue
            checked += 1
            path = unquote(parts.path)
            if path.startswith("/"):
                if not path.startswith(base_path):
                    broken.append(f"{page.relative_to(build)}: {link} is outside the base path {base_path}")
                    continue
                target = build / path[len(base_path):]
            elif path == "":
                target = page
            else:
                target = (page.parent / path)
            if path.endswith("/") or path == "" and target.is_dir():
                target = target / "index.html"
            elif target.is_dir():
                target = target / "index.html"
            target = target.resolve()
            try:
                target.relative_to(build)
            except ValueError:
                broken.append(f"{page.relative_to(build)}: {link} points outside the site")
                continue
            if not target.is_file():
                broken.append(f"{page.relative_to(build)}: {link} -> missing {target.relative_to(build)}")
                continue
            if page.name != "404.html":
                reachable.add(target)
            frag = unquote(parts.fragment)
            if frag and target.suffix == ".html":
                ids = pages[target].ids if target in pages else parse(target.read_text(encoding="utf-8")).ids
                if frag not in ids and frag != "top":
                    broken.append(f"{page.relative_to(build)}: {link} -> no element with id '{frag}'")
    orphans = sorted(str(p.relative_to(build)) for p in pages
                     if p not in reachable and p.name != "404.html" and p != build / "index.html")
    for o in orphans:
        broken.append(f"{o}: page is not linked from any other page")
    return broken, checked, len(pages), external


def fetch(url: str) -> tuple[int, str, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "icraft-linkcheck"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            ctype = resp.headers.get("Content-Type", "")
            data = resp.read()
            return resp.status, ctype, data.decode("utf-8", "replace") if "html" in ctype else ""
    except urllib.error.HTTPError as err:
        return err.code, "", ""


def check_url(start: str) -> tuple[list[str], int, int, set[str]]:
    prefix = start if start.endswith("/") else start.rsplit("/", 1)[0] + "/"
    base_path, netloc = urlsplit(prefix).path, urlsplit(prefix).netloc
    queue = deque([start])
    seen: dict[str, tuple[int, set[str] | None]] = {}
    wanted: list[tuple[str, str, str]] = []  # (from, url, fragment)
    external: set[str] = set()
    broken: list[str] = []
    while queue:
        url = queue.popleft()
        if url in seen:
            continue
        status, ctype, text = fetch(url)
        ids = None
        if status == 200 and "html" in ctype:
            parsed = parse(text)
            ids = parsed.ids
            for link in parsed.links:
                full, frag = urldefrag(urljoin(url, link))
                if not full.startswith(("http://", "https://")):
                    continue
                parts = urlsplit(full)
                if parts.netloc != netloc or not parts.path.startswith(base_path):
                    external.add(full)
                    continue
                wanted.append((url, full, frag))
                if full not in seen:
                    queue.append(full)
        seen[url] = (status, ids)
    for src, full, frag in wanted:
        status, ids = seen.get(full, (0, None))
        if status != 200:
            broken.append(f"{src}: {full} -> HTTP {status}")
        elif frag and ids is not None and unquote(frag) not in ids:
            broken.append(f"{src}: {full}#{frag} -> no element with id '{unquote(frag)}'")
    pages = sum(1 for s, ids in seen.values() if ids is not None)
    return sorted(set(broken)), len(wanted), pages, external


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("build", nargs="?", type=Path, default=HERE / "_build")
    ap.add_argument("--url", help="crawl a running server from this URL instead of reading files")
    ap.add_argument("--config", type=Path, default=HERE / "pages.json")
    ap.add_argument("--list-external", action="store_true", help="print the external links found")
    args = ap.parse_args()
    if args.url:
        broken, checked, pages, external = check_url(args.url)
    else:
        cfg = json.loads(args.config.read_text(encoding="utf-8"))
        base = urlsplit(cfg.get("site_url", "/")).path or "/"
        broken, checked, pages, external = check_files(args.build, base)
    print(f"Pages: {pages}  internal links checked: {checked}  external links (not fetched): {len(external)}")
    if args.list_external:
        for e in sorted(external):
            print("  external:", e)
    if broken:
        print(f"BROKEN ({len(broken)}):")
        for b in broken:
            print("  " + b)
        return 1
    print("No broken internal links.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
