# -*- coding: utf-8 -*-
"""The facts the Iridescent Codex states, read from the pack's sources of truth. Nothing here is typed by hand
except the names players read (names.json) and the patterns that find a number in a script.

    import codex_facts
    facts = codex_facts.load(minecraft_root)     # raises FactError naming the file and what is missing

Sources (paths relative to the .minecraft folder; INPUTS lists them for the pre-push hook and CI):
  kubejs/config/icraft/registry/bosses.json, dimensions.json   per boss: tier, kind, designed health, rush, arena;
                                                               per dimension: tier, stage gate, death penalty
  config/iridescent_difficulty-common.toml                     the difficulty mod's tiers (start / cap / hours /
                                                               damage) and which dimension is on which tier
  kubejs/server_scripts/gates/codex_boss_rush.js               BOSS_RUSH_TIERS: the share of a roster to clear
  kubejs/server_scripts/gates/codex_progression_engine.js      the token thresholds per tier
  kubejs/server_scripts/exploration/codex_exploration_kills.js tokens per kill, per first arrival, the token item
  kubejs/server_scripts/death_penalty.js                       DEFAULT_LOSS: the penalty of a dimension without one
  kubejs/server_scripts/scaling/zz_boss_global_3x.js           BOSS_3X_HP_MULT: the health of an x3 boss
  kubejs/server_scripts/loot/unique_itemset_registry.js        every unique weapon: its tier and kind; the bosses
                                                               boss_unique_drops.js gives one (addDrop), the chance
  kubejs/server_scripts/loot/loot_overhaul.js                  the other unique drops: boss, item, chance
  dev/codex/names.json                                         the names players read, for every boss and dimension

A script constant is found by a pattern that must match exactly once: a rewritten line is an error that names the
file and the constant, never a silent default.
"""
import json
import math
import os
import re
import sys
import tomllib
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'rosters'))
import rosters  # noqa: E402

REGISTRY_BOSSES = 'kubejs/config/icraft/registry/bosses.json'
REGISTRY_DIMS = 'kubejs/config/icraft/registry/dimensions.json'
DIFFICULTY = 'config/iridescent_difficulty-common.toml'
RUSH_SCRIPT = 'kubejs/server_scripts/gates/codex_boss_rush.js'
ENGINE_SCRIPT = 'kubejs/server_scripts/gates/codex_progression_engine.js'
KILLS_SCRIPT = 'kubejs/server_scripts/exploration/codex_exploration_kills.js'
DEATH_SCRIPT = 'kubejs/server_scripts/death_penalty.js'
X3_SCRIPT = 'kubejs/server_scripts/scaling/zz_boss_global_3x.js'
UNIQUE_SCRIPT = 'kubejs/server_scripts/loot/unique_itemset_registry.js'
LOOT_SCRIPT = 'kubejs/server_scripts/loot/loot_overhaul.js'
NAMES = 'dev/codex/names.json'

# Every file the facts are read from. The pre-push hook and CI run the Codex gate when a pushed commit touches one
# (codex.py inputs prints these together with the book source, the tools and the jar's copies).
INPUTS = (REGISTRY_BOSSES, REGISTRY_DIMS, DIFFICULTY, RUSH_SCRIPT, ENGINE_SCRIPT, KILLS_SCRIPT, DEATH_SCRIPT,
          X3_SCRIPT, UNIQUE_SCRIPT, LOOT_SCRIPT, 'kubejs/server_scripts/loot/boss_unique_drops.js', NAMES,
          'dev/rosters/rosters.py')

TIERS = (1, 2, 3, 4)
ROMAN = {1: 'I', 2: 'II', 3: 'III', 4: 'IV'}
WORDS = ('no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve')


class FactError(Exception):
    pass


def read_text(mc, rel):
    try:
        with open(os.path.join(mc, rel), 'r', encoding='utf-8-sig') as f:
            return f.read()
    except OSError as e:
        raise FactError('%s: not readable (%s)' % (rel, e))


def script_const(mc, rel, name, pattern):
    """The groups of the ONE match of `pattern` in a script. Zero or two matches is an error naming the constant."""
    text = read_text(mc, rel)
    found = list(re.finditer(pattern, text, re.M))
    if len(found) != 1:
        raise FactError('%s: %s not found where the Codex reads it (%d matches of /%s/). If the script was rewritten, '
                        'update the pattern in dev/codex/codex_facts.py.' % (rel, name, len(found), pattern))
    return found[0].groups()


