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
  per slot (basic / heavy / light / robed for boots, breastplate /
  cuirass / robe_chest / scaled_chest for chestplate, etc.) each with
  12 or 14 material variants. The stale repair JSONs reference
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
ARMOR_SLOTS = ('helmet', 'chestplate', 'leggings', 'boots')

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
    # tetra:skin/fabric/fibre fixtures
    'leather':      (['minecraft:leather'],         2, HAMMER_IRON),
    'wool':         (['minecraft:white_wool'],      2, HAMMER_IRON),
    'string':       (['minecraft:string'],          4, HAMMER_IRON),
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


def is_major_module(d):
    return d.get('type') == 'tetra:basic_major_module'


def variant_material_suffix(variant_key):
    """`breastplate/iron` -> `iron`. Empty suffix = base template, skip."""
    parts = variant_key.split('/', 1)
    return parts[1].strip() if len(parts) == 2 else ''


def emit_repair(slot, archetype, material, items, count, tools, variant_key):
    """Write a single repair JSON. Filename includes archetype + material
    so multi-archetype slots don't collide."""
    out_dir = os.path.join(REPAIRS_DIR, slot)
    os.makedirs(out_dir, exist_ok=True)
    fname = f'{archetype}__{material}.json'
    out = {
        'material':      {'items': items, 'count': count},
        'requiredTools': tools,
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
