#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""external_lists.py -- the boss and dimension lists two mods keep outside the registry, held to the registry.

    python .minecraft/dev/rosters/external_lists.py                     # = check: the full report, exit 0
    python .minecraft/dev/rosters/external_lists.py check --summary     # the summary line only (the pre-push hook)
    python .minecraft/dev/rosters/external_lists.py check --strict      # exit 1 when there is a finding (for later)
    python .minecraft/dev/rosters/external_lists.py generate --dry-run  # what generate would write, as a diff
    python .minecraft/dev/rosters/external_lists.py generate            # write the keys; refused while a ruling is owed

The lists (ruling 25 of 2026-10-14; internal decision list entry 31), each in the three distros (.minecraft,
server_distribution, distribution/client):
  config/iridescent_difficulty-common.toml  [dimensions] t1..t4: a dimension's tier on the difficulty curve (not
                                            listed = t1); [excludes] entities: the ONLY exemption from the curve
                                            (exact ids; an id that names nothing is accepted silently)
  config/apotheosis/adventure.cfg           "Affix Convert Rarities", "Gem Dimensional Rarities": the rarity clamp of
                                            a dimension (not listed = NO clamp, the whole ladder by weight);
                                            "Boss Spawn Dimensions": chance and rule (not listed = no Apotheosis boss
                                            spawns there). Apotheosis 7.4.8, read from its bytecode: LootRarity.random
                                            with a null clamp, BossEvents with no rule.
The registries do not feed them: the scripts read kubejs/config/icraft/registry, these two mods their own configs.

check     each distro's lists against the registry (rosters.py), the ids the game registers (dev/registry) and the
          values of external_lists.policy.json that are ruled; the three distros against each other. A report: exit 0
          whatever it finds (--strict: 1 on a finding); a file it cannot read is a finding, never a crash.
generate  writes exactly those keys, from the registry and the policy, in all three distros; every other byte of each
          file stays as it was, and what was written is read back and compared before the file is replaced. Refused
          while the policy owes a ruling (a null). NOT run on the pack until the operator has ruled.

Stdlib only; Python 3.11 or newer (tomllib).
"""
import argparse
import difflib
import json
import os
import re
import sys
from collections import OrderedDict, namedtuple

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover
    sys.stderr.write('external_lists.py needs Python 3.11 or newer (tomllib).\n')
    sys.exit(2)

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rosters  # noqa: E402

TAG = '[external-lists]'
POLICY_FILE = os.path.join(HERE, 'external_lists.policy.json')
DISTROS = (('dev', ''), ('server', 'server_distribution'), ('client', 'distribution/client'))
DIFF_REL = 'config/iridescent_difficulty-common.toml'
APOTH_REL = 'config/apotheosis/adventure.cfg'
TIERS = (1, 2, 3, 4)
APOTH_LISTS = ('Affix Convert Rarities', 'Gem Dimensional Rarities', 'Boss Spawn Dimensions')
BOSS_SPAWN = 'Boss Spawn Dimensions'
RARITIES = ('common', 'uncommon', 'rare', 'epic', 'mythic', 'ancient')     # data/apotheosis/rarities, 7.4.8
SPAWN_RULES = ('NEEDS_SKY', 'NEEDS_SURFACE', 'SURFACE_OUTER_END', 'ANY')     # AdventureConfig, 7.4.8

# every key this tool reads and generate writes, in report order: key -> (file, section, name)
KEYS = OrderedDict([('difficulty.excludes', (DIFF_REL, 'excludes', 'entities'))]
                   + [('difficulty.t%d' % t, (DIFF_REL, 'dimensions', 't%d' % t)) for t in TIERS]
                   + [('apotheosis.' + n, (APOTH_REL, None, n)) for n in APOTH_LISTS])

Finding = namedtuple('Finding', 'code level key text details count')
# level: 'finding' (the file and the registry or the ruled policy disagree) or 'note' (worth knowing, no disagreement)


class ListError(Exception):
    """a file or key this tool cannot read or write the way it expects"""


def finding(code, key, text, details=(), count=1, level='finding'):
    return Finding(code, level, key, text, list(details), count)


def note(code, key, text, details=()):
    return Finding(code, 'note', key, text, list(details), 0)


# --------------------------------------------------------------------------------------------- the files as text

class Text(object):
    """A file as lines, kept byte for byte: a UTF-8 BOM, and each line's own end ('\\r' stays on its line)."""

    def __init__(self, data, where):
        try:
            text = data.decode('utf-8')
        except UnicodeDecodeError as e:
            raise ListError('%s: not UTF-8 (%s)' % (where, e))
        self.bom = text.startswith('﻿')
        self.lines = (text[1:] if self.bom else text).split('\n')
        self.where = where

    def body(self):
        return '\n'.join(self.lines)

    def bytes(self):
        return (('﻿' if self.bom else '') + self.body()).encode('utf-8')

    def bare(self, i):
        return self.lines[i].rstrip('\r')


RX_TOML_TABLE = re.compile(r'^\s*\[\[?\s*([^\[\]]+?)\s*\]\]?\s*(#.*)?$')


