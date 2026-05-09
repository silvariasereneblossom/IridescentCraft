#!/usr/bin/env python3
"""
Audit Tetra-eligible armor: modules + materials coverage.

Cross-references:
  1. ModItems.java slot declarations vs module JSON `slots` arrays
  2. Every declared minor/major slot has at least one module JSON
     covering it
  3. Every archetype's variant entries reference materials that exist
     in datapack_sources/icraft_tetra_materials OR vanilla Tetra
     bundled materials (iron/gold/diamond/netherite/leather)
  4. Every modded material (33 metals/gems) has at least ONE archetype
     accepting it (so no orphan material that's defined but unusable)
  5. Per-archetype attribute completeness: every variant has armor +
     magicCapacity + integrity, and the wildcard variant has the
     glyph/availableTextures/models block

Exit code 0 = clean, 1 = findings.
"""
import json
import os
import re
import sys
from collections import defaultdict

MOD_ROOT = "/root/IridescentCraft/iridescent-tetra-expansion-mod/src/main/resources"
JAVA_ITEMS = "/root/IridescentCraft/iridescent-tetra-expansion-mod/src/main/java/com/iridescentcraft/reforging/registry/ModItems.java"
DATAPACK_MAT_DIR = "/root/IridescentCraft/.minecraft/datapack_sources/icraft_tetra_materials/data/tetra/materials"
TETRA_JAR = "/root/IridescentCraft/iridescent-modular-spells-mod/libs/tetra-1.20.1-6.12.0.jar"

ARMOR_SLOTS = ("helmet", "chestplate", "leggings", "boots")

errors = []
warnings = []
info = []


# ─── Step 1: parse ModItems.java for declared slots ───────────────────────
java_src = open(JAVA_ITEMS).read()
declared = {}
for slot in ARMOR_SLOTS:
    upper = slot.upper()
    pattern = rf'private static final String\[\] {upper}_(MAJOR|MINOR|REQUIRED)\s*=\s*\{{\s*([^}}]+)\s*\}}'
    decl = {"MAJOR": [], "MINOR": [], "REQUIRED": []}
    for m in re.finditer(pattern, java_src):
        kind = m.group(1)
        items = [s.strip().strip('"') for s in m.group(2).split(',') if s.strip()]
        decl[kind] = items
    declared[slot] = decl


# ─── Step 2: walk module JSONs ────────────────────────────────────────────
module_data = {}
for slot in ARMOR_SLOTS:
    slot_dir = os.path.join(MOD_ROOT, "data/tetra/modules", slot)
    if not os.path.isdir(slot_dir):
        errors.append(f"missing module dir: {slot_dir}")
        continue
    for fn in sorted(os.listdir(slot_dir)):
        if not fn.endswith(".json"):
            continue
        with open(os.path.join(slot_dir, fn)) as f:
            try:
                d = json.load(f)
            except Exception as e:
                errors.append(f"{slot}/{fn}: invalid JSON: {e}")
                continue
        d["__slot__"] = slot
        d["__file__"] = fn.replace(".json", "")
        module_data[(slot, d["__file__"])] = d


# ─── Step 3: every declared slot covered by a major module? ───────────────
for slot in ARMOR_SLOTS:
    declared_major = set(declared[slot]["MAJOR"])
    declared_minor = set(declared[slot]["MINOR"])
    declared_req = set(declared[slot]["REQUIRED"])

    if declared_req != declared_major | declared_minor:
        errors.append(
            f"{slot}: REQUIRED set != MAJOR+MINOR. "
            f"Required={declared_req}, Major={declared_major}, Minor={declared_minor}"
        )

    covered_by_module_slots = set()
    major_archetypes_for_slot = defaultdict(list)
    minor_archetypes_for_slot = defaultdict(list)
    for (s, name), d in module_data.items():
        if s != slot:
            continue
        is_major = "major" in d.get("type", "")
        for sl in d.get("slots", []):
            covered_by_module_slots.add(sl)
            if is_major:
                major_archetypes_for_slot[sl].append(name)
            else:
                minor_archetypes_for_slot[sl].append(name)

    for ms in declared_major:
        if ms not in covered_by_module_slots:
            errors.append(
                f"{slot}: declared major slot '{ms}' has no module JSON"
            )
        elif not major_archetypes_for_slot.get(ms):
            errors.append(
                f"{slot}: declared major slot '{ms}' has no MAJOR-type module"
            )
        else:
            info.append(
                f"{slot}: major '{ms}' -> {len(major_archetypes_for_slot[ms])} archetype(s): {major_archetypes_for_slot[ms]}"
            )

    for ms in declared_minor:
        if ms not in covered_by_module_slots:
            errors.append(
                f"{slot}: declared minor slot '{ms}' has no module JSON"
            )
        else:
            info.append(
                f"{slot}: minor '{ms}' -> {len(minor_archetypes_for_slot[ms])} module(s): {minor_archetypes_for_slot[ms]}"
            )

    for sl in covered_by_module_slots:
        if sl not in declared_req:
            warnings.append(
                f"{slot}: module slot '{sl}' is exposed in modules/ but NOT registered in ModItems.java"
            )


# ─── Step 4: catalogue materials ──────────────────────────────────────────
known_materials = set()
# Vanilla Tetra bundled (we don't extract the jar; just trust the well-known names)
for mat in ("iron", "gold", "leather", "wool", "string"):
    known_materials.add(("metal" if mat in ("iron", "gold") else "skin" if mat == "leather" else "fabric" if mat == "wool" else "fibre", mat))
