#!/usr/bin/env python3
"""mod_index_sets.py -- which jars would each consumer of the mod indexes install?

The proof tool behind dev/mods/mod_index.py: run it on a tree before a change and after it,
then `diff` the two results. A change to an index, to a skip list or to the generator
ships only when the difference is exactly the one intended.

It models every consumer from its own code, each with its own parser quirks and its
own skip list, read from the scripts and launcher sources OF THE TREE BEING MODELLED:

  server-launcher     icraft-core (the live server): sync, strip_client_mods,
                      update_mods, cleanup_stale_jars over server_distribution/mods/.index
  dev-client          prism_prelaunch.bat: the tracked root index + the client-distro
                      overlay, cleanup_stale_jars.ps1, download_mods.ps1
  tester-fallback     sync_client.ps1 on the root index, download_mods.ps1 (since
                      2026-10-19 its only path: the packwiz-installer path, which
                      stopped before any download on this index, is retired)
  tester-install      install.ps1: the first install, from the client distro's index
  legacy-windows      iridescentserver.bat: server_install.ps1, strip_client_mods.bat,
                      update_mods.ps1, cleanup_stale_jars.ps1
  legacy-linux        iridescentserver.sh: its inline installer and strip list
  server_install.sh, update_mods.sh, update_mods.ps1 (seed copy): run on their own

For each consumer:
  want   the jars a fresh install ends up with: name -> where it comes from (download
         urls in the order tried, or a jar committed in the repo), and the hash the
         metafile declares
  keep   the jars that survive its cleanup when already on disk (a superset of want)

Usage:
  python .minecraft/dev/mods/mod_index_sets.py sets [--ref <git ref>] [--out file.json]
  python .minecraft/dev/mods/mod_index_sets.py diff before.json after.json
  python .minecraft/dev/mods/mod_index_sets.py summary file.json

Python 3.11+. Reads only; with --ref it extracts the needed paths of that commit to a
temporary folder (git archive). Set MOD_INDEX_REPO to model another checkout than the
one this file sits in (for instance a copy of this tool run against an older tree).

How far to trust it (checked 2026-10-12):
  - server-launcher reproduces the live server's own list of 429 jars, name for name
  - the PowerShell parsing is the model of the scripts' own statements: run side by
    side on all three indexes, they agree on every file name, side, mode, url and id
  - dev-client `keep` is exactly the 458 jars of the dev instance
The launcher's TOML parser is modelled with Python's tomllib, not run.
"""
import argparse
import fnmatch
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import tomllib
import urllib.parse

HERE_MC = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPO = os.path.dirname(HERE_MC)
if os.environ.get("MOD_INDEX_REPO"):  # model another checkout than the one this file sits in
    REPO = os.path.abspath(os.environ["MOD_INDEX_REPO"])

ARCHIVE_PATHS = [
    ".minecraft/mods",
    ".minecraft/server_distribution/mods",
    ".minecraft/distribution/client/mods",
    ".minecraft/custom_jars_manifest.json",
    ".minecraft/server_distribution/custom_jars_manifest.json",
    ".minecraft/distribution/client/custom_jars_manifest.json",
    ".minecraft/server_distribution/server_install.ps1",
    ".minecraft/server_distribution/server_install.sh",
    ".minecraft/server_distribution/update_mods.ps1",
    ".minecraft/server_distribution/update_mods.sh",
    ".minecraft/server_distribution/iridescentserver.sh",
    ".minecraft/server_distribution/strip_client_mods.bat",
    ".minecraft/server_distribution/strip_client_mods.sh",
    ".minecraft/server_distribution/cleanup_stale_jars.ps1",
    ".minecraft/server_distribution/IridescentCraft Dedicated Server/update_mods.ps1",
    ".minecraft/distribution/client/download_mods.ps1",
    ".minecraft/distribution/client/cleanup_stale_jars.ps1",
    "iridescent-launcher/icraft-core/src/packwiz.rs",
    "iridescent-launcher/icraft-core/src/config.rs",
]


# ----------------------------------------------------------------------------- tree