def toml_span(text, section, key):
    """-> (first, last, prefix, tail): the lines of `key = [ ... ]` in the table [section], what stands in front of
    the value and what follows its closing bracket. The value may run over several lines."""
    table, found = None, []
    for i in range(len(text.lines)):
        ln = text.bare(i)
        m = RX_TOML_TABLE.match(ln)
        if m:
            table = m.group(1)
            continue
        if table == section:
            mk = re.match(r'^(\s*%s\s*=\s*)' % re.escape(key), ln)
            if mk:
                found.append((i, mk.group(1)))
    if not found:
        raise ListError('%s: no key `%s` in [%s]' % (text.where, key, section))
    if len(found) > 1:
        raise ListError('%s: the key `%s` is written %d times in [%s]' % (text.where, key, len(found), section))
    first, prefix = found[0]
    if not text.bare(first)[len(prefix):].startswith('['):
        raise ListError('%s: [%s] %s is not an array' % (text.where, section, key))
    depth, j, k = 0, first, len(prefix)
    while j < len(text.lines):
        s, quote = text.bare(j), None
        while k < len(s):
            c = s[k]
            if quote == '"':
                if c == '\\':
                    k += 1
                elif c == '"':
                    quote = None
            elif quote == "'":
                if c == "'":
                    quote = None
            elif c == '#':
                break
            elif c in '"\'':
                quote = c
            elif c == '[':
                depth += 1
            elif c == ']':
                depth -= 1
                if depth == 0:
                    return first, j, prefix, s[k + 1:]
            k += 1
        j, k = j + 1, 0
    raise ListError('%s: the array [%s] %s is not closed' % (text.where, section, key))


def toml_array(values):
    """an array of ids as Forge's config writer (NightConfig) puts it: one line"""
    return '[' + ', '.join(json.dumps(v) for v in values) + ']'


def toml_doc(text):
    try:
        return tomllib.loads(text.body())
    except tomllib.TOMLDecodeError as e:
        raise ListError('%s: not valid TOML (%s)' % (text.where, e))


def toml_list(doc, section, key, where):
    sec = doc.get(section)
    if not isinstance(sec, dict) or key not in sec:
        raise ListError('%s: no key `%s` in [%s]' % (where, key, section))
    v = sec[key]
    if not isinstance(v, list) or not all(isinstance(x, str) for x in v):
        raise ListError('%s: [%s] %s is not a list of strings' % (where, section, key))
    return list(v)


def cfg_span(text, name):
    """-> (header, close): the line of `S:"<name>" <` and of its closing `>` (Forge / Placebo .cfg string list)"""
    rx = re.compile(r'^\s*S:"%s"\s*<\s*$' % re.escape(name))
    heads = [i for i in range(len(text.lines)) if rx.match(text.bare(i))]
    if not heads:
        raise ListError('%s: no list "%s"' % (text.where, name))
    if len(heads) > 1:
        raise ListError('%s: the list "%s" is written %d times' % (text.where, name, len(heads)))
    h = heads[0]
    for j in range(h + 1, len(text.lines)):
        s = text.bare(j).strip()
        if s == '>':
            return h, j
        if re.match(r'^[A-Z]:"', s) or s in ('{', '}') or s.endswith('{'):
            break
    raise ListError('%s: the list "%s" is not closed with a `>` line' % (text.where, name))


def cfg_list(text, name):
    h, e = cfg_span(text, name)
    return [text.bare(i).strip() for i in range(h + 1, e) if text.bare(i).strip()]


def read_file(path, where):
    try:
        with open(path, 'rb') as f:
            return Text(f.read(), where)
    except OSError as e:
        raise ListError('%s: not readable (%s)' % (where, e.strerror or e))


class Distro(object):
    """one distro's two files and the values of every key, or the reason a key could not be read"""

    def __init__(self, pack, name, prefix):
        self.name = name
        self.paths = OrderedDict((rel, os.path.join(pack, prefix, *rel.split('/'))) for rel in (DIFF_REL, APOTH_REL))
        self.rels = OrderedDict((rel, '/'.join(x for x in (prefix, rel) if x)) for rel in (DIFF_REL, APOTH_REL))
        self.texts = OrderedDict()
        self.values = OrderedDict()
        self.errors = OrderedDict()     # key -> reason
        self.force_scale = []           # [excludes] forceScaleEntities: scaled although not of category monster
        for rel, path in self.paths.items():
            keys = [k for k, (f, _s, _n) in KEYS.items() if f == rel]
            try:
                text = read_file(path, self.rels[rel])
                self.texts[rel] = text
                doc = toml_doc(text) if rel == DIFF_REL else None
                if doc is not None:
                    fs = (doc.get('excludes') or {}).get('forceScaleEntities')
                    self.force_scale = [x for x in fs if isinstance(x, str)] if isinstance(fs, list) else []
            except ListError as e:
                for k in keys:
                    self.errors[k] = str(e)
                continue
            for k in keys:
                _f, section, name = KEYS[k]
                try:
                    self.values[k] = toml_list(doc, section, name, text.where) if section else cfg_list(text, name)
                except ListError as e:
                    self.errors[k] = str(e)


def read_distros(pack):
    return [Distro(pack, n, p) for n, p in DISTROS]


# ------------------------------------------------------------------------------------------------- the policy

class Policy(object):
    """external_lists.policy.json: what is ruled (a value), what is owed (None), and its problems (text)"""

    def __init__(self):
        self.scope = None           # a rosters.BOSS_SYSTEMS name, False (not generated) or None (owed)
        self.keep = []
        self.registry_tiers = None  # True, False (not generated) or None (owed)
        self.tier_of = {}
        self.dim_leave_off = []
        self.apoth = OrderedDict((n, {'tiers': dict((t, None) for t in TIERS), 'dimensions': OrderedDict(), 'leaveOff': []})
                                 for n in APOTH_LISTS)
        self.problems = []
        self.found = False

    def apoth_value(self, name, dim, tier):
        """the ruled value of a dimension on that list, or None when none is ruled"""
        a = self.apoth[name]
        return a['dimensions'].get(dim) or a['tiers'].get(tier)


def _keys(obj, allowed, where, problems):
    if not isinstance(obj, dict):
        problems.append('%s is not an object' % where)
        return False
    for k in obj:
        if k not in allowed:
            problems.append('%s: unknown key "%s" (known: %s)' % (where, k, ', '.join(allowed)))
    return True


