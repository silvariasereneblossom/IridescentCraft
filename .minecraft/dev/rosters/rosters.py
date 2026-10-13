# -*- coding: utf-8 -*-
"""The pack's script registries, for dev tools: kubejs/config/icraft/registry/bosses.json and dimensions.json.

One reading of the files and ONE statement of what each consuming system gets from an entry (BOSS_SYSTEMS,
DIM_SYSTEMS). The scripts read the same files through kubejs/server_scripts/0_lib_registry.js; suite `registry`
of dev/engine-tests holds that reader to these tables, id by id and system by system.

    import rosters
    reg = rosters.load(minecraft_root)          # raises RegistryError when a file is missing or not strict JSON
    rosters.boss_cell(reg.bosses[id], 'x3')     # the value that system gets, or None when the entry is not in it
"""
import json
import os
from collections import OrderedDict

REGISTRY_DIR = os.path.join('kubejs', 'config', 'icraft', 'registry')
BOSS_FILE = 'bosses.json'
DIM_FILE = 'dimensions.json'
SCHEMA = 1

BOSS_KINDS = ('named', 'miniboss', 'unlisted')
BOSS_FLAGS = ('boss', 'x3', 'x3DamageSkip', 'perKill', 'witchInk', 'abyssBoss', 'vorpalMelee', 'vorpalArcane', 'caster')
BOSS_KEYS = ('tier', 'kind', 'hp', 'flags', 'rush', 'phaseOf', 'relic', 'arena', 'absent', 'note')
ALIAS_KEYS = ('sameAs', 'note')     # an entry with `sameAs` is a second entity id of another entry, and nothing else
ARENA_KEYS = ('key', 'display', 'tier', 'dimension', 'locator', 'structure', 'signatureBlock', 'waystone', 'summonEntity', 'ritual')
RELIC_KEYS = ('item', 'chance', 'looting')
BOSS_SWITCHES = ('perKill',)

DIM_FLAGS = ('loot', 'classPassives')
DIM_KEYS = ('tier', 'flags', 'stageGate', 'exploration', 'deathPenalty', 'mobEquipment', 'note')
EQUIP_KEYS = ('chance', 'weapons', 'helmets', 'chests', 'legs', 'boots', 'enchantLevel', 'fullSetChance')


class RegistryError(Exception):
    pass


def _flag(name):
    return lambda e: True if name in (e.get('flags') or ()) else None


def _value(key):
    return lambda e: e.get(key)


def _kind_tier(kind):
    return lambda e: e.get('tier') if e.get('kind') == kind else None


# system -> (what an entry gives it, who reads it). The order is the column order of the proof table.
BOSS_SYSTEMS = OrderedDict([
    ('isBoss',         (_flag('boss'),         '0_lib_core.js core.isBoss: affixes, enchants, skills, both Vorpal decapitations')),
    ('tierHpExcluded', (_flag('boss'),         'scaling/mob_scaling_unified.js: no mob-tier health multiplier')),
    ('hp',             (_value('hp'),          'scaling/boss_hp.js: designed health')),
    ('x3',             (_flag('x3'),           'scaling/zz_boss_global_3x.js: health x3, melee x3, ISS spell power x2')),
    ('x3DamageSkip',   (_flag('x3DamageSkip'), 'scaling/zz_boss_global_3x.js: the health x3 without the damage buffs')),
    ('perKill',        (_flag('perKill'),      'scaling/boss_progressive.js: per-kill scaling (switches.perKill)')),
    ('tokensNamed',    (_kind_tier('named'),   'exploration/codex_exploration_kills.js: first-kill and repeat tokens of that tier')),
    ('tokensMiniboss', (_kind_tier('miniboss'), 'exploration/codex_exploration_kills.js: tokens of that tier on every kill')),
    ('rush',           (_value('rush'),        'gates/codex_boss_rush.js: the roster (tier) it counts for')),
    ('phase',          (_value('phaseOf'),     'gates/codex_boss_rush.js: a kill is credited to that boss')),
    ('relic',          (_value('relic'),       'relic_boss_drops.js: the relic it drops')),
    ('arena',          (_value('arena'),       'bonfire/boss_arena_registry.js: Boss Compass and bonfire')),
    ('witchInk',       (_flag('witchInk'),     'origins/witch_of_ink_progression.js: +10 on the kill counter')),
    ('abyssBoss',      (_flag('abyssBoss'),    'scaling/dimension_mechanics.js: The Abyss boss rules')),
    ('vorpalMelee',    (_flag('vorpalMelee'),  'startup enchants/vorpal_rework.js: never beheaded')),
    ('vorpalArcane',   (_flag('vorpalArcane'), 'startup enchants/icraft_magic_enchants.js: never beheaded')),
    ('caster',         (_flag('caster'),       'the five spawn scripts that must not touch these spellcasters')),
])


