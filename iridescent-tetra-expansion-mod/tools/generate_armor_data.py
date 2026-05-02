#!/usr/bin/env python3
"""Generate the multi-module-per-slot armor data for iridescent-reforging-mod.

Replaces the prior 1-module-per-slot architecture (16 modules, 16 install
schematics, 3-segment variant keys) with Tetra's canonical structure (52
modules, 52 install schematics, 2-segment variant keys, multiple module
choices per slot).

Run from repo root:
    python3 iridescent-reforging-mod/tools/generate_armor_data.py

Outputs into iridescent-reforging-mod/src/main/resources/data/tetra/ and
.../assets/iridescent_reforging/lang/en_us.json. Idempotent — re-running
overwrites previous output. Old hone schematics (384 files) are deleted.
"""

import json
import os
import shutil
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Module design table
# ---------------------------------------------------------------------------
# Format: module-name -> {slot, archetype, armor, attrs, type}
#   slot:      tetra slot key the module fits into
#   archetype: 'balanced'|'warrior'|'rogue'|'mage'|'thorns'|'minimal'|'luck'
#   armor:     base generic.armor contribution (catch-all variant)
#   attrs:     dict of additional vanilla/spellbooks attributes
#   type:      'major' | 'minor' (drives module class type & schematic displayType)
#
# Variant materials we ship: each module gets 14 variants (catch-all + 13 mats).
# Material list and per-material multiplier:

MATERIALS = [
    # (key, material_ref, mult, integrity_cost, durability_factor)
    ("",          None,                       1.0,  0, 1.0),  # catch-all
    ("leather",   "tetra:skin/leather",       0.55, 0, 0.6),
    ("iron",      "tetra:metal/iron",         1.0,  0, 1.0),
    ("gold",      "tetra:metal/gold",         0.85, 0, 0.7),
    ("diamond",   "tetra:gem/diamond",        1.4,  0, 1.6),
    ("netherite", "tetra:metal/netherite",    1.6,  0, 2.0),
    ("fire",      "iridescent_reforging:themed/fire",      1.05, 0, 1.0),
    ("ice",       "iridescent_reforging:themed/ice",       1.05, 0, 1.0),
    ("shadow",    "iridescent_reforging:themed/shadow",    1.05, 0, 1.0),
    ("holy",      "iridescent_reforging:themed/holy",      1.05, 0, 1.0),
    ("lightning", "iridescent_reforging:themed/lightning", 1.05, 0, 1.0),
    ("nature",    "iridescent_reforging:themed/nature",    1.05, 0, 1.0),
    ("ender",     "iridescent_reforging:themed/ender",     1.05, 0, 1.0),
    ("blood",     "iridescent_reforging:themed/blood",     1.05, 0, 1.0),
]

# Mage materials get a small mana boost; warrior materials get KB resist.
MATERIAL_FLAVOR = {
    "leather":   {},
    "iron":      {},
    "gold":      {"irons_spellbooks:max_mana": 5.0},
    "diamond":   {"minecraft:generic.armor_toughness": 0.2},
    "netherite": {"minecraft:generic.knockback_resistance": 0.05},
    "fire":      {"irons_spellbooks:fire_spell_power": 0.05},
    "ice":       {"irons_spellbooks:ice_spell_power": 0.05},
    "shadow":    {"irons_spellbooks:ender_spell_power": 0.05},
    "holy":      {"irons_spellbooks:holy_spell_power": 0.05},
    "lightning": {"irons_spellbooks:lightning_spell_power": 0.05},
    "nature":    {"irons_spellbooks:nature_spell_power": 0.05},
    "ender":     {"irons_spellbooks:ender_spell_power": 0.05},
    "blood":     {"irons_spellbooks:blood_spell_power": 0.05},
}

# (display_name_words, attrs_dict)
# display_name_words is a Title Case string used for tetra.module.<key>.name
# (the bare module name, before material prefix).