def load_policy(path, reg, game):
    pol = Policy()
    if not os.path.isfile(path):
        pol.problems.append('%s not found: every ruling counts as owed' % os.path.basename(path))
        return pol
    try:
        doc = rosters.read_json(path)
    except rosters.RegistryError as e:
        pol.problems.append(str(e))
        return pol
    pol.found = True
    p = pol.problems
    if not _keys(doc, ('about', 'schema', 'difficulty', 'apotheosis'), 'the policy', p):
        return pol
    if doc.get('schema') != 1:
        p.append('the policy: schema %r, this tool reads 1' % doc.get('schema'))
    dif = doc.get('difficulty') or {}
    if _keys(dif, ('excludes', 'dimensions'), 'difficulty', p):
        ex = dif.get('excludes') or {}
        if _keys(ex, ('scope', 'keep'), 'difficulty.excludes', p):
            s = ex.get('scope')
            names = s if isinstance(s, list) else [s]
            if s is None or s is False:
                pol.scope = s
            elif names and all(isinstance(n, str) and n in rosters.BOSS_SYSTEMS for n in names):
                pol.scope = list(names) if isinstance(s, list) else s
            else:
                p.append('difficulty.excludes.scope: %s is not a system of the boss registry (%s), a list of them, '
                         'false or null' % (json.dumps(s), ', '.join(rosters.BOSS_SYSTEMS)))
            for i in ex.get('keep') or []:
                if i not in game['entities']:
                    p.append('difficulty.excludes.keep: %s is not an entity type the game registers' % i)
                else:
                    pol.keep.append(i)
        dm = dif.get('dimensions') or {}
        if _keys(dm, ('registryTiers', 'tierOf', 'leaveOff'), 'difficulty.dimensions', p):
            rt = dm.get('registryTiers')
            if rt in (None, True, False):
                pol.registry_tiers = rt
            else:
                p.append('difficulty.dimensions.registryTiers: %r is not true, false or null' % (rt,))
            for d, t in (dm.get('tierOf') or {}).items():
                if d not in reg.dims:
                    p.append('difficulty.dimensions.tierOf: %s is not a dimension of the registry' % d)
                elif t not in TIERS:
                    p.append('difficulty.dimensions.tierOf: %s: tier %r is not 1 to 4' % (d, t))
                else:
                    pol.tier_of[d] = t
            for d in dm.get('leaveOff') or []:
                if d not in reg.dims:
                    p.append('difficulty.dimensions.leaveOff: %s is not a dimension of the registry' % d)
                else:
                    pol.dim_leave_off.append(d)
    ap = doc.get('apotheosis') or {}
    if _keys(ap, APOTH_LISTS, 'apotheosis', p):
        for name in APOTH_LISTS:
            lst = ap.get(name)
            where = 'apotheosis "%s"' % name
            if lst is None:
                continue
            if not _keys(lst, ('tiers', 'dimensions', 'leaveOff'), where, p):
                continue
            mine = pol.apoth[name]
            for t, v in (lst.get('tiers') or {}).items():
                if t not in ('1', '2', '3', '4'):
                    p.append('%s.tiers: "%s" is not a tier 1 to 4' % (where, t))
                elif v is not None:
                    bad = value_problem(name, v)
                    if bad:
                        p.append('%s.tiers.%s: %s' % (where, t, bad))
                    else:
                        mine['tiers'][int(t)] = v
            for d, v in (lst.get('dimensions') or {}).items():
                bad = value_problem(name, v) if isinstance(v, str) else 'not a string'
                if d not in reg.dims:
                    p.append('%s.dimensions: %s is not a dimension of the registry' % (where, d))
                elif bad:
                    p.append('%s.dimensions.%s: %s' % (where, d, bad))
                else:
                    mine['dimensions'][d] = v
            for d in lst.get('leaveOff') or []:
                if d not in reg.dims:
                    p.append('%s.leaveOff: %s is not a dimension of the registry' % (where, d))
                else:
                    mine['leaveOff'].append(d)
    return pol


def value_problem(name, value):
    """-> None, or what is wrong with a value of that Apotheosis list (the part after `dimension|`)"""
    parts = value.split('|')
    if len(parts) != 2:
        return '"%s" is not %s' % (value, 'chance|rule' if name == BOSS_SPAWN else 'min|max')
    if name == BOSS_SPAWN:
        try:
            c = float(parts[0])
        except ValueError:
            return 'the chance "%s" is not a number' % parts[0]
        if not 0.0 <= c <= 1.0:
            return 'the chance %s is outside 0 to 1' % parts[0]
        if parts[1] not in SPAWN_RULES:
            return 'the rule "%s" is not one of %s' % (parts[1], ', '.join(SPAWN_RULES))
        return None
    for r in parts:
        if r not in RARITIES:
            return 'the rarity "%s" is not one of %s' % (r, ', '.join(RARITIES))
    if RARITIES.index(parts[0]) > RARITIES.index(parts[1]):
        return 'the minimum %s is above the maximum %s' % (parts[0], parts[1])
    return None


def same_value(name, a, b):
    """two values of one list mean the same (0.10 and 0.1 are one chance)"""
    if a == b:
        return True
    if name == BOSS_SPAWN:
        try:
            pa, pb = a.split('|'), b.split('|')
            return len(pa) == len(pb) == 2 and float(pa[0]) == float(pb[0]) and pa[1] == pb[1]
        except ValueError:
            return False
    return False


# ------------------------------------------------------------------------------------- what the registry asks for

def in_scope(reg, i, scope):
    """is the boss entry `i` held by the system `scope`, or by any system of a list of them"""
    return any(reg.answer(i, s) is not None for s in (scope if isinstance(scope, list) else [scope]))