def tier_table(mc, rel, name):
    """`const NAME = { 1: a, 2: b, 3: c, 4: d }` -> {1: a, ...} (numbers)."""
    body, = script_const(mc, rel, name, r'^\s*(?:const|var|let)\s+' + re.escape(name) + r'\s*=\s*\{([^}]*)\}')
    out = {}
    for k, v in re.findall(r'(\d)\s*:\s*([0-9.]+)', body):
        out[int(k)] = float(v) if '.' in v else int(v)
    if not out:
        raise FactError('%s: %s has no "<tier>: <number>" pairs' % (rel, name))
    return out


# ---- formatting: one way to write each kind of number, everywhere in the book --------------------------------
def fmt_int(n):
    return '{:,}'.format(int(round(n)))


def fmt_pct(x):
    """0.22 -> '22%', 0.125 -> '12.5%'"""
    v = round(x * 100, 1)
    return ('%d%%' % v) if v == int(v) else ('%g%%' % v)


def fmt_mult(pct):
    """150.0 (percent of vanilla) -> '1.5x', 1000 -> '10x'"""
    return '%gx' % round(pct / 100.0, 2)


def fmt_names(names):
    names = list(names)
    if not names:
        return 'none'
    if len(names) == 1:
        return names[0]
    return ', '.join(names[:-1]) + ' and ' + names[-1]


def count_word(n):
    return WORDS[n] if 0 <= n < len(WORDS) else str(n)


def tier_label(t):
    return 'Tier %d' % t


# ---- the model ---------------------------------------------------------------------------------------------------
class Boss(object):
    def __init__(self, bid, entry, name_rec, facts):
        self.id = bid
        self.mod = bid.split(':', 1)[0]
        self.tier = entry.get('tier')
        self.kind = entry.get('kind')
        self.flags = tuple(entry.get('flags') or ())
        self.hp = entry.get('hp')
        self.rush = entry.get('rush')
        self.phase_of = entry.get('phaseOf')
        self.arena = entry.get('arena') or None
        self.name = name_rec.get('name') or bid     # a boss without a name is reported by the gate
        self.match = tuple(name_rec.get('match') or ())
        self.ignore = tuple(name_rec.get('ignore') or ())
        self.x3 = 'x3' in self.flags
        # the health a player meets at the first fight: designed health, x3 on top (zz_boss_global_3x.js)
        self.fight_hp = (self.hp * (facts.x3_hp_mult if self.x3 else 1)) if self.hp else None

    @property
    def kind_word(self):
        return {'named': 'boss', 'miniboss': 'miniboss'}.get(self.kind, 'unlisted')

    @property
    def place(self):
        """the arena's place name (its waystone without the parenthesis), or None"""
        if not self.arena:
            return None
        w = self.arena.get('waystone') or self.arena.get('display') or ''
        return re.sub(r'\s*\([^)]*\)\s*$', '', w).strip() or None

    def place_names(self, facts):
        """every name the arena's place goes by: the waystone, the structure's name"""
        out = set()
        if self.place:
            out.add(self.place.lower())
        s = (self.arena or {}).get('structure')
        if s:
            out.add(facts.structure_name(s).lower())
        return out

    @property
    def counted(self):
        """on a kill roster or a rush roster: the bosses a roster page lists"""
        return self.phase_of is None and self.tier in TIERS and (self.kind in ('named', 'miniboss') or self.rush)


class Dim(object):
    def __init__(self, did, entry, name_rec, facts):
        self.id = did
        self.tier = entry.get('tier')
        self.flags = tuple(entry.get('flags') or ())
        self.stage_gate = entry.get('stageGate')
        self.death = entry.get('deathPenalty')
        self.death_default = self.death is None
        if self.death is None:
            self.death = facts.death_default
        self.name = name_rec.get('name')
        self.short = name_rec.get('short') or (self.name[4:] if self.name and self.name.startswith('the ') else self.name)
        self.match = tuple(name_rec.get('match') or ())
        self.hidden = name_rec.get('hidden')       # a reason: not listed in the tables (a pocket dimension)
        self.group = name_rec.get('group')         # listed once under this name in a tier's list
        self.difficulty_tier = facts.difficulty_dims.get(did, 1)


class Unique(object):
    def __init__(self, uid, tier, kind, name):
        self.id, self.tier, self.kind, self.name = uid, tier, kind, name
        self.drops = []             # [(boss id, chance)], in the order the scripts give them


