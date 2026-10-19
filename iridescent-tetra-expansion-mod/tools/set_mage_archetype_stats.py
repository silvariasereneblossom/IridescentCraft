#!/usr/bin/env python3
"""Set per-archetype mage stat profile on the ROBE majors (Runed / Vestment).

Two parallel 3-stat archetypes (request 2026-05-30):
  - Runed    (burst):   small mana, HIGH spell power, + cooldown reduction
  - Vestment (sustain): LARGE mana, + mana regen

Since 2026-10-18 (decision list 151, implemented on recommendation): the mage stats are FIXED per piece, in each
variant's own "attributes" (Tetra merges them unscaled), as plain keys (ADDITION: the four pieces add up). Until then
they sat in extract.primaryAttributes as ** keys, so Tetra multiplied them by the material's primary stat and the
pieces multiplied each other: a leather runed set (leather's primary is 5) had spell power and cooldown x2.44, a
leather vestment set mana regen x2.44 and +1000 mana, a wool set x1.22. The values are the profile at primary 1
(today's wool numbers, which are within Iron's Spellbooks' own sets): a set gives runed +20 % spell power, +20 %
cooldown, +40 mana; vestment +20 % mana regen, +200 mana. Vestment's 0.0125 spell power is gone: Tetra rounds a
module's amount to 0.05, so it was 0 on every cloth already.

Only touches the ISS mage stats of each variant (removes every spelling from extract.primaryAttributes, writes the
profile into "attributes"). Leaves armor, integrity, glyph, magicCapacity, etc. UNTOUCHED. Idempotent.

Run:  python3 tools/set_mage_archetype_stats.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULES_DIR = ROOT / "src/main/resources/data/tetra/modules"

# archetype -> {attribute_key: value}  (plain keys: fixed per piece, added across pieces)
PROFILES = {
    "runed": {
        "irons_spellbooks:max_mana": 10.0,
        "irons_spellbooks:spell_power": 0.05,
        "irons_spellbooks:cooldown_reduction": 0.05,
    },
    "vestment": {
        "irons_spellbooks:max_mana": 50.0,
        "irons_spellbooks:mana_regen": 0.05,
    },
}
MODULES = {
    "runed":    ["helmet/runed_crown", "chestplate/runed_chest",
                 "leggings/runed_leg_plate", "boots/runed_boot_sole"],
    "vestment": ["helmet/vestment_crown", "chestplate/vestment_chest",
                 "leggings/vestment_leg_plate", "boots/vestment_boot_sole"],
}

# Every spelling of the mage stats we manage, removed from extract.primaryAttributes and from "attributes" before the
# profile is written (prevents cross-archetype leakage and old forms).
MAGE_STATS = ["max_mana", "spell_power", "cooldown_reduction", "mana_regen"]
ALL_SPELLINGS = [p + "irons_spellbooks:" + s for s in MAGE_STATS for p in ("", "*", "**")]

for arch, mods in MODULES.items():
    profile = PROFILES[arch]
    for mod in mods:
        path = MODULES_DIR / (mod + ".json")
        obj = json.loads(path.read_text(encoding="utf-8"))
        variants = obj.get("variants", [])
        for v in variants:
            pa = v.get("extract", {}).get("primaryAttributes")
            if pa is not None:
                for k in ALL_SPELLINGS:
                    pa.pop(k, None)
            attrs = v.get("attributes") or {}
            for k in ALL_SPELLINGS:
                attrs.pop(k, None)
            attrs.update(profile)
            v["attributes"] = attrs
        path.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")
        stats = ", ".join(f"{k.split(':')[-1]}={v}" for k, v in profile.items())
        print(f"  {mod}: {len(variants)} variants -> {stats}")

print("done -- Runed (mana/SP/CDR) vs Vestment (mana/mana_regen), fixed per piece")