def scope_name(scope):
    return ' or '.join(scope) if isinstance(scope, list) else str(scope)


def exclude_ids(reg, scope):
    """-> OrderedDict(entity id -> registry boss): the entity ids the curve must skip for the entries a system holds
    (or any system of a list), in registry order, with their second ids (`sameAs`). An entry kept as `absent` has no
    entity type; a boss the game hands out under ANOTHER type (`seenAs`) cannot be named by id at all (its type is every
    ordinary mob's)."""
    out = OrderedDict()
    for i in reg.bosses:
        e = reg.bosses[i]
        if not in_scope(reg, i, scope) or e.get('absent') or e.get('seenAs'):
            continue
        for x in reg.entity_ids(i):
            out.setdefault(x, i)
    return out


def curve_tiers(reg, pol):
    """-> OrderedDict(dimension -> tier on the curve), registry order; a dimension left off is not in it"""
    return OrderedDict((d, pol.tier_of.get(d, e['tier'])) for d, e in reg.dims.items() if d not in pol.dim_leave_off)


def describe_boss(reg, i, alias_of=None):
    e = reg.bosses[alias_of or i]
    bits = [e.get('kind', '?')]
    if e.get('hp') is not None:
        bits.append('hp %s' % e['hp'])
    if 'x3' in (e.get('flags') or ()):
        bits.append('x3')
    if alias_of:
        bits.append('second id of %s' % alias_of)
    return '%s (%s)' % (i, ', '.join(bits))


def near(i, pool):
    """registered ids of the same namespace that look like a misspelled `i`"""
    ns, _, path = i.partition(':')
    cands = [x.partition(':')[2] for x in pool if x.startswith(ns + ':')]
    hits = difflib.get_close_matches(path, cands, n=2, cutoff=0.6)
    hits += [c for c in cands if c not in hits and (c.endswith('_' + path) or c.startswith(path + '_'))][:2]
    return ['%s:%s' % (ns, h) for h in hits[:2]]


def by_tier(reg, dims, tier_of=None):
    """'tier 2: a, b; tier 4: c' for a list of registry dimensions"""
    groups = OrderedDict()
    for d in dims:
        groups.setdefault((tier_of or {}).get(d, reg.dims[d]['tier']), []).append(d)
    return '; '.join('tier %d: %s' % (t, ', '.join(groups[t])) for t in sorted(groups))


# ------------------------------------------------------------------------------------------------------ check

def curve_scales(game, force_scale, i):
    """does the difficulty mod scale this entity type at all? It takes category MONSTER only, or an id on
    forceScaleEntities (iridescent-difficulty-mod MobScalingHandler.onEntityJoin). Category from the boot's
    dev/registry/entities.json; unknown counts as scaled."""
    c = ((game.get('entity_facts') or {}).get(i) or {}).get('category')
    return c is None or c == 'monster' or i in force_scale


def check_excludes(reg, game, pol, have, force_scale=()):
    key = 'difficulty.excludes'
    out = []
    scope = pol.scope or 'isBoss'
    want = exclude_ids(reg, scope)
    ruled = pol.scope is not None
    level = 'note' if pol.scope is False else 'finding'
    missing = [x for x in want if x not in have and x not in pol.keep]
    scaled = [x for x in missing if curve_scales(game, force_scale, x)]
    inert = [x for x in missing if x not in scaled]
    if scaled:
        groups = OrderedDict()
        for x in scaled:
            b = want[x]
            groups.setdefault(reg.bosses[b].get('tier'), []).append(describe_boss(reg, x, b if b != x else None))
        out.append(Finding('BOSS-NOT-EXCLUDED', level, key,
                           '%d entity id(s) of registry bosses (scope %s%s) are not on the exclude list: the dimension curve '
                           'scales them on top of their designed health and the x3'
                           % (len(scaled), scope_name(scope), '' if ruled else '; the ruling is owed'),
                           ['tier %s (%d): %s' % (t, len(v), ', '.join(v)) for t, v in sorted(groups.items(), key=lambda kv: str(kv[0]))],
                           len(scaled) if level == 'finding' else 0))
    if inert:
        cat = lambda x: ((game.get('entity_facts') or {}).get(x) or {}).get('category')
        out.append(note('BOSS-NOT-SCALED', key, '%d entity id(s) of registry bosses are not on the list and are never scaled anyway: the '
                        'curve takes category monster only, or an id on forceScaleEntities' % len(inert),
                        ['%s, category %s' % (describe_boss(reg, x, want[x] if want[x] != x else None), cat(x)) for x in inert]))
    kept = [x for x in pol.keep if x not in have and x not in want]
    if kept:
        out.append(finding('KEEP-NOT-LISTED', key, '%d id(s) the policy keeps on the list are not on it: %s' % (len(kept), ', '.join(kept)),
                           count=len(kept)))
    seen = set()
    twice = []
    for x in have:
        if x in seen and x not in twice:
            twice.append(x)
        seen.add(x)
    if twice:
        out.append(finding('EXCLUDE-TWICE', key, '%d id(s) written twice: %s' % (len(twice), ', '.join(twice)), count=len(twice)))
    dead = [x for x in have if x not in game['entities']]
    if dead:
        det = []
        for x in OrderedDict.fromkeys(dead):
            why = []
            e = reg.bosses.get(x)
            if e and e.get('absent'):
                why.append('registry: absent, %s' % e['absent'])
            hint = near(x, game['entities'])
            if hint:
                why.append('near: ' + ', '.join('%s%s' % (h, ' (a registry boss)' if reg.answer(h, 'isBoss') else '') for h in hint))
            det.append('%s%s' % (x, ('  ' + '; '.join(why)) if why else ''))
        out.append(finding('EXCLUDE-DEAD', key, '%d %s no entity type the game registers (matched exactly: %s nothing)'
                           % (len(det), 'entry names' if len(det) == 1 else 'entries name', 'it skips' if len(det) == 1 else 'they skip'),
                           det, count=len(det)))
    extra = [x for x in OrderedDict.fromkeys(have) if x in game['entities'] and x not in want and x not in pol.keep]
    if extra:
        out.append(Finding('EXCLUDE-EXTRA', 'finding' if ruled and pol.scope is not False else 'note', key,
                           '%d registered %s on the list and not in scope %s%s' % (len(extra), 'entity is' if len(extra) == 1 else 'entities are', scope_name(scope),
                                                                                    ' (generate would drop it unless `keep` names it)' if ruled else ''),
                           [describe_boss(reg, x, reg.canon(x) if reg.canon(x) != x else None) if reg.canon(x) in reg.bosses else x for x in extra],
                           len(extra) if ruled and pol.scope is not False else 0))
    sa = [r for r in reg.seen_as() if in_scope(reg, r['id'], scope)]
    if sa:
        out.append(note('EXCLUDE-SEEN-AS', key, '%d boss(es) cannot be excluded by id: the game hands each out under the type of ordinary mobs'
                        % len(sa), ['%s is typed %s (excluding that id would exclude every %s)' % (r['id'], r['type'], r['type']) for r in sa]))
    return out


