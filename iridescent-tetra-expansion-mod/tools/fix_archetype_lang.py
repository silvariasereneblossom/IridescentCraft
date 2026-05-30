#!/usr/bin/env python3
"""Lang cleanup for the mage archetypes + the rebuilt archetype improvements.

1. Vestment/Runed variant placeholder values: many read "Wool vestment_crown"
   (raw key) or stale "Diamond robe" -- regenerate ALL uniformly as
   "<Material> Vestment" / "<Material> Runed".
2. Runed/Vestment module descriptions: generic -> archetype-flavored.
3. Add lang for the rebuilt Polished/Reinforced/Streamlined/Tempered
   improvements (key armor/upgrade/<name>) + their schematics.

Preserves existing key order (updates in place) -> minimal diff; new keys
appended. Run:  python3 tools/fix_archetype_lang.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LANG = ROOT / "src/main/resources/assets/iridescent_reforging/lang/en_us.json"

lang = json.loads(LANG.read_text(encoding="utf-8"))

# 1) Vestment/Runed variant names -> "<Material> <Archetype>" (catch-all -> bare archetype).
VARIANT_RE = re.compile(r'^tetra\.variant\.(vestment|runed)_(crown|chest|leg_plate|boot_sole)(?:/(.*))?$')
fixed_variants = 0
for key in list(lang.keys()):
    m = VARIANT_RE.match(key)
    if not m:
        continue
    arch = "Vestment" if m.group(1) == "vestment" else "Runed"
    material = m.group(3)  # None (bare), "" (trailing slash), or e.g. "wool"
    new = arch if not material else f"{material.replace('_', ' ').title()} {arch}"
    if lang.get(key) != new:
        lang[key] = new
        fixed_variants += 1

# 2) Module descriptions (one per archetype, all four slots).
DESC = {
    "runed":    "Runed weave -- channels high spell power and quicker cooldowns, at the cost of a shallow mana pool.",
    "vestment": "Mage vestment -- a deep mana pool with steady regeneration, trading away raw spell power.",
}
MODULES = {
    "runed":    ["helmet/runed_crown", "chestplate/runed_chest",
                 "leggings/runed_leg_plate", "boots/runed_boot_sole"],
    "vestment": ["helmet/vestment_crown", "chestplate/vestment_chest",
                 "leggings/vestment_leg_plate", "boots/vestment_boot_sole"],
}
for arch, mods in MODULES.items():
    for mod in mods:
        lang[f"tetra.module.{mod}.description"] = DESC[arch]

# 3) Lang for the rebuilt archetype improvements + schematics.
IMPROVEMENT_LANG = {
    "polished":    ("Polished",    "Polishes the surface to a high sheen. +0.5 toughness."),
    "reinforced":  ("Reinforced",  "Thicker plating. +1 armor, +5% knockback resistance."),
    "streamlined": ("Streamlined", "Smoothed profile. +5% movement speed, +3% attack speed."),
    "tempered":    ("Tempered",    "Balanced resilience. +0.5 armor, +1 max health."),
}
SLOT_SUFFIXES = ["", "_helmet", "_chestplate", "_leggings", "_boots"]
for name, (disp, desc) in IMPROVEMENT_LANG.items():
    lang[f"tetra.improvement.armor/upgrade/{name}"] = disp
    lang[f"tetra.improvement.armor/upgrade/{name}.name"] = disp
    lang[f"tetra.improvement.armor/upgrade/{name}.description"] = desc
    base = f"tetra/schematic/iridescent_reforging/upgrade/{name}"
    for suf in SLOT_SUFFIXES:
        lang[f"{base}{suf}.name"] = disp
        lang[f"{base}{suf}.description"] = desc

LANG.write_text(json.dumps(lang, indent=2) + "\n", encoding="utf-8")
print(f"  fixed {fixed_variants} Vestment/Runed variant names")
print(f"  set 8 archetype module descriptions")
print(f"  added lang for 4 archetype improvements + schematics")
print("done")
