#!/usr/bin/env python3
"""
Fill missing Tetra lang keys following the pack's established conventions.

Scope (2026-06-12 pass -- 407 truly-missing keys; another 156 of lang_audit's
563 already lived in the other lang homes, which the audit now merges):
  - Honing-ladder schematics (336): armor class-hones, wand secondary (_b/_c)
    lines, book hone + settled tracks. Convention from the existing wand
    primaries: themed one-word name + Roman tier ("Flow I".."Flow V"),
    description "Honed <part> <flavor> (tier N/5)."
  - Improvement .name mirrors (24): Tetra renders the BARE improvement key;
    our audit (and the modspells convention) also wants .name -- mirror the
    bare value.
  - Wand module meta (16) + book module .prefix (6) + bare variant names (22)
    + variant_category labels (3).

Theme words are stable per (class/line, stat) -- reuse them for future hone
lines so naming stays coherent:
  Flow=mana_regen  Reservoir=max_mana  Potency=spell_power
  Alacrity=cooldown_reduction  Swiftness=cast_time_reduction
  Ward=spell_resist  Precision=crit_chance  Lethality=crit_damage
  Stride/Dash=movement_speed(balanced/rogue)  Bastion=armor(balanced)
  Bulwark=armor_big(warrior)  Ferocity=attack_damage  Deadeye=arrow_damage

Book/tome keys land in the iridescent_modular_spells lang home, the rest in
iridescent_reforging -- matching where each family's existing keys live.
Idempotent: never overwrites an existing key in ANY home.
"""
import json
from pathlib import Path

MOD_ROOT = Path(__file__).resolve().parent.parent
LANG_REFORGING = MOD_ROOT / 'src/main/resources/assets/iridescent_reforging/lang/en_us.json'
LANG_MODSPELLS = MOD_ROOT / 'src/main/resources/assets/iridescent_modular_spells/lang/en_us.json'
LANG_TETRA_NS = MOD_ROOT / 'src/main/resources/assets/tetra/lang/en_us.json'