def check_dims(reg, game, pol, distro):
    out = []
    listed = OrderedDict()
    for t in TIERS:
        for d in distro.values.get('difficulty.t%d' % t, []):
            listed.setdefault(d, []).append(t)
    key = 'difficulty.t1..t4'
    twice = ['%s (%s)' % (d, ', '.join('t%d' % t for t in ts)) for d, ts in listed.items() if len(ts) > 1]
    if twice:
        out.append(finding('DIM-TWICE', key, '%d dimension(s) on more than one tier list, or twice on one (the mod takes the '
                           'highest: it asks t4, t3, t2, t1 in turn)' % len(twice), twice, count=len(twice)))
    dead = [d for d in listed if d not in game['dimensions']]
    if dead:
        out.append(finding('DIM-DEAD', key, '%d tier-list %s no dimension of the game' % (len(dead), 'entry names' if len(dead) == 1 else 'entries name'),
                           ['%s%s' % (d, ('  near: ' + ', '.join(near(d, game['dimensions']))) if near(d, game['dimensions']) else '') for d in dead],
                           count=len(dead)))
    level = 'note' if pol.registry_tiers is False else 'finding'
    owed = '' if pol.registry_tiers is not None else ' (the registry\'s answer: the ruling is owed)'
    want = curve_tiers(reg, pol)
    missing = [d for d, t in want.items() if d not in listed and t != 1]
    if missing:
        out.append(Finding('DIM-MISSING', level, key, '%d registry %s on no tier list: the curve gives %s t1%s'
                           % (len(missing), 'dimension is' if len(missing) == 1 else 'dimensions are', 'it' if len(missing) == 1 else 'them', owed),
                           [by_tier(reg, missing, want)], len(missing) if level == 'finding' else 0))
    differ = ['%s: t%d on the curve, %s' % (d, listed[d][0], 'tier %d by the policy (tierOf; registry tier %d)' % (t, reg.dims[d]['tier'])
                                             if d in pol.tier_of else 'registry tier %d' % t)
              for d, t in want.items() if d in listed and listed[d][0] != t]
    if differ:
        out.append(Finding('DIM-TIER', level, key, '%d dimension(s) on another tier than the registry%s' % (len(differ), owed),
                           differ, len(differ) if level == 'finding' else 0))
    left = [d for d in pol.dim_leave_off if d in listed]
    if left:
        out.append(finding('DIM-LEFT-OFF', key, '%d dimension(s) the policy leaves off are listed' % len(left), left, count=len(left)))
    other = [d for d in listed if d in game['dimensions'] and d not in reg.dims]
    if other:
        out.append(note('DIM-NOT-REGISTRY', key, '%d listed dimension(s) of the game have no registry entry' % len(other), other))
    return out


def check_apoth(reg, game, pol, name, entries):
    key = 'apotheosis.' + name
    out = []
    parsed = OrderedDict()
    shape, twice = [], []
    for ln in entries:
        dim, sep, val = ln.partition('|')
        bad = value_problem(name, val) if sep and dim else 'not `dimension|...`'
        if bad:
            shape.append('%s: %s' % (ln, bad))
        if dim in parsed:
            twice.append(dim)
        parsed.setdefault(dim, val)
    if shape:
        out.append(finding('APOTH-SHAPE', key, '%d line(s) Apotheosis cannot read as meant' % len(shape), shape, count=len(shape)))
    if twice:
        out.append(finding('APOTH-TWICE', key, '%d dimension(s) written twice: %s' % (len(twice), ', '.join(twice)), count=len(twice)))
    dead = [d for d in parsed if d not in game['dimensions']]
    if dead:
        det = []
        for d in dead:
            same = [g for g in game['dimensions'] if g.partition(':')[2] == d.partition(':')[2]]
            det.append('%s|%s%s' % (d, parsed[d], ('  the dimension of that name: ' + ', '.join(same)) if same else ''))
        out.append(finding('APOTH-DEAD', key, '%d %s no dimension of the game (Apotheosis never matches %s)'
                           % (len(dead), 'entry names' if len(dead) == 1 else 'entries name', 'it' if len(dead) == 1 else 'them'), det, count=len(dead)))
    lo = pol.apoth[name]['leaveOff']
    missing = [d for d in reg.dims if d not in parsed and d not in lo]
    if missing:
        what = 'no Apotheosis boss spawns there' if name == BOSS_SPAWN else 'no rarity clamp there: the whole ladder by weight'
        out.append(finding('APOTH-MISSING', key, '%d registry %s not on it (%s)' % (len(missing), 'dimension is' if len(missing) == 1 else 'dimensions are', what),
                           [by_tier(reg, missing)], count=len(missing)))
    left = [d for d in lo if d in parsed]
    if left:
        out.append(finding('APOTH-LEFT-OFF', key, '%d dimension(s) the policy leaves off are listed' % len(left), left, count=len(left)))
    differ = []
    for d, e in reg.dims.items():
        ruled = pol.apoth_value(name, d, e['tier'])
        if d in parsed and ruled is not None and not same_value(name, parsed[d], ruled):
            differ.append('%s: %s in the file, %s ruled' % (d, parsed[d], ruled))
    if differ:
        out.append(finding('APOTH-VALUE', key, '%d value(s) differ from the ruled policy' % len(differ), differ, count=len(differ)))
    other = [d for d in parsed if d in game['dimensions'] and d not in reg.dims]
    if other:
        out.append(note('APOTH-NOT-REGISTRY', key, '%d listed dimension(s) of the game have no registry entry' % len(other), other))
    ladder = []
    for t in TIERS:
        vals = OrderedDict()
        for d in reg.dims_in_tier(t):
            if d in parsed:
                vals.setdefault(parsed[d], []).append(d.partition(':')[2])
        if vals:
            ladder.append('tier %d: %s' % (t, '; '.join('%s (%s)' % (v, ', '.join(ds)) for v, ds in vals.items())))
    if ladder:
        out.append(note('APOTH-LADDER', key, 'today, by registry tier', ladder))
    return out