MODULES = {
    # Display names are intentionally short — the slot subheading already
    # says "Boot Lining"/"Crown"/etc., so the variant name doesn't repeat
    # the slot. Convention: <archetype-or-distinctive-word>. Examples:
    # crown options "Basic" / "Heavy" / "Light" / "Circlet" — slot context
    # makes this unambiguous in the workbench.
    #
    # --- HELMET MAJORS ---
    "helmet/basic_crown":     ("Basic",      "major", "balanced", 1.0, {}),
    "helmet/heavy_crown":     ("Heavy",      "major", "warrior",  1.4, {"*minecraft:generic.movement_speed": -0.05, "minecraft:generic.knockback_resistance": 0.05}),
    "helmet/light_crown":     ("Light",      "major", "rogue",    0.6, {"*minecraft:generic.movement_speed": 0.05}),
    "helmet/circlet":         ("Circlet",    "major", "mage",     0.5, {"irons_spellbooks:max_mana": 50.0, "irons_spellbooks:spell_power": 0.05}),
    # --- HELMET MINORS: visor ---
    "helmet/slit_visor":      ("Slit",       "minor", "balanced", 0.2, {}),
    "helmet/full_visor":      ("Full",       "minor", "warrior",  0.4, {"minecraft:generic.attack_speed": -0.05}),
    "helmet/goggles":         ("Goggles",    "minor", "mage",     0.0, {"irons_spellbooks:spell_power": 0.05, "irons_spellbooks:max_mana": 20.0}),
    # --- HELMET MINORS: crest ---
    "helmet/plain_crest":     ("Plain",      "minor", "minimal",  0.1, {}),
    "helmet/spiked_crest":    ("Spiked",     "minor", "thorns",   0.1, {}),
    "helmet/feathered_crest": ("Feathered",  "minor", "rogue",    0.0, {"*minecraft:generic.movement_speed": 0.05}),
    # --- HELMET MINORS: strap ---
    # Display names describe FORM, not material — Tetra's MaterialVariantData.combine
    # auto-suffixes the material name (iron, leather, etc.). A module named "Leather"
    # combined with leather material renders as "Leather Leather Strap" (doubling).
    "helmet/leather_strap":   ("Plain",      "minor", "balanced", 0.1, {}),
    "helmet/cloth_strap":     ("Soft",       "minor", "mage",     0.0, {"irons_spellbooks:max_mana": 5.0}),
    "helmet/chain_strap":     ("Linked",     "minor", "warrior",  0.2, {"minecraft:generic.knockback_resistance": 0.05}),

    # --- CHESTPLATE MAJORS ---
    "chestplate/breastplate":  ("Breastplate","major", "balanced", 3.0, {}),
    "chestplate/cuirass":      ("Cuirass",    "major", "warrior",  4.0, {"*minecraft:generic.movement_speed": -0.05, "minecraft:generic.knockback_resistance": 0.10}),
    "chestplate/robe_chest":   ("Robe",       "major", "mage",     1.5, {"irons_spellbooks:max_mana": 100.0, "irons_spellbooks:spell_power": 0.10}),
    "chestplate/scaled_chest": ("Scaled",     "major", "rogue",    2.5, {"*minecraft:generic.movement_speed": 0.05, "minecraft:generic.knockback_resistance": 0.05}),
    # --- CHESTPLATE MINORS: chest_lining ---
    "chestplate/padded_lining":   ("Padded",     "minor", "balanced", 0.4, {}),
    "chestplate/silk_lining":     ("Sheer",      "minor", "mage",     0.1, {"irons_spellbooks:max_mana": 30.0, "irons_spellbooks:mana_regen": 0.05}),
    "chestplate/chainmail_lining":("Mailed",     "minor", "warrior",  0.5, {"minecraft:generic.knockback_resistance": 0.10, "*minecraft:generic.movement_speed": -0.02}),
    # --- CHESTPLATE MINORS: trim ---
    "chestplate/simple_trim":     ("Simple",     "minor", "minimal",  0.0, {}),
    "chestplate/decorative_trim": ("Decorative", "minor", "minimal",  0.1, {}),
    "chestplate/gilded_trim":     ("Gilded",     "minor", "luck",     0.1, {"minecraft:generic.luck": 0.5}),
    # --- CHESTPLATE MINORS: pauldrons ---
    "chestplate/light_pauldrons": ("Light",      "minor", "rogue",    0.3, {"*minecraft:generic.movement_speed": 0.02}),
    "chestplate/heavy_pauldrons": ("Heavy",      "minor", "warrior",  0.7, {"*minecraft:generic.movement_speed": -0.03}),
    "chestplate/spiked_pauldrons":("Spiked",     "minor", "thorns",   0.4, {}),

    # --- LEGGINGS MAJORS ---
    "leggings/full_leg_plate":  ("Full",       "major", "balanced", 2.0, {}),
    "leggings/heavy_leg_plate": ("Heavy",      "major", "warrior",  2.7, {"*minecraft:generic.movement_speed": -0.05}),
    "leggings/light_leg_plate": ("Light",      "major", "rogue",    1.2, {"*minecraft:generic.movement_speed": 0.07}),
    "leggings/robed_leg_plate": ("Robed",      "major", "mage",     1.0, {"irons_spellbooks:max_mana": 60.0, "irons_spellbooks:spell_power": 0.05}),
    # --- LEGGINGS MINORS: belt ---
    "leggings/leather_belt": ("Plain",   "minor", "balanced", 0.1, {}),
    "leggings/sash":         ("Sash",    "minor", "mage",     0.0, {"irons_spellbooks:max_mana": 20.0}),
    "leggings/chain_belt":   ("Linked",  "minor", "warrior",  0.2, {"minecraft:generic.knockback_resistance": 0.05}),
    # --- LEGGINGS MINORS: greaves ---
    "leggings/standard_greaves":   ("Standard",   "minor", "balanced", 0.3, {}),
    "leggings/reinforced_greaves": ("Reinforced", "minor", "warrior",  0.5, {"*minecraft:generic.movement_speed": -0.02}),
    "leggings/agile_greaves":      ("Agile",      "minor", "rogue",    0.1, {"*minecraft:generic.movement_speed": 0.04}),
    # --- LEGGINGS MINORS: cuisses ---
    "leggings/cloth_cuisses":  ("Soft",    "minor", "mage",     0.1, {"irons_spellbooks:max_mana": 20.0}),
    "leggings/padded_cuisses": ("Padded",  "minor", "balanced", 0.3, {}),
    "leggings/plated_cuisses": ("Plated",  "minor", "warrior",  0.5, {"*minecraft:generic.movement_speed": -0.02}),

    # --- BOOTS MAJORS ---
    "boots/basic_boot_sole": ("Basic",      "major", "balanced", 1.0, {}),
    "boots/heavy_boot_sole": ("Heavy",      "major", "warrior",  1.4, {"*minecraft:generic.movement_speed": -0.05}),
    "boots/light_boot_sole": ("Light",      "major", "rogue",    0.6, {"*minecraft:generic.movement_speed": 0.07, "forge:step_height_addition": 0.5}),
    "boots/robed_boot_sole": ("Robed",      "major", "mage",     0.5, {"irons_spellbooks:max_mana": 30.0}),
    # --- BOOTS MINORS: boot_lining ---
    "boots/padded_boot_lining": ("Padded",     "minor", "balanced", 0.2, {}),
    "boots/silk_boot_lining":   ("Sheer",      "minor", "mage",     0.0, {"irons_spellbooks:max_mana": 15.0}),
    "boots/fur_boot_lining":    ("Fur",        "minor", "warrior",  0.3, {}),
    # --- BOOTS MINORS: heel ---
    "boots/standard_heel":  ("Standard",   "minor", "balanced", 0.1, {}),
    "boots/spiked_heel":    ("Spiked",     "minor", "thorns",   0.1, {}),
    "boots/cushioned_heel": ("Cushioned",  "minor", "rogue",    0.0, {"*minecraft:generic.movement_speed": 0.02}),
    # --- BOOTS MINORS: lacing ---
    "boots/leather_lacing": ("Plain",      "minor", "balanced", 0.1, {}),
    "boots/silk_lacing":    ("Sheer",      "minor", "mage",     0.0, {"irons_spellbooks:max_mana": 10.0}),
    "boots/iron_lacing":    ("Tight",      "minor", "warrior",  0.2, {"minecraft:generic.knockback_resistance": 0.02}),
}