class Tree:
    def __init__(self, root, label):
        self.root = root  # the repo root of the tree (holds .minecraft)
        self.label = label

    def path(self, rel):
        return os.path.join(self.root, *rel.split("/"))

    def text(self, rel):
        with open(self.path(rel), "rb") as f:
            return f.read().decode("utf-8", errors="replace")

    def exists(self, rel):
        return os.path.exists(self.path(rel))

    def metafiles(self, rel):
        d = self.path(rel)
        if not os.path.isdir(d):
            return {}
        return {fn: self.text(rel + "/" + fn) for fn in sorted(os.listdir(d)) if fn.endswith(".pw.toml")}

    def jars(self, rel):
        d = self.path(rel)
        out = {}
        if not os.path.isdir(d):
            return out
        for fn in sorted(os.listdir(d)):
            full = os.path.join(d, fn)
            if fn.endswith(".jar") and os.path.isfile(full):
                h = hashlib.sha256()
                with open(full, "rb") as f:
                    for chunk in iter(lambda: f.read(1 << 20), b""):
                        h.update(chunk)
                out[fn] = h.hexdigest()
        return out


def tree_for(ref):
    if not ref:
        return Tree(REPO, "working tree"), None
    tmp = tempfile.mkdtemp(prefix="mod-index-sets-")
    sha = subprocess.run(["git", "-C", REPO, "rev-parse", "--short", ref], capture_output=True, text=True, check=True).stdout.strip()
    existing = []
    for path in ARCHIVE_PATHS:
        r = subprocess.run(["git", "-C", REPO, "cat-file", "-e", "%s:%s" % (ref, path)], capture_output=True)
        if r.returncode == 0:
            existing.append(path)
    # core.autocrlf / eol attributes would rewrite line endings on export: scripts are
    # parsed line by line, so either form reads the same.
    data = subprocess.run(["git", "-C", REPO, "archive", "--format=tar", ref, "--"] + existing, capture_output=True, check=True).stdout
    with tarfile.open(fileobj=io.BytesIO(data)) as tf:
        tf.extractall(tmp, filter="data")
    return Tree(tmp, "%s (%s)" % (ref, sha)), tmp


# -------------------------------------------------------------------------- parsers

def parse_strict(text):
    try:
        return tomllib.loads(text.lstrip("﻿"))
    except Exception:
        return None


def rust_capture_str(line, key):
    prefix = key + " = "
    if not line.startswith(prefix):
        return None
    rest = line[len(prefix):]
    if not rest or rest[0] not in "'\"":
        return None
    q = rest[0]
    inner = rest.lstrip(q)
    last = inner.rfind(q)
    if last < 0:
        return None
    return inner[:last]


def rust_fields(text):
    """packwiz.rs parse_one: the toml crate, then the line-regex fallback."""
    d = parse_strict(text)
    if d is not None:
        fn = d.get("filename")
        side = d.get("side", "both")
        dl = d.get("download") or {}
        up = d.get("update") or {}
        cf = up.get("curseforge") or {}
        ok = (fn is None or isinstance(fn, str)) and isinstance(side, str) and isinstance(dl, dict)
        if ok:
            if not isinstance(fn, str):
                return None
            return {"filename": fn, "side": side, "mode": dl.get("mode", "") or "", "url": dl.get("url", "") or "",
                    "project": cf.get("project-id"), "file": cf.get("file-id"), "parser": "toml"}
    filename = None
    side, mode, url, project, file_id = "both", "", "", None, None
    for raw in text.splitlines():
        line = raw.strip()
        v = rust_capture_str(line, "filename")
        if v is not None:
            filename = v
            continue
        v = rust_capture_str(line, "side")
        if v is not None:
            side = v
            continue
        v = rust_capture_str(line, "mode")
        if v is not None:
            mode = v
            continue
        v = rust_capture_str(line, "url")
        if v is not None:
            url = v
            continue
        m = re.fullmatch(r"project-id = (\d+)", line)
        if m:
            project = int(m.group(1))
            continue
        m = re.fullmatch(r"file-id = (\d+)", line)
        if m:
            file_id = int(m.group(1))
    if filename is None:
        return None
    return {"filename": filename, "side": side, "mode": mode, "url": url, "project": project, "file": file_id, "parser": "line-regex"}


