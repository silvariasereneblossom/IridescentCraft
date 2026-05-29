#!/usr/bin/env python3
# =============================================================================
# rename_robe_to_vestment.py
#
# One-shot migration: collapses the four pre-existing "Mage" modules under a
# consistent `vestment_*` namespace, in preparation for the upcoming Runed
# sibling archetype that will live alongside Vestment as the second Mage
# variant.
#
# Renames (module short name -> new short name):
#     robe_chest        -> vestment_chest
#     robed_leg_plate   -> vestment_leg_plate
#     robed_boot_sole   -> vestment_boot_sole
#     circlet           -> vestment_crown
#
# Touches:
#   - data/tetra/modules/*/<old>.json         (file rename + key field)
#   - data/tetra/schematics/iridescent_reforging/*/<old>.json
#   - data/tetra/repairs/*/<old>__<material>.json (file rename)
#   - data/tetra/replacements/irons_spellbooks__*.json (content references)
#   - assets/iridescent_reforging/lang/en_us.json (module + variant lang keys
#     + human-readable display names)
#   - src/main/java/... (string constants referencing module IDs)
#
# Does NOT touch:
#   - build/ outputs (gradle regenerates)
#   - save-game NBT (handled by StackNbtMigrator.java extension shipped alongside)
#   - icraft_tetra_materials datapack (no robe/circlet refs)
#
# Naming-collision safety:
#   "robed_*" must be replaced BEFORE "robe_*" or naive substring replacement
#   produces "vestmentd_*". The RENAMES dict is iterated longest-old-key first.
#
# Usage:
#   python3 rename_robe_to_vestment.py --dry-run    # preview, no writes
#   python3 rename_robe_to_vestment.py              # apply
# =============================================================================
import argparse
import json
import os
import sys
from pathlib import Path

# Tuple list, NOT dict -- order matters for substring safety (longest first).
RENAMES = [
    ("robed_leg_plate",  "vestment_leg_plate"),
    ("robed_boot_sole",  "vestment_boot_sole"),
    ("robe_chest",       "vestment_chest"),
    ("circlet",          "vestment_crown"),
]

# Display-name swaps in lang (longest-first by old-name to avoid partial hits).
DISPLAY_RENAMES = [
    ("Robed",   "Vestment"),
    ("Robe",    "Vestment"),
    ("Circlet", "Vestment"),
]

# Slot prefix per old name (for repair-def file matching + replacement content).
SLOT_PER_MODULE = {
    "robe_chest":       "chestplate",
    "robed_leg_plate":  "leggings",
    "robed_boot_sole":  "boots",
    "circlet":          "helmet",
}


def find_mod_root() -> Path:
    """Locate the iridescent-tetra-expansion-mod root from script location."""
    here = Path(__file__).resolve()
    # tools/<script>.py -> tools/ -> mod root
    mod_root = here.parent.parent
    if not (mod_root / "src" / "main" / "resources").is_dir():
        sys.exit(f"[rename] not a mod root: {mod_root}")
    return mod_root


def apply_renames_in_text(text: str) -> str:
    """Substring replacement, longest-old-key first to avoid partial-match
    poisoning ('robed_*' must be replaced before 'robe_*')."""
    for old, new in RENAMES:
        text = text.replace(old, new)
    return text


def apply_display_renames_in_lang(text: str) -> str:
    """For lang display names only -- replaces 'Robed'/'Robe'/'Circlet' with
    'Vestment' inside string VALUES, but only on lines whose KEY references
    one of the renamed (now new-name) modules. This protects unrelated lang
    entries like `tooltip.iridescent_reforging.weight.robe: "Robe Armor"`
    which name the conceptual ROBE weight class -- per design, that weight
    class persists as the parent category housing Vestment + Runed as
    sub-variants, so its display name does NOT change.

    Invariant: this runs AFTER the module-name renames have rewritten KEYS.
    So we look for NEW module names (vestment_*) in the key portion, not old."""
    new_module_short_names = [new for _, new in RENAMES]

    out_lines = []
    for line in text.splitlines(keepends=True):
        # Lang lines look like:  "  \"key.path\": \"display value\",\n"
        # Naive split-on-": " is good enough; lang files don't put ": " in keys.
        if ":" in line:
            colon_idx = line.find(":")
            key_part = line[:colon_idx]
            if any(name in key_part for name in new_module_short_names):
                value_part = line[colon_idx:]
                for old, new in DISPLAY_RENAMES:
                    value_part = value_part.replace(old, new)
                line = key_part + value_part
        out_lines.append(line)
    return "".join(out_lines)


