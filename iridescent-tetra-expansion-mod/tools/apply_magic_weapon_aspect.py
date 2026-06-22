#!/usr/bin/env python3
"""Apply the icraft_magic_weapon Tetra ItemAspect (tier 2 -> max-level enchants)
to every variant of the mage-kit modules, so the magic-weapon enchants
(MagicWeaponCategory) are applicable at the Tetra workbench (BookEnchantSchematic
-> acceptsEnchantment -> isApplicableForAspects matches by category identity vs
the aspect's registered rules; mapping registered in MagicWeaponCategory.
registerTetraAspect). Aspect-ONLY -- does NOT touch magicCapacity (that's a
material-driven multiplier; Ship A learned that the hard way).

Scope (operator-confirmed): the modular wand (cap/core/handle/inlay -- already
done in Ship A), mage armor (runed_*/vestment_* majors), and spell-book covers.

SURVIVES REGEN:
  - book covers: gen_per_material_variants.py also emits the aspect (front/back
    cover) -- this script covers the wildcard + already-committed entries.
  - runed_*: gen_runed_modules.py copies the aspect from vestment_* (it only
    rewrites key + primaryAttributes), so a runed regen keeps it.
  - vestment_*: hand-maintained -- re-run THIS script if those modules are
    ever rebuilt from scratch.

Idempotent. Run from the mod root (iridescent-tetra-expansion-mod/).
"""
import json, os

MODS = "src/main/resources/data/tetra/modules"
# mage armor majors (runed + vestment, all 4 slots) + spell-book covers
TARGETS = [
    "boots/runed_boot_sole", "boots/vestment_boot_sole",
    "chestplate/runed_chest", "chestplate/vestment_chest",
    "helmet/runed_crown", "helmet/vestment_crown",
    "leggings/runed_leg_plate", "leggings/vestment_leg_plate",
    "ars_book/front_cover", "ars_book/back_cover",
    "iss_book/front_cover", "iss_book/back_cover",
]
ASPECT = {"icraft_magic_weapon": 2}

for rel in TARGETS:
    p = os.path.join(MODS, rel + ".json")
    with open(p, encoding="utf-8") as f:
        d = json.load(f)
    n = 0
    for v in d.get("variants", []):
        v["aspects"] = dict(ASPECT)
        n += 1
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"{rel}: aspect on {n} variants")