Q = "['\"]"


def ps_fields(text):
    """The per-line regexes of download_mods.ps1 / update_mods.ps1 / server_install.ps1 /
    install.ps1 (PowerShell -match: case-insensitive, last matching line wins)."""
    f = {"filename": "", "side": "both", "mode": "", "url": "", "project": "", "file": ""}
    for raw in text.splitlines():
        line = raw.strip()
        for key in ("filename", "side", "mode", "url"):
            m = re.match(r"^%s\s*=\s*%s(.+)%s" % (key, Q, Q), line, re.I)
            if m:
                f[key] = m.group(1)
        m = re.match(r"^project-id\s*=\s*(\d+)", line, re.I)
        if m:
            f["project"] = m.group(1)
        m = re.match(r"^file-id\s*=\s*(\d+)", line, re.I)
        if m:
            f["file"] = m.group(1)
    return f if f["filename"] else None


def ps_cleanup_filenames(text):
    """cleanup_stale_jars.ps1: every line matching ^\\s*filename\\s*=\\s*['"](.+)['"]."""
    out = []
    for raw in text.splitlines():
        m = re.match(r"^\s*filename\s*=\s*%s(.+)%s" % (Q, Q), raw, re.I)
        if m:
            out.append(m.group(1))
    return out


def sh_grep_fields(text, both_quotes):
    """grep '^key' file | head -1 | sed "s/^key = '//;s/'$//" (first matching line)."""
    f = {}
    q = "['\"]" if both_quotes else "'"
    lines = text.split("\n")
    for key in ("filename", "side", "mode", "url"):
        v = ""
        for line in lines:
            if line.startswith(key):
                v = re.sub("^%s = %s" % (key, q), "", line, count=1)
                v = re.sub("%s$" % q, "", v, count=1)
                break
        f[key] = v
    for key, name in (("project-id", "project"), ("file-id", "file")):
        v = ""
        for line in lines:
            if line.startswith(key):
                v = re.sub("^%s = " % key, "", line, count=1)
                break
        f[name] = v
    return f if f["filename"] else None


def sh_case_fields(text):
    """update_mods.sh: while read; case "$line" in 'key = '*) ... (last matching line wins)."""
    f = {"filename": "", "side": "both", "mode": "", "url": "", "project": "", "file": ""}
    for raw in text.split("\n"):
        line = raw.lstrip()
        for key in ("filename", "side", "mode", "url"):
            if line.startswith(key + " = "):
                v = re.sub(r"^%s\s*=\s*['\"]" % key, "", line, count=1)
                f[key] = re.sub(r"['\"]$", "", v, count=1)
        if line.startswith("file-id = "):
            f["file"] = re.sub(r"^file-id\s*=\s*", "", line, count=1)
        if line.startswith("project-id = "):
            f["project"] = re.sub(r"^project-id\s*=\s*", "", line, count=1)
    return f if f["filename"] else None


def declared_hash(text):
    d = parse_strict(text)
    if d is not None:
        dl = d.get("download") or {}
        if dl.get("hash"):
            return "%s:%s" % (dl.get("hash-format"), dl.get("hash"))
        return None
    h = re.search(r"(?m)^hash\s*=\s*['\"]([0-9a-fA-F]+)['\"]", text)
    f = re.search(r"(?m)^hash-format\s*=\s*['\"]([^'\"]+)['\"]", text)
    return "%s:%s" % (f.group(1) if f else None, h.group(1)) if h else None


# ----------------------------------------------------------------------------- urls

def forgecdn(file_id, encoded_name):
    s = str(file_id)
    rest = s[4:].lstrip("0") or "0"
    return "https://edge.forgecdn.net/files/%s/%s/%s" % (s[:4], rest, encoded_name)