# Slot -> [module-keys-fitting-it]; computed below. Also slot -> first module
# (used as default for vanilla replacements).

SLOTS_FOR_PIECE = {
    "helmet":     ["helmet/crown",         "helmet/visor",         "helmet/crest",        "helmet/strap"],
    "chestplate": ["chestplate/chest_plate","chestplate/chest_lining","chestplate/trim",  "chestplate/pauldrons"],
    "leggings":   ["leggings/leg_plate",   "leggings/belt",        "leggings/greaves",    "leggings/cuisses"],
    "boots":      ["boots/boot_sole",      "boots/boot_lining",    "boots/heel",          "boots/lacing"],
}

# Module -> slot (computed for the JSON output). The first segment is the piece
# and the second is the slot we want; module-name itself is below module level.

# Modules slot mapping (module-key -> slot-key)
MODULE_SLOT = {
    # helmet
    "helmet/basic_crown": "helmet/crown",
    "helmet/heavy_crown": "helmet/crown",
    "helmet/light_crown": "helmet/crown",
    "helmet/circlet":     "helmet/crown",
    "helmet/slit_visor":  "helmet/visor",
    "helmet/full_visor":  "helmet/visor",
    "helmet/goggles":     "helmet/visor",
    "helmet/plain_crest":     "helmet/crest",
    "helmet/spiked_crest":    "helmet/crest",
    "helmet/feathered_crest": "helmet/crest",
    "helmet/leather_strap": "helmet/strap",
    "helmet/cloth_strap":   "helmet/strap",
    "helmet/chain_strap":   "helmet/strap",
    # chestplate
    "chestplate/breastplate":  "chestplate/chest_plate",
    "chestplate/cuirass":      "chestplate/chest_plate",
    "chestplate/robe_chest":   "chestplate/chest_plate",
    "chestplate/scaled_chest": "chestplate/chest_plate",
    "chestplate/padded_lining":    "chestplate/chest_lining",
    "chestplate/silk_lining":      "chestplate/chest_lining",
    "chestplate/chainmail_lining": "chestplate/chest_lining",
    "chestplate/simple_trim":     "chestplate/trim",
    "chestplate/decorative_trim": "chestplate/trim",
    "chestplate/gilded_trim":     "chestplate/trim",
    "chestplate/light_pauldrons":  "chestplate/pauldrons",
    "chestplate/heavy_pauldrons":  "chestplate/pauldrons",
    "chestplate/spiked_pauldrons": "chestplate/pauldrons",
    # leggings
    "leggings/full_leg_plate":  "leggings/leg_plate",
    "leggings/heavy_leg_plate": "leggings/leg_plate",
    "leggings/light_leg_plate": "leggings/leg_plate",
    "leggings/robed_leg_plate": "leggings/leg_plate",
    "leggings/leather_belt": "leggings/belt",
    "leggings/sash":         "leggings/belt",
    "leggings/chain_belt":   "leggings/belt",
    "leggings/standard_greaves":   "leggings/greaves",
    "leggings/reinforced_greaves": "leggings/greaves",
    "leggings/agile_greaves":      "leggings/greaves",
    "leggings/cloth_cuisses":  "leggings/cuisses",
    "leggings/padded_cuisses": "leggings/cuisses",
    "leggings/plated_cuisses": "leggings/cuisses",
    # boots
    "boots/basic_boot_sole":  "boots/boot_sole",
    "boots/heavy_boot_sole":  "boots/boot_sole",
    "boots/light_boot_sole":  "boots/boot_sole",
    "boots/robed_boot_sole":  "boots/boot_sole",
    "boots/padded_boot_lining": "boots/boot_lining",
    "boots/silk_boot_lining":   "boots/boot_lining",
    "boots/fur_boot_lining":    "boots/boot_lining",
    "boots/standard_heel":  "boots/heel",
    "boots/spiked_heel":    "boots/heel",
    "boots/cushioned_heel": "boots/heel",
    "boots/leather_lacing": "boots/lacing",
    "boots/silk_lacing":    "boots/lacing",
    "boots/iron_lacing":    "boots/lacing",
}

