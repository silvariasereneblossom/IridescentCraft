#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validator of the script registries (kubejs/config/icraft/registry/bosses.json, dimensions.json).

    python .minecraft/dev/rosters/validate.py            # exit 0 ok, 1 findings, 2 could not run
    python .minecraft/dev/rosters/validate.py --notes    # also list what is only reported (never fails)

What it checks:
  1. both files are strict JSON, no key written twice, and have the shape the reader expects (the reader,
     kubejs/server_scripts/0_lib_registry.js, refuses a file with a shape problem whole, at boot);
  2. every id against what the game REALLY registers (dev/registry, the dump of a full-pack boot): entity types,
     dimensions, arena structures and signature blocks, relic items, mob-equipment items. An entity id that is
     not registered fails unless the entry says why it is kept (`absent`); an `absent` id that IS registered fails too;
  3. consistency inside the files (a tier exists; a boss with a designed HP is a boss; arena keys, stage-gate ids
     and exploration keys are unique; a structure arena has its structure tag);
  4. the expectations below. Today's scripts disagree in known places; each known disagreement is listed in
     accepted.json with its reason, and a NEW one fails. That is what makes a forgotten flag loud: a named boss
     added without `x3` does not pass until someone says it is meant.

It prints the line 0_lib_registry.js prints at boot, with the same counts.
Run by dev/engine-tests (`run.py fast`, suite registry-data), so by the pre-push hook and by CI.
"""
import argparse
import json
import os
import sys
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rosters  # noqa: E402

ACCEPTED_FILE = os.path.join(HERE, 'accepted.json')

# rule -> what it expects. A deviation is reported with the rule's name.
BOSS_RULES = OrderedDict([
    ('named-not-boss',        'a named boss has the flag `boss` (core.isBoss, no mob-tier health)'),
    ('named-not-x3',          'a named boss has the flag `x3`'),
    ('hp-not-x3',             'a boss with a designed health has the flag `x3`'),
    ('x3-not-named',          'only named bosses have the flag `x3`'),
    ('boss-not-on-kill-roster', 'an entry with the flag `boss` is named or miniboss (it pays kill tokens)'),
    ('named-not-in-rush',     'a named boss of tier 1-3 is on a boss-rush roster'),
    ('miniboss-not-in-rush',  'a miniboss of tier 1-3 is on a boss-rush roster'),
    ('rush-tier',             'the boss-rush roster of an entry is its tier'),
    ('arena-tier',            'the tier of an arena is the tier of its boss'),
    ('vorpal-lists',          'the two Vorpal blocklists hold the same ids'),
    ('vorpal-not-boss',       'an id on a Vorpal blocklist has the flag `boss`'),
])
DIM_RULES = OrderedDict([
    ('dim-no-stage-gate',     'a dimension of tier 2-4 has a stage gate'),
    ('dim-not-in-loot',       'a dimension is in the loot group of its tier'),
    ('dim-no-class-passives', 'a dimension of tier 2-4 counts for the class passives'),
    ('dim-no-exploration',    'a dimension of tier 2-4 pays a first-arrival bonus'),
    ('dim-no-mob-equipment',  'a dimension has a mob-equipment roll'),
    ('dim-no-death-penalty',  'a dimension has its own death penalty'),
])


def shape_problems(reg):
    bad = []
    doc = reg.bosses_doc
    if doc.get('schema') != rosters.SCHEMA:
        bad.append('bosses.json: schema %r, the tools know %d' % (doc.get('schema'), rosters.SCHEMA))
    if reg.dims_doc.get('schema') != rosters.SCHEMA:
        bad.append('dimensions.json: schema %r, the tools know %d' % (reg.dims_doc.get('schema'), rosters.SCHEMA))
    for k in doc:
        if k not in ('about', 'schema', 'switches', 'bosses'):
            bad.append('bosses.json: unknown top-level key "%s"' % k)
    for k in reg.dims_doc:
        if k not in ('about', 'schema', 'dimensions'):
            bad.append('dimensions.json: unknown top-level key "%s"' % k)
    sw = doc.get('switches', {})
    if not isinstance(sw, dict):
        bad.append('bosses.json: "switches" is not an object')
        sw = {}
    for name, s in sw.items():
        if name not in rosters.BOSS_SWITCHES:
            bad.append('bosses.json: unknown switch "%s"' % name)
        elif not isinstance(s, dict) or not isinstance(s.get('on'), bool):
            bad.append('bosses.json: switch %s needs "on": true | false' % name)
        elif not isinstance(s.get('why'), str) or not s['why'].strip():
            bad.append('bosses.json: switch %s needs a "why"' % name)

    def flags_ok(where, e, known):
        fl = e.get('flags')
        if fl is None:
            return
        if not isinstance(fl, list):
            bad.append('%s: flags is not a list' % where)
            return
        for f in fl:
            if f not in known:
                bad.append('%s: unknown flag "%s"' % (where, f))
        if len(set(map(str, fl))) != len(fl):
            bad.append('%s: a flag is written twice' % where)
        if fl == []:
            bad.append('%s: an empty flags list (leave the key out)' % where)

    def is_tier(v):
        return isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= 4

    arena_keys = {}
    for i, e in reg.bosses.items():
        if not isinstance(e, dict):
            bad.append('%s: not an object' % i)
            continue
        for k in e:
            if k not in rosters.BOSS_KEYS:
                bad.append('%s: unknown key "%s"' % (i, k))
        flags_ok(i, e, rosters.BOSS_FLAGS)
        if e.get('kind') not in rosters.BOSS_KINDS:
            bad.append('%s: kind %r is none of %s' % (i, e.get('kind'), ' / '.join(rosters.BOSS_KINDS)))
        if 'tier' not in e:
            if not (isinstance(e.get('absent'), str) and e['absent'].strip()):
                bad.append('%s: no tier (only an entry with `absent` may have none)' % i)
            if e.get('kind') != 'unlisted':
                bad.append('%s: kind %s needs a tier' % (i, e.get('kind')))
        elif not is_tier(e['tier']):
            bad.append('%s: tier %r is not 1-4' % (i, e['tier']))
        if 'hp' in e and not (isinstance(e['hp'], (int, float)) and not isinstance(e['hp'], bool) and e['hp'] > 0):
            bad.append('%s: hp is not a positive number' % i)
        if 'rush' in e and e['rush'] not in (1, 2, 3):
            bad.append('%s: rush %r is not a roster (1-3)' % (i, e['rush']))
        if 'phaseOf' in e and not (isinstance(e['phaseOf'], str) and e['phaseOf'] in reg.bosses and e['phaseOf'] != i):
            bad.append('%s: phaseOf names no other entry' % i)
        if 'relic' in e:
            r = e['relic']
            if not (isinstance(r, dict) and sorted(r.keys()) == sorted(rosters.RELIC_KEYS) and isinstance(r['item'], str)
                    and isinstance(r['chance'], (int, float)) and isinstance(r['looting'], (int, float))):
                bad.append('%s: relic needs exactly item, chance, looting' % i)
        if 'arena' in e:
            a = e['arena']
            if not isinstance(a, dict):
                bad.append('%s: arena is not an object' % i)
            else:
                for k in a:
                    if k not in rosters.ARENA_KEYS:
                        bad.append('%s: arena has an unknown key "%s"' % (i, k))
                for k in ('key', 'display', 'dimension', 'waystone'):
                    if not (isinstance(a.get(k), str) and a[k]):
                        bad.append('%s: arena needs a "%s"' % (i, k))
                if not is_tier(a.get('tier')):
                    bad.append('%s: arena tier %r is not 1-4' % (i, a.get('tier')))
                if isinstance(a.get('key'), str):
                    if a['key'] in arena_keys:
                        bad.append('%s: arena key "%s" is also the key of %s' % (i, a['key'], arena_keys[a['key']]))
                    arena_keys[a['key']] = i
                if 'locator' in a and a['locator'] not in ('structure', 'block', 'summon'):
                    bad.append('%s: arena locator %r is none of structure / block / summon' % (i, a['locator']))
                if a.get('locator') == 'block' and 'signatureBlock' not in a:
                    bad.append('%s: a block-located arena needs a signatureBlock' % i)
                if 'structure' in a and a.get('locator') in ('block', 'summon'):
                    bad.append('%s: arena has a structure and the locator %s' % (i, a['locator']))
                if 'summonEntity' in a and a['summonEntity'] != i:
                    bad.append('%s: arena summonEntity is %s, not this entity' % (i, a['summonEntity']))
        if 'absent' in e and not (isinstance(e['absent'], str) and e['absent'].strip()):
            bad.append('%s: absent needs the reason the entry is kept' % i)
        if 'note' in e and not isinstance(e['note'], str):
            bad.append('%s: note is not text' % i)

    gates, keys = {}, {}
    for i, e in reg.dims.items():
        if not isinstance(e, dict):
            bad.append('%s: not an object' % i)
            continue
        for k in e:
            if k not in rosters.DIM_KEYS:
                bad.append('%s: unknown key "%s"' % (i, k))
        flags_ok(i, e, rosters.DIM_FLAGS)
        if not is_tier(e.get('tier')):
            bad.append('%s: tier %r is not 1-4' % (i, e.get('tier')))
        if 'stageGate' in e:
            if not (isinstance(e['stageGate'], str) and e['stageGate']):
                bad.append('%s: stageGate is not a restriction id' % i)
            elif e['stageGate'] in gates:
                bad.append('%s: stageGate "%s" is also the gate of %s' % (i, e['stageGate'], gates[e['stageGate']]))
            else:
                gates[e['stageGate']] = i
            if e.get('tier') == 1:
                bad.append('%s: a tier-1 dimension cannot have a stage gate (every player has tier_1)' % i)
        if 'exploration' in e:
            if not (isinstance(e['exploration'], str) and e['exploration']):
                bad.append('%s: exploration is not a key' % i)
            elif e['exploration'] in keys:
                bad.append('%s: exploration key "%s" is also the key of %s' % (i, e['exploration'], keys[e['exploration']]))
            else:
                keys[e['exploration']] = i
        if 'deathPenalty' in e and not (isinstance(e['deathPenalty'], (int, float)) and not isinstance(e['deathPenalty'], bool)
                                        and 0 <= e['deathPenalty'] <= 1):
            bad.append('%s: deathPenalty is not a share 0-1' % i)
        if 'mobEquipment' in e:
            c = e['mobEquipment']
            if not isinstance(c, dict) or sorted(c.keys()) != sorted(rosters.EQUIP_KEYS):
                bad.append('%s: mobEquipment needs exactly %s' % (i, ', '.join(rosters.EQUIP_KEYS)))
            else:
                for k in ('weapons', 'helmets', 'chests', 'legs', 'boots'):
                    if not (isinstance(c[k], list) and c[k] and all(isinstance(x, str) for x in c[k])):
                        bad.append('%s: mobEquipment.%s is not a list of item ids' % (i, k))
                for k in ('chance', 'fullSetChance'):
                    if not (isinstance(c[k], (int, float)) and 0 <= c[k] <= 1):
                        bad.append('%s: mobEquipment.%s is not a share 0-1' % (i, k))
    return bad


def id_problems(reg, game, pack):
    bad = []
    src = game.get('source', {})
    ents, dims = game['entities'], game['dimensions']
    for i, e in reg.bosses.items():
        if not isinstance(e, dict):
            continue
        registered = i in ents
        if 'absent' in e and registered:
            bad.append('%s: says `absent`, but it IS a registered entity type: remove `absent`' % i)
        if 'absent' not in e and not registered:
            bad.append('%s: not a registered entity type (dev/registry/entity_types.txt). An id that names nothing matches '
                       'nothing, without an error. Correct it, or keep the entry with "absent": "<why it is kept>"' % i)
        if 'absent' in e:
            for k in ('hp', 'rush', 'relic', 'arena', 'phaseOf'):
                if k in e:
                    bad.append('%s: an `absent` entry cannot have %s' % (i, k))
        a = e.get('arena')
        if isinstance(a, dict):
            if a.get('dimension') not in dims:
                bad.append('%s: arena dimension %s is not a dimension of the server' % (i, a.get('dimension')))
            elif a.get('dimension') not in reg.dims:
                bad.append('%s: arena dimension %s has no entry in dimensions.json' % (i, a.get('dimension')))
            if 'structure' in a:
                if a['structure'] not in game['structures']:
                    bad.append('%s: arena structure %s is not a registered structure' % (i, a['structure']))
                tag = os.path.join(pack, 'kubejs', 'data', 'icraft', 'tags', 'worldgen', 'structure', str(a.get('key')) + '.json')
                try:
                    with open(tag, 'r', encoding='utf-8') as f:
                        values = [v['id'] if isinstance(v, dict) else v for v in json.load(f).get('values', [])]
                    if values != [a['structure']]:
                        bad.append('%s: the structure tag of arena %s lists %s, the registry says %s (the compass locates by the tag)'
                                   % (i, a.get('key'), values, a['structure']))
                except (OSError, ValueError):
                    bad.append('%s: arena %s has no readable structure tag kubejs/data/icraft/tags/worldgen/structure/%s.json '
                               '(the compass and the bonfire find a structure arena through it)' % (i, a.get('key'), a.get('key')))
            if 'signatureBlock' in a and a['signatureBlock'] not in game['blocks']:
                bad.append('%s: arena signatureBlock %s is not a registered block' % (i, a['signatureBlock']))
        r = e.get('relic')
        if isinstance(r, dict) and r.get('item') not in game['items']:
            bad.append('%s: relic item %s is not a registered item' % (i, r.get('item')))
    for i, e in reg.dims.items():
        if not isinstance(e, dict):
            continue
        if i not in dims:
            bad.append('%s: not a dimension of the server (dev/registry/dimensions.txt). A gate or a rule keyed on it never applies' % i)
        c = e.get('mobEquipment')
        if isinstance(c, dict):
            for k in ('weapons', 'helmets', 'chests', 'legs', 'boots'):
                for item in (c.get(k) or []):
                    if item not in game['items']:
                        bad.append('%s: mobEquipment.%s names %s, which is not a registered item' % (i, k, item))
    return bad, src


def consistency_problems(reg):
    bad = []
    for i, e in reg.bosses.items():
        if not isinstance(e, dict):
            continue
        fl = e.get('flags') or []
        if 'hp' in e and 'boss' not in fl:
            bad.append('%s: a designed health (hp) without the flag `boss`: scaling/boss_hp.js would set its health and '
                       'the mob-tier multiplier would then multiply it' % i)
        if 'x3DamageSkip' in fl and 'x3' not in fl:
            bad.append('%s: x3DamageSkip without x3' % i)
        if 'phaseOf' in e and isinstance(e.get('phaseOf'), str) and e['phaseOf'] in reg.bosses:
            if 'rush' not in reg.bosses[e['phaseOf']]:
                bad.append('%s: phaseOf %s, which is on no boss-rush roster (the credit goes nowhere)' % (i, e['phaseOf']))
            if 'rush' in e:
                bad.append('%s: has phaseOf and its own rush roster (a kill would be credited to the other boss only)' % i)
    return bad


def deviations(reg):
    """-> OrderedDict rule -> [ids] for the expectations above"""
    out = OrderedDict((r, []) for r in list(BOSS_RULES) + list(DIM_RULES))
    for i, e in reg.bosses.items():
        if not isinstance(e, dict) or 'absent' in e:
            continue
        fl = e.get('flags') or []
        kind, tier = e.get('kind'), e.get('tier')
        if kind == 'named' and 'boss' not in fl:
            out['named-not-boss'].append(i)
        if kind == 'named' and 'x3' not in fl:
            out['named-not-x3'].append(i)
        if 'hp' in e and 'x3' not in fl:
            out['hp-not-x3'].append(i)
        if 'x3' in fl and kind != 'named':
            out['x3-not-named'].append(i)
        if 'boss' in fl and kind == 'unlisted':
            out['boss-not-on-kill-roster'].append(i)
        if kind == 'named' and tier in (1, 2, 3) and 'rush' not in e and 'phaseOf' not in e:
            out['named-not-in-rush'].append(i)
        if kind == 'miniboss' and tier in (1, 2, 3) and 'rush' not in e and 'phaseOf' not in e:
            out['miniboss-not-in-rush'].append(i)
        if 'rush' in e and e['rush'] != tier:
            out['rush-tier'].append(i)
        if isinstance(e.get('arena'), dict) and e['arena'].get('tier') != tier:
            out['arena-tier'].append(i)
        if ('vorpalMelee' in fl) != ('vorpalArcane' in fl):
            out['vorpal-lists'].append(i)
        if ('vorpalMelee' in fl or 'vorpalArcane' in fl) and 'boss' not in fl:
            out['vorpal-not-boss'].append(i)
    for i, e in reg.dims.items():
        if not isinstance(e, dict):
            continue
        fl = e.get('flags') or []
        upper = e.get('tier') in (2, 3, 4)
        if upper and 'stageGate' not in e:
            out['dim-no-stage-gate'].append(i)
        if 'loot' not in fl:
            out['dim-not-in-loot'].append(i)
        if upper and 'classPassives' not in fl:
            out['dim-no-class-passives'].append(i)
        if upper and 'exploration' not in e:
            out['dim-no-exploration'].append(i)
        if 'mobEquipment' not in e:
            out['dim-no-mob-equipment'].append(i)
        if 'deathPenalty' not in e:
            out['dim-no-death-penalty'].append(i)
    return out


def load_accepted():
    try:
        doc = rosters.read_json(ACCEPTED_FILE)
    except rosters.RegistryError as e:
        raise rosters.RegistryError('accepted.json: %s' % e)
    acc = OrderedDict()
    for rule, ids in doc.items():
        if rule == 'about':
            continue
        if rule not in BOSS_RULES and rule not in DIM_RULES:
            raise rosters.RegistryError('accepted.json: "%s" is not a rule (%s)' % (rule, ', '.join(list(BOSS_RULES) + list(DIM_RULES))))
        if not isinstance(ids, dict):
            raise rosters.RegistryError('accepted.json: %s is not an object of id -> reason' % rule)
        for i, why in ids.items():
            if not (isinstance(why, str) and why.strip()):
                raise rosters.RegistryError('accepted.json: %s / %s has no reason' % (rule, i))
        acc[rule] = ids
    return acc


def notes(reg, game):
    out = []
    missing = sorted(d for d in game['dimensions'] if d not in reg.dims)
    if missing:
        out.append('%d dimension(s) of the server have no entry (no tier anywhere: enterable at tier 1, default death penalty, '
                   'no loot group): %s' % (len(missing), ', '.join(missing)))
    tagged = []
    for i, f in sorted(game.get('entity_facts', {}).items()):
        tags = [t for t in (f.get('tags') or []) if t in ('forge:bosses', 'c:bosses')]
        if tags and i not in reg.bosses:
            tagged.append(i)
    if tagged:
        out.append('%d entity type(s) carry the tag forge:bosses or c:bosses and have no entry (for every script they are '
                   'ordinary mobs): %s' % (len(tagged), ', '.join(tagged)))
    absent = [i for i, e in reg.bosses.items() if isinstance(e, dict) and 'absent' in e]
    if absent:
        out.append('%d entr(y/ies) kept although the id is not a registered entity type: %s' % (len(absent), ', '.join(absent)))
    unlisted = [i for i, e in reg.bosses.items() if isinstance(e, dict) and e.get('kind') == 'unlisted' and 'absent' not in e]
    if unlisted:
        out.append('%d entr(y/ies) of kind `unlisted` (on neither kill roster): %s' % (len(unlisted), ', '.join(unlisted)))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--pack', default=os.path.normpath(os.path.join(HERE, '..', '..')), help='the .minecraft folder to check')
    ap.add_argument('--notes', action='store_true', help='also print what is reported only')
    ap.add_argument('--deviations', action='store_true', help='print every accepted deviation with its reason')
    args = ap.parse_args()
    pack = os.path.abspath(args.pack)
    try:
        reg = rosters.load(pack)
        game = rosters.load_game_registry(pack)
        accepted = load_accepted()
    except rosters.RegistryError as e:
        print('[rosters] COULD NOT RUN: %s' % e)
        return 2

    findings = []
    shape = shape_problems(reg)
    findings += [('shape', p) for p in shape]
    if not shape:
        ids, src = id_problems(reg, game, pack)
        findings += [('id', p) for p in ids]
        findings += [('consistency', p) for p in consistency_problems(reg)]
        dev = deviations(reg)
        n_acc = 0
        for rule, got in dev.items():
            acc = accepted.get(rule, {})
            what = (BOSS_RULES.get(rule) or DIM_RULES.get(rule))
            for i in got:
                if i in acc:
                    n_acc += 1
                else:
                    findings.append(('expectation', '%s: %s -- expected: %s. If it is meant, add it to dev/rosters/accepted.json '
                                     'under "%s" with the reason; if not, correct the entry' % (i, rule, what, rule)))
            for i in acc:
                if i not in got:
                    findings.append(('accepted', 'accepted.json lists %s under "%s", and the registry no longer deviates there: '
                                     'remove the line' % (i, rule)))
    else:
        src, dev, n_acc = game.get('source', {}), OrderedDict(), 0

    for kind, text in findings:
        print('[rosters] %-12s %s' % (kind.upper(), text))
    if args.deviations and not shape:
        for rule, got in dev.items():
            if got:
                print('[rosters] accepted, %s (%s):' % (rule, BOSS_RULES.get(rule) or DIM_RULES.get(rule)))
                for i in got:
                    print('[rosters]     %s: %s' % (i, accepted.get(rule, {}).get(i, 'NOT ACCEPTED')))
    the_notes = notes(reg, game) if not shape else []
    if args.notes:
        for n in the_notes:
            print('[rosters] note: %s' % n)
    absent = sum(1 for e in reg.bosses.values() if isinstance(e, dict) and 'absent' in e)
    dump = 'commit %s' % str(src.get('commit', '?'))[:8]
    if findings:
        print('[rosters] FAIL -- %d finding(s) in the registries (%d bosses, %d dimensions)' % (len(findings), len(reg.bosses), len(reg.dims)))
        return 1
    print(rosters.boot_line(reg))
    print('[rosters] OK -- %d bosses (%d registered entity types, %d kept as absent), %d dimensions; ids checked against '
          'dev/registry (%s); %d accepted deviation(s), %d note(s)%s'
          % (len(reg.bosses), len(reg.bosses) - absent, absent, len(reg.dims), dump, n_acc, len(the_notes),
             '' if args.notes else ' (--notes)'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