def cf_api(project, file_id):
    return "https://www.curseforge.com/api/v1/mods/%s/files/%s/download" % (project, file_id)


def rust_urls(f):
    if f["mode"] == "url":
        return [f["url"]] if f["url"] else []
    if f["mode"] == "metadata:curseforge" and f["file"] is not None:
        out = [forgecdn(f["file"], urllib.parse.quote(f["filename"], safe="-_.~/()!*';:@&=+$,"))]
        if f["project"] is not None:
            out.append(cf_api(f["project"], f["file"]))
        return out
    return []


def ps_urls(f, escape=True, fallback=True):
    if f["mode"] == "url" and f["url"]:
        return [f["url"]]
    if f["mode"] == "metadata:curseforge" and f["file"]:
        # [uri]::EscapeDataString under Windows PowerShell 5.1 (.NET Framework) leaves ! * ' ( ) alone
        name = urllib.parse.quote(f["filename"], safe="-_.~!*'()") if escape else f["filename"]
        out = [forgecdn(f["file"], name)]
        if fallback and f["project"]:
            out.append(cf_api(f["project"], f["file"]))
        return out
    return []


def sh_api_urls(f):
    if f["mode"] == "url" and f["url"]:
        return [f["url"]]
    if f["mode"] == "metadata:curseforge" and f["project"] and f["file"]:
        return [cf_api(f["project"], f["file"])]
    return []


def sh_cdn_urls(f):
    if f["mode"] == "url" and f["url"]:
        return [f["url"]]
    if f["mode"] == "metadata:curseforge" and f["file"]:
        out = [forgecdn(f["file"], urllib.parse.quote(f["filename"]))]
        if f["project"]:
            out.append(cf_api(f["project"], f["file"]))
        return out
    return []


# ------------------------------------------------------------ lists kept in scripts

def strings_in(block):
    return [a or b for a, b in re.findall(r"\"([^\"]*)\"|'([^']*)'", re.sub(r"(?m)#.*$", "", block))]


def ps_array(text, var):
    """`$var = @( ... )`: on one line, or closed by a line that starts with `)`."""
    m = re.search(r"(?m)^[ \t]*\$%s\s*=\s*@\(([^\r\n]*)\)[ \t]*\r?$" % var, text)
    if not m:
        m = re.search(r"(?ms)^[ \t]*\$%s\s*=\s*@\((.*?)^[ \t]*\)" % var, text)
    if not m:
        return []
    return strings_in(m.group(1))


def rust_array(text, const):
    m = re.search(r"%s\s*:\s*&\[&str\]\s*=\s*&\[(.*?)\];" % const, text, re.S)
    if not m:
        return []
    return re.findall(r'"([^"]*)"', re.sub(r"(?m)//.*$", "", m.group(1)))


def ci_sub(patterns, name):
    low = name.lower()
    return any(pat.lower() in low for pat in patterns)


def manifest_names(tree, rel):
    if not tree.exists(rel):
        return []
    try:
        return list(json.loads(tree.text(rel).lstrip("﻿")).get("jars", {}).keys())
    except Exception:
        return []


# ------------------------------------------------------------------------ consumers

def entry(urls, text, meta):
    return {"from": urls, "hash": declared_hash(text), "meta": meta}


def committed(jars):
    return {name: {"from": ["committed jar sha256:" + sha], "hash": None, "meta": None} for name, sha in jars.items()}


def finish(want, universe, allowed, purged_fn, notes=None, extra=None):
    """Apply a consumer's cleanup to what it fetched: keep what is allowed and not purged."""
    out_want = {n: v for n, v in want.items() if n in allowed and not purged_fn(n)}
    keep = sorted(n for n in universe if n in allowed and not purged_fn(n))
    res = {"want": dict(sorted(out_want.items())), "keep": keep,
           "fetched_then_removed": sorted(n for n in want if n not in out_want)}
    if notes:
        res["notes"] = notes
    if extra:
        res.update(extra)
    return res