# Default module per slot (used by replacements & migration mapper):
DEFAULT_MODULE_FOR_SLOT = {
    "helmet/crown":          "helmet/basic_crown",
    "helmet/visor":          "helmet/slit_visor",
    "helmet/crest":          "helmet/plain_crest",
    "helmet/strap":          "helmet/leather_strap",
    "chestplate/chest_plate":   "chestplate/breastplate",
    "chestplate/chest_lining":  "chestplate/padded_lining",
    "chestplate/trim":          "chestplate/simple_trim",
    "chestplate/pauldrons":     "chestplate/light_pauldrons",
    "leggings/leg_plate":  "leggings/full_leg_plate",
    "leggings/belt":       "leggings/leather_belt",
    "leggings/greaves":    "leggings/standard_greaves",
    "leggings/cuisses":    "leggings/padded_cuisses",
    "boots/boot_sole":     "boots/basic_boot_sole",
    "boots/boot_lining":   "boots/padded_boot_lining",
    "boots/heel":          "boots/standard_heel",
    "boots/lacing":        "boots/leather_lacing",
}

# Acceptable material category prefixes per slot, for the install schematic's
# outcomes. Major slots accept metals/gems; minor cloth-y slots accept fabrics
# and skin; trim/cosmetic slots accept anything visual. Themed materials
# universally allowed.
SLOT_MATERIAL_CATEGORIES = {
    "helmet/crown":         ["tetra:metal/", "tetra:gem/", "iridescent_reforging:themed/"],
    "helmet/visor":         ["tetra:metal/", "iridescent_reforging:themed/"],
    "helmet/crest":         ["tetra:metal/", "tetra:fabric/", "iridescent_reforging:themed/"],
    "helmet/strap":         ["tetra:skin/", "tetra:fabric/", "tetra:metal/", "iridescent_reforging:themed/"],
    "chestplate/chest_plate":  ["tetra:metal/", "tetra:gem/", "iridescent_reforging:themed/"],
    "chestplate/chest_lining": ["tetra:skin/", "tetra:fabric/", "iridescent_reforging:themed/"],
    "chestplate/trim":         ["tetra:metal/", "tetra:fabric/", "iridescent_reforging:themed/"],
    "chestplate/pauldrons":    ["tetra:metal/", "tetra:gem/", "iridescent_reforging:themed/"],
    "leggings/leg_plate":  ["tetra:metal/", "tetra:gem/", "iridescent_reforging:themed/"],
    "leggings/belt":       ["tetra:skin/", "tetra:fabric/", "tetra:metal/", "iridescent_reforging:themed/"],
    "leggings/greaves":    ["tetra:metal/", "iridescent_reforging:themed/"],
    "leggings/cuisses":    ["tetra:skin/", "tetra:fabric/", "tetra:metal/", "iridescent_reforging:themed/"],
    "boots/boot_sole":     ["tetra:metal/", "tetra:skin/", "iridescent_reforging:themed/"],
    "boots/boot_lining":   ["tetra:skin/", "tetra:fabric/", "iridescent_reforging:themed/"],
    "boots/heel":          ["tetra:metal/", "tetra:skin/", "iridescent_reforging:themed/"],
    "boots/lacing":        ["tetra:skin/", "tetra:fabric/", "tetra:metal/", "iridescent_reforging:themed/"],
}

# ---------------------------------------------------------------------------
# Generators
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src/main/resources/data/tetra"
LANG = ROOT / "src/main/resources/assets/iridescent_reforging/lang/en_us.json"

GLYPH = {
    "textureLocation": "iridescent_modular_spells:textures/gui/glyphs.png",
    "textureX": 0,
    "textureY": 0,
}

def variant_name_for(module_key: str, mat_key: str, mat_disp: str) -> str:
    """Pretty display name for a variant lang entry.

    Convention matches Tetra's StringUtils.capitalize+toLowerCase fallback
    pipeline so authored variants and fallback-resolved variants render
    identically:
      - catch-all (empty material): Title Case noun     'Padded'
      - material variants: sentence case                'Iron padded'

    The first word is the material prefix (Title Case from material_display)
    and the module noun is lowercased so it reads naturally — same as
    Tetra's "Iron blade" / "Wool blade" convention.
    """
    base = MODULES[module_key][0]  # e.g. 'Padded'
    if not mat_key:
        return base
    return f"{mat_disp} {base.lower()}"

def material_display(mat_key: str) -> str:
    if mat_key == "":
        return ""
    if mat_key.startswith("wool"):
        return "Wool" if mat_key == "wool" else "Wool " + mat_key.split("_", 1)[1].title()
    return mat_key.replace("_", " ").title()