def check_distro(reg, game, pol, distro):
    """-> [Finding] for one distro's values"""
    out = []
    for k, why in distro.errors.items():
        out.append(finding('NOT-READABLE', k, why))
    if 'difficulty.excludes' in distro.values:
        out += check_excludes(reg, game, pol, distro.values['difficulty.excludes'], distro.force_scale)
    if all('difficulty.t%d' % t in distro.values for t in TIERS):
        out += check_dims(reg, game, pol, distro)
    for n in APOTH_LISTS:
        if 'apotheosis.' + n in distro.values:
            out += check_apoth(reg, game, pol, n, distro.values['apotheosis.' + n])
    return out


def compare_distros(distros):
    out = []
    for k in KEYS:
        have = [(d.name, d.values.get(k)) for d in distros if k in d.values]
        if len(set(json.dumps(v) for _n, v in have)) <= 1:
            continue
        ref_name, ref = have[0]
        det = []
        for n, v in have[1:]:
            if v == ref:
                continue
            plus = [x for x in v if x not in ref]
            minus = [x for x in ref if x not in v]
            bits = []
            if plus:
                bits.append('only in %s: %s' % (n, ', '.join(plus)))
            if minus:
                bits.append('not in %s: %s' % (n, ', '.join(minus)))
            if not plus and not minus:
                bits.append('the same entries in another order or count')
            det.append('%s against %s: %s' % (n, ref_name, '; '.join(bits)))
        out.append(finding('DISTRO-DIFFER', k, '%s differs between the distros' % k, det, count=1))
    unreadable = [d.name for d in distros if d.errors]
    return out, unreadable


def groups_of(distros):
    """[(names, distro)]: distros whose values (and unreadable keys) are the same, checked once"""
    out = OrderedDict()
    for d in distros:
        sig = json.dumps([d.values, d.errors], sort_keys=True)
        out.setdefault(sig, []).append(d)
    return [([d.name for d in ds], ds[0]) for ds in out.values()]


# ---------------------------------------------------------------------------------------------------- generate

def plan(reg, pol):
    """-> (OrderedDict key -> values to write, [owed rulings]). A key not in the plan is not written."""
    out, owed = OrderedDict(), []
    if pol.scope is None:
        owed.append('difficulty.excludes.scope: which registry bosses leave the dimension curve (isBoss = every one '
                    'of the %d; another system, or a list of systems = only those; false = leave the list as it is)'
                    % len(reg.boss_ids('isBoss')))
    elif pol.scope is not False:
        ids = list(exclude_ids(reg, pol.scope))
        out['difficulty.excludes'] = ids + [x for x in pol.keep if x not in ids]
    if pol.registry_tiers is None:
        owed.append('difficulty.dimensions.registryTiers: put every registry dimension on the curve at its registry '
                    'tier (true; with tierOf / leaveOff), or leave t1..t4 as they are (false)')
    elif pol.registry_tiers:
        want = curve_tiers(reg, pol)
        for t in TIERS:
            out['difficulty.t%d' % t] = [d for d, x in want.items() if x == t]
    for name in APOTH_LISTS:
        a = pol.apoth[name]
        lines, gaps = [], []
        for d, e in reg.dims.items():
            if d in a['leaveOff']:
                continue
            v = pol.apoth_value(name, d, e['tier'])
            if v is None:
                gaps.append(d)
            else:
                lines.append('%s|%s' % (d, v))
        if gaps:
            ts = sorted(set(reg.dims[d]['tier'] for d in gaps))
            owed.append('apotheosis "%s": %d registry dimension(s) have no value (%s): set tiers %s, dimensions.<id> '
                        'or leaveOff' % (name, len(gaps), by_tier(reg, gaps), ', '.join(str(t) for t in ts)))
        else:
            out['apotheosis.' + name] = lines
    return out, owed


