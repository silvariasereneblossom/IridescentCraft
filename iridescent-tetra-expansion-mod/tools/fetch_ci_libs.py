#!/usr/bin/env python3
# =============================================================================
# fetch_ci_libs.py -- populate libs/ with the compile-time mod dependency jars
# the Tetra-expansion build needs (Tetra, ISS, Curios, Ars, Geckolib, Apothic
# Attributes, CoFH Core, mutil).
#
# Why this exists:
#   build.gradle declares these as `compileOnly fg.deobf("blank:<name>:<ver>")`
#   resolved from a flatDir at libs/. Those jars are third-party binaries with
#   redistribution terms we don't want to vendor into a PUBLIC repo, so libs/
#   is NOT committed. CI (and a fresh local checkout) call this script to pull
#   them from their authors' official CDNs instead.
#
# Source of truth: tools/ci_libs.json -- a pinned manifest of
#   {name, url, sha256, size} entries. The URLs are IMMUTABLE per-version CDN
#   links (Modrinth /data/<proj>/versions/<id>/..., CurseForge mediafilez
#   /files/<id>/...), so a given manifest always yields byte-identical jars.
#   Every download is sha256-verified against the manifest; a mismatch is a
#   hard failure (tamper / wrong-version / truncated download), never a
#   silent best-effort.
#
# flatDir contract: the SAVED filename must equal the gradle coordinate's
#   `<name>-<version>.jar` (group is ignored by flatDir). A few upstream
#   filenames differ from the coordinate (curios ships `...5.14.1+1.20.1.jar`
#   with a `+`; the coordinate uses `-`), so the manifest's `name` field is
#   the SAVE name, independent of the URL's basename.
#
# Usage:
#   python3 tools/fetch_ci_libs.py            # fetch into ./libs (idempotent)
#   python3 tools/fetch_ci_libs.py --dest X   # fetch into X
#   python3 tools/fetch_ci_libs.py --force    # re-download even if present+valid
#
# Exit 0 = all libs present + checksum-verified. Non-zero = a download or
# checksum failed (the build cannot succeed; fail loud here, not at compile).
# =============================================================================

import argparse
import hashlib
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HERE, "ci_libs.json")
DEFAULT_DEST = os.path.normpath(os.path.join(HERE, "..", "libs"))


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url, dest_path):
    req = urllib.request.Request(url, headers={"User-Agent": "icraft-ci-fetch"})
    tmp = dest_path + ".part"
    with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as out:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
    os.replace(tmp, dest_path)


def main():
    ap = argparse.ArgumentParser(description="Fetch compile-time mod libs for the Tetra-expansion build.")
    ap.add_argument("--dest", default=DEFAULT_DEST, help="directory to populate (default: ../libs)")
    ap.add_argument("--force", action="store_true", help="re-download even if a valid jar is already present")
    args = ap.parse_args()

    with open(MANIFEST, encoding="utf-8") as f:
        entries = json.load(f)

    os.makedirs(args.dest, exist_ok=True)
    failures = []

    for e in entries:
        name, url, want = e["name"], e["url"], e["sha256"]
        path = os.path.join(args.dest, name)

        if not args.force and os.path.exists(path):
            have = sha256_of(path)
            if have == want:
                print(f"  ok (cached)   {name}")
                continue
            print(f"  stale ({have[:12]}.. != {want[:12]}..), refetching {name}")

        print(f"  downloading   {name}  <- {url}")
        try:
            download(url, path)
        except Exception as ex:  # noqa: BLE001 -- report + continue so we list ALL failures
            failures.append(f"{name}: download error: {ex}")
            continue

        have = sha256_of(path)
        if have != want:
            failures.append(f"{name}: sha256 mismatch (got {have}, want {want})")
            os.remove(path)
            continue
        size = os.path.getsize(path)
        if "size" in e and size != e["size"]:
            failures.append(f"{name}: size mismatch (got {size}, want {e['size']})")
            os.remove(path)
            continue
        print(f"  verified      {name}  ({size} bytes)")

    if failures:
        print("\nERROR: could not provision all compile-time libs:", file=sys.stderr)
        for fmsg in failures:
            print(f"  - {fmsg}", file=sys.stderr)
        print(
            "\nThese are pinned to immutable CDN URLs in tools/ci_libs.json. A failure here "
            "usually means an upstream CDN hiccup (retry the job) or a manifest that no longer "
            "matches what the URL serves (regenerate it).",
            file=sys.stderr,
        )
        return 1

    print(f"\nAll {len(entries)} compile-time libs present + checksum-verified in {args.dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