def gen_module_json(module_key: str) -> dict:
    """One module file with all 14 variants."""
    base_name, kind, archetype, base_armor, extra = MODULES[module_key]
    slot = MODULE_SLOT[module_key]
    # 'major' modules use basic_major_module so improvements/durability render.
    type_str = "tetra:basic_major_module" if kind == "major" else "tetra:basic_module"
    module_short = module_key.split("/", 1)[1]  # 'heavy_crown'

    # Integrity allocation (2026-05-02 v3): MAJOR PROVIDES capacity,
    # MINORS CONSUME it — mirroring Tetra's hilt-vs-blade pattern.
    # The major is the structural piece (foundation that other modules
    # attach to); minors are accessory pieces that nibble the budget.
    #
    # Tetra's combine logic in MaterialVariantData:
    #   if extract.integrity > 0: result.integrity += extract.integrity * material.integrityGain
    #   if extract.integrity < 0: result.integrity += extract.integrity * material.integrityCost
    # Then in ItemProperties.merge:
    #   positive result.integrity → added to .integrity (CAPACITY)
    #   negative result.integrity → added to .integrityUsage (USED)
    #
    # Per piece w/ iron material (gain=5, cost=2):
    #   Major catch-all (+2) × iron gain 5 = +10 capacity
    #   3 minor catch-alls (-1) × iron cost 2 = -2 each → usage += 6
    #   Improvements (each -1, applied at any major archetype): -1*N
    #
    # Net per piece (no improvements applied): 10 capacity / 6 usage,
    # 4 spare for ~4 improvements before overflow. Honing system can
    # accrue ~5 hone improvements over time, putting longterm steady
    # state at maybe 10/11 — overflow by 1, which Tetra handles
    # gracefully (durability multiplier penalty).
    INTEGRITY_MAJOR_CATCHALL = 2     # POSITIVE: major provides capacity
    INTEGRITY_MINOR_CATCHALL = -1    # NEGATIVE: minors consume capacity

    variants = []
    # Calibration constant: Tetra multiplies extract.primaryAttributes by
    # the material's `primary` field at variant-combine time. Iron's
    # primary is 5 (verified: tetra-1.20.1-6.12.0.jar / data/tetra/
    # materials/metal/iron.json), so a base_armor of 4.0 in MODULES would
    # yield 20 armor on the iron variant — vs vanilla iron chestplate's
    # 6 armor. Dividing by 5 here gives `extract.primary.armor` × iron's
    # primary (5) ≈ vanilla iron value. Other materials scale relatively:
    # diamond primary 6 → ~1.2× iron, netherite 7.24 → ~1.45× iron.
    # 2.5 chosen so the existing MODULES base_armor values land on
    # vanilla-equivalent absolute armor with iron material:
    #   breastplate 3.0 / 2.5 × 5 = 6 armor (matches vanilla iron chest)
    #   cuirass     4.0 / 2.5 × 5 = 8 armor (matches vanilla diamond chest)
    #   basic_crown 1.0 / 2.5 × 5 = 2 armor (matches vanilla iron helmet)
    #   etc. Other materials scale relatively (diamond primary 6 → +20%
    #   over iron, netherite 7.24 → +45%).
    PRIMARY_DIVISOR = 2.5
    for mat_key, mat_ref, mult, _ignored_integ, dur in MATERIALS:
        vkey = f"{module_short}/{mat_key}" if mat_key else f"{module_short}/"
        materials = [mat_ref] if mat_ref else SLOT_MATERIAL_CATEGORIES[slot]
        # Compose primary attributes (scaled down — see PRIMARY_DIVISOR).
        attrs = {"minecraft:generic.armor": round(base_armor * mult / PRIMARY_DIVISOR, 4)}
        for k, v in extra.items():
            # Only apply non-armor-related extras to the catch-all + every
            # material — they're a property of the module, not the material.
            # Skip movement_speed: handled by kubejs/server_scripts/armor_weight.js
            # at the player level (per-piece scaling with unique UUIDs). Per-
            # module speed via Tetra's per-(attr, op) UUID system collapses
            # to a single binary "any heavy = -X" instead of scaling per piece.
            if k.lstrip('*') == "minecraft:generic.movement_speed":
                continue
            # Other extras (knockback, attack_speed, max_mana, spell_power):
            # divide by primary divisor too, since they're in primaryAttributes.
            attrs[k] = round(v / PRIMARY_DIVISOR, 4)
        # Apply material flavor on top (mage materials boost mana, etc.).
        for k, v in MATERIAL_FLAVOR.get(mat_key, {}).items():
            attrs[k] = round(attrs.get(k, 0.0) + v, 4)

        # Catch-all (empty mat_key): carries the archetype's integrity cost.
        # Per-material variants: 0 (dead, doubled keys never resolve).
        if not mat_key:
            integ = INTEGRITY_MAJOR_CATCHALL if kind == "major" else INTEGRITY_MINOR_CATCHALL
        else:
            integ = 0

        variant = {
            "materials": materials,
            "key": vkey,
            "extract": {
                "primaryAttributes": attrs,
                "integrity": integ,
                "glyph": GLYPH,
                "availableTextures": ["default"],
                "models": [],
            },
        }
        variants.append(variant)

    # Improvements: only majors get archetype-specific upgrade paths.
    # The improvements[] field is a list of path prefixes; at module-load
    # time Tetra walks data/tetra/improvements/<prefix>/ and registers
    # every improvement def found there as an accepted improvement on
    # this module. A heavy module gets armor/heavy/* + armor/shared/*;
    # a mage module gets armor/mage/* + armor/shared/*; etc.
    if kind == "major" and archetype in ("balanced", "warrior", "rogue", "mage"):
        improvements_field = [
            f"tetra:armor/{archetype}/",
            "tetra:armor/shared/",
        ]
    else:
        improvements_field = []

    out = {
        "type": type_str,
        "slots": [slot],
        "improvements": improvements_field,
        "variants": variants,
    }
    return out

