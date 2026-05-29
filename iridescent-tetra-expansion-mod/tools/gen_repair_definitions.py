#!/usr/bin/env python3
"""
Auto-generate Tetra repair definitions for the modular armor system.

Background:
  Tetra's RepairSchematic (the workbench Repair tab) reads from
  RepairRegistry, which loads from data/tetra/repairs/<...>.json
  files at startup. Each file declares `(moduleKey, moduleVariant)`
  -> `(material.items, count, requiredTools)`.

  The repair JSONs in this mod were left over from a pre-refactor
  schema where each slot had ONE major module named e.g.
  `full_leg_plate`. The current schema has 4 archetype-coded majors
  per slot (basic / heavy / light / vestment for boots, breastplate /
  cuirass / vestment_chest / scaled_chest for chestplate, etc.) each
  with 12 or 14 material variants. The stale repair JSONs reference
  module variants that no longer exist, so RepairRegistry returns
  empty for every current variant key, and the Repair tab accepts
  no input materials.

Fix:
  Walk every major-slot armor module file
  (`data/tetra/modules/<slot>/<archetype>.json`) where
  `type == "tetra:basic_major_module"`. For each variant whose key
  has a non-empty material suffix (e.g. `breastplate/iron`), look up
  the material in MATERIAL_ITEM_MAP and emit a repair JSON at
  `data/tetra/repairs/<slot>/<archetype>__<material>.json`.

  The lookup combines:
    - hardcoded metal/gem map (taken from the existing repair JSONs
      that had the right item counts/tools, just wrong moduleKeys)
    - themed materials read live from
      `data/tetra/materials/themed/<material>.json::material.items[0]`
    - skin/fabric/fibre fixtures for leather/wool/string

  Wipes the existing data/tetra/repairs/ tree first so stale entries
  can't shadow the new ones.

Run:
  python3 tools/gen_repair_definitions.py
"""

import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODULES_DIR = os.path.join(ROOT, 'src/main/resources/data/tetra/modules')
REPAIRS_DIR = os.path.join(ROOT, 'src/main/resources/data/tetra/repairs')
THEMED_DIR  = os.path.join(ROOT, 'src/main/resources/data/tetra/materials/themed')

# Slots we generate repair defs for. Spell book core/front_cover have
# only one variant (the slot fixture, no material variation) -- they
# use a different repair path via book material schematics.
# 'wand' is a non-armor major-bearing slot (reforged_wand item, Phase D
# of the staves/wands integration) — its handle module is the major and
# drives repair material identity exactly like armor's crown/chest_plate.
ARMOR_SLOTS = ('helmet', 'chestplate', 'leggings', 'boots', 'wand',
               'ars_book', 'iss_book')

# Material suffix -> (item_id, count, required_hammer_tool_level).
# Combines the values from the 19 pre-refactor repair JSONs (verified
# correct items + counts; the only thing wrong was their moduleKey)
# plus skin/fabric/fibre fixtures. Themed materials are loaded
# live from their material data files below so a future addition
# auto-flows.
HAMMER_IRON     = {'hammer_dig': 'minecraft:iron'}
HAMMER_DIAMOND  = {'hammer_dig': 'minecraft:diamond'}

