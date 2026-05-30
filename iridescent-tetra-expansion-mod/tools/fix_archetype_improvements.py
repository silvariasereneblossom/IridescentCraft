#!/usr/bin/env python3
"""Fix the non-mage one-shot improvements (Polished/Reinforced/Streamlined/Tempered)
the same way the mage ones (Empowered/Quickened/Channeling) were fixed.

The old armor/<archetype>/<name> improvements were dead for the exact reason
Runic was: their schematics had replace:true and the majors referenced them
via a trailing-slash DIRECTORY PREFIX (tetra:armor/shared/ etc.), which Tetra's
accepts_improvement never honored. This rebuilds them on the proven honing
pattern: def under improvements/iridescent_reforging/, referenced by EXACT FILE
(no slash), schematic with NO replace + accepts_improvement gate.

Archetype gating still works because only the matching majors reference each
def (warrior majors -> reinforced, rogue -> streamlined, balanced -> tempered);
polished (shared) is referenced by every major.

Run:  python3 tools/fix_archetype_improvements.py
"""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src/main/resources/data/tetra"
GLYPH = {"textureLocation": "iridescent_modular_spells:textures/gui/glyphs.png",
         "textureX": 0, "textureY": 0}
MAJOR_SLOTS = ["helmet/crown", "chestplate/chest_plate", "leggings/leg_plate", "boots/boot_sole"]
SLOT_SUFFIXES = ["_helmet", "_chestplate", "_leggings", "_boots"]

# (def_file_stem, old_directory_prefix, improvement_key, schematic_name, attributes)
IMPROVEMENTS = [
    ("armor_shared_polished",    "tetra:armor/shared/",   "armor/upgrade/polished",
        {"minecraft:generic.armor_toughness": 0.5}),
    ("armor_warrior_reinforced", "tetra:armor/warrior/",  "armor/upgrade/reinforced",
        {"minecraft:generic.armor": 1.0, "minecraft:generic.knockback_resistance": 0.05}),
    ("armor_rogue_streamlined",  "tetra:armor/rogue/",    "armor/upgrade/streamlined",
        {"*minecraft:generic.movement_speed": 0.05, "minecraft:generic.attack_speed": 0.03}),
    ("armor_balanced_tempered",  "tetra:armor/balanced/", "armor/upgrade/tempered",
        {"minecraft:generic.max_health": 1.0, "minecraft:generic.armor": 0.5}),
]
# old prefix -> new exact-file ref
REF_MAP = {old: f"tetra:iridescent_reforging/{stem}" for (stem, old, _k, _a) in IMPROVEMENTS}


def write(p: Path, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")


# 1) Generate the 4 improvement defs + 4 schematics (honing pattern).
for stem, _old, key, attrs in IMPROVEMENTS:
    name = key.split("/")[-1]
    write(DATA / "improvements/iridescent_reforging" / f"{stem}.json",
          [{"key": key, "level": 1, "attributes": attrs, "integrity": -1}])
    write(DATA / "schematics/iridescent_reforging/upgrade" / f"{name}.json", {
        "slots": MAJOR_SLOTS,
        "keySuffixes": SLOT_SUFFIXES,
        "materialSlotCount": 0,
        "displayType": "improvement",
        "glyph": GLYPH,
        "requirement": {"type": "tetra:and", "requirements": [
            {"type": "tetra:accepts_improvement", "improvement": key},
            {"type": "tetra:not", "requirement": {"type": "tetra:improvement", "improvement": key}},
        ]},
        "outcomes": [{"improvements": {key: 1}}],
    })
    print(f"  wrote def + schematic for {name} ({key})")

# 2) Rewire every module's improvements[] from directory-prefix -> exact-file ref.
changed = 0
for mod_file in (DATA / "modules").rglob("*.json"):
    obj = json.loads(mod_file.read_text(encoding="utf-8"))
    imps = obj.get("improvements")
    if not imps:
        continue
    new = [REF_MAP.get(r, r) for r in imps]
    if new != imps:
        obj["improvements"] = new
        write(mod_file, obj)
        changed += 1
print(f"  rewired improvements[] in {changed} major modules")

# 3) Delete the old broken archetype improvement/schematic trees.
for sub in ("improvements/armor", "schematics/armor"):
    tree = DATA / sub
    if tree.exists():
        shutil.rmtree(tree)
        print(f"  deleted stale tree: {sub}")

print("done -- Polished/Reinforced/Streamlined/Tempered rebuilt on the honing pattern")
