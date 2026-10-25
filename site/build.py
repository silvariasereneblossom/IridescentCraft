#!/usr/bin/env python3
"""Build the IridescentCraft website from the GitHub wiki.

    python site/build.py --wiki path/to/IridescentCraft.wiki [--out site/_build]

The pages to publish are listed in site/pages.json ("include"). The
Tester-Installation-Guide becomes index.html; every other page is written
to <Page-Name>/index.html. The output is plain static files meant to be
served from a folder root by any web server (default document index.html,
404.html for missing URLs). Links between pages are relative; only 404.html,
which a server returns at any depth, uses the absolute base path: the path
of "site_url" in pages.json ("/" for https://iridescentcraft.sereneblossom.gay/).
build.json at the root records the wiki commit and the build time.

Local preview:

    python site/build.py --wiki ../IridescentCraft.wiki
    python site/build.py --serve      # http://localhost:8000/, with 404.html for missing pages

Python 3.9+ standard library only.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import html
import json
import os

import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote, urljoin, urlsplit

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from mdrender import Renderer, plain_text  # noqa: E402

WIKI_SPECIAL = {"_Sidebar", "_Footer", "_Header"}


# ---------------------------------------------------------------------------
# Wiki discovery
# ---------------------------------------------------------------------------
def write_lf(path: Path, text: str, encoding: str = "utf-8") -> None:
    """Write text with LF line endings on every OS, so builds are byte-identical."""
    with open(path, "w", encoding=encoding, newline="\n") as fh:
        fh.write(text)


def git_out(repo: Path, *args: str) -> str:
    try:
        return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True,
                              check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return ""


def page_dates(wiki: Path) -> dict[str, str]:
    """Last commit date (YYYY-MM-DD) per wiki file, from one `git log` pass."""
    out = git_out(wiki, "log", "--format=@%cs", "--name-only", "--no-renames")
    dates: dict[str, str] = {}
    current = ""
    for line in out.splitlines():
        if line.startswith("@"):
            current = line[1:]
        elif line.strip() and line not in dates:
            dates[line] = current
    return dates


class Site:
    def __init__(self, cfg: dict, wiki: Path, out: Path, repo_root: Path):
        self.cfg = cfg
        self.wiki = wiki
        self.out = out
        self.repo = cfg["repo"]
        self.site_url = cfg["site_url"].rstrip("/") + "/"
        self.base_path = urlsplit(self.site_url).path or "/"
        self.wiki_url = f"https://github.com/{self.repo}/wiki"
        self.all_pages = {p.stem: p for p in sorted(wiki.glob("*.md")) if p.stem not in WIKI_SPECIAL}
        self.lower_map = {k.lower(): k for k in self.all_pages}
        self.include: list[str] = []
        self.problems: list[str] = []
        for name in cfg["include"]:
            if name in self.all_pages:
                self.include.append(name)
            else:
                self.problems.append(f"pages.json lists '{name}', which is not a page of the wiki")
        self.index_page = cfg["index_page"]
        if self.index_page not in self.include:
            raise SystemExit(f"index_page '{self.index_page}' must be in the include list")
        self.excluded = [p for p in self.all_pages if p not in self.include]
        self.dates = page_dates(wiki)
        self.wiki_commit = git_out(wiki, "rev-parse", "HEAD")
        self.wiki_sha = self.wiki_commit[:7]
        self.wiki_commit_date = git_out(wiki, "log", "-1", "--format=%cI")
        self.sources = self._load_sources(repo_root / cfg.get("source_manifest", ""))
        # Report data
        self.excluded_links: dict[str, set[str]] = {}
        self.unresolved: dict[str, set[str]] = {}
        self.copied_files: set[str] = set()
        self.titles: dict[str, str] = {}
        self.headings: dict[str, list] = {}

    @staticmethod
    def _load_sources(manifest: Path) -> dict[str, str]:
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
        return {Path(f["dst"]).stem: f["src"] for f in data.get("files", []) if "dst" in f and "src" in f}

    # -- URLs ------------------------------------------------------------
    def page_path(self, page: str) -> str:
        """Output path of a page, relative to the site root ('' = root)."""
        return "" if page == self.index_page else f"{page}/"

    @staticmethod
    def root_prefix(page: str | None, index_page: str) -> str:
        return "" if page == index_page else "../"

    def href(self, from_page: str, to_page: str, fragment: str = "") -> str:
        rel = self.root_prefix(from_page, self.index_page) + self.page_path(to_page)
        if not rel:
            rel = "./"
        return rel + (f"#{fragment}" if fragment else "")

    def wiki_page_url(self, page: str, fragment: str = "") -> str:
        url = f"{self.wiki_url}/{quote(page)}" if page != "Home" else self.wiki_url
        return url + (f"#{fragment}" if fragment else "")

    def canonical(self, name: str) -> str | None:
        name = name.strip().replace(" ", "-")
        if name in self.all_pages:
            return name
        return self.lower_map.get(name.lower())

    # -- Link resolution ---------------------------------------------------
    def resolve_page_link(self, from_page: str, name: str, fragment: str, raw: str):
        page = self.canonical(name)
        if page is None:
            return None
        if page in self.include:
            return {"href": self.href(from_page, page, fragment)}
        self.excluded_links.setdefault(from_page, set()).add(page)
        if self.cfg.get("excluded_links", "wiki") == "text":
            return None
        return {"href": self.wiki_page_url(page, fragment), "class": "wiki-ext", "external": True,
                "title": "Not mirrored on this site: opens the page on the GitHub wiki"}

    def make_resolver(self, from_page: str):
        wiki_prefix = f"github.com/{self.repo}/wiki".lower()

        def resolve_link(href: str):
            href = href.strip()
            if not href:
                return None
            if href.startswith("#"):
                return {"href": href}
            parts = urlsplit(href)
            scheme = parts.scheme.lower()
            if scheme in ("http", "https"):
                full = (parts.netloc + parts.path).lower().rstrip("/")
                if full == wiki_prefix or full.startswith(wiki_prefix + "/"):
                    rest = parts.path.rstrip("/").split("/wiki", 1)[1].lstrip("/") or "Home"
                    if "/" not in rest:
                        res = self.resolve_page_link(from_page, rest, parts.fragment, href)
                        if res:
                            return res
                return {"href": href, "external": True}
            if scheme == "mailto":
                return {"href": href}
            if scheme:
                self.unresolved.setdefault(from_page, set()).add(href)
                return None
            path = parts.path
            if path.startswith("./"):
                path = path[2:]
            if path.startswith("/"):
                path = path.split("/wiki/", 1)[-1] if "/wiki/" in path else path.lstrip("/")
            name = path[:-3] if path.lower().endswith(".md") else path
            if "/" not in name:
                res = self.resolve_page_link(from_page, name, parts.fragment, href)
                if res:
                    return res
                if self.canonical(name):  # excluded and rendered as text
                    return None
            asset = self.copy_wiki_file(path)
            if asset:
                return {"href": self.root_prefix(from_page, self.index_page) + asset}
            self.unresolved.setdefault(from_page, set()).add(href)
            return None

        def resolve_wikilink(target: str):
            name, _, fragment = target.partition("#")
            if not name:
                return {"href": f"#{fragment}"}
            if re.match(r"^[a-z]+://", name, re.I):
                return {"href": target, "external": True}
            res = self.resolve_page_link(from_page, name, fragment, target)
            if res is None and not self.canonical(name):
                asset = self.copy_wiki_file(name)
                if asset:
                    return {"href": self.root_prefix(from_page, self.index_page) + asset}
                self.unresolved.setdefault(from_page, set()).add(f"[[{target}]]")
            return res

        def resolve_image(src: str):
            parts = urlsplit(src)
            if parts.scheme:
                return src
            asset = self.copy_wiki_file(parts.path)
            if asset:
                return self.root_prefix(from_page, self.index_page) + asset
            self.unresolved.setdefault(from_page, set()).add(src)
            return src

        return resolve_link, resolve_wikilink, resolve_image

    def copy_wiki_file(self, path: str) -> str | None:
        """Copy a non-page file (image, attachment) from the wiki; return its site path."""
        path = path.split("?", 1)[0].lstrip("/")
        if not path or path.lower().endswith(".md"):
            return None
        src = (self.wiki / path).resolve()
        try:
            src.relative_to(self.wiki.resolve())
        except ValueError:
            return None
        if not src.is_file() or ".git" in src.parts:
            return None
        rel = "wiki-files/" + src.relative_to(self.wiki.resolve()).as_posix()
        dst = self.out / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        self.copied_files.add(rel)
        return quote(rel)

    # -- Navigation ----------------------------------------------------------
    def nav_groups(self) -> list[tuple[str | None, list[str]]]:
        groups: list[tuple[str | None, list[str]]] = [(None, [])]
        side = self.wiki / "_Sidebar.md"
        if side.exists():
            for line in side.read_text(encoding="utf-8").splitlines():
                s = line.strip()
                g = re.match(r"^\*\*(.+?)\*\*$", s)
                if g:
                    groups.append((g.group(1), []))
                    continue
                for m in re.finditer(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", s):
                    page = self.canonical(m.group(2) or m.group(1))
                    if page:
                        groups[-1][1].append(page)
        for label, pages in self.cfg.get("nav_extra", {}).items():
            target = next((g for g in groups if g[0] == label), None)
            if target is None:
                target = (label, [])
                groups.append(target)
            target[1].extend(p for p in pages if p in self.all_pages)
        placed = {p for _, ps in groups for p in ps}
        rest = [p for p in self.include if p not in placed]
        if rest:
            groups.append(("More", rest))
        # Filter to published pages; the index page always leads.
        out = []
        for label, pages in groups:
            seen = []
            for p in pages:
                if p in self.include and p not in seen:
                    seen.append(p)
            if seen:
                out.append((label, seen))
        return out

    def nav_label(self, page: str) -> str:
        return self.cfg.get("nav_labels", {}).get(page, page.replace("-", " "))

    def render_nav(self, current: str) -> str:
        parts = []
        for label, pages in self.nav_groups():
            parts.append('<div class="nav-group">')
            if label:
                parts.append(f'<p class="nav-label">{html.escape(label)}</p>')
            parts.append("<ul>")
            for p in pages:
                cur = ' aria-current="page"' if p == current else ""
                parts.append(f'<li><a href="{html.escape(self.href(current, p))}"{cur}>'
                             f"{html.escape(self.nav_label(p))}</a></li>")
            parts.append("</ul></div>")
        parts.append('<div class="nav-group nav-out"><p class="nav-label">Elsewhere</p><ul>'
                     f'<li><a href="{self.wiki_url}" rel="noopener">GitHub wiki</a></li>'
                     f'<li><a href="https://github.com/{self.repo}" rel="noopener">Repository</a></li>'
                     f'<li><a href="https://github.com/{self.repo}/issues" rel="noopener">Report an issue</a></li>'
                     "</ul></div>")
        return "\n".join(parts)


# ---------------------------------------------------------------------------
# Page rendering
# ---------------------------------------------------------------------------
ICON_MENU = ('<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" '
             'stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>')


def toc_html(headings) -> str:
    h2 = [(t, s) for lvl, t, s in headings if lvl == 2 and t != "Notes"]
    if len(h2) < 4:
        return ""
    items = "".join(f'<li><a href="#{html.escape(s)}">{html.escape(t)}</a></li>' for t, s in h2)
    return f'<details class="toc"><summary>On this page ({len(h2)} sections)</summary><ol>{items}</ol></details>'


def first_paragraph(body: str) -> str:
    m = re.search(r"<p>(.*?)</p>", body, re.S)
    if not m:
        return ""
    text = " ".join(plain_text(m.group(1)).split())
    return text if len(text) <= 160 else text[:157].rsplit(" ", 1)[0] + "..."


def asset_version(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:10]


def page_html(site: Site, page: str | None, title: str, body: str, *, root: str, nav: str,
              description: str, foot: str, versions: dict[str, str], noindex: bool = False) -> str:
    cfg = site.cfg
    e = html.escape
    v = versions
    robots = '<meta name="robots" content="noindex">\n' if noindex else ""
    if page is not None:
        url = urljoin(site.site_url, site.page_path(page))
        robots += (f'<link rel="canonical" href="{e(url)}">\n'
                   '<meta property="og:type" content="website">\n'
                   f'<meta property="og:site_name" content="{e(cfg["site_title"])}">\n'
                   f'<meta property="og:title" content="{e(title)}">\n'
                   f'<meta property="og:description" content="{e(description)}">\n'
                   f'<meta property="og:url" content="{e(url)}">\n'
                   '<meta name="twitter:card" content="summary">\n')
    doc_title = cfg["site_title"] if title == cfg["site_title"] else f"{title} · {cfg['site_title']}"
    return f"""<!doctype html>
