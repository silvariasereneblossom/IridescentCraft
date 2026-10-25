#!/usr/bin/env python3
"""Build the IridescentCraft website from the wiki pages in the repository.

    python site/build.py [--out site/_build]          # build (--source is accepted, the default)
    python site/build.py --sync-workflow              # rewrite the repo-file paths in wiki-site.yml
    python site/build.py --serve                      # http://localhost:8000/

The pages are the public wiki's pages, made the way the wiki sync
(.minecraft/tools/sync-wiki.py) makes them from .minecraft/wiki/: the files and
link conversions of .minecraft/tools/wiki-sync-manifest.json, plus the wiki-only
sidebar kept in site/wiki-sidebar.md. Every page is published except the ones
pages.json lists under "exclude"; a link to an excluded page is plain text.

Every link a page makes resolves on the site:
  - to another page: the site page;
  - into the repository (a relative path, or a github.com / raw.githubusercontent.com
    URL of it): a pack file a tester downloads goes to the pack server
    (pack_server + raw/main/<path>, always current) when the path is one the
    pack server serves (pack_paths); any other file is copied into the build:
    files/<path>/ is a page showing it (Markdown rendered, other text as text,
    each with a download link) and files/raw/<path> is the file itself; a folder
    gets a page listing its files plus a zip of them;
  - the repository's issues: the site's own report page (report/).
A link that resolves to nothing fails the build. The site never links to, or
names, the repository: the build fails on any URL of it in what it wrote, and
on any mention of it in the text of the site's own pages (forbidden_phrases).

Each page's date is the last commit that changed its source's text. The output
is plain static files served from a folder root (index.html per folder,
404.html for missing URLs); links are relative except in 404.html, which uses
the base path of "site_url". build.json records the source commit, the build
time and the repository files the build copied (`repo_paths`, which the
workflow's path filters and sparse checkout must cover: --sync-workflow writes
them, --check-workflow fails when they are stale).

Python 3.9+ standard library only.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import html
import json
import os
import posixpath
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, unquote, urljoin, urlsplit

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from mdrender import Renderer, plain_text  # noqa: E402

WIKI_SPECIAL = {"_Sidebar", "_Footer", "_Header"}
WORKFLOW = ".github/workflows/wiki-site.yml"
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"}
# Linked as a download, never shown as a page. Decided by name, not by reading
# the file, so a sparse checkout without the file decides the same way.
BINARY_EXT = IMAGE_EXT | {".jar", ".zip", ".gz", ".7z", ".exe", ".dll", ".class", ".nbt", ".mca", ".dat",
                          ".ogg", ".mp3", ".wav", ".ttf", ".otf", ".pdf", ".mrpack", ".lnk"}
MAX_COPY_BYTES = 10 * 1024 * 1024        # one copied repository file
MAX_COPY_TOTAL = 60 * 1024 * 1024        # all of them together


class BuildError(SystemExit):
    pass


def write_lf(path: Path, text: str, encoding: str = "utf-8") -> None:
    """Write text with LF line endings on every OS, so builds are byte-identical."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding=encoding, newline="\n") as fh:
        fh.write(text)


def git_out(repo: Path, *args: str) -> str:
    try:
        return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True,
                              encoding="utf-8", check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return ""


# ---------------------------------------------------------------------------
# The pages: the wiki sync's output, from .minecraft/wiki/
# ---------------------------------------------------------------------------
def load_sync_wiki(repo_root: Path):
    """The wiki sync script (.minecraft/tools/sync-wiki.py), as a module: its link
    conversions and its INTERNAL ONLY check are what the GitHub wiki got."""
    import importlib.util
    path = repo_root / ".minecraft" / "tools" / "sync-wiki.py"
    spec = importlib.util.spec_from_file_location("sync_wiki", path)
    mod = importlib.util.module_from_spec(spec)
    keep, sys.dont_write_bytecode = sys.dont_write_bytecode, True  # no __pycache__ in .minecraft/tools
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.dont_write_bytecode = keep
    return mod


def stage_source(repo_root: Path, cfg: dict, stage: Path) -> dict:
    """Write the wiki pages the wiki sync would write, from the repository's
    .minecraft/wiki/ sources, into `stage` (a flat folder like a wiki clone), plus
    the wiki-only sidebar kept in site/ ("sidebar" in pages.json). Returns the
    provenance a wiki clone's git history would give: the last commit and date
    of each page's source, and the newest of them."""
    sync = load_sync_wiki(repo_root)
    manifest = json.loads((repo_root / cfg["source_manifest"]).read_text(encoding="utf-8"))
    conversions = manifest.get("link_conversions", {})
    stage.mkdir(parents=True, exist_ok=True)
    src_of: dict[str, str] = {}
    for entry in manifest.get("files", []):
        src = repo_root / entry["src"]
        if not src.is_file():
            raise BuildError(f"wiki source {entry['src']} (manifest entry for {entry['dst']}) does not exist")
        text = src.read_text(encoding="utf-8")
        if sync._is_internal_only(text):
            continue
        write_lf(stage / entry["dst"], sync._apply_conversions(text, conversions))
        src_of[entry["src"]] = entry["dst"]
    sidebar = cfg.get("sidebar")
    if sidebar:
        shutil.copyfile(repo_root / sidebar, stage / "_Sidebar.md")
    # Dates in UTC, as the wiki's own commits (made by the sync Action) have them.
    env = dict(os.environ, TZ="UTC")

    def git(*args: str) -> str:
        # The dates come from this history: no answer is an error, not a page
        # without a date.
        try:
            return subprocess.run(["git", "-C", str(repo_root), *args], capture_output=True, text=True,
                                  encoding="utf-8", check=True, env=env).stdout.strip()
        except (OSError, subprocess.CalledProcessError) as ex:
            detail = getattr(ex, "stderr", "") or str(ex)
            raise BuildError(f"git {' '.join(args[:2])} failed in {repo_root}: {detail.strip()}")
    paths = sorted(src_of)
    # Per page: the newest commit that changed its source's text. A pure move
    # (R100, e.g. the 2026-04-13 folder change) is followed, not counted. -M100%
    # keeps rename detection to exact renames, which compare blob ids only: a
    # blobless clone (the Action's) never has to fetch file contents for it.
    dates: dict[str, str] = {}
    for path in paths:
        out = git("log", "--follow", "-M100%", "--date=format-local:%Y-%m-%d", "--format=@%cd", "--raw",
                  "--", path)
        current = ""
        for line in out.splitlines():
            if line.startswith("@"):
                current = line[1:]
            elif line.startswith(":") and current:
                status = line.split("\t", 1)[0].split()[-1]
                if status != "R100":
                    dates[src_of[path]] = current
                    break
    return {
        "dates": dates,
        "commit": git("log", "-1", "--format=%H", "--", *paths),
        "commit_date": git("log", "-1", "--date=iso-strict-local", "--format=%cd", "--", *paths),
        "src_of_page": {Path(dst).stem: src for src, dst in src_of.items()},
    }