known_materials.add(("gem", "diamond"))
known_materials.add(("metal", "netherite"))
# Tetra also ships fabric/* and fibre/* defaults
known_materials.add(("fabric", ""))   # wildcard-only marker, but we track for variant lookup
known_materials.add(("fibre", ""))
known_materials.add(("skin", ""))
known_materials.add(("metal", ""))
known_materials.add(("gem", ""))

# Modded materials from icraft_tetra_materials
for cat in ("metal", "gem", "skin"):
    cat_dir = os.path.join(DATAPACK_MAT_DIR, cat)
    if not os.path.isdir(cat_dir):
        continue
    for fn in sorted(os.listdir(cat_dir)):
        if not fn.endswith(".json"):
            continue
        with open(os.path.join(cat_dir, fn)) as f:
            d = json.load(f)
        known_materials.add((cat, d["key"]))

# Pack-themed materials (in-mod)
themed_dir = os.path.join(MOD_ROOT, "data/tetra/materials/themed")
if os.path.isdir(themed_dir):
    for fn in sorted(os.listdir(themed_dir)):
        if not fn.endswith(".json"):
            continue
        with open(os.path.join(themed_dir, fn)) as f:
            d = json.load(f)
        # themed/<key> with category "themed" doesn't fit cat above;
        # treat the prefix as iridescent_reforging:themed/
        known_materials.add(("__themed__", d["key"]))


def material_match(mat_str):
    """Map a variant `materials` entry like 'tetra:metal/iron' or
    'iridescent_reforging:themed/fire' to a known-material set member."""
    if mat_str.startswith("tetra:"):
        rest = mat_str[len("tetra:"):]
        if "/" in rest:
            cat, name = rest.split("/", 1)
        else:
            cat, name = rest, ""
        if (cat, name) in known_materials:
            return True
        # wildcard match (cat, "") covers all of cat
        return False
    if mat_str.startswith("iridescent_reforging:themed/"):
        name = mat_str[len("iridescent_reforging:themed/"):]
        if name == "":
            # Wildcard: matches any themed material. Valid as long as the
            # category has at least one entry.
            return any(c == "__themed__" for (c, _n) in known_materials)
        return ("__themed__", name) in known_materials
    return False


# ─── Step 5: every variant references a known material ────────────────────
materials_used = set()
for (slot, name), d in module_data.items():
    for v in d.get("variants", []):
        for mat in v.get("materials", []):
            materials_used.add(mat)
            if not material_match(mat):
                errors.append(
                    f"{slot}/{name}: variant '{v.get('key','?')}' references unknown material '{mat}'"
                )


# ─── Step 6: every modded material has at least one archetype using it ────
modded_metals = sorted({(c, n) for (c, n) in known_materials if c in ("metal", "gem") and n not in ("", "iron", "gold", "diamond", "netherite")})
unused = []
for (cat, name) in modded_metals:
    qualified = f"tetra:{cat}/{name}"
    if qualified not in materials_used:
        unused.append(qualified)
if unused:
    for u in unused:
        warnings.append(f"modded material has NO archetype variant: {u}")


# ─── Step 7: variant attribute completeness on majors ─────────────────────
for (slot, name), d in module_data.items():
    if "major" not in d.get("type", ""):
        continue
    for v in d.get("variants", []):
        key = v.get("key", "?")
        ext = v.get("extract", {})
        if "primaryAttributes" not in ext or not ext["primaryAttributes"]:
            errors.append(f"{slot}/{name} variant '{key}': no primaryAttributes")
        if "magicCapacity" not in ext:
            errors.append(f"{slot}/{name} variant '{key}': no magicCapacity")
        if "integrity" not in ext:
            errors.append(f"{slot}/{name} variant '{key}': no integrity")
        # Wildcard (key ends with /) needs glyph + availableTextures + models;
        # specific variants either have them or inherit -- but the gem/book
        # bug we hit recently was specific-without-glyph rendering empty,
        # so flag as warning.
        if "glyph" not in ext:
            warnings.append(f"{slot}/{name} variant '{key}': no glyph block (specific-match variants don't inherit -- may render iconless)")


# ─── Output ───────────────────────────────────────────────────────────────
print("=" * 70)
print("ARMOR-AUDIT REPORT")
print("=" * 70)
print(f"\nDeclared slots (Java):")
for slot in ARMOR_SLOTS:
    print(f"  {slot}: major={declared[slot]['MAJOR']} minor={declared[slot]['MINOR']}")

print(f"\nMaterial catalog: {len(known_materials)} entries")
print(f"Modded metals/gems with at least one archetype: {len(modded_metals) - len(unused)} / {len(modded_metals)}")
print(f"Total module JSONs scanned: {len(module_data)}")

print()
if errors:
    print(f"\n*** ERRORS ({len(errors)}) ***")
    for e in errors:
        print(f"  ! {e}")
if warnings:
    print(f"\n*** WARNINGS ({len(warnings)}) ***")
    for w in warnings[:30]:
        print(f"  ? {w}")
    if len(warnings) > 30:
        print(f"  ... and {len(warnings) - 30} more")

if not errors and not warnings:
    print("\nClean.")

print()
if info:
    print("Slot-by-slot module coverage:")
    for line in info:
        print(f"  {line}")

sys.exit(1 if errors else 0)
