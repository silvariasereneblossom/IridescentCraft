#!/usr/bin/env python3
"""gen_packwiz_index.py -- in-house `packwiz refresh` for the IridescentCraft packwiz pack(s).

WHY in-house (not the packwiz binary): packwiz ships NO GitHub release, its nightly CI
artifacts expire after 90 days, and Go isn't installed on the build box -- so `packwiz refresh`
can't be reliably wired into the release flow. The index.toml format is small + stable
(packwiz:1.1.0), so we generate it directly. Validated against packwiz-installer v0.5.14.

WHAT it does (mods-only scope -- the config/kubejs overlay is sync_client's job, NOT packwiz):
  - lists every `mods/.index/*.pw.toml` metafile in index.toml with its sha256 + metafile=true
  - writes index.toml (LF, ordinal-sorted -> byte-deterministic)
  - updates pack.toml's [index] hash = sha256(index.toml bytes)

LOAD-BEARING for the cutover: run this after ANY custom-jar rebuild (wired into
regen_custom_jars_manifest.ps1) so a SAME-VERSION content rebuild bumps the metafile hash ->
the index hash -> packwiz-installer detects the change and re-fetches. Without it the index
goes stale and a rebuilt custom jar never re-pulls. See docket #109.

Usage:  py gen_packwiz_index.py [pack_root]   (default: .minecraft/distribution/client)
"""
import hashlib
import os
import re
import sys

MC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .minecraft (this file is in .minecraft/dev/)
DEFAULT_PACK = os.path.join(MC, "distribution", "client")


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def build_index_text(index_dir):
    """index.toml body: one [[files]] block per metafile, ordinal-sorted, LF."""
    metafiles = sorted(
        fn for fn in os.listdir(index_dir) if fn.endswith(".pw.toml")
    )  # default str sort == ordinal/codepoint (ASCII names) -> byte-stable
    lines = ['hash-format = "sha256"', ""]
    for fn in metafiles:
        rel = "mods/.index/" + fn  # forward-slash, relative to pack root
        digest = sha256_file(os.path.join(index_dir, fn))
        lines += ["[[files]]", 'file = "%s"' % rel, 'hash = "%s"' % digest, "metafile = true", ""]
    return "\n".join(lines) + "\n", len(metafiles)


def update_pack_index_hash(pack_path, index_hash):
    """Rewrite the `hash = "..."` line inside pack.toml's [index] section. Line-walk (not a
    blanket regex) so we never touch `hash-format` or a hash in another section."""
    with open(pack_path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    in_index = False
    changed = False
    for i, ln in enumerate(lines):
        s = ln.strip()
        if s.startswith("[") and s.endswith("]"):
            in_index = (s == "[index]")
            continue
        if in_index and re.match(r"hash\s*=", s):
            lines[i] = 'hash = "%s"' % index_hash
            changed = True
            in_index = False  # only the first hash line in [index]
    if not changed:
        raise SystemExit("ERROR: no `hash =` line found in [index] of %s" % pack_path)
    with open(pack_path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))


def refresh(pack_root):
    pack_root = os.path.abspath(pack_root)
    index_dir = os.path.join(pack_root, "mods", ".index")
    pack_path = os.path.join(pack_root, "pack.toml")
    if not os.path.isdir(index_dir):
        raise SystemExit("ERROR: no mods/.index under %s" % pack_root)
    if not os.path.isfile(pack_path):
        raise SystemExit("ERROR: no pack.toml under %s" % pack_root)

    index_text, n = build_index_text(index_dir)
    index_bytes = index_text.encode("utf-8")
    index_path = os.path.join(pack_root, "index.toml")
    with open(index_path, "wb") as f:
        f.write(index_bytes)

    index_hash = hashlib.sha256(index_bytes).hexdigest()
    update_pack_index_hash(pack_path, index_hash)
    print("[packwiz-index] %s: %d metafiles -> index.toml; pack.toml [index] hash=%s"
          % (os.path.relpath(pack_root, MC), n, index_hash[:12]))


if __name__ == "__main__":
    refresh(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PACK)