def stable_order(key, old, new):
    """the generated entries of a key in the order the file already has them: entries that stay keep their place
    (an Apotheosis line takes its new value in place), dropped ones go, new ones follow in registry order. Neither
    mod reads an order, so this only keeps the diff to what changed."""
    if key.startswith('apotheosis.'):
        name = key.split('.', 1)[1]
        dim = lambda ln: ln.partition('|')[0]
        newd = OrderedDict((dim(x), x) for x in new)
        out, seen = [], set()
        for x in old:
            d = dim(x)
            if d in newd and d not in seen:
                # a line that already says the same (0.10 and 0.1) keeps its text
                out.append(x if same_value(name, x.partition('|')[2], newd[d].partition('|')[2]) else newd[d])
                seen.add(d)
        return out + [x for d, x in newd.items() if d not in seen]
    want = set(new)
    out = [x for x in OrderedDict.fromkeys(old) if x in want]
    return out + [x for x in new if x not in out]


def rewrite(text, rel, values):
    """-> new Text with the keys of `values` that live in this file replaced, every other line as it was"""
    new = Text(text.bytes(), text.where)
    spans = []
    for k, v in values.items():
        f, section, name = KEYS[k]
        if f != rel:
            continue
        if section:
            first, last, prefix, tail = toml_span(new, section, name)
            repl = [prefix + toml_array(v) + tail]
        else:
            first, last = cfg_span(new, name)
            indent = None
            for i in range(first + 1, last):
                if new.bare(i).strip():
                    indent = re.match(r'^\s*', new.bare(i)).group(0)
                    break
            if indent is None:
                indent = re.match(r'^\s*', new.bare(first)).group(0) + '    '
            first, last = first + 1, last - 1
            repl = [indent + x for x in v]
        spans.append((first, last, repl))
    for first, last, repl in sorted(spans, reverse=True):
        cr = '\r' if (last >= first and new.lines[last].endswith('\r')) or (last < first and new.lines[first - 1].endswith('\r')) else ''
        new.lines[first:last + 1] = [r + cr for r in repl]
    return new


def outside(text, rel, keys):
    """the lines of a file with the spans of the given keys taken out (what generate must leave untouched)"""
    spans = []
    for k in keys:
        f, section, name = KEYS[k]
        if f != rel:
            continue
        if section:
            first, last, _p, _t = toml_span(text, section, name)
        else:
            h, e = cfg_span(text, name)
            first, last = h + 1, e - 1
        spans.append((first, last))
    lines = list(text.lines)
    for first, last in sorted(spans, reverse=True):
        lines[first:last + 1] = ['<generated>']
    return lines


def verify(old, new, rel, values):
    """read the rewritten file back: the keys hold what was meant, nothing else moved -> [problems]"""
    bad = []
    keys = [k for k in values if KEYS[k][0] == rel]
    try:
        if outside(old, rel, keys) != outside(new, rel, keys):
            bad.append('%s: lines outside the generated keys changed' % new.where)
        if rel == DIFF_REL:
            a, b = toml_doc(old), toml_doc(new)
            for k in keys:
                _f, section, name = KEYS[k]
                if toml_list(b, section, name, new.where) != values[k]:
                    bad.append('%s: [%s] %s does not read back as written' % (new.where, section, name))
                a[section].pop(name, None)
                b[section].pop(name, None)
            if a != b:
                bad.append('%s: another key reads differently after the rewrite' % new.where)
        else:
            for k in keys:
                if cfg_list(new, KEYS[k][2]) != values[k]:
                    bad.append('%s: "%s" does not read back as written' % (new.where, KEYS[k][2]))
    except ListError as e:
        bad.append(str(e))
    return bad


def cmd_generate(pack, reg, game, pol, dry_run):
    if pol.problems:
        for p in pol.problems:
            print('%s POLICY %s' % (TAG, p))
        print('%s nothing written: the policy has %d problem(s).' % (TAG, len(pol.problems)))
        return 1
    values, owed = plan(reg, pol)
    if owed:
        for o in owed:
            print('%s OWED   %s' % (TAG, o))
        print('%s nothing written: %d ruling(s) owed in %s.' % (TAG, len(owed), os.path.basename(POLICY_FILE)))
        return 1
    if not values:
        print('%s nothing to generate: every list is ruled "leave as it is".' % TAG)
        return 0
    distros = read_distros(pack)
    # one order for all three distros: the first distro that reads the key gives it, so they agree afterwards
    ordered = OrderedDict()
    for k, v in values.items():
        first = next((d.values[k] for d in distros if k in d.values), [])
        ordered[k] = stable_order(k, first, v)
    pending, problems = [], []
    for d in distros:
        for rel, path in d.paths.items():
            keys = [k for k in values if KEYS[k][0] == rel]
            if not keys:
                continue
            mine = OrderedDict((k, ordered[k]) for k in keys)
            try:
                old = d.texts.get(rel) or read_file(path, d.rels[rel])
                new = rewrite(old, rel, mine)
            except ListError as e:
                problems.append(str(e))
                continue
            problems += verify(old, new, rel, mine)
            if new.bytes() != old.bytes():
                pending.append((path, d.rels[rel], old, new, keys))
    if problems:
        for p in problems:
            print('%s ERROR  %s' % (TAG, p))
        print('%s nothing written: %d problem(s).' % (TAG, len(problems)))
        return 1
    for path, rel, old, new, keys in pending:
        if dry_run:
            sys.stdout.writelines(difflib.unified_diff([x + '\n' for x in old.body().split('\n')], [x + '\n' for x in new.body().split('\n')],
                                                       'a/' + rel, 'b/' + rel, n=0))
            continue
        tmp = path + '.external_lists.tmp'
        with open(tmp, 'wb') as f:
            f.write(new.bytes())
        os.replace(tmp, path)
        print('%s wrote  %s (%s)' % (TAG, rel, ', '.join(keys)))
    print('%s %s %d file(s); %d key(s) generated from the registry and the policy%s.'
          % (TAG, 'would rewrite' if dry_run else 'rewrote', len(pending), len(values), ' (dry run: nothing written)' if dry_run else ''))
    return 0