# ---------------------------------------------------------------------------
# Phase B — improvement schematics
# ---------------------------------------------------------------------------
# 5 improvements total: 4 archetype-specific + 1 universal. Each is a
# discrete (one-shot) upgrade: a player applies it once, the module gains
# the listed attributes, no progressive level ladder.
#
# Schematic shape: targets all 4 major slots via slots[] + keySuffixes[]
# array pairs (Tetra's standard pattern for cross-slot schematics).
# Tetra builds 4 ConfigSchematic instances out of each definition, one per
# slot; each is independently applicable based on the installed module's
# accepts_improvement() check.
#
# Improvement key convention: armor/<name> (matches Tetra's
# blade/serrated convention — namespace + descriptor).

# (improvement_key_short, archetype, attributes_per_level_1)
# Each entry produces one improvement def + one schematic.
IMPROVEMENTS = [
    # Archetype-specific (heavy)
    ("reinforced", "warrior", {"minecraft:generic.armor": 1.0,
                                "minecraft:generic.knockback_resistance": 0.05}),
    # Archetype-specific (light)
    ("streamlined", "rogue", {"*minecraft:generic.movement_speed": 0.05,
                              "minecraft:generic.attack_speed": 0.03}),
    # Archetype-specific (mage)
    ("runic",       "mage", {"irons_spellbooks:max_mana": 30.0,
                              "irons_spellbooks:spell_power": 0.05}),
    # Archetype-specific (balanced)
    ("tempered",    "balanced", {"minecraft:generic.armor": 0.5,
                                  "minecraft:generic.max_health": 1.0}),
    # Universal (any archetype)
    ("polished",    "shared", {"minecraft:generic.armor_toughness": 0.5}),
]

# Improvement display names for lang. Match Tetra's sentence-case style.
IMPROVEMENT_DISPLAY = {
    "reinforced":  ("Reinforced",   "Reinforces the armor with thicker plating. +1 armor, +5% knockback resist."),
    "streamlined": ("Streamlined",  "Smooths the armor's profile for faster motion. +5% movement speed, +3% attack speed."),
    "runic":       ("Runic",        "Inscribes runes that channel magical energy. +30 max mana, +5% spell power."),
    "tempered":    ("Tempered",     "Tempers the armor for balanced resilience. +0.5 armor, +1 max health."),
    "polished":    ("Polished",     "Polishes the surface to a high sheen. +0.5 toughness."),
}

MAJOR_SLOTS = [
    "helmet/crown",
    "chestplate/chest_plate",
    "leggings/leg_plate",
    "boots/boot_sole",
]
MAJOR_SLOT_SUFFIXES = ["_helmet", "_chestplate", "_leggings", "_boots"]

def gen_improvement_def(name: str, archetype: str, attrs: dict) -> list:
    """One improvement definition file (a JSON array of level entries).

    Each improvement consumes 1 integrity from the module's pool when
    applied. Combined with the variant integrity costs (major -2, minor
    -1), a fully-iron armor piece's +12 capacity supports about 7
    improvements before integrity-overflow shows in the workbench.
    """
    return [{
        "key": f"armor/{name}",
        "level": 1,
        "attributes": attrs,
        "integrity": -1,
    }]

def gen_improvement_schematic(name: str, archetype: str) -> dict:
    """One schematic file that applies the named improvement.

    Discoverable in any of the 4 major slot context menus; gated by the
    installed module's accepts_improvement check (which only succeeds if
    the module's improvements[] field includes the right archetype path
    prefix that loaded this improvement def).
    """
    return {
        "replace": True,
        "slots": MAJOR_SLOTS,
        "keySuffixes": MAJOR_SLOT_SUFFIXES,
        "materialSlotCount": 0,
        "displayType": "improvement",
        "glyph": GLYPH,
        "requirement": {
            "type": "tetra:and",
            "requirements": [
                {
                    "type": "tetra:not",
                    "requirement": {
                        "type": "tetra:improvement",
                        "improvement": f"armor/{name}",
                    },
                },
                {
                    "type": "tetra:accepts_improvement",
                    "improvement": f"armor/{name}",
                },
            ],
        },
        "outcomes": [{
            "improvements": {f"armor/{name}": 1},
        }],
    }

def gen_improvement_lang() -> dict:
    """Lang keys for improvement defs + schematic display."""
    out = {}
    for name, archetype, attrs in IMPROVEMENTS:
        display, desc = IMPROVEMENT_DISPLAY[name]
        # Improvement def lang (referenced by ImprovementData on module
        # tooltip lists).
        out[f"tetra.improvement.armor/{name}.name"] = display
        out[f"tetra.improvement.armor/{name}.description"] = desc
        # Schematic lang. Author both the BASE schematic key (file path
        # without suffix — what lang_audit checks) AND each suffixed form
        # (what Tetra resolves at runtime, since keySuffixes generates
        # one ConfigSchematic per slot with the suffix appended).
        base_path = f"tetra/schematic/armor/{archetype}/{name}"
        out[f"{base_path}.name"] = display
        out[f"{base_path}.description"] = desc
        for suffix in MAJOR_SLOT_SUFFIXES:
            sp = f"{base_path}{suffix}"
            out[f"{sp}.name"] = display
            out[f"{sp}.description"] = desc
    return out

def gen_install_schematic_json(module_key: str) -> dict:
    """Schematic that installs this specific module variant in its slot."""
    base_name, kind, archetype, base_armor, extra = MODULES[module_key]
    slot = MODULE_SLOT[module_key]
    module_short = module_key.split("/", 1)[1]
    display_type = "major" if kind == "major" else "minor"

    return {
        "replace": True,
        "slots": [slot],
        "materialSlotCount": 1,
        "displayType": display_type,
        "glyph": GLYPH,
        "translation": {"integrity": 0},
        "outcomes": [
            {
                "materials": SLOT_MATERIAL_CATEGORIES[slot],
                "countFactor": 1,
                "moduleKey": module_key,
                "moduleVariant": f"{module_short}/",
            }
        ],
    }

