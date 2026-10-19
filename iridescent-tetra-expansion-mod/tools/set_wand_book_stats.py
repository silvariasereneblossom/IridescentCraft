#!/usr/bin/env python3
"""Set the FIXED Iron's Spellbooks stats of the wand and book modules (decision list 153, ruled 2026-10-19).

Until 2026-10-19 these modules carried their ISS stats in extract.primaryAttributes, mostly as ** keys: Tetra
multiplied them by the material's primary stat, and the item multiplied its modules, so a better material gave a
bigger multiplier (measured on a full-pack boot: a ruby wand x1.2 spell power, a boss gem's wand x1.55, gem books
x1.27 to x1.77; a gem kit, set + wand + book, x3.3 to x4.4). The operator ruled "fixed per item", like the vestment
and runed plates (set_mage_archetype_stats.py): every variant of a module now carries the same plain keys in its own
"attributes" (Tetra merges them unscaled; the item adds its modules), whatever it is made of.

Sizes, within Iron's Spellbooks' own best staff +15 % for Tetra's 0.05 steps (its staffs: spell power +10 %, mana regen
+25 %, cooldown +15 %, a school +15 %), in the worst case of a gem wand (the gem's own +5 % a module, decision 150, adds
spell power +20 %):
  wand  = spell power +5 %, mana regen +15 %, cooldown reduction +15 %, max mana +22.5 (the iron wand's regen, cooldown
          and mana; its spell power cut from +15 % so a gem wand stays at x1.25 against the band's x1.265)
  book  = the iron book's extras: max mana +20 (back cover), cooldown +5 % (ISS spine) or mana regen +5 % (Ars spine);
          the covers carry no spell power of their own (an iron cover's was 0 after Tetra's rounding). The book core
          keeps Iron's Spellbooks' own book numbers (its material, one module an item).

Only the ISS stats are touched (every spelling removed from extract.primaryAttributes and "attributes", then the profile
written into "attributes"); armour, integrity, magicCapacity, glyphs, Ars attributes and the improvements stay as they
are. A variant the gap filler (gen_fill_variant_gaps.py) clones later copies "attributes" unscaled, so a new material
gets the same fixed stats. Idempotent.

Run:  python3 tools/set_wand_book_stats.py [--check]   (--check: exit 1 if a file would change, write nothing)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULES_DIR = ROOT / "src/main/resources/data/tetra/modules"
ISS = "irons_spellbooks:"

PROFILES = {
    "wand/basic_handle": {ISS + "max_mana": 15.0, ISS + "spell_power": 0.05, ISS + "mana_regen": 0.15,
                          ISS + "cooldown_reduction": 0.15},
    "wand/basic_core": {ISS + "max_mana": 7.5},
    "wand/basic_cap": {},
    "wand/basic_inlay": {},
    "iss_book/front_cover": {},
    "iss_book/back_cover": {ISS + "max_mana": 20.0},
    "iss_book/spine": {ISS + "cooldown_reduction": 0.05},
    "iss_book/pages": {},
    "ars_book/front_cover": {},
    "ars_book/back_cover": {ISS + "max_mana": 20.0},
    "ars_book/spine": {ISS + "mana_regen": 0.05},
}
MANAGED = ["max_mana", "spell_power", "mana_regen", "cooldown_reduction", "cast_time_reduction"]
SPELLINGS = [p + ISS + s for s in MANAGED for p in ("", "*", "**")]


def rewrite(obj, profile):
    for v in obj.get("variants", []):
        pa = (v.get("extract") or {}).get("primaryAttributes")
        if pa is not None:
            for k in SPELLINGS:
                pa.pop(k, None)
        attrs = v.get("attributes") or {}
        for k in SPELLINGS:
            attrs.pop(k, None)
        attrs.update(profile)
        if attrs:
            v["attributes"] = attrs
        else:
            v.pop("attributes", None)
    return obj


def main():
    check = "--check" in sys.argv
    changed = []
    for mod, profile in PROFILES.items():
        path = MODULES_DIR / (mod + ".json")
        text = path.read_bytes().decode("utf-8").replace(chr(13) + chr(10), chr(10))
        obj = json.loads(text)
        new = json.dumps(rewrite(obj, profile), indent=2) + "\n"
        if new != text:
            changed.append(mod)
            if not check:
                path.write_bytes(new.encode("utf-8"))
        stats = ", ".join(f"{k.split(':')[-1]}={v}" for k, v in profile.items()) or "none"
        print(f"  {mod}: {len(obj.get('variants', []))} variants -> {stats}")
    print(("would change: " if check else "changed: ") + (", ".join(changed) or "nothing"))
    sys.exit(1 if (check and changed) else 0)


if __name__ == "__main__":
    main()