<html lang="en" data-root="{e(root)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="color-scheme" content="dark light">
{robots}<title>{e(doc_title)}</title>
<meta name="description" content="{e(description)}">
<link rel="icon" href="{root}assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="{root}assets/style.css?v={v['style.css']}">
<script src="{root}assets/search-index.js?v={v['search-index.js']}" defer></script>
<script src="{root}assets/site.js?v={v['site.js']}" defer></script>
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="topbar">
  <a class="nav-toggle" href="#sidebar" role="button" aria-controls="sidebar" aria-expanded="false" aria-label="Show navigation">{ICON_MENU}</a>
  <a class="brand" href="{root or './'}"><span class="mark" aria-hidden="true"></span><span class="wordmark">{e(cfg['site_title'])}</span><span class="tagline">{e(cfg['tagline'])}</span></a>
  <div class="search" role="search">
    <input type="search" id="search" placeholder="Search pages and headings" aria-label="Search pages and headings" autocomplete="off" spellcheck="false" aria-controls="search-results" aria-expanded="false">
    <kbd class="search-key" aria-hidden="true">/</kbd>
    <ul id="search-results" class="search-results" role="listbox" aria-label="Search results" hidden></ul>
  </div>
</header>
<div class="layout">
  <nav id="sidebar" class="sidebar" aria-label="Pages">
{nav}
  </nav>
  <a class="scrim" href="#content" tabindex="-1" aria-hidden="true"></a>
  <main id="content" class="content" tabindex="-1">
    <article class="prose">
{body}
    </article>
    <footer class="page-foot">{foot}</footer>
  </main>