def server_launcher(tree, universe):
    metas = tree.metafiles(".minecraft/server_distribution/mods/.index")
    rs = tree.text("iridescent-launcher/icraft-core/src/packwiz.rs")
    cfg = tree.text("iridescent-launcher/icraft-core/src/config.rs")
    force = rust_array(rs, "FORCE_SKIP_PATTERNS")
    custom = rust_array(cfg, "CUSTOM_JARS")
    deny = rust_array(cfg, "DENY_LIST_PATTERNS")
    parsed = {m: rust_fields(t) for m, t in metas.items()}
    expected, skipped_client, skipped_force = {}, [], []
    for m, f in parsed.items():
        if f is None:
            continue
        if f["side"] == "client":
            skipped_client.append(f["filename"])
        elif ci_sub(force, f["filename"]):
            skipped_force.append(f["filename"])
        else:
            expected[f["filename"]] = entry(rust_urls(f), metas[m], m)
    # The sync copies the committed jars first; update_mods then downloads only what is
    # not on disk, so for a jar that is both committed and indexed the copy is the source.
    want = dict(expected)
    want.update(committed(tree.jars(".minecraft/server_distribution/mods")))
    allowed = {f["filename"] for f in parsed.values() if f} | set(manifest_names(tree, ".minecraft/server_distribution/custom_jars_manifest.json")) | set(custom)

    def purged(n):
        return ci_sub(force, n) or any(pat in n.lower() for pat in deny)

    return finish(want, universe, allowed, purged, extra={
        "index_metafiles": len(metas),
        "index_unique_jars": len({f["filename"] for f in parsed.values() if f}),
        "skipped_side_client": sorted(set(skipped_client)),
        "skipped_force_pattern": sorted(set(skipped_force)),
        "expected_from_index": len(expected),
        "line_regex_fallback": sorted(m for m, f in parsed.items() if f and f["parser"] == "line-regex"),
    })


def ps_client(tree, universe, overlay):
    root = tree.metafiles(".minecraft/mods/.index")
    metas = dict(root)
    overlaid = []
    if overlay:
        for m, t in tree.metafiles(".minecraft/distribution/client/mods/.index").items():
            if m not in metas:
                metas[m] = t
                overlaid.append(m)
    dl = tree.text(".minecraft/distribution/client/download_mods.ps1")
    cl = tree.text(".minecraft/distribution/client/cleanup_stale_jars.ps1")
    force = ps_array(dl, "forceSkip")
    deny = ps_array(cl, "denyList")
    custom = ps_array(cl, "customJars")
    expected, skipped_server = {}, []
    for m, t in metas.items():
        f = ps_fields(t)
        if f is None:
            continue
        if f["side"] == "server":
            skipped_server.append(f["filename"])
            continue
        if ci_sub(force, f["filename"]):
            continue
        expected[f["filename"]] = entry(ps_urls(f), t, m)
    want = dict(expected)
    want.update(committed(tree.jars(".minecraft/mods")))
    allowed = set(custom) | set(manifest_names(tree, ".minecraft/custom_jars_manifest.json"))
    for t in metas.values():
        allowed.update(ps_cleanup_filenames(t))

    def purged(n):
        return any(pat.lower() in n.lower() for pat in deny)

    return finish(want, universe, allowed, purged, extra={
        "index_metafiles": len(metas), "overlaid_from_client_distro": sorted(overlaid),
        "skipped_side_server": sorted(set(skipped_server)), "expected_from_index": len(expected),
    })


def tester_install(tree, universe):
    metas = tree.metafiles(".minecraft/distribution/client/mods/.index")
    want = {}
    for m, t in metas.items():
        f = ps_fields(t)
        if f is None or f["side"] == "server":
            continue
        want[f["filename"]] = entry(ps_urls(f, escape=False, fallback=False), t, m)
    want.update(committed(tree.jars(".minecraft/distribution/client/mods")))
    return {"want": dict(sorted(want.items())), "keep": sorted(want), "index_metafiles": len(metas)}


