#!/usr/bin/env python3
"""
sync-wiki.py — mirror public wiki/ source pages to the GitHub Wiki repo.

Usage:
    python3 .minecraft/tools/sync-wiki.py --wiki-dir <wiki-checkout> [--dry-run]

The wiki-checkout is a clone of silvariasereneblossom/IridescentCraft.wiki.git.
The script reads .minecraft/tools/wiki-sync-manifest.json, applies the listed
link conversions, copies each source file to its destination wiki page, and
prints a summary. Use --dry-run to preview without writing.

Files marked with `<!-- INTERNAL ONLY -->` on the first non-empty line are
skipped as a defense-in-depth check (internal content should never be in the
source files mapped here, but the check costs nothing).

Pages listed under wiki_only in the manifest are NEVER touched by the sync —
they live only on the wiki side (e.g., _Sidebar.md, Tester-Installation-Guide.md).
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path


def _load_manifest(repo_root: Path) -> dict:
    manifest_path = repo_root / ".minecraft" / "tools" / "wiki-sync-manifest.json"
    with open(manifest_path) as f:
        return json.load(f)


def _is_internal_only(content: str) -> bool:
    """Return True if first non-empty/non-frontmatter content line is the marker."""
    for raw in content.splitlines():
        line = raw.strip()
        if not line:
            continue
        # Allow YAML frontmatter to come first
        if line == "---":
            continue
        return line == "<!-- INTERNAL ONLY -->"
    return False


def _apply_conversions(content: str, conversions: dict[str, str]) -> str:
    # Sort by length descending so longer patterns replace before shorter
    # substrings that they'd otherwise be a prefix of.
    items = [(k, v) for k, v in conversions.items() if not k.startswith("_")]
    items.sort(key=lambda kv: -len(kv[0]))
    for src_str, dst_str in items:
        content = content.replace(src_str, dst_str)
    return content


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--wiki-dir",
        required=True,
        help="Path to the GitHub Wiki repo checkout (target dir).",
    )
    parser.add_argument(
        "--repo-root",
        default=".",
        help="Path to the IridescentCraft repo root (default: current dir).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without writing.",
    )
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    wiki_dir = Path(args.wiki_dir).resolve()

    if not wiki_dir.is_dir():
        print(f"ERROR: wiki-dir does not exist: {wiki_dir}", file=sys.stderr)
        return 2

    manifest = _load_manifest(repo_root)
    conversions = manifest.get("link_conversions", {})
    files = manifest.get("files", [])

    if not files:
        print("ERROR: manifest has no files entries", file=sys.stderr)
        return 2

    summary = {"unchanged": [], "updated": [], "created": [], "skipped_internal": [], "missing": []}

    for entry in files:
        src_rel = entry["src"]
        dst_name = entry["dst"]
        src_path = repo_root / src_rel
        dst_path = wiki_dir / dst_name

        if not src_path.is_file():
            summary["missing"].append(src_rel)
            continue

        with open(src_path, encoding="utf-8") as f:
            content = f.read()

        if _is_internal_only(content):
            summary["skipped_internal"].append(src_rel)
            continue

        converted = _apply_conversions(content, conversions)

        existed = dst_path.is_file()
        unchanged = False
        if existed:
            with open(dst_path, encoding="utf-8") as f:
                if f.read() == converted:
                    unchanged = True

        if unchanged:
            summary["unchanged"].append(dst_name)
        elif args.dry_run:
            label = "would-update" if existed else "would-create"
            (summary["updated"] if existed else summary["created"]).append(f"{label}: {dst_name}")
        else:
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            with open(dst_path, "w", encoding="utf-8") as f:
                f.write(converted)
            (summary["updated"] if existed else summary["created"]).append(dst_name)

    print(f"=== sync-wiki summary ({'dry run' if args.dry_run else 'wrote'}) ===")
    print(f"Source repo: {repo_root}")
    print(f"Wiki dir:    {wiki_dir}")
    print()
    if summary["created"]:
        print(f"Created ({len(summary['created'])}):")
        for n in summary["created"]:
            print(f"  + {n}")
    if summary["updated"]:
        print(f"Updated ({len(summary['updated'])}):")
        for n in summary["updated"]:
            print(f"  ~ {n}")
    if summary["unchanged"]:
        print(f"Unchanged ({len(summary['unchanged'])}):")
        for n in summary["unchanged"]:
            print(f"  = {n}")
    if summary["skipped_internal"]:
        print(f"Skipped (INTERNAL ONLY marker) ({len(summary['skipped_internal'])}):")
        for n in summary["skipped_internal"]:
            print(f"  ! {n}")
    if summary["missing"]:
        print(f"Missing source files ({len(summary['missing'])}):")
        for n in summary["missing"]:
            print(f"  ? {n}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
