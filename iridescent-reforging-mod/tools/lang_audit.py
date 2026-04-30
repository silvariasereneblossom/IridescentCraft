#!/usr/bin/env python3
"""
Walk every Tetra data file (modules / schematics / materials / improvements)
and verify the matching translation key exists in our en_us.json. Tetra's UI
falls through to raw IDs when keys are missing, so we want this red-flagged
*before* a build ships.

Required key patterns (per data type):
  modules/<slot>/<sub>.json
    - tetra.slot.<slot>/<sub>
    - tetra.module.<slot>/<sub>.name
    - tetra.module.<slot>/<sub>.description
    - tetra.module.<slot>/<sub>.material_name
    - tetra.module.<slot>/<sub>.prefix
    For each variant:
      - tetra.variant.<variant_key>.name
      - tetra.variant.<variant_key>.prefix

  schematics/<path>.json
    - tetra/schematic/<path>.name      (uses '/' separator — Tetra quirk)
    - tetra/schematic/<path>.description
    - tetra/schematic/<path>.slot1     (per-slot label, slot2 if multi-slot)

  materials/<path>.json
    - tetra.material.<key>             (key from JSON's "key" field)
    - tetra.material.<key>.prefix
    - tetra.variant_category.<category>.label  (only first time we see each)

  improvements/<path>.json (array of level entries sharing a key)
    - tetra.improvement.<key>.name
    - tetra.improvement.<key>.description

Exit code: 0 if zero gaps, 1 otherwise. CI / build script can gate on this.
"""
import json
import sys
from pathlib import Path
from collections import defaultdict

MOD_ROOT = Path(__file__).resolve().parent.parent
LANG = MOD_ROOT / "src/main/resources/assets/iridescent_reforging/lang/en_us.json"
DATA_TETRA = MOD_ROOT / "src/main/resources/data/tetra"

def load_lang():
    with open(LANG) as f:
        return json.load(f)

def audit_modules(lang):
    """Modules contribute slot meta + per-variant keys."""
    gaps = []
    seen_variants = set()
    for jf in sorted((DATA_TETRA / "modules").rglob("*.json")):
        with open(jf) as f:
            d = json.load(f)
        slots = d.get("slots", [])
        for slot in slots:
            for k in [
                f"tetra.slot.{slot}",
                f"tetra.module.{slot}.name",
                f"tetra.module.{slot}.description",
                f"tetra.module.{slot}.material_name",
                f"tetra.module.{slot}.prefix",
            ]:
                if k not in lang:
                    gaps.append((str(jf.relative_to(MOD_ROOT)), k, "module-meta"))
        for v in d.get("variants", []):
            vk = v.get("key", "")
            if not vk or vk in seen_variants:
                continue
            seen_variants.add(vk)
            # Tetra strips trailing '/' from the variant key before lang
            # lookup. The canonical key shape is BARE — no .name/.prefix
            # suffix (per Tetra's own lang: 102 bare keys vs 3 outliers).
            lookup_key = vk.rstrip("/")
            k = f"tetra.variant.{lookup_key}"
            if k not in lang:
                gaps.append((str(jf.relative_to(MOD_ROOT)), k, "variant"))
    return gaps

def audit_schematics(lang):
    """Schematics use '/' separators in the lang key (Tetra-specific quirk)."""
    gaps = []
    schematics_root = DATA_TETRA / "schematics"
    if not schematics_root.exists():
        return gaps
    for jf in sorted(schematics_root.rglob("*.json")):
        # Path key: e.g. iridescent_reforging/leggings/leg_plate_main
        rel = jf.relative_to(schematics_root)
        path_key = str(rel.with_suffix(""))
        with open(jf) as f:
            d = json.load(f)
        keys_required = [
            f"tetra/schematic/{path_key}.name",
            f"tetra/schematic/{path_key}.description",
        ]
        # Tetra only renders the material slot label when the schematic
        # actually accepts a material input. Honing schematics have
        # materialSlotCount: 0 — no slotN keys needed there.
        slot_count = int(d.get("materialSlotCount", 0))
        for i in range(1, slot_count + 1):
            keys_required.append(f"tetra/schematic/{path_key}.slot{i}")
        for k in keys_required:
            if k not in lang:
                gaps.append((str(jf.relative_to(MOD_ROOT)), k, "schematic"))
    return gaps

def audit_materials(lang):
    """Materials need name + prefix; variant_category needs label (once per category)."""
    gaps = []
    materials_root = DATA_TETRA / "materials"
    if not materials_root.exists():
        return gaps
    seen_categories = set()
    for jf in sorted(materials_root.rglob("*.json")):
        with open(jf) as f:
            d = json.load(f)
        key = d.get("key")
        if not key:
            continue
        for k in [f"tetra.material.{key}", f"tetra.material.{key}.prefix"]:
            if k not in lang:
                gaps.append((str(jf.relative_to(MOD_ROOT)), k, "material"))
        category = d.get("category")
        if category and category not in seen_categories:
            seen_categories.add(category)
            ck = f"tetra.variant_category.{category}.label"
            if ck not in lang:
                gaps.append((str(jf.relative_to(MOD_ROOT)), ck, "variant_category"))
    return gaps

def audit_improvements(lang):
    """Improvements: name + description per unique key (file may hold multiple
    levels under one key)."""
    gaps = []
    improvements_root = DATA_TETRA / "improvements"
    if not improvements_root.exists():
        return gaps
    seen_keys = set()
    for jf in sorted(improvements_root.rglob("*.json")):
        with open(jf) as f:
            d = json.load(f)
        # File may be array of {key, level, ...} or a single object
        entries = d if isinstance(d, list) else [d]
        for e in entries:
            key = e.get("key")
            if not key or key in seen_keys:
                continue
            seen_keys.add(key)
            for k in [f"tetra.improvement.{key}.name",
                       f"tetra.improvement.{key}.description"]:
                if k not in lang:
                    gaps.append((str(jf.relative_to(MOD_ROOT)), k, "improvement"))
    return gaps

def main():
    lang = load_lang()
    print(f"Loaded {len(lang)} keys from en_us.json\n")

    all_gaps = []
    for label, fn in [
        ("modules",      audit_modules),
        ("schematics",   audit_schematics),
        ("materials",    audit_materials),
        ("improvements", audit_improvements),
    ]:
        gaps = fn(lang)
        print(f"[{label:13s}] gaps: {len(gaps)}")
        all_gaps.extend(gaps)

    if all_gaps:
        # Group by reason for focused output
        by_reason = defaultdict(list)
        for src, key, reason in all_gaps:
            by_reason[reason].append((src, key))
        print("\nMissing keys by category:")
        for reason, items in sorted(by_reason.items()):
            print(f"\n  [{reason}] {len(items)} entries")
            for src, key in items[:8]:
                print(f"    {key}")
                print(f"        from {src}")
            if len(items) > 8:
                print(f"    ... +{len(items) - 8} more")
        print(f"\nTOTAL GAPS: {len(all_gaps)}")
        return 1
    print("\nAll required Tetra translation keys present.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