ROMAN = {1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V'}

# (line key) -> (theme word, description flavor "Honed ...")
ARMOR_LINES = {
    'balanced_armor':          ('Bastion',  'Balanced honing hardens the plate. Bonus armor'),
    'balanced_movement_speed': ('Stride',   'Balanced honing lightens the step. Bonus movement speed'),
    'mage_spell_power':        ('Potency',  'Mage honing attunes the piece to spellcraft. Bonus spell power'),
    'mage_max_mana':           ('Reservoir', 'Mage honing deepens the mana pool. Bonus max mana'),
    'mage_cooldown_reduction': ('Alacrity', 'Mage honing shortens spell cooldowns'),
    'rogue_attack_damage':     ('Ferocity', 'Rogue honing sharpens every strike. Bonus attack damage'),
    'rogue_arrow_damage':      ('Deadeye',  'Rogue honing steadies the aim. Bonus arrow damage'),
    'rogue_movement_speed':    ('Dash',     'Rogue honing frees the wearer. Bonus movement speed'),
    'warrior_armor_big':       ('Bulwark',  'Warrior honing layers heavy plate. Large armor bonus'),
}

WAND_LINES = {
    'cap_max_mana_b':            ('Reservoir', 'Honed cap stores deeper mana reserves'),
    'cap_spell_resist_c':        ('Ward',      'Honed cap wards against hostile magic'),
    'core_mana_regen_b':         ('Flow',      'Honed core accelerates mana recovery'),
    'core_cooldown_reduction_c': ('Alacrity',  'Honed core shortens spell cooldowns'),
    'handle_spell_power_b':      ('Potency',   'Honed handle channels greater spell power'),
    'handle_mana_regen_c':       ('Flow',      'Honed handle steadies mana recovery'),
    'inlay_crit_chance_b':       ('Precision', 'Honed inlay sharpens critical chance'),
    'inlay_crit_damage_c':       ('Lethality', 'Honed inlay deepens critical wounds'),
}

# book -> line -> (theme, flavor, settled stat label)
BOOK_LINES = {
    'ars_book': {
        'spine_mana_regen':        ('Flow',      'Honed spine quickens mana recovery', 'Mana Regen'),
        'front_cover_max_mana':    ('Reservoir', 'Honed cover deepens the mana pool', 'Max Mana'),
        'back_cover_spell_power':  ('Potency',   'Honed backing amplifies spell power', 'Spell Power'),
    },
    'iss_book': {
        'spine_mana_regen':             ('Flow',      'Honed spine quickens mana recovery', 'Mana Regen'),
        'front_cover_max_mana':         ('Reservoir', 'Honed cover deepens the mana pool', 'Max Mana'),
        'back_cover_spell_power':       ('Potency',   'Honed backing amplifies spell power', 'Spell Power'),
        'pages_cast_time_reduction':    ('Swiftness', 'Honed pages hasten casting', 'Cast Time'),
        'core_cooldown_reduction':      ('Alacrity',  'Honed core shortens spell cooldowns', 'Cooldowns'),
    },
}

WAND_MODULE_META = {
    'wand/cap':    ('Wand Cap',    'Crowns the wand; governs mana capacity and warding.',  '%s cap',    '%s-capped'),
    'wand/core':   ('Wand Core',   "The wand's focus; governs recovery and cooldowns.",    '%s core',   '%s-cored'),
    'wand/handle': ('Wand Handle', 'The grip; channels spell power and steadies recovery.', '%s handle', '%s-handled'),
    'wand/inlay':  ('Wand Inlay',  'Decorative channels that sharpen critical spellwork.', '%s inlay',  '%s-inlaid'),
}

BOOK_MODULE_PREFIX = {
    'ars_book/back_cover': '%s-backed',
    'ars_book/spine':      '%s-bound',
    'ars_book/dye':        '%s-dyed',
    'iss_book/back_cover': '%s-backed',
    'iss_book/spine':      '%s-bound',
    'iss_book/pages':      '%s-leaved',
}

BARE_VARIANTS_REFORGING = {
    'basic_cap': 'Basic Cap', 'basic_core': 'Basic Core',
    'basic_handle': 'Basic Handle', 'basic_inlay': 'Basic Inlay',
}
BARE_VARIANTS_MODSPELLS = {
    'ars_core': 'Tome Core', 'iss_core': 'Spell Book Core',
    'spine': 'Spine', 'front_cover': 'Front Cover',
    'back_cover': 'Back Cover', 'pages': 'Pages', 'dye': 'Dye',
}

VARIANT_CATEGORY_LABELS = {
    'fabric': 'Fabric', 'metal': 'Metal', 'skin': 'Skin',
}


def main():
    reforging = json.load(open(LANG_REFORGING))
    modspells = json.load(open(LANG_MODSPELLS))
    tetra_ns = json.load(open(LANG_TETRA_NS)) if LANG_TETRA_NS.exists() else {}
    merged = {**tetra_ns, **modspells, **reforging}

    add_ref, add_mod = {}, {}

    def put(target, key, value):
        if key not in merged and key not in add_ref and key not in add_mod:
            target[key] = value

    # -- armor class-hone schematics -----------------------------------------
    for slot, lines in {
        'boots':      ['balanced_movement_speed', 'mage_cooldown_reduction', 'rogue_movement_speed', 'warrior_armor_big'],
        'chestplate': ['balanced_armor', 'mage_spell_power', 'rogue_attack_damage', 'warrior_armor_big'],
        'helmet':     ['balanced_armor', 'mage_spell_power', 'rogue_arrow_damage', 'warrior_armor_big'],
        'leggings':   ['balanced_armor', 'mage_max_mana', 'rogue_movement_speed', 'warrior_armor_big'],
    }.items():
        for line in lines:
            theme, flavor = ARMOR_LINES[line]
            for n in range(1, 6):
                base = f'tetra/schematic/iridescent_reforging/{slot}/hone_{line}_{n}'
                put(add_ref, f'{base}.name', f'{theme} {ROMAN[n]}')
                put(add_ref, f'{base}.description', f'{flavor} (tier {n}/5).')

    # -- wand secondary hone schematics ---------------------------------------
    for line, (theme, flavor) in WAND_LINES.items():
        for n in range(1, 6):
            base = f'tetra/schematic/iridescent_reforging/wand/hone_{line}_{n}'
            put(add_ref, f'{base}.name', f'{theme} {ROMAN[n]}')
            put(add_ref, f'{base}.description', f'{flavor} (tier {n}/5).')

    # -- book hone + settled schematics ---------------------------------------
    for book, lines in BOOK_LINES.items():
        for line, (theme, flavor, stat_label) in lines.items():
            for n in range(1, 6):
                base = f'tetra/schematic/{book}/hone_{line}_{n}'
                put(add_mod, f'{base}.name', f'{theme} {ROMAN[n]}')
                put(add_mod, f'{base}.description', f'{flavor} (tier {n}/5).')
            # settled key shape: hone_<part>_settled_<stat>. Parts can be
            # two words (front_cover) so split on the KNOWN stat suffix,
            # never on the first underscore.
            for stat in ('mana_regen', 'max_mana', 'spell_power',
                         'cast_time_reduction', 'cooldown_reduction'):
                if line.endswith('_' + stat):
                    part = line[:-len(stat) - 1]
                    break
            settled = f'tetra/schematic/{book}/hone_{part}_settled_{stat}'
            put(add_mod, f'{settled}.name', f'Settled {theme}')
            put(add_mod, f'{settled}.description',
                f'The slot settles into the bearer\'s spellcraft. Permanent {stat_label.lower()} bonus.')

    # -- improvement .name mirrors (Tetra renders the bare key; mirror it) ----
    for key, val in list(merged.items()):
        if key.startswith('tetra.improvement.') and not key.endswith(('.name', '.description')):
            put(add_ref, f'{key}.name', val)

    # -- wand module meta ------------------------------------------------------
    for mod, (name, desc, mat_name, prefix) in WAND_MODULE_META.items():
        put(add_ref, f'tetra.module.{mod}.name', name)
        put(add_ref, f'tetra.module.{mod}.description', desc)
        put(add_ref, f'tetra.module.{mod}.material_name', mat_name)
        put(add_ref, f'tetra.module.{mod}.prefix', prefix)

    # -- book module prefixes ---------------------------------------------------
    for mod, prefix in BOOK_MODULE_PREFIX.items():
        put(add_mod, f'tetra.module.{mod}.prefix', prefix)

    # -- bare variant names (both bare and trailing-slash forms) ---------------
    for arch, pretty in BARE_VARIANTS_REFORGING.items():
        put(add_ref, f'tetra.variant.{arch}', pretty)
        put(add_ref, f'tetra.variant.{arch}/', pretty)
    for arch, pretty in BARE_VARIANTS_MODSPELLS.items():
        put(add_mod, f'tetra.variant.{arch}', pretty)
        put(add_mod, f'tetra.variant.{arch}/', pretty)

    # -- variant category labels -------------------------------------------------
    for cat, label in VARIANT_CATEGORY_LABELS.items():
        put(add_ref, f'tetra.variant_category.{cat}.label', label)

    reforging.update(add_ref)
    modspells.update(add_mod)
    with open(LANG_REFORGING, 'w') as f:
        json.dump(dict(sorted(reforging.items())), f, indent=2, ensure_ascii=False)
        f.write('\n')
    with open(LANG_MODSPELLS, 'w') as f:
        json.dump(dict(sorted(modspells.items())), f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(f'Added {len(add_ref)} keys to iridescent_reforging, {len(add_mod)} to iridescent_modular_spells.')


if __name__ == '__main__':
    main()
