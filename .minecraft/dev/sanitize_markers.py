#!/usr/bin/env python3
"""sanitize_markers.py -- make the packwiz .pw.toml metafiles valid for the STRICT
packwiz-installer TOML parser. The lenient regex-based download_mods.ps1 tolerated these
defects; packwiz-installer (tomlj) ABORTS the whole sync on any single bad metafile.

Fixes (per the 2026-06-23 empirical-test census -- docket #109):
  (b) metadata:curseforge markers with empty `url = ''`     -> drop the url line (packwiz
      resolves CF via the API from [update.curseforge]; an empty url makes it try to parse "")
  (c) url-mode markers missing `hash`                        -> resolve via the Modrinth API / CDN
  (d) metadata:curseforge markers missing `hash`            -> resolve via the CurseForge API
  (e) unescaped apostrophe in a single-quoted name/filename -> re-emit as a double-quoted string
  (f) empty `side = ''`                                      -> 'both'

PRESERVES each file's existing line endings (437/460 are CRLF) so the diff is minimal and we
don't churn 400+ files. CRLF is valid TOML -- NOT a defect.

All fixes are BEHAVIOR-NEUTRAL for download_mods.ps1 (it ignores hashes, builds CF URLs from
file-id, never reads `name`), so this is safe to ship during the bespoke->packwiz transition.

Usage:
  py sanitize_markers.py <index_dir> [<index_dir> ...]           # dry-run report
  py sanitize_markers.py --apply <index_dir> [<index_dir> ...]   # write fixes
CF hash resolution needs CF_API_KEY in the env (falls back to a forgecdn download if absent).
"""
import os, sys, glob, json, re, time, hashlib, urllib.request
from urllib.parse import quote

UA = "IridescentCraft-marker-sanitizer/1.0"
HASHERS = {"sha1": hashlib.sha1, "sha256": hashlib.sha256, "sha512": hashlib.sha512, "md5": hashlib.md5}
CF_KEY = os.environ.get("CF_API_KEY", "").strip()
_cache = {}