MATERIAL_ITEM_MAP = {
    # tetra:metal/...
    'iron':         (['minecraft:iron_ingot'],          2, HAMMER_IRON),
    'gold':         (['minecraft:gold_ingot'],          2, HAMMER_IRON),
    'copper':       (['minecraft:copper_ingot'],        3, HAMMER_IRON),
    'diamond':      (['minecraft:diamond'],             2, HAMMER_IRON),
    'netherite':    (['minecraft:netherite_ingot'],     1, HAMMER_DIAMOND),
    # tetranomicon-extended metals
    'aethersteel':  (['aethersteel:aethersteel_ingot'], 2, HAMMER_IRON),
    'charoite':     (['blue_skies:charoite_ingot'],     2, HAMMER_IRON),
    'diopside':     (['blue_skies:diopside_gem'],       2, HAMMER_IRON),
    'elementium':   (['botania:elementium_ingot'],      2, HAMMER_IRON),
    'fiery':        (['twilightforest:fiery_ingot'],    2, HAMMER_IRON),
    'horizonite':   (['blue_skies:horizonite_ingot'],   2, HAMMER_IRON),
    'ironwood':     (['twilightforest:ironwood_ingot'], 2, HAMMER_IRON),
    'knightmetal':  (['twilightforest:knightmetal_ingot'], 2, HAMMER_IRON),
    'manasteel':    (['botania:manasteel_ingot'],       2, HAMMER_IRON),
    'steeleaf':     (['twilightforest:steeleaf_ingot'], 2, HAMMER_IRON),
    'terrasteel':   (['botania:terrasteel_ingot'],      1, HAMMER_IRON),
    'undergarden_cloggrum':   (['undergarden:cloggrum_ingot'],   2, HAMMER_IRON),
    'undergarden_froststeel': (['undergarden:froststeel_ingot'], 2, HAMMER_IRON),
    'undergarden_utherium':   (['undergarden:utherium_ingot'],   2, HAMMER_IRON),
    # 2026-05-10: per-mod material variants for non-vanilla-tier modded armor
    # (added during the modded-armor rebalance pass; each variant has the
    # source mod's exact armor profile mapped onto our 4 default modules).
    'aether_neptune':         (['aether:zanite_gemstone'],       2, HAMMER_IRON),
    'aether_obsidian':        (['minecraft:obsidian'],           2, HAMMER_IRON),
    'tf_arctic':              (['twilightforest:arctic_fur'],    2, HAMMER_IRON),
    'tf_fiery':               (['twilightforest:fiery_ingot'],   2, HAMMER_IRON),
    'tf_ironwood':            (['twilightforest:ironwood_ingot'],2, HAMMER_IRON),
    'tf_knightmetal':         (['twilightforest:knightmetal_ingot'], 2, HAMMER_IRON),
    'tf_naga':                (['twilightforest:naga_scale'],    2, HAMMER_IRON),
    'tf_yeti':                (['twilightforest:alpha_fur'],     2, HAMMER_IRON),
    'ug_cloggrum':            (['undergarden:cloggrum_ingot'],   2, HAMMER_IRON),
    'ug_froststeel':          (['undergarden:froststeel_ingot'], 2, HAMMER_IRON),
    'fa_draco_arcanus':       (['forbidden_arcanus:draco_arcanus_ingot'], 2, HAMMER_DIAMOND),
    'fa_mortem':              (['forbidden_arcanus:bone'],       2, HAMMER_IRON),
    'fa_tyr':                 (['forbidden_arcanus:tyr_ingot'],  2, HAMMER_DIAMOND),
    'bs_diopside':            (['blue_skies:diopside_gem'],      2, HAMMER_IRON),
    'bs_horizonite':          (['blue_skies:horizonite_ingot'],  2, HAMMER_IRON),
    'bs_pyrope':              (['blue_skies:pyrope_gem'],        2, HAMMER_IRON),
    # Shared variant: diamond armor with 0 toughness — repair via vanilla diamond.
    'diamond_no_t':           (['minecraft:diamond'],            2, HAMMER_IRON),
    # Round 3: DeeperDarker + Cataclysm
    'dd_resonarium':          (['deeperdarker:resonarium'],      2, HAMMER_IRON),
    'dd_warden':              (['deeperdarker:reinforced_echo_shard'], 1, HAMMER_DIAMOND),
    'cm_ignitium':            (['cataclysm:ignitium_ingot'],     1, HAMMER_DIAMOND),
    # tetra:wood/stone for the wand slot (reforged_wand T1 materials)
    # After 2026-05-11 sweep, wand wildcards expand using material.key
    # (tetra:wood/oak -> key=oak), so we map oak in addition to legacy wood.
    'wood':         (['minecraft:stick'],           2, HAMMER_IRON),
    'oak':          (['minecraft:oak_planks'],      2, HAMMER_IRON),
    'stone':        (['minecraft:cobblestone'],     2, HAMMER_IRON),
    # tetra:skin/fabric/fibre fixtures
    'leather':       (['minecraft:leather'],            2, HAMMER_IRON),
    'wool':          (['minecraft:white_wool'],         2, HAMMER_IRON),
    'string':        (['minecraft:string'],             4, HAMMER_IRON),
    'paper':         (['minecraft:paper'],              4, HAMMER_IRON),
    'rotten_flesh':  (['minecraft:rotten_flesh'],       4, HAMMER_IRON),
    'deathskin':     (['minecraft:rotten_flesh'],       4, HAMMER_IRON),
    'rotten_leather':(['forbidden_arcanus:rotten_leather'], 2, HAMMER_IRON),
    'arcane_ingot':  (['irons_spellbooks:arcane_ingot'], 2, HAMMER_IRON),
    'arcane_cloth':  (['irons_spellbooks:magic_cloth'],  2, HAMMER_IRON),
    # themed (added below from data/tetra/materials/themed/*.json)
}