# ---------------------------------------------------------------------------
# Repository files the pages link to
# ---------------------------------------------------------------------------
def is_text(data: bytes) -> bool:
    if b"\x00" in data[:8192]:
        return False
    try:
        data.decode("utf-8")
        return True
    except UnicodeDecodeError:
        return False


class RepoFiles:
    """Copies the repository files that published pages link to, and builds their
    pages. Paths are repository paths (posix, no leading slash)."""

    def __init__(self, site: "Site", repo_root: Path):
        self.site = site
        self.root = repo_root
        listed = subprocess.run(["git", "-C", str(repo_root), "ls-files", "-z"], capture_output=True,
                                check=True).stdout.decode("utf-8")
        self.tracked = {p for p in listed.split("\0") if p}
        self.dirs: set[str] = set()
        for p in self.tracked:
            d = posixpath.dirname(p)
            while d and d not in self.dirs:
                self.dirs.add(d)
                d = posixpath.dirname(d)
        self.views: dict[str, str] = {}     # repo path -> "file" | "dir": a page under files/
        self.raw: set[str] = set()          # repo paths copied to files/raw/ (a folder: its zip)
        self.packed: set[str] = set()       # repo paths linked on the pack server
        self.total = 0
        self.problems: list[str] = []

    # -- what a repository path becomes ------------------------------------
    def norm(self, path: str) -> str | None:
        path = posixpath.normpath(unquote(path).lstrip("/"))
        if path in (".", "") or path.startswith("../"):
            return None
        return path

    @staticmethod
    def site_path(path: str) -> str:
        """Where repository path `path` lives on the site: a segment that starts
        with a dot (.minecraft, .gitignore) gets an underscore instead, since web
        servers commonly refuse to serve dot-paths."""
        return "/".join("_" + seg[1:] if seg.startswith(".") else seg for seg in path.split("/"))

    def exists(self, path: str) -> bool:
        return path in self.tracked or path in self.dirs

    def view_href(self, path: str, fragment: str = "") -> str:
        """Site path (from the root) of the page that shows `path`."""
        self.views.setdefault(path, "dir" if path in self.dirs else "file")
        frag = f"#{fragment}" if fragment and path.lower().endswith(".md") else ""
        return "files/" + quote(self.site_path(path)) + "/" + frag

    def raw_href(self, path: str) -> str:
        """Site path (from the root) of the file itself, copied into the build."""
        self.raw.add(path)
        return "files/raw/" + quote(self.site_path(path))

    def copied(self) -> list[tuple[str, bool]]:
        """(repo path, is a folder) for every path the build copies from the checkout;
        a file inside a copied folder is covered by the folder."""
        paths = set(self.views) | self.raw
        dirs = {p for p in paths if p in self.dirs}
        return sorted((p, p in dirs) for p in paths
                      if not any(p.startswith(d + "/") for d in dirs))

    def pack_url(self, path: str) -> str | None:
        """The pack server's always-current URL for `path`, if it serves it."""
        for p in self.site.cfg.get("pack_paths", []):
            if p.endswith("/*"):
                if posixpath.dirname(path) == p[:-2]:
                    break
            elif path.startswith(p) or path == p.rstrip("/"):
                break
        else:
            return None
        return self.site.pack_server + "raw/main/" + quote(path)

    def check_source(self, path: str, from_where: str) -> None:
        """A path that is tracked but not on disk is outside the sparse checkout."""
        if path in self.tracked and not (self.root / path).is_file():
            raise BuildError(
                f"{from_where} links to {path}, which is in the repository but not in this checkout. "
                f"The workflow checks out only the files the site copies: run "
                f"`python site/build.py --sync-workflow` and commit {WORKFLOW}.")

    # -- copying --------------------------------------------------------------
    def read(self, path: str) -> bytes:
        self.check_source(path, "the site")
        data = (self.root / path).read_bytes()
        if len(data) > MAX_COPY_BYTES:
            raise BuildError(f"{path} is {len(data)} bytes, over the {MAX_COPY_BYTES} a copied file may have")
        text_head = data[:4096].decode("utf-8", "replace").lstrip("﻿")
        first = next((ln.strip() for ln in text_head.splitlines() if ln.strip()), "")
        if first == "<!-- INTERNAL ONLY -->":
            raise BuildError(f"a page links to {path}, which is marked INTERNAL ONLY: it is not published")
        return data

    def copy_raw(self, out: Path) -> None:
        for path in sorted(self.raw):
            if path in self.dirs:
                self.write_zip(out, path)
                continue
            data = self.read(path)
            self.total += len(data)
            dst = out / "files" / "raw" / self.site_path(path)
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(data)
        if self.total > MAX_COPY_TOTAL:
            raise BuildError(f"the copied repository files add up to {self.total} bytes, over {MAX_COPY_TOTAL}")

    def write_zip(self, out: Path, folder: str) -> None:
        """files/raw/<folder>.zip: the folder's tracked files, byte-identical between builds."""
        dst = out / "files" / "raw" / (self.site_path(folder) + ".zip")
        dst.parent.mkdir(parents=True, exist_ok=True)
        names = sorted(p for p in self.tracked if p.startswith(folder + "/"))
        with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as z:
            for p in names:
                info = zipfile.ZipInfo(posixpath.basename(folder) + "/" + p[len(folder) + 1:], (1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o644 << 16
                z.writestr(info, self.read(p))
        self.total += dst.stat().st_size

    # -- pages ----------------------------------------------------------------
    def write_pages(self, out: Path, versions: dict[str, str]) -> None:
        done: set[str] = set()
        while True:  # a rendered document can link to more files
            todo = sorted(set(self.views) - done)
            if not todo:
                break
            for path in todo:
                done.add(path)
                if self.views[path] == "dir":
                    self.folder_page(out, path, versions)
                else:
                    self.file_page(out, path, versions)

    def _page(self, out: Path, path: str, title: str, body: str, versions) -> None:
        site = self.site
        rel = "files/" + self.site_path(path) + "/"
        root = "../" * rel.count("/")
        doc = page_html(site, rel, title, body, root=root, nav=site.render_nav(None, root),
                        description=f"{path}, a file of the IridescentCraft pack.",
                        foot=site.footer(root, ""), versions=versions)
        write_lf(out / rel / "index.html", doc)

    def file_page(self, out: Path, path: str, versions) -> None:
        e = html.escape
        data = self.read(path)
        root = "../" * ("files/" + self.site_path(path) + "/").count("/")
        name = posixpath.basename(path)
        dl = f'<p class="file-meta"><a class="button" href="{e(root + self.raw_href(path))}" download>Download {e(name)}</a> · {len(data):,} bytes</p>'
        crumbs = self.crumbs(path, root)
        if not is_text(data):
            body = f"<h1>{e(name)}</h1>\n{crumbs}{dl}<p>This file is not text: download it to open it.</p>"
        elif path.lower().endswith(".md"):
            r = Renderer(*self.site.make_resolver_for(posixpath.dirname(path), root, f"files/{path}"))
            rendered = r.render(data.decode("utf-8").lstrip("﻿"))
            body = f"{crumbs}{dl}{rendered}"
        else:
            text = data.decode("utf-8").lstrip("﻿")
            body = (f"<h1>{e(name)}</h1>\n{crumbs}{dl}"
                    f'<div class="code"><pre><code>{e(text)}</code></pre></div>')
        self._page(out, path, name, body, versions)

    def folder_page(self, out: Path, folder: str, versions) -> None:
        e = html.escape
        root = "../" * ("files/" + self.site_path(folder) + "/").count("/")
        names = sorted(p for p in self.tracked if p.startswith(folder + "/"))
        rows = []
        for p in names:
            size = (self.root / p).stat().st_size if (self.root / p).is_file() else 0
            rows.append(f'<tr><td><a href="{e(root + self.raw_href(p))}">{e(p[len(folder) + 1:])}</a></td>'
                        f'<td class="num">{size:,}</td></tr>')
        zip_href = root + self.raw_href(folder)
        readme = next((p for p in (folder + "/README.md", folder + "/readme.md") if p in self.tracked), None)
        body = [f"<h1>{e(posixpath.basename(folder))}</h1>", self.crumbs(folder, root),
                f'<p class="file-meta"><a class="button" href="{e(zip_href + ".zip")}" download>'
                f"Download all {len(names)} files (.zip)</a></p>"]
        if readme:
            r = Renderer(*self.site.make_resolver_for(folder, root, f"files/{folder}"))
            body.append('<section class="readme">' + r.render(self.read(readme).decode("utf-8").lstrip("﻿"))
                        + "</section>")
        body.append('<h2 id="files">Files</h2><div class="table-wrap"><table><thead><tr><th>File</th>'
                    '<th class="num">Bytes</th></tr></thead><tbody>' + "".join(rows) + "</tbody></table></div>")
        self._page(out, folder, posixpath.basename(folder), "\n".join(body), versions)

    def crumbs(self, path: str, root: str) -> str:
        parts = path.split("/")
        bits = []
        for i in range(len(parts) - 1):
            sub = "/".join(parts[: i + 1])
            if sub in self.views:
                bits.append(f'<a href="{html.escape(root + "files/" + quote(self.site_path(sub)) + "/")}">{html.escape(parts[i])}</a>')
            else:
                bits.append(html.escape(parts[i]))
        bits.append(f"<strong>{html.escape(parts[-1])}</strong>")
        return '<p class="crumbs">' + " / ".join(bits) + "</p>\n"


# ---------------------------------------------------------------------------
# The site
# ---------------------------------------------------------------------------
class Site:
    def __init__(self, cfg: dict, wiki: Path, out: Path, repo_root: Path, provenance: dict):
        self.cfg = cfg
        self.wiki = wiki
        self.out = out
        self.repo = cfg["repo"]
        self.site_url = cfg["site_url"].rstrip("/") + "/"
        self.base_path = urlsplit(self.site_url).path or "/"
        self.pack_server = cfg.get("pack_server", self.site_url + "pack/").rstrip("/") + "/"
        self.all_pages = {p.stem: p for p in sorted(wiki.glob("*.md")) if p.stem not in WIKI_SPECIAL}
        self.lower_map = {k.lower(): k for k in self.all_pages}
        self.problems: list[str] = []
        exclude = cfg.get("exclude", [])
        for name in exclude:
            if name not in self.all_pages:
                self.problems.append(f"pages.json excludes '{name}', which is not a page of the wiki")
        self.index_page = cfg["index_page"]
        order = [p for p in cfg.get("order", []) if p in self.all_pages]
        self.include = [p for p in order + sorted(self.all_pages) if p not in exclude]
        self.include = list(dict.fromkeys(self.include))
        if self.index_page not in self.include:
            raise BuildError(f"index_page '{self.index_page}' is not published")
        self.excluded = [p for p in self.all_pages if p not in self.include]
        self.dates = provenance["dates"]
        self.wiki_commit = provenance["commit"]
        self.wiki_commit_date = provenance["commit_date"]
        self.src_of_page = provenance["src_of_page"]
        self.page_of_src = {v: k for k, v in self.src_of_page.items()}
        self.wiki_sha = self.wiki_commit[:7]
        self.files = RepoFiles(self, repo_root)
        # Report data
        self.excluded_links: dict[str, set[str]] = {}
        self.unresolved: dict[str, set[str]] = {}
        self.titles: dict[str, str] = {}
        self.headings: dict[str, list] = {}
        self.raw_notes: list[str] = []

    # -- URLs ------------------------------------------------------------
    def page_path(self, page: str) -> str:
        """Output path of a page, relative to the site root ('' = root)."""
        return "" if page == self.index_page else f"{page}/"

    def root_of(self, page: str) -> str:
        return "" if page == self.index_page else "../"

    def href_from(self, root: str, to_page: str, fragment: str = "") -> str:
        rel = root + self.page_path(to_page)
        return (rel or "./") + (f"#{fragment}" if fragment else "")

    def canonical(self, name: str) -> str | None:
        name = name.strip().replace(" ", "-")
        if name in self.all_pages:
            return name
        return self.lower_map.get(name.lower())

    # -- Link resolution ---------------------------------------------------
    def page_link(self, where: str, root: str, page: str, fragment: str):
        if page in self.include:
            return {"href": self.href_from(root, page, fragment)}
        self.excluded_links.setdefault(where, set()).add(page)
        return None  # an excluded page: plain text

    def repo_link(self, where: str, root: str, kind: str, path: str, fragment: str):
        """kind: 'view' (blob, tree, relative), 'raw' (a download)."""
        f = self.files
        if path in self.page_of_src:  # a wiki source file: its page
            return self.page_link(where, root, self.page_of_src[path], fragment)
        if path.startswith(".minecraft/wiki/") and path.lower().endswith(".md"):
            self.unresolved.setdefault(where, set()).add(
                f"{path} (a wiki source that is not one of the public pages)")
            return {"href": "#"}
        if not f.exists(path):
            self.unresolved.setdefault(where, set()).add(f"{path} (not in the repository)")
            return {"href": "#"}
        ext = posixpath.splitext(path)[1].lower()
        if path in f.dirs:
            return {"href": root + f.view_href(path)}
        if ext in IMAGE_EXT:
            return {"href": root + f.raw_href(path)}
        if kind == "raw" or ext in BINARY_EXT:
            pack = f.pack_url(path)
            if pack:  # a file testers download: the pack server's copy is always current
                f.packed.add(path)
                return {"href": pack, "external": True}
            return {"href": root + f.raw_href(path)}
        return {"href": root + f.view_href(path, fragment)}

    def resolve_url(self, where: str, root: str, href: str):
        """An absolute http(s) URL: the repository's, the site's own, or another site's."""
        parts = urlsplit(href)
        host = parts.netloc.lower()
        segs = [unquote(s) for s in parts.path.split("/") if s]
        owner, name = self.repo.lower().split("/")
        if host in ("github.com", "www.github.com") and len(segs) >= 2 and \
                segs[0].lower() == owner and segs[1].lower().removesuffix(".git") == name:
            rest = segs[2:]
            if not rest:
                return {"href": root or "./"}  # the repository's front page: the site's
            if rest[0] == "wiki":
                page = self.canonical(rest[1]) if len(rest) > 1 else "Home"
                if page:
                    return self.page_link(where, root, page, parts.fragment)
            elif rest[0] in ("issues", "pulls", "discussions"):
                return {"href": root + "report/"}
            elif rest[0] in ("blob", "tree", "raw") and len(rest) >= 3:
                path = self.files.norm("/".join(rest[2:]))
                if path:
                    return self.repo_link(where, root, "raw" if rest[0] == "raw" else "view", path,
                                          parts.fragment)
            self.unresolved.setdefault(where, set()).add(href)
            return {"href": "#"}
        if host == "raw.githubusercontent.com" and len(segs) >= 4 and \
                segs[0].lower() == owner and segs[1].lower() == name:
            path = self.files.norm("/".join(segs[3:]))
            if path:
                return self.repo_link(where, root, "raw", path, "")
            self.unresolved.setdefault(where, set()).add(href)
            return {"href": "#"}
        if href.startswith(self.pack_server + "raw/"):
            # Already a pack-server link: it must be a path the pack server serves.
            path = self.files.norm("/".join(segs[3:]) if len(segs) > 3 else "")
            if not path or not self.files.exists(path) or not self.files.pack_url(path):
                self.unresolved.setdefault(where, set()).add(f"{href} (not a file the pack server serves)")
                return {"href": "#"}
            self.files.packed.add(path)
            return {"href": href, "external": True}
        if href.startswith(self.site_url) and not href.startswith(self.pack_server):
            rel = href[len(self.site_url):]
            return {"href": (root + rel) or "./"}
        return {"href": href, "external": True}

    def make_resolver_for(self, src_dir: str | None, root: str, where: str):
        """Resolvers for a page whose source lives in repository folder `src_dir`
        (None: a wiki page known only by name) and is written `root` below the site root."""

        def resolve_link(href: str):
            href = href.strip()
            if not href:
                return None
            if href.startswith("#"):
                return {"href": href}
            parts = urlsplit(href)
            scheme = parts.scheme.lower()
            if scheme in ("http", "https"):
                return self.resolve_url(where, root, href)
            if scheme == "mailto":
                return {"href": href}
            if scheme:
                self.unresolved.setdefault(where, set()).add(href)
                return {"href": "#"}
            path = unquote(parts.path)
            if path.startswith("./"):
                path = path[2:]
            name = path[:-3] if path.lower().endswith(".md") else path
            if "/" not in name and self.canonical(name):
                return self.page_link(where, root, self.canonical(name), parts.fragment)
            if src_dir is not None:
                target = self.files.norm(posixpath.join(src_dir, path))
                if target:
                    return self.repo_link(where, root, "view", target, parts.fragment)
            self.unresolved.setdefault(where, set()).add(href)
            return {"href": "#"}

        def resolve_wikilink(target: str):
            name, _, fragment = target.partition("#")
            if not name:
                return {"href": f"#{fragment}"}
            if re.match(r"^[a-z]+://", name, re.I):
                return resolve_link(target)
            page = self.canonical(name)
            if page:
                return self.page_link(where, root, page, fragment)
            self.unresolved.setdefault(where, set()).add(f"[[{target}]]")
            return {"href": "#"}

        def resolve_image(src: str):
            res = resolve_link(src)
            return res["href"] if res else src

        return resolve_link, resolve_wikilink, resolve_image

    def make_resolver(self, page: str):
        src = self.src_of_page.get(page)
        return self.make_resolver_for(posixpath.dirname(src) if src else None, self.root_of(page), page)

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

    def render_nav(self, current: str | None, root: str) -> str:
        parts = []
        for label, pages in self.nav_groups():
            parts.append('<div class="nav-group">')
            if label:
                parts.append(f'<p class="nav-label">{html.escape(label)}</p>')
            parts.append("<ul>")
            for p in pages:
                cur = ' aria-current="page"' if p == current else ""
                parts.append(f'<li><a href="{html.escape(self.href_from(root, p))}"{cur}>'
                             f"{html.escape(self.nav_label(p))}</a></li>")
            parts.append("</ul></div>")
        cur = ' aria-current="page"' if current == "__report__" else ""
        parts.append('<div class="nav-group nav-help"><p class="nav-label">Help</p><ul>'
                     f'<li><a href="{html.escape(root)}report/"{cur}>Report an issue</a></li></ul></div>')
        return "\n".join(parts)

    def footer(self, root: str, date: str) -> str:
        e = html.escape
        bits = []
        if date:
            bits.append(f'Last updated <time datetime="{e(date)}">{e(date)}</time>')
        bits.append(f'Something wrong or missing? <a href="{e(root)}report/">Report an issue</a>')
        # Nothing build-specific (time, commit) goes into the pages, so an
        # unchanged set of pages gives byte-identical output; build.json has those.
        return "<p>" + " · ".join(bits) + "</p>"


# ---------------------------------------------------------------------------
# Page rendering
# ---------------------------------------------------------------------------
ICON_MENU = ('<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" '
             'stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>')

CSP = ("default-src 'none'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; "
       "base-uri 'none'; form-action 'none'")
CSP_REPORT = ("default-src 'none'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; "
              "connect-src 'self'; base-uri 'none'; form-action 'self'")


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


def page_html(site: Site, path: str | None, title: str, body: str, *, root: str, nav: str,
              description: str, foot: str, versions: dict[str, str], noindex: bool = False,
              csp: str = CSP, scripts: tuple[str, ...] = ()) -> str:
    """`path`: output folder of the page relative to the site root ('' = root),
    None for the 404 page."""
    cfg = site.cfg
    e = html.escape
    v = versions
    robots = '<meta name="robots" content="noindex">\n' if noindex else ""
    if path is not None:
        url = urljoin(site.site_url, path)
        robots += (f'<link rel="canonical" href="{e(url)}">\n'
                   '<meta property="og:type" content="website">\n'
                   f'<meta property="og:site_name" content="{e(cfg["site_title"])}">\n'
                   f'<meta property="og:title" content="{e(title)}">\n'
                   f'<meta property="og:description" content="{e(description)}">\n'
                   f'<meta property="og:url" content="{e(url)}">\n'
                   '<meta name="twitter:card" content="summary">\n')
    doc_title = cfg["site_title"] if title == cfg["site_title"] else f"{title} · {cfg['site_title']}"
    extra = "".join(f'<script src="{root}assets/{s}?v={v[s]}" defer></script>\n' for s in scripts)
    return f"""<!doctype html>
<html lang="en" data-root="{e(root)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="{csp}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="color-scheme" content="dark light">
{robots}<title>{e(doc_title)}</title>
<meta name="description" content="{e(description)}">
<link rel="icon" href="{root}assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="{root}assets/style.css?v={v['style.css']}">
<script src="{root}assets/search-index.js?v={v['search-index.js']}" defer></script>
<script src="{root}assets/site.js?v={v['site.js']}" defer></script>
{extra}</head>
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


# ---------------------------------------------------------------------------
# The report pages (the form posts to /report/ on this host; the server files
# the issue). Field names and limits are the server's.
# ---------------------------------------------------------------------------
REPORT_LIMITS = {"title": (4, 120), "details": (10, 8000), "steps": (0, 4000), "log": (0, 50000),
                 "version": (0, 60), "contact": (0, 200)}


def report_body(base_path: str) -> str:
    def field(name, label, hint, kind="input", required=False, rows=0, extra=""):
        lo, hi = REPORT_LIMITS[name]
        req = " required" if required else ""
        mn = f' minlength="{lo}"' if lo else ""
        hint_html = f'<span class="hint" id="{name}-hint">{hint}</span>' if hint else ""
        desc = f' aria-describedby="{name}-hint"' if hint else ""
        star = ' <span class="req" aria-hidden="true">*</span>' if required else ""
        if kind == "textarea":
            ctl = (f'<textarea id="{name}" name="{name}" rows="{rows}" maxlength="{hi}"{mn}{req}{desc}{extra}>'
                   "</textarea>")
        else:
            ctl = f'<input type="text" id="{name}" name="{name}" maxlength="{hi}"{mn}{req}{desc}{extra}>'
        return (f'<div class="field"><label for="{name}">{label}{star}</label>{ctl}{hint_html}'
                f'<span class="count" data-for="{name}" aria-live="polite"></span></div>')

    return "\n".join([
        '<h1 id="report-an-issue">Report an issue</h1>',
        "<p>Found a bug, a crash, or something that should work differently? Tell us here. "
        "The report goes straight to Silvaria's list of things to fix.</p>",
        '<p id="report-status" class="report-status" role="alert" tabindex="-1" hidden></p>',
        '<noscript><p class="report-note">If this page sent you back here after you pressed '
        "Send, the report was not sent: check that the title and the description are filled in, "
        "or wait a few minutes and try again.</p></noscript>",
        f'<form class="report-form" id="report-form" method="post" action="{base_path}report/" '
        'accept-charset="utf-8">',
        '<div class="field"><label for="kind">What kind of report?</label>'
        '<select id="kind" name="kind">'
        '<option value="bug">Bug: something does not work as it should</option>'
        '<option value="crash">Crash: the game or the server crashed</option>'
        '<option value="suggestion">Suggestion: an idea or a change you would like</option>'
        '<option value="other">Something else</option></select></div>',
        field("title", "Title", "A few words, like “Frostmaw drops nothing in Everbright”.", required=True,
              extra=' autocomplete="off"'),
        field("details", "What happened", "What you did, what you expected, and what happened instead.",
              kind="textarea", required=True, rows=7),
        field("steps", "Steps to make it happen again (optional)", "", kind="textarea", rows=4),
        field("log", "Log or crash report (optional)",
              "Paste <code>logs/latest.log</code>, or the newest file in <code>crash-reports/</code>. "
              "Both are in your instance’s <code>.minecraft</code> folder (in PrismLauncher: right-click "
              "the instance, then Folder). A log that is too long: paste its last part, where the error is.",
              kind="textarea", rows=6, extra=' spellcheck="false" class="mono"'),
        field("version", "Pack version (optional)",
              "The commit or pack version, if you know it, e.g. from <code>.icraft_last_sha</code> in the "
              "instance’s <code>.minecraft</code> folder.", extra=' autocomplete="off" spellcheck="false"'),
        field("contact", "How to reach you (optional)",
              "Your Discord name or similar, if you would like an answer. Only Silvaria sees it.",
              extra=' autocomplete="off"'),
        '<div class="hp" aria-hidden="true"><label for="website">Website</label>'
        '<input type="text" id="website" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"></div>',
        '<input type="hidden" name="t" id="t" value="">',
        '<p class="actions"><button type="submit" class="button primary">Send report</button></p>',
        "</form>",
    ])


def sent_body(root: str, index_href: str) -> str:
    e = html.escape
    return "\n".join([
        '<h1 id="thank-you">Thank you</h1>',
        '<p>Your report was sent. <span id="report-number" hidden></span></p>',
        "<p>Silvaria reads every report. If you left a way to reach you, you may hear back there.</p>",
        f'<p><a href="{e(index_href)}">Back to the installation guide</a> · <a href="{e(root)}Home/">'
        f'Wiki home</a> · <a href="{e(root)}report/">Send another report</a></p>',
    ])


# ---------------------------------------------------------------------------
# Checks on what the build wrote
# ---------------------------------------------------------------------------
class TextParser(HTMLParser):
    """The text a visitor sees (including title/alt/placeholder), and every href/src."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text: list[str] = []
        self.urls: list[str] = []

    def handle_starttag(self, tag, attrs):
        for k, val in attrs:
            if val is None:
                continue
            if k in ("href", "src", "action", "content"):
                self.urls.append(val)
            if k in ("title", "alt", "placeholder", "aria-label"):
                self.text.append(val)

    def handle_data(self, data):
        self.text.append(data)


def repo_url_pattern(repo: str) -> re.Pattern:
    owner, name = (re.escape(x) for x in repo.split("/"))
    return re.compile(rf"(?i)(?:github\.com|githubusercontent\.com)/{owner}/{name}(?![\w-])"
                      rf"|\b{owner}/{name}(?![\w-])|{owner}\.github\.io")


def check_output(site: Site, out: Path) -> tuple[list[str], list[str]]:
    """No URL or name of the repository anywhere the site shows; no mention of it in
    the text of the site's own pages (files/** shows repository files as they are).
    Returns (problems, notes): the copies under files/raw/ are downloads, byte for
    byte the repository's files, so one that names the repository is a note."""
    problems, notes = [], []
    url_re = repo_url_pattern(site.repo)
    phrases = [re.compile(p, re.I) for p in site.cfg.get("forbidden_phrases", [])]
    allowed = [re.compile(p, re.I) for p in site.cfg.get("allowed_phrases", [])]
    for f in sorted(out.rglob("*")):
        if not f.is_file() or f.suffix.lower() in (".zip", ".jar", ".png", ".jpg", ".gif", ".webp", ".ico"):
            continue
        rel = f.relative_to(out).as_posix()
        data = f.read_bytes()
        if not is_text(data):
            continue
        text = data.decode("utf-8")
        for m in url_re.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            (notes if rel.startswith("files/raw/") else problems).append(
                f"{rel}:{line}: names the repository ({m.group(0)})")
        if f.suffix == ".html" and not rel.startswith("files/"):
            p = TextParser()
            p.feed(text)
            visible = " ".join(p.text)
            for a in allowed:
                visible = a.sub(" ", visible)
            for rx in phrases:
                for m in rx.finditer(visible):
                    ctx = visible[max(0, m.start() - 50): m.end() + 50].replace("\n", " ")
                    problems.append(f"{rel}: mentions the repository ({m.group(0)!r}): ...{ctx.strip()}...")
    return problems, notes


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
def build(cfg: dict, wiki: Path, out: Path, repo_root: Path, provenance: dict) -> Site:
    if out.exists():
        shutil.rmtree(out)
    (out / "assets").mkdir(parents=True)
    site = Site(cfg, wiki, out, repo_root, provenance)

    rendered: dict[str, str] = {}
    for page in site.include:
        r = Renderer(*site.make_resolver(page))
        body = r.render(site.all_pages[page].read_text(encoding="utf-8"))
        h1 = next((t for lvl, t, s in r.headings if lvl == 1), page.replace("-", " "))
        site.titles[page] = h1
        site.headings[page] = r.headings
        toc = toc_html(r.headings)
        if toc:
            body = body.replace("</h1>", "</h1>\n" + toc, 1) if "</h1>" in body else toc + body
        rendered[page] = body

    # Search index: page titles + h2/h3 headings, and the report page.
    index = []
    for page in site.include:
        url = site.page_path(page)
        index.append({"t": site.titles[page], "u": url or "./", "p": site.nav_label(page), "k": 0})
        for lvl, text, slug in site.headings[page]:
            if lvl in (2, 3) and text != "Notes":
                index.append({"t": text, "u": f"{url}#{slug}", "p": site.titles[page], "k": lvl})
    index.append({"t": "Report an issue", "u": "report/", "p": "Help", "k": 0})
    write_lf(out / "assets" / "search-index.js",
             "window.SEARCH_INDEX=" + json.dumps(index, ensure_ascii=False, separators=(",", ":")) + ";\n")

    for f in (HERE / "assets").iterdir():
        if f.is_file():
            shutil.copyfile(f, out / "assets" / f.name)
    versions = {name: asset_version(out / "assets" / name)
                for name in ("style.css", "site.js", "search-index.js", "report.js")}

    for page in site.include:
        root = site.root_of(page)
        date = site.dates.get(site.all_pages[page].name, "")
        doc = page_html(site, site.page_path(page), site.titles[page], rendered[page], root=root,
                        nav=site.render_nav(page, root), description=first_paragraph(rendered[page]),
                        foot=site.footer(root, date), versions=versions)
        write_lf(out / site.page_path(page) / "index.html", doc)

    # Repository files the pages link to (and the files those link to).
    site.files.write_pages(out, versions)
    site.files.copy_raw(out)

    # Report pages.
    root = "../"
    write_lf(out / "report" / "index.html", page_html(
        site, "report/", "Report an issue", report_body(site.base_path), root=root,
        nav=site.render_nav("__report__", root),
        description="Report a bug, a crash or a suggestion for the IridescentCraft pack.",
        foot=site.footer(root, ""), versions=versions, csp=CSP_REPORT, scripts=("report.js",)))
    root = "../../"
    write_lf(out / "report" / "sent" / "index.html", page_html(
        site, "report/sent/", "Report sent", sent_body(root, root or "./"), root=root,
        nav=site.render_nav(None, root), description="Your report was sent.",
        foot=site.footer(root, ""), versions=versions, noindex=True, scripts=("report.js",)))

    # 404 page: served at arbitrary depths, so it uses the absolute base path.
    base = site.base_path
    nav404 = site.render_nav("__404__", base)
    body404 = ('<h1 id="not-found">Page not found</h1>'
               f'<p>That page is not on this site. Start from the <a href="{base}">installation guide</a>, '
               f'or <a href="{base}report/">report a broken link</a>.</p>')
    write_lf(out / "404.html", page_html(
        site, None, "Page not found", body404, root=base, nav=nav404, description="Page not found",
        foot="", versions=versions, noindex=True))

    if site.unresolved:
        lines = [f"- {w}: {', '.join(sorted(h))}" for w, h in sorted(site.unresolved.items())]
        raise BuildError("Links that resolve to nothing on the site:\n" + "\n".join(lines))
    leaks, site.raw_notes = check_output(site, out)
    if leaks:
        raise BuildError("The site would name or link the repository:\n" + "\n".join(f"- {x}" for x in leaks))

    generator = os.environ.get("GITHUB_SHA") or git_out(repo_root, "rev-parse", "HEAD")
    build_info = {
        "site_url": site.site_url,
        "wiki_commit": site.wiki_commit,
        "wiki_commit_date": site.wiki_commit_date,
        "generator_commit": generator,
        "source": ".minecraft/wiki",
        "built_at": _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "pages": site.include,
        "repo_paths": [p for p, _ in site.files.copied()],
        "pack_links": sorted(site.files.packed),
    }
    write_lf(out / "build.json", json.dumps(build_info, indent=2) + "\n")
    return site


def report(site: Site) -> str:
    lines = ["## Wiki site build", ""]
    lines.append(f"Published {len(site.include)} pages for {site.site_url} from source commit "
                 f"`{site.wiki_sha or 'unknown'}`: " + ", ".join(site.include))
    lines.append("")
    lines.append("Not published: " + (", ".join(site.excluded) or "none"))
    lines.append("")
    if site.excluded_links:
        lines.append("Links from published pages to unpublished pages (shown as plain text):")
        for where in sorted(site.excluded_links):
            lines.append(f"- {where} -> " + ", ".join(sorted(site.excluded_links[where])))
        lines.append("")
    copied = site.files.copied()
    if copied:
        lines.append(f"Repository files copied into the site ({len(copied)}; a page under files/, the file "
                     "under files/raw/):")
        lines.extend(f"- `{p}{'/' if d else ''}`" for p, d in copied)
        lines.append("")
    if site.files.packed:
        lines.append("Links to the pack server: " + ", ".join(f"`{p}`" for p in sorted(site.files.packed)))
        lines.append("")
    if site.raw_notes:
        lines.append("Downloads (files/raw/, copies of repository files) that name the repository:")
        lines.extend(f"- {n}" for n in site.raw_notes)
        lines.append("")
    for p in site.problems:
        lines.append(f"WARNING: {p}")
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# The workflow's path list (path filters and sparse checkout)
# ---------------------------------------------------------------------------
MARK = "# >>> site/build.py --sync-workflow:"
END = "# <<< site/build.py"


def workflow_blocks(text: str, paths: list[tuple[str, bool]]) -> str:
    """Rewrite each generated block of the workflow. `MARK paths` blocks are
    entries of a `paths:` filter, `MARK sparse` blocks lines of a sparse-checkout
    pattern list (where git reads a line starting with # as a comment)."""
    out, i, lines = [], 0, text.split("\n")
    while i < len(lines):
        line = lines[i]
        out.append(line)
        i += 1
        if not line.strip().startswith(MARK):
            continue
        kind = line.strip()[len(MARK):].split()[0]
        indent = line[: len(line) - len(line.lstrip())]
        j = i
        while j < len(lines) and lines[j].strip() != END:
            j += 1
        if j == len(lines):
            raise BuildError(f"{WORKFLOW}: a generated block has no '{END}' line")
        for p, is_dir in paths:
            if kind == "paths":
                out.append(f"{indent}- '{p}/**'" if is_dir else f"{indent}- '{p}'")
            elif kind == "sparse":
                out.append(f"{indent}/{p}/" if is_dir else f"{indent}/{p}")
            else:
                raise BuildError(f"{WORKFLOW}: unknown generated block kind '{kind}'")
        out.append(lines[j])
        i = j + 1
    return "\n".join(out)


def workflow_paths(site: Site) -> list[tuple[str, bool]]:
    # .minecraft/wiki/ is in the workflow's lists already.
    return [(p, d) for p, d in site.files.copied() if not p.startswith(".minecraft/wiki/")]


# ---------------------------------------------------------------------------
# Local preview
# ---------------------------------------------------------------------------
def serve(out: Path, base: str, port: int) -> None:
    import functools
    import http.server
    if base.strip("/"):
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
    ap.add_argument("--source", action="store_true", help="build from .minecraft/wiki/ (the default and only input)")
    ap.add_argument("--out", type=Path, default=HERE / "_build")
    ap.add_argument("--config", type=Path, default=HERE / "pages.json")
    ap.add_argument("--repo-root", type=Path, default=HERE.parent, help="main repo root")
    ap.add_argument("--report", type=Path, help="also write the build report (Markdown) to this file")
    ap.add_argument("--sync-workflow", action="store_true",
                    help=f"build, then rewrite the repo-file path lists in {WORKFLOW}")
    ap.add_argument("--check-workflow", action="store_true",
                    help=f"build, then fail when the repo-file path lists in {WORKFLOW} are stale")
    ap.add_argument("--serve", action="store_true", help="serve the built site (no build)")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()
    cfg = json.loads(args.config.read_text(encoding="utf-8"))
    if args.serve:
        serve(args.out.resolve(), urlsplit(cfg["site_url"]).path or "/", args.port)
        return 0
    repo_root = args.repo_root.resolve()
    try:
        with tempfile.TemporaryDirectory(prefix="icraft-wiki-") as stage:
            provenance = stage_source(repo_root, cfg, Path(stage))
            site = build(cfg, Path(stage), args.out.resolve(), repo_root, provenance)
    except BuildError as ex:
        print(f"BUILD FAILED: {ex.code}", file=sys.stderr)
        if args.report:
            with open(args.report, "a", encoding="utf-8") as fh:
                fh.write(f"## Wiki site build FAILED\n\n```\n{ex.code}\n```\n")
        return 1
    text = report(site)
    print(text)
    if args.report:
        with open(args.report, "a", encoding="utf-8") as fh:
            fh.write(text)
    if args.sync_workflow or args.check_workflow:
        wf = repo_root / WORKFLOW
        old = wf.read_text(encoding="utf-8")
        new = workflow_blocks(old, workflow_paths(site))
        if args.sync_workflow:
            if new != old:
                write_lf(wf, new)
                print(f"Rewrote the repo-file paths in {WORKFLOW}.")
            else:
                print(f"{WORKFLOW}: repo-file paths are current.")
        elif new != old:
            print(f"STALE: the repo-file paths in {WORKFLOW} do not match the files the site copies. "
                  "Run `python site/build.py --sync-workflow` and commit the workflow.", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
