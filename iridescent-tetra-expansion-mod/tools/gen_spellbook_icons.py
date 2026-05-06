#!/usr/bin/env python3
"""
Source-aware inventory icon generator for modular spell books.

For each source spell book (ISS + Ars):
  1. Generates a per-source item model at
     assets/iridescent_modular_spells/models/item/source/<source>.json
     with layer0 pointing at the source mod's actual texture.
  2. Updates the main model JSONs (modular_spell_book.json,
     modular_ars_spell_book.json) overrides array with predicate
     `iridescent_modular_spells:source_index = N` -> per-source model.

Numeric N is assigned by alphabetical sort over the source paths,
matching ClientSpellbookIcon's runtime index map. Run before gradle
build, integrated into build_mod.sh.
"""
import json
import os
import sys

ISS_SOURCES = [
    'blaze_spell_book', 'copper_spell_book', 'diamond_spell_book',
    'dragonskin_spell_book', 'druidic_spell_book', 'evoker_spell_book',
    'gold_spell_book', 'iron_spell_book', 'necronomicon_spell_book',
    'netherite_spell_book', 'rotten_spell_book', 'villager_spell_book',
]

ARS_SOURCES = [
    'apprentice_spell_book', 'archmage_spell_book', 'novice_spell_book',
]

# Ars Nouveau ships colored 2D textures + 3D BlockEntity model. The 3D
# path uses `parent: "builtin/entity"`. For the 2D inventory icon we map
# each source to a colored Ars PNG by tier feel. The Ars jar ships:
# black/blue/brown/cyan/gray/green/light_blue/light_gray/lime/magenta/
# orange/pink/purple/red/white/yellow - no `gold`, so archmage uses
# `yellow` as the closest match.
ARS_SOURCE_TO_TEXTURE = {
    'novice_spell_book':     'spellbook_blue',
    'apprentice_spell_book': 'spellbook_purple',
    'archmage_spell_book':   'spellbook_yellow',
}

# ISS sources missing a flat 2D PNG -- we fall back to their 3D model
# texture atlas. Currently only `villager_spell_book` (registered item but
# no flat icon ships).
ISS_SOURCE_TEXTURE_OVERRIDES = {
    'villager_spell_book': 'irons_spellbooks:item/spell_book_models/villager_spell_book',
}


def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    assets = os.path.join(repo_root, 'src/main/resources/assets/iridescent_modular_spells/models/item')
    source_dir = os.path.join(assets, 'source')
    os.makedirs(source_dir, exist_ok=True)

    # Build deterministic 1..N indices (sorted alphabetically) - must match
    # ClientSpellbookIcon's index map.
    iss_index = {s: i + 1 for i, s in enumerate(sorted(ISS_SOURCES))}
    ars_index = {s: i + 1 for i, s in enumerate(sorted(ARS_SOURCES))}

    # ISS per-source models point at irons_spellbooks:item/<source>
    # (verified to exist in the ISS jar as flat 2D PNGs).
    iss_overrides = []
    for source in sorted(ISS_SOURCES):
        layer0 = ISS_SOURCE_TEXTURE_OVERRIDES.get(source, f'irons_spellbooks:item/{source}')
        out_path = os.path.join(source_dir, f'iss_{source}.json')
        with open(out_path, 'w') as f:
            json.dump({
                'parent': 'item/generated',
                'textures': {'layer0': layer0},
            }, f, indent=2)
            f.write('\n')
        iss_overrides.append({
            'predicate': {'iridescent_modular_spells:source_index': iss_index[source]},
            'model': f'iridescent_modular_spells:item/source/iss_{source}',
        })

    # Ars per-source models point at the colored Ars textures via
    # ARS_SOURCE_TO_TEXTURE mapping.
    ars_overrides = []
    for source in sorted(ARS_SOURCES):
        tex = ARS_SOURCE_TO_TEXTURE.get(source, 'spellbook_blue')
        out_path = os.path.join(source_dir, f'ars_{source}.json')
        with open(out_path, 'w') as f:
            json.dump({
                'parent': 'item/generated',
                'textures': {'layer0': f'ars_nouveau:item/{tex}'},
            }, f, indent=2)
            f.write('\n')
        ars_overrides.append({
            'predicate': {'iridescent_modular_spells:source_index': ars_index[source]},
            'model': f'iridescent_modular_spells:item/source/ars_{source}',
        })

    # Update the main modular_spell_book.json (ISS) - replace any existing
    # source_index overrides, preserve other predicate types.
    iss_main = os.path.join(assets, 'modular_spell_book.json')
    with open(iss_main) as f:
        iss_model = json.load(f)
    iss_model.setdefault('parent', 'item/generated')
    iss_model.setdefault('textures', {'layer0': 'irons_spellbooks:item/iron_spell_book'})
    keep = [o for o in iss_model.get('overrides', [])
            if 'iridescent_modular_spells:source_index' not in o.get('predicate', {})]
    iss_model['overrides'] = keep + iss_overrides
    with open(iss_main, 'w') as f:
        json.dump(iss_model, f, indent=2); f.write('\n')

    # Update modular_ars_spell_book.json (Ars) - same shape.
    ars_main = os.path.join(assets, 'modular_ars_spell_book.json')
    with open(ars_main) as f:
        ars_model = json.load(f)
    ars_model.setdefault('parent', 'item/generated')
    ars_model.setdefault('textures', {'layer0': 'ars_nouveau:item/spellbook_blue'})
    keep = [o for o in ars_model.get('overrides', [])
            if 'iridescent_modular_spells:source_index' not in o.get('predicate', {})]
    ars_model['overrides'] = keep + ars_overrides
    with open(ars_main, 'w') as f:
        json.dump(ars_model, f, indent=2); f.write('\n')

    print(f'gen_spellbook_icons: wrote {len(ISS_SOURCES)} ISS + {len(ARS_SOURCES)} Ars per-source models')
    print(f'gen_spellbook_icons: ISS index 1..{len(ISS_SOURCES)} / Ars index 1..{len(ARS_SOURCES)}')


if __name__ == '__main__':
    main()