def legacy_ps_expected(tree, script_rel, metas):
    text = tree.text(script_rel)
    force = ps_array(text, "forceSkip")
    out = {}
    for m, t in metas.items():
        f = ps_fields(t)
        if f is None or f["side"] == "client" or ci_sub(force, f["filename"]):
            continue
        out[f["filename"]] = entry(ps_urls(f), t, m)
    return out


def bat_patterns(text):
    return re.findall(r'(?im)^\s*call :delete "([^"]+)"', text)


def sh_call_patterns(text, fn):
    out = []
    for line in re.findall(r"(?m)^\s*%s (.+)$" % fn, text):
        out += re.findall(r'"([^"]+)"', line)
    return out


def glob_ci(patterns, name):
    return any(fnmatch.fnmatchcase(name.lower(), pat.lower()) for pat in patterns)


def glob_cs(patterns, name):
    return any(fnmatch.fnmatchcase(name, pat) for pat in patterns)


def legacy_windows(tree, universe):
    metas = tree.metafiles(".minecraft/server_distribution/mods/.index")
    want = legacy_ps_expected(tree, ".minecraft/server_distribution/server_install.ps1", metas)
    upd = legacy_ps_expected(tree, ".minecraft/server_distribution/update_mods.ps1", metas)
    for n, v in upd.items():
        want.setdefault(n, v)
    want.update(committed(tree.jars(".minecraft/server_distribution/mods")))
    strip = bat_patterns(tree.text(".minecraft/server_distribution/strip_client_mods.bat"))
    cl = tree.text(".minecraft/server_distribution/cleanup_stale_jars.ps1")
    deny, custom = ps_array(cl, "denyList"), ps_array(cl, "customJars")
    allowed = set(custom) | set(manifest_names(tree, ".minecraft/server_distribution/custom_jars_manifest.json"))
    for t in metas.values():
        allowed.update(ps_cleanup_filenames(t))

    def purged(n):
        return glob_ci(strip, n) or any(pat.lower() in n.lower() for pat in deny)

    return finish(want, universe, allowed, purged, extra={"update_mods_expected": len(upd)})


def legacy_linux(tree, universe):
    metas = tree.metafiles(".minecraft/server_distribution/mods/.index")
    text = tree.text(".minecraft/server_distribution/iridescentserver.sh")
    m = re.search(r"(?ms)^\s*FORCE_SKIP=\((.*?)^\s*\)", text)
    force = strings_in(m.group(1)) if m else []
    want = {}
    for meta, t in metas.items():
        f = sh_grep_fields(t, both_quotes=True)
        if f is None or f["side"] == "client" or any(pat in f["filename"] for pat in force):
            continue
        want[f["filename"]] = entry(sh_api_urls(f), t, meta)
    want.update(committed(tree.jars(".minecraft/server_distribution/mods")))
    strip = sh_call_patterns(text, "strip_mod")

    def purged(n):
        return glob_cs(strip, n)

    # the .sh launcher has no cleanup pass: everything not stripped stays
    return finish(want, universe, set(universe) | set(want), purged)


def server_install_sh(tree, universe):
    metas = tree.metafiles(".minecraft/server_distribution/mods/.index")
    text = tree.text(".minecraft/server_distribution/server_install.sh")
    exclude = set(re.findall(r'(?m)^\s*FORCE_EXCLUDE\["([^"]+)"\]=1', text))
    want = {}
    for meta, t in metas.items():
        f = sh_grep_fields(t, both_quotes=False)
        if f is None or f["side"] == "client" or f["filename"] in exclude:
            continue
        want[f["filename"]] = entry(sh_api_urls(f), t, meta)
    return {"want": dict(sorted(want.items())), "keep": sorted(want)}


def update_mods_sh(tree, universe):
    metas = tree.metafiles(".minecraft/server_distribution/mods/.index")
    text = tree.text(".minecraft/server_distribution/update_mods.sh")
    m = re.search(r'(?m)^\s*FORCE_SKIP="([^"]*)"', text)
    force = m.group(1) if m else ""
    want = {}
    for meta, t in metas.items():
        f = sh_case_fields(t)
        if f is None or f["side"] == "client":
            continue
        if force and re.search(force, f["filename"]):
            continue
        want[f["filename"]] = entry(sh_cdn_urls(f), t, meta)
    return {"want": dict(sorted(want.items())), "keep": sorted(want)}