def load_themed_materials():
    """Read themed material JSONs and add them to MATERIAL_ITEM_MAP."""
    if not os.path.isdir(THEMED_DIR):
        return
    for fname in sorted(os.listdir(THEMED_DIR)):
        if not fname.endswith('.json'):
            continue
        path = os.path.join(THEMED_DIR, fname)
        with open(path) as f:
            d = json.load(f)
        key = d.get('key')
        items = d.get('material', {}).get('items', [])
        if not key or not items:
            continue
        # Themed: 2 of the primary item, iron hammer.
        MATERIAL_ITEM_MAP[key] = (items, 2, HAMMER_IRON)


def load_modded_materials():
    """Auto-load modded metal + gem materials from the icraft_tetra_materials
    datapack so per-material armor variants generated by tools/generate_
    variants.py have repair JSONs without manual MATERIAL_ITEM_MAP edits.
    Mirrors load_themed_materials() but pulls from the sibling datapack
    sources directory rather than the in-mod themed/ folder."""
    icraft_mat_dir = os.path.join(
        ROOT, '..', '.minecraft', 'datapack_sources',
        'icraft_tetra_materials', 'data', 'tetra', 'materials')
    icraft_mat_dir = os.path.normpath(icraft_mat_dir)
    if not os.path.isdir(icraft_mat_dir):
        return
    for cat in ('metal', 'gem'):
        cat_dir = os.path.join(icraft_mat_dir, cat)
        if not os.path.isdir(cat_dir):
            continue
        for fname in sorted(os.listdir(cat_dir)):
            if not fname.endswith('.json'):
                continue
            with open(os.path.join(cat_dir, fname)) as f:
                d = json.load(f)
            key = d.get('key')
            items = d.get('material', {}).get('items', [])
            if not key or not items:
                continue
            if key in MATERIAL_ITEM_MAP:
                continue  # hardcoded entry wins (preserves count + tool tier)
            # Tier-derived hammer requirement: netherite-tier metals need a
            # diamond hammer; everything else needs iron. Default count = 2.
            tool_lvl = str(d.get('toolLevel', '')).lower()
            tools = HAMMER_DIAMOND if 'netherite' in tool_lvl else HAMMER_IRON
            MATERIAL_ITEM_MAP[key] = (items, 2, tools)


def is_major_module(d):
    return d.get('type') == 'tetra:basic_major_module'


def variant_material_suffix(variant_key):
    """`breastplate/iron` -> `iron`. Empty suffix = base template, skip."""
    parts = variant_key.split('/', 1)
    return parts[1].strip() if len(parts) == 2 else ''


