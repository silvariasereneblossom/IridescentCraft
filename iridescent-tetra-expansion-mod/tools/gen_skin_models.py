#!/usr/bin/env python3
"""
Skin-aware inventory icon generator for iridescent_reforging modular armor.

For each skin definition at
  src/main/resources/data/iridescent_reforging/iridescent_reforging_skins/<name>.json

generate:
  1. A per-skin item model JSON at
     src/main/resources/assets/iridescent_reforging/models/item/skin/<short_id>.json
     (parent: item/generated, layer0 = source mod's inventory texture path)

  2. An override entry in
     src/main/resources/assets/iridescent_reforging/models/item/reforged_<slot>.json
     with predicate `iridescent_reforging:skin_index = N` -> the per-skin model

The numeric N is assigned by alphabetical sort over skin_id (same sort that
ClientSkinIcon.java uses at runtime), so build-time JSON indices match
runtime ItemProperty values.

Run from `iridescent-tetra-expansion-mod/` dir before gradle build, OR via
build_mod.sh which invokes this automatically.
"""
import json
import os
import sys
from glob import glob


# Cross-mod inventory-icon texture resolution. The naive `<ns>:item/<item>` guess
# is WRONG for mods that nest armor icons under textures/item/armor/, and for two
# Iron's Spellbooks items whose texture basename differs from the item id. A wrong
# path renders the magenta/black missing-texture in the workbench + inventory.
# Verified 2026-06-17 against the live instance jars (aether, blue_skies,
# forbidden_arcanus, irons_spellbooks 3.15.5.1). See tools/_xmod_icon_audit.py.
_ARMOR_SUBDIR_NS = {'aether', 'blue_skies', 'forbidden_arcanus'}
_ICON_TEXTURE_OVERRIDE = {
    # ISS item `wizard_helmet` is the hood by default (its own model uses
    # item/wizard_helmet_hood with an override to _hat); there is no bare
    # `wizard_helmet.png`.
    'irons_spellbooks:wizard_helmet': 'irons_spellbooks:item/wizard_helmet_hood',
    # ISS tarnished crown ships as `tarnished_crown.png`, not `tarnished_helmet`.
    'irons_spellbooks:tarnished_helmet': 'irons_spellbooks:item/tarnished_crown',
}


def icon_texture_for(source_item):
    """Resolve a skin's `source_item` to the source mod's real inventory-icon
    texture ResourceLocation."""
    if source_item in _ICON_TEXTURE_OVERRIDE:
        return _ICON_TEXTURE_OVERRIDE[source_item]
    ns, path = source_item.split(':', 1)
    if ns in _ARMOR_SUBDIR_NS:
        return f'{ns}:item/armor/{path}'
    return f'{ns}:item/{path}'


def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    skin_dir = os.path.join(repo_root, 'src/main/resources/data/iridescent_reforging/iridescent_reforging_skins')
    assets_dir = os.path.join(repo_root, 'src/main/resources/assets/iridescent_reforging/models/item')
    skin_subdir = os.path.join(assets_dir, 'skin')
    os.makedirs(skin_subdir, exist_ok=True)

    skins = []
    for path in sorted(glob(os.path.join(skin_dir, '*.json'))):
        with open(path) as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError as e:
                print(f'WARN: skip malformed {os.path.basename(path)}: {e}', file=sys.stderr)
                continue
        if not data.get('source_item'):
            continue
        skins.append(data)

    # Same sort as ClientSkinIcon.buildIndexMap (Collections.sort over keySet).
    # In Java, Collections.sort on a List<String> uses natural ordering
    # (String.compareTo, lexicographic UTF-16). Python's sort on strings uses
    # the same lexicographic ordering for ASCII identifiers, which all our
    # skin_ids are. Equivalent for our id space.
    skins.sort(key=lambda s: s['skin_id'])

    # Assign 1..N
    skin_index = {s['skin_id']: i + 1 for i, s in enumerate(skins)}

    # Group by slot
    by_slot = {'helmet': [], 'chestplate': [], 'leggings': [], 'boots': []}
    skipped = 0
    for s in skins:
        slot = s.get('slot')
        if slot in by_slot:
            by_slot[slot].append(s)
        else:
            skipped += 1

    if skipped:
        print(f'WARN: {skipped} skins had unrecognized slot, skipped', file=sys.stderr)

    # Generate per-skin model JSONs
    skin_models_written = 0
    for s in skins:
        skin_id = s['skin_id']
        source = s['source_item']  # e.g. "irons_spellbooks:wandering_magician_chestplate"
        if ':' not in source:
            print(f'WARN: skin {skin_id} has malformed source_item {source!r}, skipping', file=sys.stderr)
            continue
        ns, path = source.split(':', 1)

        # Short id = drop the iridescent_reforging: prefix from skin_id
        short = skin_id
        if short.startswith('iridescent_reforging:'):
            short = short[len('iridescent_reforging:'):]

        out_file = os.path.join(skin_subdir, f'{short}.json')
        model = {
            'parent': 'item/generated',
            'textures': {
                'layer0': icon_texture_for(source)
            }
        }
        with open(out_file, 'w') as f:
            json.dump(model, f, indent=2)
            f.write('\n')
        skin_models_written += 1

    # Update reforged_<slot>.json overrides
    slots_updated = 0
    for slot, skin_list in by_slot.items():
        target = os.path.join(assets_dir, f'reforged_{slot}.json')
        if not os.path.exists(target):
            print(f'WARN: {target} not found, skipping slot {slot}', file=sys.stderr)
            continue
        with open(target) as f:
            base = json.load(f)

        existing_overrides = base.get('overrides', [])
        # Strip any existing skin_index overrides (idempotency for re-runs)
        kept = [
            o for o in existing_overrides
            if 'iridescent_reforging:skin_index' not in o.get('predicate', {})
        ]

        # Append new skin_index overrides in increasing-index order so that
        # Minecraft's last-matching-predicate-wins behavior picks the highest
        # matching index. Predicates in MC are >= comparisons, not exact.
        for s in sorted(skin_list, key=lambda x: skin_index[x['skin_id']]):
            skin_id = s['skin_id']
            short = skin_id
            if short.startswith('iridescent_reforging:'):
                short = short[len('iridescent_reforging:'):]
            kept.append({
                'predicate': {'iridescent_reforging:skin_index': skin_index[skin_id]},
                'model': f'iridescent_reforging:item/skin/{short}'
            })

        base['overrides'] = kept
        with open(target, 'w') as f:
            json.dump(base, f, indent=2)
            f.write('\n')
        slots_updated += 1

    print(f'gen_skin_models: wrote {skin_models_written} per-skin models')
    print(f'gen_skin_models: updated {slots_updated}/4 reforged_<slot>.json files')
    print(f'gen_skin_models: skin index range 1..{len(skins)}')


if __name__ == '__main__':
    main()