def update_mods_seed(tree, universe):
    metas = tree.metafiles(".minecraft/server_distribution/mods/.index")
    want = legacy_ps_expected(tree, ".minecraft/server_distribution/IridescentCraft Dedicated Server/update_mods.ps1", metas)
    return {"want": dict(sorted(want.items())), "keep": sorted(want)}


def strip_scripts(tree, universe):
    bat = bat_patterns(tree.text(".minecraft/server_distribution/strip_client_mods.bat"))
    sh = sh_call_patterns(tree.text(".minecraft/server_distribution/strip_client_mods.sh"), "delete_mod")
    return {"want": {}, "keep": [],
            "strip_client_mods.bat_removes": sorted(n for n in universe if glob_ci(bat, n)),
            "strip_client_mods.sh_removes": sorted(n for n in universe if glob_cs(sh, n))}


# Besides `want` and `keep`, the result keys that are an outcome, not a mechanism.
OUTCOME_KEYS = ("aborts", "strip_client_mods.bat_removes", "strip_client_mods.sh_removes")

CONSUMERS = [
    ("server-launcher", server_launcher),
    ("dev-client", lambda t, u: ps_client(t, u, overlay=True)),
    ("tester-fallback", lambda t, u: ps_client(t, u, overlay=False)),
    ("tester-install", tester_install),
    ("legacy-windows", legacy_windows),
    ("legacy-linux", legacy_linux),
    ("server_install.sh", server_install_sh),
    ("update_mods.sh", update_mods_sh),
    ("update_mods.ps1 (seed copy)", update_mods_seed),
    ("strip scripts", strip_scripts),
]


def compute(tree):
    universe = set()
    for rel in (".minecraft/mods/.index", ".minecraft/server_distribution/mods/.index", ".minecraft/distribution/client/mods/.index"):
        for t in tree.metafiles(rel).values():
            universe.update(ps_cleanup_filenames(t))
    for rel in (".minecraft/mods", ".minecraft/server_distribution/mods", ".minecraft/distribution/client/mods"):
        universe.update(tree.jars(rel))
    res = {"tree": tree.label, "universe": sorted(universe), "consumers": {}}
    for name, fn in CONSUMERS:
        res["consumers"][name] = fn(tree, universe)
    return res


# ------------------------------------------------------------------------- commands

def cmd_sets(args):
    tree, tmp = tree_for(args.ref)
    try:
        res = compute(tree)
    finally:
        if tmp:
            shutil.rmtree(tmp, ignore_errors=True)
    if args.out:
        with open(args.out, "w", encoding="utf-8", newline="\n") as f:
            json.dump(res, f, indent=1, sort_keys=True)
    print_summary(res)
    return 0


def print_summary(res):
    print("tree: %s   (%d jar names known to any index or committed)" % (res["tree"], len(res["universe"])))
    for name, c in res["consumers"].items():
        extra = []
        if c.get("aborts"):
            extra.append("STOPS before any download: %d invalid metafile(s) %s" % (c["invalid_metafiles"], c["problems"]))
        for k in ("index_metafiles", "index_unique_jars", "expected_from_index"):
            if k in c:
                extra.append("%s=%s" % (k, c[k]))
        for k in ("skipped_side_client", "skipped_force_pattern", "skipped_side_server", "overlaid_from_client_distro", "fetched_then_removed",
                  "strip_client_mods.bat_removes", "strip_client_mods.sh_removes", "line_regex_fallback"):
            if c.get(k):
                extra.append("%s=%d" % (k, len(c[k])))
        print("  %-28s want %3d  keep %3d   %s" % (name, len(c["want"]), len(c["keep"]), "  ".join(extra)))


def cmd_summary(args):
    with open(args.file, encoding="utf-8") as f:
        print_summary(json.load(f))
    return 0