def emit_repair(slot, archetype, material, items, count, tools, variant_key):
    """Write a single repair JSON. Filename includes archetype + material
    so multi-archetype slots don't collide.

    `requiredTools` is OMITTED from the output (mirrors base Tetra's
    `data/tetra/repairs/sockets/**/*.json` shape — see e.g. socket/
    pristine_diamond.json). The workbench Repair tab then accepts the
    listed material with no hammer/wrench implement required, which
    matches how vanilla armor repair feels at an anvil. We still compute
    the per-material tool tier in MATERIAL_ITEM_MAP so reinstating an
    implement requirement later is a one-line revert if a tier ever
    warrants gating. Tetra deserialises missing requiredTools as an
    empty ToolData; RepairSchematic.getRequiredToolLevels returns an
    empty map and the workbench accepts material-only repair."""
    _ = tools  # intentionally unused; see docstring
    out_dir = os.path.join(REPAIRS_DIR, slot)
    os.makedirs(out_dir, exist_ok=True)
    fname = f'{archetype}__{material}.json'
    out = {
        'material':      {'items': items, 'count': count},
        'moduleKey':     archetype_to_module_key(slot, archetype),
        'moduleVariant': variant_key,
    }
    with open(os.path.join(out_dir, fname), 'w') as f:
        json.dump(out, f, indent=2)
        f.write('\n')


def archetype_to_module_key(slot, archetype_filename):
    """Map (slot, archetype-filename) -> moduleKey expected by Tetra.
    moduleKey is the slot id from the module's `slots` array."""
    return _MODULE_SLOT_MAP[(slot, archetype_filename)]


_MODULE_SLOT_MAP = {}


def regenerate():
    load_themed_materials()
    load_modded_materials()
    if os.path.isdir(REPAIRS_DIR):
        shutil.rmtree(REPAIRS_DIR)
    os.makedirs(REPAIRS_DIR, exist_ok=True)

    written  = 0
    skipped  = 0
    unknown  = set()

    for slot in ARMOR_SLOTS:
        slot_dir = os.path.join(MODULES_DIR, slot)
        if not os.path.isdir(slot_dir):
            continue
        for fname in sorted(os.listdir(slot_dir)):
            if not fname.endswith('.json'):
                continue
            archetype = fname[:-5]  # strip .json
            with open(os.path.join(slot_dir, fname)) as f:
                d = json.load(f)
            if not is_major_module(d):
                continue
            slots = d.get('slots', [])
            if not slots:
                continue
            module_slot_key = slots[0]
            _MODULE_SLOT_MAP[(slot, archetype)] = module_slot_key

            for v in d.get('variants', []):
                vk = v.get('key', '')
                mats = v.get('materials', [])
                if vk.endswith('/'):
                    # Wildcard variant (canonical Tetra shape). Derive
                    # per-material expansion from the materials list.
                    # Tetra's combine() produces key = <wildcard><material.key>
                    # at module-load time; we mirror that so repair lookups
                    # match the stamped variant key.
                    for m in mats:
                        if m.endswith('/'):
                            # Category wildcard (e.g. tetra:metal/) -- we don't
                            # enumerate every material under a category here;
                            # repairs are emitted only for explicit material refs.
                            continue
                        mat_key = m.split('/')[-1]
                        if mat_key not in MATERIAL_ITEM_MAP:
                            unknown.add(mat_key)
                            skipped += 1
                            continue
                        items, count, tools = MATERIAL_ITEM_MAP[mat_key]
                        expanded_key = vk + mat_key
                        emit_repair(slot, archetype, mat_key, items, count, tools, expanded_key)
                        written += 1
                else:
                    # Legacy named variant (modded materials deferred from the
                    # 2026-05-11 doubling-fix sweep). Use the suffix as the
                    # material lookup; the variant is dead until those modded
                    # materials are registered, but we still emit a repair
                    # entry keyed to the suffix in case the schematic path
                    # somehow stamps it.
                    mat = variant_material_suffix(vk)
                    if not mat:
                        skipped += 1
                        continue
                    lookup = MATERIAL_ITEM_MAP.get(mat)
                    if not lookup:
                        unknown.add(mat)
                        skipped += 1
                        continue
                    items, count, tools = lookup
                    emit_repair(slot, archetype, mat, items, count, tools, vk)
                    written += 1

    print(f'gen_repair_definitions: wrote {written} repair JSONs')
    if skipped:
        print(f'gen_repair_definitions: skipped {skipped} variant(s) (base templates or unmapped materials)')
    if unknown:
        print(f'gen_repair_definitions: UNMAPPED MATERIALS — extend MATERIAL_ITEM_MAP for: {sorted(unknown)}')
        sys.exit(1)


if __name__ == '__main__':
    regenerate()