def _dim_tier_if(key):
    return lambda e: e.get('tier') if key in (e.get('flags') or ()) else None


DIM_SYSTEMS = OrderedDict([
    ('stageGate',     (_value('stageGate'),       'gates/astages_restrictions.js: locked until stage tier_<tier>')),
    ('exploration',   (_value('exploration'),     'exploration/codex_exploration_kills.js: first-arrival bonus of that tier')),
    ('mobEquipment',  (_value('mobEquipment'),    'scaling/mob_equipment.js: the gear roll')),
    ('deathPenalty',  (_value('deathPenalty'),    'death_penalty.js: durability lost on death')),
    ('classPassives', (_dim_tier_if('classPassives'), 'origins/class_passives.js: detected tier')),
    ('loot',          (_dim_tier_if('loot'),      "the loot scripts: member of its tier's dimension group")),
])


def boss_cell(entry, system):
    return BOSS_SYSTEMS[system][0](entry)


def dim_cell(entry, system):
    return DIM_SYSTEMS[system][0](entry)


class Registry(object):
    def __init__(self, root, bosses_doc, dims_doc):
        self.root = root
        self.bosses_doc = bosses_doc
        self.dims_doc = dims_doc
        # the bosses, file order: every entry that is not a second id (`sameAs`) of another
        self.bosses = OrderedDict((i, e) for i, e in bosses_doc['bosses'].items() if not (isinstance(e, dict) and 'sameAs' in e))
        # second id -> the id of the boss it is. The game hands a script that boss under this id too
        # (progressivebosses:wither is the Wither). A list never holds one; a question asked with one is
        # answered from the boss (0_lib_registry.js does the same, suite `registry` compares).
        self.aliases = OrderedDict((i, e['sameAs']) for i, e in bosses_doc['bosses'].items() if isinstance(e, dict) and 'sameAs' in e)
        self.alias_entries = OrderedDict((i, e) for i, e in bosses_doc['bosses'].items() if isinstance(e, dict) and 'sameAs' in e)
        self.dims = dims_doc['dimensions']
        self.switches = bosses_doc.get('switches') or {}

    def canon(self, i):
        return self.aliases.get(i, i)

    def entity_ids(self, i):
        """[the boss's id, then its second ids]: the entity types a per-type rule for that boss has to cover"""
        c = self.canon(i)
        return [c] + [a for a, t in self.aliases.items() if t == c]

    def answer(self, i, system):
        """what a script that asks WITH this id gets from a system (a second id answers as its boss); None = not in it"""
        e = self.bosses.get(self.canon(i))
        return boss_cell(e, system) if e is not None else None

    def switch_on(self, name):
        s = self.switches.get(name)
        return bool(s and s.get('on') is True)

    def boss_ids(self, system=None):
        return [i for i, e in self.bosses.items() if system is None or boss_cell(e, system) is not None]

    def dim_ids(self, system=None):
        return [i for i, e in self.dims.items() if system is None or dim_cell(e, system) is not None]

    def dims_in_tier(self, tier, system=None):
        return [i for i, e in self.dims.items() if e.get('tier') == tier and (system is None or dim_cell(e, system) is not None)]

    def arenas(self):
        """arena key -> record as bonfire/boss_arena_registry.js publishes it (no `key`), in file order"""
        out = OrderedDict()
        for i, e in self.bosses.items():
            a = e.get('arena')
            if a:
                out[a['key']] = OrderedDict((k, v) for k, v in a.items() if k != 'key')
        return out

    def arena_entity(self):
        return OrderedDict((e['arena']['key'], i) for i, e in self.bosses.items() if e.get('arena'))


def _no_duplicates(pairs):
    seen = OrderedDict()
    for k, v in pairs:
        if k in seen:
            raise RegistryError('the key %r is written twice in one object' % k)
        seen[k] = v
    return seen