class Migration:
    def __init__(self, mod_root: Path, dry_run: bool):
        self.mod_root = mod_root
        self.dry_run = dry_run
        self.renames: list[tuple[Path, Path]] = []
        self.rewrites: list[Path] = []

    def schedule_rename(self, src: Path, dst: Path):
        self.renames.append((src, dst))

    def schedule_rewrite(self, path: Path):
        if path not in self.rewrites:
            self.rewrites.append(path)

    def run(self):
        res = self.mod_root / "src" / "main" / "resources"
        java = self.mod_root / "src" / "main" / "java"

        # --- 1. Module JSONs (4 files) ---
        for old, new in RENAMES:
            slot = SLOT_PER_MODULE[old]
            p_old = res / "data" / "tetra" / "modules" / slot / f"{old}.json"
            p_new = res / "data" / "tetra" / "modules" / slot / f"{new}.json"
            if p_old.exists():
                self.schedule_rename(p_old, p_new)

        # --- 2. Schematic JSONs (4 files) ---
        for old, new in RENAMES:
            slot = SLOT_PER_MODULE[old]
            p_old = res / "data" / "tetra" / "schematics" / "iridescent_reforging" / slot / f"{old}.json"
            p_new = res / "data" / "tetra" / "schematics" / "iridescent_reforging" / slot / f"{new}.json"
            if p_old.exists():
                self.schedule_rename(p_old, p_new)

        # --- 3. Repair definitions (13 materials x 4 slots = 52 files) ---
        for old, new in RENAMES:
            slot = SLOT_PER_MODULE[old]
            repair_dir = res / "data" / "tetra" / "repairs" / slot
            if not repair_dir.is_dir():
                continue
            for p in repair_dir.iterdir():
                if p.name.startswith(f"{old}__"):
                    p_new = repair_dir / p.name.replace(f"{old}__", f"{new}__", 1)
                    self.schedule_rename(p, p_new)

        # --- 4. All content rewrites: scan JSON + Java for old module names ---
        for root_dir, exts in [
            (res, {".json"}),
            (java, {".java"}),
        ]:
            if not root_dir.is_dir():
                continue
            for p in root_dir.rglob("*"):
                if p.is_dir() or p.suffix not in exts:
                    continue
                # Skip files we're going to rename anyway -- their content
                # gets rewritten when we read+rename below.
                if any(p == src for src, _ in self.renames):
                    self.schedule_rewrite(p)
                    continue
                try:
                    txt = p.read_text(encoding="utf-8")
                except (UnicodeDecodeError, OSError):
                    continue
                if any(old in txt for old, _ in RENAMES):
                    self.schedule_rewrite(p)

        # --- 5. Lang file gets a separate pass (handles display names too) ---
        lang = res / "assets" / "iridescent_reforging" / "lang" / "en_us.json"
        if lang.exists():
            # Already scheduled by the rewrite pass above if it had old names;
            # ensure we apply the display-name pass to it specifically.
            self.schedule_rewrite(lang)

        # --- execute ---
        print(f"[rename] mod_root: {self.mod_root}")
        print(f"[rename] dry_run:  {self.dry_run}")
        print(f"[rename] file renames scheduled:  {len(self.renames)}")
        print(f"[rename] content rewrites scheduled: {len(self.rewrites)}")

        # Apply content rewrites FIRST (before renames change paths).
        for p in self.rewrites:
            try:
                old_txt = p.read_text(encoding="utf-8")
            except OSError as e:
                print(f"[rename] WARN: cannot read {p}: {e}")
                continue
            new_txt = apply_renames_in_text(old_txt)
            # Lang gets the display-name pass too.
            if p.name == "en_us.json" and "lang" in p.parts:
                new_txt = apply_display_renames_in_lang(new_txt)
            if new_txt == old_txt:
                continue
            rel = p.relative_to(self.mod_root)
            print(f"[rename] rewrite: {rel}")
            if not self.dry_run:
                p.write_text(new_txt, encoding="utf-8")

        # Apply file renames.
        for src, dst in self.renames:
            rel_src = src.relative_to(self.mod_root)
            rel_dst = dst.relative_to(self.mod_root)
            print(f"[rename] mv: {rel_src} -> {rel_dst.name}")
            if not self.dry_run:
                if dst.exists():
                    print(f"[rename] WARN: target exists, skipping: {rel_dst}")
                    continue
                src.rename(dst)

        print("[rename] done.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="preview only, no writes")
    args = ap.parse_args()

    mod_root = find_mod_root()
    Migration(mod_root, dry_run=args.dry_run).run()


if __name__ == "__main__":
    main()