def cmd_diff(args):
    with open(args.before, encoding="utf-8") as f:
        a = json.load(f)
    with open(args.after, encoding="utf-8") as f:
        b = json.load(f)
    print("before: %s" % a["tree"])
    print("after : %s" % b["tree"])
    ua, ub = set(a["universe"]), set(b["universe"])
    if ua != ub:
        print("jar names known: -%s +%s" % (sorted(ua - ub), sorted(ub - ua)))
    changed_any = False
    for name in a["consumers"]:
        ca, cb = a["consumers"][name], b["consumers"].get(name)
        if cb is None:
            print("  %-28s missing in after" % name)
            changed_any = True
            continue
        wa, wb = ca["want"], cb["want"]
        added, removed = sorted(set(wb) - set(wa)), sorted(set(wa) - set(wb))
        src = sorted(n for n in set(wa) & set(wb) if wa[n]["from"] != wb[n]["from"])
        hsh = sorted(n for n in set(wa) & set(wb) if wa[n]["hash"] != wb[n]["hash"])
        ka, kb = set(ca["keep"]), set(cb["keep"])
        # What a consumer ends up with is the verdict; how it gets there (which filter
        # dropped a jar, how many metafiles it read) is listed but does not count.
        outcome = [k for k in OUTCOME_KEYS if ca.get(k) != cb.get(k)]
        other = sorted(k for k in set(ca) | set(cb) if k not in ("want", "keep", "notes") + OUTCOME_KEYS and ca.get(k) != cb.get(k))
        same = not (added or removed or src or hsh or ka != kb or outcome)
        print("  %-28s want %3d -> %3d   keep %3d -> %3d   %s" % (name, len(wa), len(wb), len(ka), len(kb), "IDENTICAL" if same else "DIFFERS"))
        for k in other:
            va, vb = ca.get(k), cb.get(k)
            if isinstance(va, list) and isinstance(vb, list):
                print("      (how) %s: %d -> %d   -%s +%s" % (k, len(va), len(vb), sorted(set(va) - set(vb)), sorted(set(vb) - set(va))))
            else:
                print("      (how) %s: %s -> %s" % (k, va, vb))
        if same:
            continue
        changed_any = True
        other = outcome
        for label, items in (("want +", added), ("want -", removed)):
            for n in items:
                print("      %s %s" % (label, n))
        for n in src:
            print("      source  %s" % n)
            print("              before %s" % wa[n]["from"])
            print("              after  %s" % wb[n]["from"])
        for n in hsh:
            print("      hash    %-50s %s -> %s" % (n, short(wa[n]["hash"]), short(wb[n]["hash"])))
        for n in sorted(kb - ka):
            print("      keep +  %s" % n)
        for n in sorted(ka - kb):
            print("      keep -  %s" % n)
        for k in other:
            va, vb = ca.get(k), cb.get(k)
            if isinstance(va, list) and isinstance(vb, list):
                print("      %s: -%s +%s" % (k, sorted(set(va) - set(vb)), sorted(set(vb) - set(va))))
            else:
                print("      %s: %s -> %s" % (k, va, vb))
    print("RESULT: %s" % ("differences listed above" if changed_any else "every consumer installs and keeps exactly the same jars, from the same sources, with the same declared hashes"))
    return 1 if changed_any and args.strict else 0


def short(h):
    if not h:
        return "none"
    fmt, _, val = h.partition(":")
    return "%s:%s.." % (fmt, val[:12])


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sets", help="compute the installed sets of a tree")
    s.add_argument("--ref", help="a git ref (default: the working tree)")
    s.add_argument("--out", help="write the full result as JSON")
    s.set_defaults(fn=cmd_sets)
    d = sub.add_parser("diff", help="compare two results")
    d.add_argument("before")
    d.add_argument("after")
    d.add_argument("--strict", action="store_true", help="exit 1 when anything differs")
    d.set_defaults(fn=cmd_diff)
    m = sub.add_parser("summary", help="print the summary of a saved result")
    m.add_argument("file")
    m.set_defaults(fn=cmd_summary)
    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