</div>
</body>
</html>
"""


def page_footer(site: Site, page: str) -> str:
    e = html.escape
    date = site.dates.get(site.all_pages[page].name, "")
    bits = []
    if date:
        bits.append(f"Last updated <time datetime=\"{e(date)}\">{e(date)}</time>")
    bits.append(f'<a href="{e(site.wiki_page_url(page))}" rel="noopener">View on the GitHub wiki</a>')
    src = site.sources.get(page)
    if src:
        bits.append(f'<a href="https://github.com/{site.repo}/edit/main/{quote(src)}" rel="noopener" '
                    f'title="The wiki is generated from this file in the repository; edits made on the wiki itself are overwritten">Edit on GitHub</a>')
    else:
        bits.append(f'<a href="{e(site.wiki_page_url(page))}/_edit" rel="noopener">Edit on GitHub wiki</a>')
    # Nothing build-specific (time, wiki commit) goes into the pages, so an
    # unchanged set of pages gives byte-identical output; build.json has those.
    return ("<p>" + " · ".join(bits) + "</p>"
            f'<p class="built">A mirror of the player-facing pages of the '
            f'<a href="{site.wiki_url}" rel="noopener">IridescentCraft wiki</a>.</p>')


def build(cfg: dict, wiki: Path, out: Path, repo_root: Path) -> Site:
    if out.exists():
        shutil.rmtree(out)
    (out / "assets").mkdir(parents=True)
    site = Site(cfg, wiki, out, repo_root)

    rendered: dict[str, str] = {}
    for page in site.include:
        r_link, r_wiki, r_img = site.make_resolver(page)
        r = Renderer(resolve_link=r_link, resolve_wikilink=r_wiki, resolve_image=r_img)
        body = r.render(site.all_pages[page].read_text(encoding="utf-8"))
        h1 = next((t for lvl, t, s in r.headings if lvl == 1), page.replace("-", " "))
        site.titles[page] = h1
        site.headings[page] = r.headings
        toc = toc_html(r.headings)
        if toc:
            body = body.replace("</h1>", "</h1>\n" + toc, 1) if "</h1>" in body else toc + body
        rendered[page] = body

    # Search index: page titles + h2/h3 headings.
    index = []
    for page in site.include:
        url = site.page_path(page)
        index.append({"t": site.titles[page], "u": url or "./", "p": site.nav_label(page), "k": 0})
        for lvl, text, slug in site.headings[page]:
            if lvl in (2, 3) and text != "Notes":
                index.append({"t": text, "u": f"{url}#{slug}", "p": site.titles[page], "k": lvl})
    write_lf(out / "assets" / "search-index.js", 
        "window.SEARCH_INDEX=" + json.dumps(index, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8")

    # Static assets
    for f in (HERE / "assets").iterdir():
        if f.is_file():
            shutil.copy2(f, out / "assets" / f.name)
    versions = {name: asset_version(out / "assets" / name) for name in ("style.css", "site.js", "search-index.js")}

    for page in site.include:
        root = Site.root_prefix(page, site.index_page)
        doc = page_html(site, page, site.titles[page], rendered[page], root=root,
                        nav=site.render_nav(page), description=first_paragraph(rendered[page]),
                        foot=page_footer(site, page), versions=versions)
        target = out / site.page_path(page) / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        write_lf(target, doc, encoding="utf-8")

    # 404 page: served at arbitrary depths, so it uses the absolute base path.
    base = site.base_path
    nav404 = site.render_nav("__404__").replace('href="../', f'href="{base}')
    body404 = ('<h1 id="not-found">Page not found</h1>'
               '<p>That page is not on this site. It may be a wiki page that is not mirrored here: '
               f'try the <a href="{site.wiki_url}" rel="noopener">GitHub wiki</a>, or start from the '
               f'<a href="{base}">installation guide</a>.</p>')
    write_lf(out / "404.html", 
        page_html(site, None, "Page not found", body404, root=base, nav=nav404, description="Page not found",
                  foot="", versions=versions, noindex=True), encoding="utf-8")
    generator = os.environ.get("GITHUB_SHA") or git_out(repo_root, "rev-parse", "HEAD")
    build_info = {
        "site_url": site.site_url,
        "wiki_commit": site.wiki_commit,
        "wiki_commit_date": site.wiki_commit_date,
        "generator_commit": generator,
        "built_at": _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "pages": site.include,
    }
    write_lf(out / "build.json", json.dumps(build_info, indent=2) + "\n", encoding="utf-8")
    return site


def report(site: Site) -> str:
    lines = ["## Wiki site build", ""]
    lines.append(f"Published {len(site.include)} pages for {site.site_url} from wiki commit `{site.wiki_sha or 'unknown'}`: "
                 + ", ".join(site.include))
    lines.append("")
    lines.append("Not published: " + (", ".join(site.excluded) or "none"))
    lines.append("")
    if site.excluded_links:
        mode = site.cfg.get("excluded_links", "wiki")
        how = "linked to the GitHub wiki" if mode == "wiki" else "shown as plain text"
        lines.append(f"Links from published pages to unpublished pages ({how}):")
        for page in site.include:
            if page in site.excluded_links:
                lines.append(f"- {page} -> " + ", ".join(sorted(site.excluded_links[page])))
        lines.append("")
    if site.unresolved:
        lines.append("Links that match no wiki page or file (shown as plain text):")
        for page, hrefs in sorted(site.unresolved.items()):
            lines.append(f"- {page}: " + ", ".join(sorted(hrefs)))
        lines.append("")
    for p in site.problems:
        lines.append(f"WARNING: {p}")
    return "\n".join(lines) + "\n"


def serve(out: Path, base: str, port: int) -> None:
    import functools
    import http.server
    if base.strip("/"):
        # A sub-path deployment: put the build under _serve/<base>/.
        serve_root = HERE / "_serve"
        if serve_root.exists():
            shutil.rmtree(serve_root)
        shutil.copytree(out, serve_root / base.strip("/"))
        shutil.copy2(out / "404.html", serve_root / "404.html")
    else:
        serve_root = out

    class Handler(http.server.SimpleHTTPRequestHandler):
        def send_error(self, code, message=None, explain=None):
            if code == 404:
                body = (serve_root / "404.html").read_bytes()
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(body)
                return
            super().send_error(code, message, explain)

    handler = functools.partial(Handler, directory=str(serve_root))
    print(f"Serving http://localhost:{port}{base}  (Ctrl+C to stop)")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--wiki", type=Path, help="path to a clone of the IridescentCraft.wiki repository")
    ap.add_argument("--out", type=Path, default=HERE / "_build")
    ap.add_argument("--config", type=Path, default=HERE / "pages.json")
    ap.add_argument("--repo-root", type=Path, default=HERE.parent, help="main repo root (for the wiki source manifest)")
    ap.add_argument("--report", type=Path, help="also write the build report (Markdown) to this file")
    ap.add_argument("--strict", action="store_true", help="exit 1 when a link matches no wiki page or file")
    ap.add_argument("--serve", action="store_true", help="serve the built site under its base path")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()
    cfg = json.loads(args.config.read_text(encoding="utf-8"))

    if args.wiki:
        site = build(cfg, args.wiki.resolve(), args.out.resolve(), args.repo_root.resolve())
        text = report(site)
        print(text)
        if args.report:
            with open(args.report, "a", encoding="utf-8") as fh:
                fh.write(text)
        if args.strict and (site.unresolved or site.problems):
            print("Strict mode: unresolved links or config problems (see above).", file=sys.stderr)
            return 1
    elif not args.serve:
        ap.error("--wiki is required (or --serve to serve an existing build)")
    if args.serve:
        serve(args.out.resolve(), urlsplit(cfg["site_url"]).path or "/", args.port)
    return 0


if __name__ == "__main__":
    sys.exit(main())