class Facts(object):
    """Filled by load(); the methods are the questions the renderer and the prose checks ask."""

    def structure_name(self, sid):
        if sid in self.structure_names:
            return self.structure_names[sid]
        return ' '.join(w.capitalize() for w in sid.split(':', 1)[-1].split('/')[-1].split('_'))

    def boss(self, bid):
        b = self.bosses.get(self.registry.canon(bid))
        if b is None:
            raise FactError('no boss %s in %s' % (bid, REGISTRY_BOSSES))
        return b

    def dim(self, did):
        d = self.dims.get(did)
        if d is None:
            raise FactError('no dimension %s in %s' % (did, REGISTRY_DIMS))
        return d

    def rush_roster(self, t):
        return [b for b in self.bosses.values() if b.rush == t]

    def rush_need(self, t):
        return int(math.ceil(self.rush_pct[t] * len(self.rush_roster(t)) - 1e-9))

    def tier_dims(self, t, listed=True):
        return [d for d in self.dims.values() if d.tier == t and not (listed and d.hidden)]

    def tier_dim_names(self, t):
        """the names a tier's list shows: each dimension once, a group (the planets and orbits) once"""
        out = []
        for d in self.tier_dims(t):
            n = d.group or d.name
            if n not in out:
                out.append(n)
        return out

    def token_name(self, t):
        return 'Codex Token %s' % ROMAN[self.token_item[t]]

    def arena_dim_name(self, b):
        if not b.arena:
            return None
        d = self.dims.get(b.arena.get('dimension'))
        return d.name if d else b.arena.get('dimension')


def load_names(mc):
    try:
        doc = rosters.read_json(os.path.join(mc, NAMES))
    except rosters.RegistryError as e:
        raise FactError(str(e))
    return doc.get('bosses') or {}, doc.get('dimensions') or {}, doc.get('structures') or {}, doc.get('items') or {}


def load_difficulty(mc):
    text = read_text(mc, DIFFICULTY)
    try:
        doc = tomllib.loads(text)
    except tomllib.TOMLDecodeError as e:
        raise FactError('%s: not valid TOML (%s)' % (DIFFICULTY, e))
    tiers = {}
    for t in TIERS:
        rec = ((doc.get('tiers') or {}).get('t%d' % t)) or {}
        try:
            tiers[t] = {'start': float(rec['startPct']), 'cap': float(rec['capPct']), 'hours': float(rec['capHours']),
                        'damage': float(rec.get('damageMultiplierPct', 100.0))}
        except (KeyError, TypeError, ValueError):
            raise FactError('%s: [tiers.t%d] lacks startPct / capPct / capHours' % (DIFFICULTY, t))
    dims = {}
    section = doc.get('dimensions') or {}
    for t in TIERS:
        for d in section.get('t%d' % t) or ():
            dims[d] = t
    uncap = tuple(section.get('uncapAfterEnderDragon') or ())
    return tiers, dims, uncap


def load(mc):
    """Every fact the book can state. Raises FactError when a source is missing or not in the expected shape."""
    f = Facts()
    f.mc = mc
    try:
        f.registry = rosters.load(mc)
    except rosters.RegistryError as e:
        raise FactError(str(e))
    f.rush_pct = {}
    for t in (1, 2, 3):
        pct, = script_const(mc, RUSH_SCRIPT, 'BOSS_RUSH_TIERS[%d].pct' % t,
                            r'^\s*%d\s*:\s*\{\s*pct\s*:\s*([0-9.]+)\s*,\s*grantsStage' % t)
        f.rush_pct[t] = float(pct)
    f.threshold = {}
    for t in (1, 2, 3):
        n, = script_const(mc, ENGINE_SCRIPT, 'the tier %d token threshold' % t,
                          r"^\s*%d\s*:\s*\{\s*item\s*:\s*'icraft:progression_token_t%d'\s*,\s*threshold\s*:\s*(\d+)" % (t, t))
        f.threshold[t] = int(n)
    f.tokens_miniboss = tier_table(mc, KILLS_SCRIPT, 'EXPLORE_MINIBOSS_TOKENS')
    f.tokens_first = tier_table(mc, KILLS_SCRIPT, 'EXPLORE_BOSS_FIRST_TOKENS')
    f.tokens_repeat = tier_table(mc, KILLS_SCRIPT, 'EXPLORE_BOSS_REPEAT_TOKENS')
    n, = script_const(mc, KILLS_SCRIPT, 'EXPLORE_DIM_ENTRY_BONUS', r'^\s*const\s+EXPLORE_DIM_ENTRY_BONUS\s*=\s*(\d+)')
    f.dim_entry_bonus = int(n)
    body, = script_const(mc, KILLS_SCRIPT, 'EXPLORE_TOKEN_ITEM', r'^\s*const\s+EXPLORE_TOKEN_ITEM\s*=\s*\{([^}]*)\}')
    f.token_item = dict((int(k), int(v)) for k, v in re.findall(r"(\d)\s*:\s*'icraft:progression_token_t(\d)'", body))
    if sorted(f.token_item) != list(TIERS):
        raise FactError('%s: EXPLORE_TOKEN_ITEM does not name a token for each of the tiers 1-4' % KILLS_SCRIPT)
    d, = script_const(mc, DEATH_SCRIPT, 'DEFAULT_LOSS', r'^\s*const\s+DEFAULT_LOSS\s*=\s*([0-9.]+)')
    f.death_default = float(d)
    m, = script_const(mc, X3_SCRIPT, 'BOSS_3X_HP_MULT', r'^\s*const\s+BOSS_3X_HP_MULT\s*=\s*([0-9.]+)')
    f.x3_hp_mult = float(m)
    f.difficulty, f.difficulty_dims, f.uncap = load_difficulty(mc)

    boss_names, dim_names, f.structure_names, item_names = load_names(mc)
    f.bosses = OrderedDict()
    missing = []
    for bid, e in f.registry.bosses.items():
        rec = boss_names.get(bid)
        if not rec or not rec.get('name'):
            missing.append(bid)
            rec = {}
        f.bosses[bid] = Boss(bid, e, rec, f)
    f.dims = OrderedDict()
    for did, e in f.registry.dims.items():
        rec = dim_names.get(did)
        if not rec or not rec.get('name'):
            missing.append(did)
            rec = {'name': did}
        f.dims[did] = Dim(did, e, rec, f)
    f.uniques = load_uniques(mc, f, item_names, missing)
    f.missing_names = missing
    f.stale_names = sorted(set(boss_names) - set(f.registry.bosses) - set(f.registry.aliases)) + \
        sorted(set(dim_names) - set(f.registry.dims)) + sorted(set(item_names) - set(f.uniques))
    return f