def read_json(path):
    """Strict JSON; a key written twice in one object is an error (json.load would keep the last one silently)."""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            text = f.read()
    except OSError as e:
        raise RegistryError('%s: not readable (%s)' % (path, e))
    try:
        return json.loads(text, object_pairs_hook=_no_duplicates)
    except RegistryError as e:
        raise RegistryError('%s: %s' % (path, e))
    except ValueError as e:
        raise RegistryError('%s: not valid JSON (%s)' % (path, e))


def _registry(root, bosses, dims):
    if not isinstance(bosses, dict) or not isinstance(bosses.get('bosses'), dict):
        raise RegistryError('%s: no "bosses" object' % BOSS_FILE)
    if not isinstance(dims, dict) or not isinstance(dims.get('dimensions'), dict):
        raise RegistryError('%s: no "dimensions" object' % DIM_FILE)
    return Registry(root, bosses, dims)


def load(minecraft_root):
    d = os.path.join(minecraft_root, REGISTRY_DIR)
    return _registry(minecraft_root, read_json(os.path.join(d, BOSS_FILE)), read_json(os.path.join(d, DIM_FILE)))


def from_text(bosses_text, dims_text, name=''):
    """The two files as text (another commit's, read with git show): the same strict reading as load()."""
    docs = []
    for fn, text in ((BOSS_FILE, bosses_text), (DIM_FILE, dims_text)):
        try:
            docs.append(json.loads(text, object_pairs_hook=_no_duplicates))
        except RegistryError as e:
            raise RegistryError('%s%s: %s' % (name, fn, e))
        except ValueError as e:
            raise RegistryError('%s%s: not valid JSON (%s)' % (name, fn, e))
    return _registry(None, docs[0], docs[1])


def boot_line(reg):
    """The one line 0_lib_registry.js prints when it has loaded both files (suite `registry` compares the two)."""
    b = reg.bosses
    kinds = dict((k, 0) for k in BOSS_KINDS)
    for e in b.values():
        kinds[e.get('kind')] = kinds.get(e.get('kind'), 0) + 1
    n = lambda system: len(reg.boss_ids(system))
    tiers = [len(reg.dims_in_tier(t)) for t in (1, 2, 3, 4)]
    return ('[icraft.registry] loaded -- bosses: %d entries (%d named, %d miniboss, %d unlisted; %d boss, %d designed hp, '
            '%d x3, %d rush, %d arenas, %d absent, %d second id%s; per-kill scaling %s), dimensions: %d entries (tier 1-4: %d / %d / %d / %d)'
            % (len(b), kinds['named'], kinds['miniboss'], kinds['unlisted'], n('isBoss'), n('hp'), n('x3'), n('rush'),
               n('arena'), sum(1 for e in b.values() if e.get('absent')), len(reg.aliases), '' if len(reg.aliases) == 1 else 's',
               'ON' if reg.switch_on('perKill') else 'off',
               len(reg.dims), tiers[0], tiers[1], tiers[2], tiers[3]))


def load_game_registry(minecraft_root):
    """The committed dump of a real boot (dev/registry): {name: set(ids)} for the lists the validator needs."""
    d = os.path.join(minecraft_root, 'dev', 'registry')
    out = {}
    for name, fn in (('entities', 'entity_types.txt'), ('dimensions', 'dimensions.txt'), ('structures', 'structures.txt'),
                     ('blocks', 'blocks.txt'), ('items', 'items.txt')):
        p = os.path.join(d, fn)
        try:
            with open(p, 'r', encoding='utf-8') as f:
                out[name] = set(line.strip() for line in f if line.strip())
        except OSError as e:
            raise RegistryError('%s: not readable (%s). The validator needs the registry dump of a real boot.' % (p, e))
    try:
        with open(os.path.join(d, 'entities.json'), 'r', encoding='utf-8') as f:
            out['entity_facts'] = json.load(f).get('entities', {})
    except (OSError, ValueError):
        out['entity_facts'] = {}
    try:
        with open(os.path.join(d, 'SOURCE.json'), 'r', encoding='utf-8') as f:
            out['source'] = json.load(f)
    except (OSError, ValueError):
        out['source'] = {}
    return out
