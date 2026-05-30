#!/usr/bin/env python3
"""Set per-archetype mage stat profile on the ROBE majors (Runed / Vestment).

Two parallel 3-stat archetypes (request 2026-05-30):
  - Runed    (burst):   small mana, HIGH spell power, + cooldown reduction
  - Vestment (sustain): LARGE mana, small spell power, + mana regen

Only touches the four ISS mage stats in each variant's
extract.primaryAttributes (max_mana, spell_power, cooldown_reduction,
mana_regen). Leaves armor, integrity, glyph, magicCapacity, etc. UNTOUCHED.
Removes any mage stat NOT in the archetype's profile (so Runed never carries
mana_regen and Vestment never carries CDR). Updates in place. Idempotent.

Run:  python3 tools/set_mage_archetype_stats.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULES_DIR = ROOT / "src/main/resources/data/tetra/modules"

# archetype -> {attribute_key: value}  (canonical ** forms)
PROFILES = {
    "runed": {
        "irons_spellbooks:max_mana": 10.0,
        "**irons_spellbooks:spell_power": 0.05,
        "**irons_spellbooks:cooldown_reduction": 0.05,
    },
    "vestment": {
        "irons_spellbooks:max_mana": 50.0,
        "**irons_spellbooks:spell_power": 0.0125,
        "**irons_spellbooks:mana_regen": 0.05,
    },
}
MODULES = {
    "runed":    ["helmet/runed_crown", "chestplate/runed_chest",
                 "leggings/runed_leg_plate", "boots/runed_boot_sole"],
    "vestment": ["helmet/vestment_crown", "chestplate/vestment_chest",
                 "leggings/vestment_leg_plate", "boots/vestment_boot_sole"],
}

# Full set of mage stats we manage; anything here not in the archetype's
# profile gets removed (prevents cross-archetype leakage).
ALL_MAGE_STATS = {
    "irons_spellbooks:max_mana",
    "**irons_spellbooks:spell_power",
    "**irons_spellbooks:cooldown_reduction",
    "**irons_spellbooks:mana_regen",
}
# Legacy spell-power spellings to collapse into the ** form.
SP_LEGACY = ["irons_spellbooks:spell_power", "*irons_spellbooks:spell_power"]

for arch, mods in MODULES.items():
    profile = PROFILES[arch]
    drop = ALL_MAGE_STATS - set(profile.keys())
    for mod in mods:
        path = MODULES_DIR / (mod + ".json")
        obj = json.loads(path.read_text(encoding="utf-8"))
        variants = obj.get("variants", [])
        for v in variants:
            pa = v.get("extract", {}).get("primaryAttributes")
            if pa is None:
                continue
            for k in SP_LEGACY:
                pa.pop(k, None)
            for stat in drop:
                pa.pop(stat, None)
            for key, val in profile.items():
                pa[key] = val
        path.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")
        stats = ", ".join(f"{k.split(':')[-1]}={v}" for k, v in profile.items())
        print(f"  {mod}: {len(variants)} variants -> {stats}")

print("done -- Runed (mana/SP/CDR) vs Vestment (mana/SP/mana_regen)")