SLOT_LABELS = {
    "helmet/crown":          "Crown",
    "helmet/visor":          "Visor",
    "helmet/crest":          "Crest",
    "helmet/strap":          "Strap",
    "chestplate/chest_plate":   "Chest Plate",
    "chestplate/chest_lining":  "Chest Lining",
    "chestplate/trim":          "Trim",
    "chestplate/pauldrons":     "Pauldrons",
    "leggings/leg_plate":  "Leg Plate",
    "leggings/belt":       "Belt",
    "leggings/greaves":    "Greaves",
    "leggings/cuisses":    "Cuisses",
    "boots/boot_sole":     "Boot Sole",
    "boots/boot_lining":   "Boot Lining",
    "boots/heel":          "Heel",
    "boots/lacing":        "Lacing",
}

def gen_lang_entries() -> dict:
    """All lang keys touched by this generator."""
    out = {}
    # Per-slot meta (audit-required: name/description/material_name/prefix)
    for slot, label in SLOT_LABELS.items():
        out[f"tetra.slot.{slot}"] = label
        out[f"tetra.module.{slot}.name"] = label
        out[f"tetra.module.{slot}.description"] = f"The {label.lower()} slot of a reforged armor piece."
        out[f"tetra.module.{slot}.material_name"] = f"%s {label}"
        out[f"tetra.module.{slot}.prefix"] = label
    for module_key, (base_name, kind, *_rest) in MODULES.items():
        # Module-level keys (Tetra's getName chain also reads these by moduleKey)
        out[f"tetra.module.{module_key}.name"] = base_name
        out[f"tetra.module.{module_key}.description"] = f"A {kind} module for the {MODULE_SLOT[module_key].split('/', 1)[1].replace('_', ' ')} slot."
        out[f"tetra.module.{module_key}.material_name"] = f"%s {base_name}"
        out[f"tetra.module.{module_key}.prefix"] = base_name
        # Schematic keys (install schematic per module). Names match Tetra's
        # convention — just the module label, no "Install " prefix. The
        # workbench groups schematics under the slot context already.
        out[f"tetra/schematic/iridescent_reforging/{module_key}.name"] = base_name
        out[f"tetra/schematic/iridescent_reforging/{module_key}.description"] = f"Install a {base_name} {SLOT_LABELS[MODULE_SLOT[module_key]].lower()} into this slot."
        out[f"tetra/schematic/iridescent_reforging/{module_key}.slot1"] = "Material"
        # Variant keys: catch-all + each material. Tetra's getName uses the
        # variant key VERBATIM, so trailing-slash variants need both forms
        # authored — workbench falls through to the slash-stripped form on
        # some lookups.
        module_short = module_key.split("/", 1)[1]
        for mat_key, *_ in MATERIALS:
            mat_disp = material_display(mat_key)
            display = variant_name_for(module_key, mat_key, mat_disp)
            if mat_key:
                vk = f"{module_short}/{mat_key}"
                out[f"tetra.variant.{vk}"] = display
            else:
                # Catch-all variant: both 'foo/' and 'foo' forms.
                out[f"tetra.variant.{module_short}/"] = display
                out[f"tetra.variant.{module_short}"]  = display
    return out

def vanilla_replacement(piece: str, source_item: str, source_material: str) -> dict:
    """Build one replacement entry for vanilla armor → reforged_<piece>.

    Sets all 4 slots to the default module + given material.
    """
    slots = SLOTS_FOR_PIECE[piece]
    modules = {}
    for slot in slots:
        default_module = DEFAULT_MODULE_FOR_SLOT[slot]
        module_short = default_module.split("/", 1)[1]
        modules[slot] = [default_module, f"{module_short}/{source_material}"]
    return {
        "predicate": {"items": [source_item]},
        "item": f"iridescent_reforging:reforged_{piece}",
        "modules": modules,
    }

VANILLA_SOURCES = [
    # (item-id, source-material) — material maps to the module variant we install.
    ("minecraft:leather_helmet",     "leather"),    ("minecraft:leather_chestplate", "leather"),
    ("minecraft:leather_leggings",   "leather"),    ("minecraft:leather_boots",      "leather"),
    ("minecraft:iron_helmet",        "iron"),       ("minecraft:iron_chestplate",    "iron"),
    ("minecraft:iron_leggings",      "iron"),       ("minecraft:iron_boots",         "iron"),
    ("minecraft:golden_helmet",      "gold"),       ("minecraft:golden_chestplate",  "gold"),
    ("minecraft:golden_leggings",    "gold"),       ("minecraft:golden_boots",       "gold"),
    ("minecraft:diamond_helmet",     "diamond"),    ("minecraft:diamond_chestplate", "diamond"),
    ("minecraft:diamond_leggings",   "diamond"),    ("minecraft:diamond_boots",      "diamond"),
    ("minecraft:netherite_helmet",   "netherite"),  ("minecraft:netherite_chestplate","netherite"),
    ("minecraft:netherite_leggings", "netherite"),  ("minecraft:netherite_boots",    "netherite"),
    ("minecraft:chainmail_helmet",   "iron"),       ("minecraft:chainmail_chestplate","iron"),
    ("minecraft:chainmail_leggings", "iron"),       ("minecraft:chainmail_boots",    "iron"),
    ("minecraft:turtle_helmet",      "iron"),
]