UNIQUE_LINE = re.compile(r"^\s*'([a-z0-9_.-]+:[a-z0-9_/.-]+)'\s*:\s*\{\s*tier\s*:\s*([1-4])\s*,\s*kind\s*:\s*'(sword|bow)'\s*,"
                         r"\s*boss\s*:\s*(null|'[a-z0-9_.-]+:[a-z0-9_/.-]+')\s*,\s*addDrop\s*:\s*(true|false)\s*\}\s*,?\s*(?://.*)?$")
LOOT_MOD = re.compile(r'global\.icraftEntityMod\(event,\s*"([a-z0-9_.-]+:[a-z0-9_/.-]+)"\)')
LOOT_UNIQUE = re.compile(r'LootEntry\.of\("([a-z0-9_.-]+:[a-z0-9_/.-]+)"\)\.when\(c => c\.randomChance\(([0-9.]+)\)\)')


def load_uniques(mc, f, item_names, missing):
    """unique id -> Unique: tier and kind from the unique registry; who drops it from boss_unique_drops.js (the
    registry's addDrop entries, at ICRAFT_UNIQUE_DROP_CHANCE) and from loot_overhaul.js (one entity modifier per boss)."""
    text = read_text(mc, UNIQUE_SCRIPT)
    m = re.search(r'^global\.ICRAFT_UNIQUE_ITEMS\s*=\s*\{(.*?)^\}', text, re.M | re.S)
    if not m:
        raise FactError('%s: global.ICRAFT_UNIQUE_ITEMS = { ... } not found' % UNIQUE_SCRIPT)
    chance, = script_const(mc, UNIQUE_SCRIPT, 'ICRAFT_UNIQUE_DROP_CHANCE', r'^global\.ICRAFT_UNIQUE_DROP_CHANCE\s*=\s*([0-9.]+)')
    out = OrderedDict()
    for line in m.group(1).splitlines():
        if not line.strip() or line.strip().startswith('//'):
            continue
        u = UNIQUE_LINE.match(line)
        if not u:
            raise FactError('%s: a line of ICRAFT_UNIQUE_ITEMS the Codex cannot read: %s (one entry per line: '
                            "'id': { tier: n, kind: 'sword'|'bow', boss: 'id'|null, addDrop: true|false })"
                            % (UNIQUE_SCRIPT, line.strip()[:100]))
        uid, tier, kind, boss, add = u.groups()
        rec = item_names.get(uid) or {}
        if not rec.get('name'):
            missing.append(uid)
        q = out[uid] = Unique(uid, int(tier), kind, rec.get('name') or uid)
        if add == 'true' and boss != 'null':
            q.drops.append((f.registry.canon(boss.strip("'")), float(chance)))
    loot = read_text(mc, LOOT_SCRIPT)
    parts = LOOT_MOD.split(loot)
    for i in range(1, len(parts), 2):
        for item, p in LOOT_UNIQUE.findall(parts[i + 1]):
            if item in out:
                out[item].drops.append((f.registry.canon(parts[i]), float(p)))
    return out