# ------------------------------------------------------------------------------------------------------ report

def findings_total(groups, distro_findings):
    """findings of the first distro group (the dev distro) plus one per key the distros disagree on"""
    first = groups[0][1] if groups else []
    return sum(f.count for f in first if f.level == 'finding') + len(distro_findings)


def summary(groups, distro_findings, unreadable, owed, pol_problems):
    first = groups[0][1] if groups else []

    def c(code):
        return sum(f.count for f in first if f.code == code and f.level == 'finding')
    apo_lists = len(set(f.key for f in first if f.code == 'APOTH-MISSING' and f.level == 'finding'))
    parts = [
        'difficulty: %d boss ids on the curve (not excluded), %d dead entries, %d tiers differ, %d dimensions not listed'
        % (c('BOSS-NOT-EXCLUDED'), c('EXCLUDE-DEAD'), c('DIM-TIER'), c('DIM-MISSING')),
        'Apotheosis: %d dead entries, %d dimensions not listed (%d of 3 lists)' % (c('APOTH-DEAD'), c('APOTH-MISSING'), apo_lists),
        'distros: %s' % ('agree' if not distro_findings and len(groups) <= 1
                         else '%d key(s) differ (counts above: %s)' % (len(distro_findings), groups[0][0][0])),
    ]
    if unreadable:
        parts.append('unreadable in %s' % ', '.join(unreadable))
    tail = 'generate: %s' % ('the policy has %d problem(s)' % len(pol_problems) if pol_problems else
                             '%d ruling(s) owed' % len(owed) if owed else 'ruled, ready')
    return '%s REPORT (check only, nothing changed) -- %s | %d findings; %s' % (
        TAG, ' | '.join(parts), findings_total(groups, distro_findings), tail)


def print_report(reg, game, groups, distro_findings, owed, pol):
    src = game.get('source') or {}
    print('%s the lists two mods keep outside the registry, held to it (check only: nothing is changed)' % TAG)
    print('  registry: %d boss entries (%d flagged boss, %d second id(s)), %d dimensions; game ids: dev/registry @ %s '
          '(%d entity types, %d dimensions)' % (len(reg.bosses), len(reg.boss_ids('isBoss')), len(reg.aliases), len(reg.dims),
                                                 str(src.get('commit', '?'))[:8], len(game['entities']), len(game['dimensions'])))
    titles = OrderedDict([('difficulty', 'the difficulty mod: %s' % DIFF_REL), ('apotheosis', 'Apotheosis: %s' % APOTH_REL)])
    for names, fs in groups:
        where = 'all three distros' if len(names) == len(DISTROS) else 'distro%s %s' % ('' if len(names) == 1 else 's', ', '.join(names))
        for part, title in titles.items():
            mine = [f for f in fs if f.key.startswith(part)]
            print('')
            print('== %s (%s) ==' % (title, where))
            if not mine:
                print('  nothing to report')
            for f in mine:
                print('  %-18s %s%s' % (f.code, '' if f.level == 'finding' else '(note) ', f.text) if f.key.startswith('difficulty')
                      else '  %-18s %s"%s": %s' % (f.code, '' if f.level == 'finding' else '(note) ', f.key.split('.', 1)[1], f.text))
                for line in f.details:
                    print('      ' + line)
    print('')
    print('== the three distros ==')
    if not distro_findings:
        print('  the %d keys read the same in all three' % len(KEYS))
    for f in distro_findings:
        print('  %-18s %s' % (f.code, f.text))
        for line in f.details:
            print('      ' + line)
    print('')
    print('== generate ==')
    for p in pol.problems:
        print('  POLICY  %s' % p)
    if owed:
        print('  refused until the operator rules (%s):' % os.path.basename(POLICY_FILE))
        for o in owed:
            print('    - ' + o)
    elif not pol.problems:
        print('  the rulings are complete: `generate --dry-run` shows what it would write')


def cmd_check(pack, reg, game, pol, args):
    distros = read_distros(pack)
    groups = [(names, check_distro(reg, game, pol, d)) for names, d in groups_of(distros)]
    distro_findings, unreadable = compare_distros(distros)
    _values, owed = plan(reg, pol)
    line = summary(groups, distro_findings, unreadable, owed, pol.problems)
    if not args.summary:
        print_report(reg, game, groups, distro_findings, owed, pol)
        print('')
    print(line)
    any_finding = any(f.level == 'finding' for _n, fs in groups for f in fs) or distro_findings
    return 1 if args.strict and (any_finding or pol.problems) else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('command', nargs='?', default='check', choices=('check', 'generate'))
    ap.add_argument('--pack', default=os.path.normpath(os.path.join(HERE, '..', '..')), help='the .minecraft folder')
    ap.add_argument('--policy', default=None, help='the policy file (default: external_lists.policy.json beside this tool)')
    ap.add_argument('--summary', action='store_true', help='check: print the summary line only')
    ap.add_argument('--strict', action='store_true', help='check: exit 1 when there is a finding')
    ap.add_argument('--dry-run', action='store_true', help='generate: print the change as a diff, write nothing')
    args = ap.parse_args(argv)
    pack = os.path.abspath(args.pack)
    try:
        reg = rosters.load(pack)
        game = rosters.load_game_registry(pack)
    except rosters.RegistryError as e:
        print('%s COULD NOT RUN: %s' % (TAG, e))
        return 2 if (args.command == 'generate' or args.strict) else 0
    pol = load_policy(os.path.abspath(args.policy) if args.policy else POLICY_FILE, reg, game)
    if args.command == 'generate':
        return cmd_generate(pack, reg, game, pol, args.dry_run)
    return cmd_check(pack, reg, game, pol, args)


if __name__ == '__main__':
    sys.exit(main())
