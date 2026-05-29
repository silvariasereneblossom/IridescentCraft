#!/usr/bin/env python3
# =============================================================================
# gen_runed_modules.py
#
# Phase 2 of the Mage archetype split (#41): adds Runed as a sibling to
# Vestment under the conceptual ROBE weight class.
#
# Reads each `vestment_<slot>.json` as a structural template, emits
# `runed_<slot>.json` with the same variant footprint but stats transformed
# per the Runed archetype profile:
#
#   generic.armor  x 1.25  -- Runed is sturdier than Vestment (rune inscription)
#   max_mana       x 0.5   -- sacrifice mana pool for raw power
#   spell_power    x 2.0   -- Runed's primary stat
#   + cooldown_reduction = 0.05 (5%)  if the source variant had any magic stat
#
# Mundane materials (deathskin, arcane_cloth) lacking magic stats get only
# the +25% armor boost. Themed-blood gets the armor boost and halved mana
# but no spell_power injection (the base material's identity drives that).
#
# Also emits matching schematics + repair definitions for each new module.
# Idempotent: re-running overwrites previous Runed output.
#
# Usage from repo root or anywhere:
#   python3 tools/gen_runed_modules.py
# =============================================================================
import json
from pathlib import Path

MOD_ROOT = Path(__file__).resolve().parent.parent
MODULES_DIR    = MOD_ROOT / "src" / "main" / "resources" / "data" / "tetra" / "modules"
SCHEMATICS_DIR = MOD_ROOT / "src" / "main" / "resources" / "data" / "tetra" / "schematics" / "iridescent_reforging"
REPAIRS_DIR    = MOD_ROOT / "src" / "main" / "resources" / "data" / "tetra" / "repairs"

# (slot dir name, vestment short, runed short)
SLOTS = [
    ("helmet",     "vestment_crown",     "runed_crown"),
    ("chestplate", "vestment_chest",     "runed_chest"),
    ("leggings",   "vestment_leg_plate", "runed_leg_plate"),
    ("boots",      "vestment_boot_sole", "runed_boot_sole"),
]

ARMOR_KEY   = "minecraft:generic.armor"
MANA_KEY    = "irons_spellbooks:max_mana"
SP_KEY      = "**irons_spellbooks:spell_power"     # ** = MULTIPLY_BASE per tetra finickyness rules
CDR_KEY     = "**irons_spellbooks:cooldown_reduction"
CDR_VALUE   = 0.05


def transform_primary_attrs(attrs: dict) -> dict:
    """Apply Runed's stat transformation to a Vestment variant's
    primaryAttributes block. Preserves any other attrs (rare but possible)."""
    out = {}
    had_magic = False
    for k, v in attrs.items():
        if k == ARMOR_KEY:
            out[k] = round(v * 1.25, 3)
        elif k == MANA_KEY:
            out[k] = round(v * 0.5, 1)
            had_magic = True
        elif k == SP_KEY:
            out[k] = round(v * 2.0, 3)
            had_magic = True
        else:
            # Pass through any other attribute we don't explicitly retune.
            out[k] = v
    if had_magic:
        out[CDR_KEY] = CDR_VALUE
    return out


def gen_module(slot: str, vestment_short: str, runed_short: str):
    src = MODULES_DIR / slot / f"{vestment_short}.json"
    dst = MODULES_DIR / slot / f"{runed_short}.json"
    data = json.loads(src.read_text(encoding="utf-8"))

    # Same archetype gates -- Runed lives in the Mage archetype like
    # Vestment, sharing the same hone improvement chain.
    # (No changes to `improvements` needed.)

    # Per-variant: rewrite key prefix + transform stats.
    for variant in data["variants"]:
        variant["key"] = f"{runed_short}/"
        variant["extract"]["primaryAttributes"] = transform_primary_attrs(
            variant["extract"]["primaryAttributes"]
        )

    dst.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"[runed] module: {dst.relative_to(MOD_ROOT)}")


def gen_schematic(slot: str, vestment_short: str, runed_short: str):
    src = SCHEMATICS_DIR / slot / f"{vestment_short}.json"
    dst = SCHEMATICS_DIR / slot / f"{runed_short}.json"
    data = json.loads(src.read_text(encoding="utf-8"))
    for outcome in data["outcomes"]:
        outcome["moduleKey"] = f"{slot}/{runed_short}"
        outcome["moduleVariant"] = f"{runed_short}/"
    dst.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"[runed] schematic: {dst.relative_to(MOD_ROOT)}")


def gen_repairs(slot: str, vestment_short: str, runed_short: str):
    """Mirror each vestment_X__<material>.json to runed_X__<material>.json,
    rewriting the moduleVariant field. moduleKey stays the same (= slot path)."""
    repair_dir = REPAIRS_DIR / slot
    if not repair_dir.is_dir():
        print(f"[runed] WARN: no repair dir for {slot}")
        return
    count = 0
    prefix_old = f"{vestment_short}__"
    for p in sorted(repair_dir.iterdir()):
        if not p.name.startswith(prefix_old):
            continue
        material_suffix = p.name[len(prefix_old):]  # e.g., "wool.json"
        dst = repair_dir / f"{runed_short}__{material_suffix}"
        data = json.loads(p.read_text(encoding="utf-8"))
        if "moduleVariant" in data:
            data["moduleVariant"] = data["moduleVariant"].replace(
                f"{vestment_short}/", f"{runed_short}/", 1
            )
        dst.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        count += 1
    print(f"[runed] {slot}: emitted {count} repair JSONs")


LANG_FILE = MOD_ROOT / "src" / "main" / "resources" / "assets" / "iridescent_reforging" / "lang" / "en_us.json"


def gen_lang():
    """Add Runed lang entries by cloning every vestment_* entry, remapping
    the key, and swapping 'Vestment' -> 'Runed' in the display value.
    Idempotent: existing runed_* keys get overwritten. Keys are sorted on
    write so re-runs produce stable JSON output."""
    if not LANG_FILE.exists():
        print(f"[runed] WARN: lang file missing: {LANG_FILE}")
        return
    data = json.loads(LANG_FILE.read_text(encoding="utf-8"))
    added = 0
    for k, v in list(data.items()):
        for _, vestment_short, runed_short in SLOTS:
            if vestment_short not in k:
                continue
            new_key = k.replace(vestment_short, runed_short)
            new_val = v.replace("Vestment", "Runed") if isinstance(v, str) else v
            data[new_key] = new_val
            added += 1
            break  # one slot match per key is enough
    # Stable ordering: sort keys to keep diff churn minimal across runs.
    sorted_data = {k: data[k] for k in sorted(data.keys())}
    LANG_FILE.write_text(
        json.dumps(sorted_data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"[runed] lang: added/updated {added} entries; total keys: {len(sorted_data)}")


def main():
    print(f"[runed] mod_root: {MOD_ROOT}")
    for slot, vestment_short, runed_short in SLOTS:
        gen_module(slot, vestment_short, runed_short)
        gen_schematic(slot, vestment_short, runed_short)
        gen_repairs(slot, vestment_short, runed_short)
    gen_lang()
    print("[runed] done.")


if __name__ == "__main__":
    main()
