#!/usr/bin/env python3
"""convert_cf_disabled.py -- find CurseForge mods whose author DISABLED third-party API
distribution and convert their markers from metadata:curseforge -> url-mode forgecdn.

WHY: packwiz-installer downloads metadata:curseforge mods via the CF API. For mods with
"third-party API distribution" turned off, the API returns downloadUrl=null EVEN WITH a valid
key, and packwiz-installer hard-errors ("must be downloaded manually") instead of falling back.
The forgecdn CDN serves these files regardless (verified), and the bespoke download_mods.ps1
always used that hand-shaped CDN URL. So for ONLY the api-disabled mods we pin a url-mode
forgecdn marker; the rest stay metadata:curseforge (resolved via the API at runtime).

Detection is principled (not a hardcoded list): one bulk CF API call (POST /v1/mods/files)
returns downloadUrl per file; null => disabled. Re-run after pack changes; new disabled mods
auto-convert. Keeps [update.curseforge] so `packwiz`-style version bumps still work.

Usage:  CF_API_KEY=... py convert_cf_disabled.py [--apply] <index_dir> [<index_dir> ...]
"""
import os, sys, glob, re, json, urllib.request
from urllib.parse import quote

CF_KEY = os.environ.get("CF_API_KEY", "").strip()
if not CF_KEY:
    print("ERROR: CF_API_KEY not set (needed to query downloadUrl).")
    sys.exit(2)


def forgecdn_url(file_id, filename):
    s = str(file_id)
    p1 = s[:4]
    p2 = s[4:].lstrip("0") or "0"
    return "https://edge.forgecdn.net/files/%s/%s/%s" % (p1, p2, quote(filename))


def main(argv):
    apply = "--apply" in argv
    dirs = [a for a in argv if a != "--apply"]
    if not dirs:
        print("usage: convert_cf_disabled.py [--apply] <index_dir> ..."); return 2

    # collect metadata:curseforge markers -> file_id
    by_fid = {}  # file_id -> list of (path, filename)
    for d in dirs:
        for p in sorted(glob.glob(os.path.join(d, "*.pw.toml"))):
            t = open(p, encoding="utf-8").read()
            if "mode = 'metadata:curseforge'" not in t:
                continue
            mf = re.search(r"file-id\s*=\s*(\d+)", t)
            mn = re.search(r"filename\s*=\s*'([^']*)'", t) or re.search(r'filename\s*=\s*"([^"]*)"', t)
            if mf and mn:
                by_fid.setdefault(int(mf.group(1)), []).append((p, mn.group(1)))
    if not by_fid:
        print("no metadata:curseforge markers found."); return 0
    print("querying CF API for %d file ids (bulk)..." % len(by_fid))

    # bulk downloadUrl lookup (chunk to be safe)
    disabled = set()
    fids = list(by_fid.keys())
    for i in range(0, len(fids), 50):
        chunk = fids[i:i + 50]
        body = json.dumps({"fileIds": chunk}).encode()
        req = urllib.request.Request(
            "https://api.curseforge.com/v1/mods/files", data=body,
            headers={"x-api-key": CF_KEY, "Content-Type": "application/json",
                     "Accept": "application/json", "User-Agent": "IridescentCraft/1.0"})
        data = json.load(urllib.request.urlopen(req, timeout=60))
        for f in data.get("data", []):
            if not f.get("downloadUrl"):
                disabled.add(f["id"])

    if not disabled:
        print("[cf-disabled] none found -- all CF mods are API-downloadable.")
        return 0

    converted = 0
    for fid in sorted(disabled):
        for (p, filename) in by_fid[fid]:
            url = forgecdn_url(fid, filename)
            raw = open(p, "rb").read()
            text = raw.decode("utf-8")
            nl = "\r\n" if "\r\n" in text else "\n"
            lines = text.replace("\r\n", "\n").split("\n")
            out = []
            for l in lines:
                if l.strip() == "mode = 'metadata:curseforge'":
                    out.append("mode = 'url'")
                    out.append("url = '%s'" % url)
                else:
                    out.append(l)
            new = nl.join(out).encode("utf-8")
            tag = "CONVERT" if apply else "would-convert"
            print("  %s %-44s file-id=%s -> forgecdn url-mode" % (tag, os.path.basename(p), fid))
            if apply:
                open(p, "wb").write(new)
            converted += 1
    print("\n[cf-disabled] %s: %d api-disabled marker(s) -> url-mode forgecdn"
          % ("APPLIED" if apply else "DRY-RUN", converted))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