def _http_json(url, headers=None, tries=4):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=headers or {"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.load(r)
        except Exception as e:  # noqa
            last = e; time.sleep(1.5 * (i + 1))
    raise last


def _download_hash(url, hfmt, tries=4):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 IridescentCraft"})
            with urllib.request.urlopen(req, timeout=180) as r:
                h = HASHERS[hfmt]()
                for chunk in iter(lambda: r.read(1 << 20), b""):
                    h.update(chunk)
                return h.hexdigest()
        except Exception as e:  # noqa
            last = e; time.sleep(1.5 * (i + 1))
    raise last


def resolve_modrinth(url, hfmt):
    key = ("mr", url, hfmt)
    if key in _cache:
        return _cache[key]
    try:
        vid = url.split("/versions/")[1].split("/")[0]
        data = _http_json("https://api.modrinth.com/v2/version/%s" % vid)
        digest = None
        files = data.get("files", [])
        for f in files:
            if f.get("url") == url:
                digest = f["hashes"].get(hfmt); break
        if not digest:
            for f in files:
                if f.get("primary"):
                    digest = f["hashes"].get(hfmt); break
        if not digest and files:
            digest = files[0]["hashes"].get(hfmt)
        if digest:
            _cache[key] = digest; return digest
    except Exception:
        pass
    digest = _download_hash(url, hfmt)
    _cache[key] = digest
    return digest


def resolve_curseforge(project_id, file_id, filename, hfmt):
    key = ("cf", file_id, hfmt)
    if key in _cache:
        return _cache[key]
    if CF_KEY:
        try:
            data = _http_json("https://api.curseforge.com/v1/mods/%s/files/%s" % (project_id, file_id),
                              headers={"User-Agent": UA, "x-api-key": CF_KEY, "Accept": "application/json"})
            algo = {1: "sha1", 2: "md5"}
            for h in data.get("data", {}).get("hashes", []):
                if algo.get(h.get("algo")) == hfmt:
                    _cache[key] = h["value"].lower(); return _cache[key]
        except Exception:
            pass
    fid = str(file_id); p1 = fid[:4]; p2 = fid[4:].lstrip("0") or "0"
    url = "https://edge.forgecdn.net/files/%s/%s/%s" % (p1, p2, quote(filename))
    digest = _download_hash(url, hfmt)
    _cache[key] = digest
    return digest


def _scalar(lines, key, section_filter=None):
    """first single-quoted value for `key`, optionally only inside [section_filter]."""
    section = ""
    for l in lines:
        s = l.strip()
        if s.startswith("[") and s.endswith("]"):
            section = s.strip("[]"); continue
        if section_filter is not None and section != section_filter:
            continue
        m = re.match(r"%s\s*=\s*'([^']*)'" % re.escape(key), s)
        if m:
            return m.group(1)
    return None


def sanitize(text, apply, changes):
    nl = "\r\n" if "\r\n" in text else "\n"
    lines = text.replace("\r\n", "\n").split("\n")

    mode = _scalar(lines, "mode", "download")
    has_hash = any(re.match(r"hash\s*=\s*'", l.strip()) for l in lines)
    hfmt = _scalar(lines, "hash-format", "download") or ("sha1" if mode == "metadata:curseforge" else "sha512")
    filename = _scalar(lines, "filename")

    out = []
    for l in lines:
        s = l.strip()
        if re.match(r"side\s*=\s*''\s*$", s):
            out.append("side = 'both'"); changes["side"] += 1; continue
        if re.match(r"url\s*=\s*''\s*$", s):
            changes["empty_url"] += 1; continue  # drop
        m = re.match(r"(name|filename)\s*=\s*'(.*)'\s*$", s)
        if m and "'" in m.group(2):
            val = m.group(2).replace("\\", "\\\\").replace('"', '\\"')
            out.append('%s = "%s"' % (m.group(1), val)); changes["apostrophe"] += 1; continue
        out.append(l)

    if not has_hash and mode:
        digest = None
        if mode == "url":
            url = _scalar(out, "url", "download")
            if url:
                digest = resolve_modrinth(url, hfmt) if "modrinth.com" in url else _download_hash(url, hfmt)
        elif mode == "metadata:curseforge":
            pid = _scalar(out, "project-id", "update.curseforge")
            fid = _scalar(out, "file-id", "update.curseforge")
            # project-id/file-id are bare ints, not quoted -- read them directly
            for l in out:
                mm = re.match(r"project-id\s*=\s*(\d+)", l.strip());  pid = mm.group(1) if mm else pid
                mm = re.match(r"file-id\s*=\s*(\d+)", l.strip());     fid = mm.group(1) if mm else fid
            if pid and fid and filename:
                digest = resolve_curseforge(pid, fid, filename, hfmt)
        if digest:
            # insert `hash = '...'` right before the hash-format line in [download]
            ins = []
            done = False
            for l in out:
                if not done and re.match(r"hash-format\s*=", l.strip()):
                    ins.append("hash = '%s'" % digest); done = True
                ins.append(l)
            out = ins
            changes["missing_hash"] += 1

    new = nl.join(out)
    return new


def main(argv):
    apply = False
    dirs = []
    for a in argv:
        if a == "--apply":
            apply = True
        else:
            dirs.append(a)
    if not dirs:
        print("usage: sanitize_markers.py [--apply] <index_dir> ..."); return 2

    changes = {"side": 0, "empty_url": 0, "apostrophe": 0, "missing_hash": 0}
    files_changed = 0
    for d in dirs:
        for p in sorted(glob.glob(os.path.join(d, "*.pw.toml"))):
            raw = open(p, "rb").read()
            text = raw.decode("utf-8")
            before = dict(changes)
            new = sanitize(text, apply, changes)
            file_touched = (new.encode("utf-8") != raw)
            if file_touched:
                files_changed += 1
                tag = "FIX " if apply else "would-fix"
                deltas = {k: changes[k] - before[k] for k in changes if changes[k] != before[k]}
                print("  %s %-46s %s" % (tag, os.path.basename(p), deltas))
                if apply:
                    open(p, "wb").write(new.encode("utf-8"))
    mode = "APPLIED" if apply else "DRY-RUN"
    print("\n[sanitize] %s: %d files changed; by class: %s" % (mode, files_changed, changes))
    if not CF_KEY and changes["missing_hash"]:
        print("[sanitize] NOTE: CF_API_KEY not set -- any CF missing-hash used the forgecdn fallback.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