def piece_from_item(item_id: str) -> str:
    if item_id.endswith("_helmet"):     return "helmet"
    if item_id.endswith("_chestplate"): return "chestplate"
    if item_id.endswith("_leggings"):   return "leggings"
    if item_id.endswith("_boots"):      return "boots"
    raise ValueError(item_id)

# ---------------------------------------------------------------------------
# Main: write everything
# ---------------------------------------------------------------------------

def write(p: Path, content: str):
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(content)

def main():
    # 1) Wipe old module files (16) + old _main schematics (16) + hone schematics (384)
    for piece in ("helmet", "chestplate", "leggings", "boots"):
        modules_dir = DATA / "modules" / piece
        if modules_dir.exists():
            shutil.rmtree(modules_dir)
        schemes_dir = DATA / "schematics/iridescent_reforging" / piece
        if schemes_dir.exists():
            shutil.rmtree(schemes_dir)
    # Wipe the Phase B armor improvement + schematic trees so re-running
    # the generator stays idempotent.
    for sub in ("armor",):
        for tree in (DATA / "schematics" / sub, DATA / "improvements" / sub):
            if tree.exists():
                shutil.rmtree(tree)

    # 2) Wipe vanilla + chainmail/turtle replacement files (we'll rewrite them).
    rep_dir = DATA / "replacements"
    rep_dir.mkdir(parents=True, exist_ok=True)
    for src_item, _ in VANILLA_SOURCES:
        fname = rep_dir / f"{src_item.split(':',1)[1]}.json"
        if fname.exists():
            fname.unlink()

    # 3) Generate new modules
    for module_key in MODULES:
        path = DATA / "modules" / (module_key + ".json")
        write(path, json.dumps(gen_module_json(module_key), indent=2))

    # 4) Generate new install schematics — one per module
    for module_key in MODULES:
        path = DATA / "schematics" / "iridescent_reforging" / (module_key + ".json")
        write(path, json.dumps(gen_install_schematic_json(module_key), indent=2))

    # 5) Rewrite vanilla replacements
    for src_item, mat in VANILLA_SOURCES:
        piece = piece_from_item(src_item)
        repl = [vanilla_replacement(piece, src_item, mat)]
        path = rep_dir / f"{src_item.split(':',1)[1]}.json"
        write(path, json.dumps(repl, indent=2))

    # 5b) Phase B — improvement definitions + schematics
    for name, archetype, attrs in IMPROVEMENTS:
        # Improvement def at data/tetra/improvements/armor/<archetype>/<name>.json
        imp_path = DATA / "improvements" / "armor" / archetype / f"{name}.json"
        write(imp_path, json.dumps(gen_improvement_def(name, archetype, attrs), indent=2))
        # Schematic at data/tetra/schematics/armor/<archetype>/<name>.json
        sch_path = DATA / "schematics" / "armor" / archetype / f"{name}.json"
        write(sch_path, json.dumps(gen_improvement_schematic(name, archetype), indent=2))

    # 6) Lang — replace tetra.* / tetra/schematic.* keys we own; keep everything else.
    if LANG.exists():
        with open(LANG) as f:
            lang = json.load(f)
    else:
        lang = {}
    # Drop old keys we will regenerate (variants + modules + main schematics)
    drop_prefixes = (
        "tetra.variant.",
        "tetra.module.",
        "tetra/schematic/iridescent_reforging/",
    )
    drop_prefixes = drop_prefixes + (
        "tetra.improvement.armor/",
        "tetra/schematic/armor/",
    )
    lang = {k: v for k, v in lang.items() if not any(k.startswith(p) for p in drop_prefixes)}
    lang.update(gen_lang_entries())
    lang.update(gen_improvement_lang())
    # Re-add slot lang (we keep these as before — slot keys didn't change)
    SLOT_LABELS = {
        "helmet/crown": "Crown", "helmet/visor": "Visor", "helmet/crest": "Crest", "helmet/strap": "Strap",
        "chestplate/chest_plate": "Chest Plate", "chestplate/chest_lining": "Chest Lining",
        "chestplate/trim": "Trim", "chestplate/pauldrons": "Pauldrons",
        "leggings/leg_plate": "Leg Plate", "leggings/belt": "Belt",
        "leggings/greaves": "Greaves", "leggings/cuisses": "Cuisses",
        "boots/boot_sole": "Boot Sole", "boots/boot_lining": "Boot Lining",
        "boots/heel": "Heel", "boots/lacing": "Lacing",
    }
    for slot_key, label in SLOT_LABELS.items():
        lang[f"tetra.slot.{slot_key}"] = label
    write(LANG, json.dumps(lang, indent=2, sort_keys=True))

    # 7) Stats
    n_modules = len(MODULES)
    n_install_schemes = len(MODULES)
    n_variants = sum(len(MATERIALS) for _ in MODULES)
    n_replacements = len(VANILLA_SOURCES)
    n_lang_added = len(gen_lang_entries())
    print(f"  modules:           {n_modules}")
    print(f"  install schematics:{n_install_schemes}")
    print(f"  variant entries:   {n_variants}")
    print(f"  vanilla replacers: {n_replacements}")
    print(f"  lang entries owned:{n_lang_added}")
    print(f"  total lang keys:   {len(lang)}")

if __name__ == "__main__":
    main()
