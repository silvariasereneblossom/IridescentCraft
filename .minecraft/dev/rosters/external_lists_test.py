#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""external_lists_test.py -- does external_lists.py report what it exists to report, and does `generate` write only
its keys?

Builds a small pack in a temporary folder (a boss and a dimension registry, the game's ids, and the difficulty mod's
and Apotheosis's configs in the three distros), breaks it one way at a time and runs the tool on it:

  check     a registry boss missing from the exclude list; a second id (`sameAs`) missing; an exclude entry naming no
            entity (and one naming an `absent` registry entry); a dimension on another tier than the registry; a
            registry dimension on no tier list; a tier entry naming no dimension; an Apotheosis entry naming no
            dimension, a registry dimension missing from one Apotheosis list, a line Apotheosis cannot read, a value
            that differs from the ruled policy; a distro that disagrees; a file that is missing; a registry that
            cannot be read. Check exits 0 on all of them (a report), --strict exits 1.
  generate  refused while the policy owes a ruling (files untouched); refused on a policy problem; --dry-run writes
            nothing; on a fixture broken in all three distros (CRLF lines, a BOM, a comment after an array, an array
            over several lines) it rewrites only the keys, keeps every other line byte for byte, leaves a pack that
            checks clean and is a no-op the second time; scope / tierOf / leaveOff do what the policy says.
  real pack a COPY of the pack's real registry, game ids and six config files with the committed policy (ruled
            2026-10-16): generate writes only the keys, the copy then checks clean, a second run changes nothing.

Nothing in the real tree is written. Usage: python .minecraft/dev/rosters/external_lists_test.py
Exit 0 when every case behaves, 1 otherwise.
"""
import difflib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, 'external_lists.py')
PACK = os.path.normpath(os.path.join(HERE, '..', '..'))
DISTROS = ('', 'server_distribution', os.path.join('distribution', 'client'))
DIFF = os.path.join('config', 'iridescent_difficulty-common.toml')
APOTH = os.path.join('config', 'apotheosis', 'adventure.cfg')

# git is not used here; a test started from a git hook must never inherit the hook's repository anyway
for _k in [k for k in os.environ if k.startswith('GIT_')]:
    del os.environ[_k]

BOSSES = {"schema": 1, "bosses": {
    "testmod:king": {"tier": 1, "kind": "named", "hp": 300, "flags": ["boss", "x3"], "rush": 1},
    "testmod:knight": {"tier": 2, "kind": "miniboss", "flags": ["boss"], "rush": 2},
    "testmod:queen": {"tier": 3, "kind": "named", "flags": ["boss", "x3"], "rush": 3},
    "otherid:queen": {"sameAs": "testmod:queen", "note": "the game hands the queen out under this id too"},
    "testmod:ghost": {"tier": 2, "kind": "unlisted", "flags": ["boss"], "absent": "no such entity type"},
    "testmod:mage": {"tier": 3, "kind": "unlisted", "hp": 500, "flags": ["boss"],
                     "seenAs": {"type": "minecraft:vindicator", "class": "x.Mage"}, "note": "typed as a vindicator"},
    "testmod:pet": {"tier": 1, "kind": "unlisted", "flags": []},
}}
DIMS = {"schema": 1, "dimensions": {
    "minecraft:overworld": {"tier": 1}, "testmod:forest": {"tier": 2}, "minecraft:the_nether": {"tier": 3},
    "minecraft:the_end": {"tier": 4}, "testmod:moon": {"tier": 4}}}
ENTITY_TYPES = ["testmod:king", "testmod:knight", "testmod:queen", "otherid:queen", "testmod:mage", "testmod:pet",
                "minecraft:vindicator", "minecraft:zombie"]
DIMENSIONS = ["minecraft:overworld", "testmod:forest", "minecraft:the_nether", "minecraft:the_end", "testmod:moon",
              "testmod:secret", "aether:the_aether"]

TOML = '''#Test difficulty config: only the two tables matter
[general]
\t#Master toggle.
\tenabled = true

[tiers]

\t[tiers.t1]
\t\tstartPct = 150.0

[dimensions]
\t#T1 dimensions.
\tt1 = ["minecraft:overworld"]
\t#T2 dimensions.
\tt2 = ["testmod:forest"]
\tt3 = ["minecraft:the_nether"]
\tt4 = ["minecraft:the_end", "testmod:moon"]
\tuncapAfterEnderDragon = ["minecraft:the_end"]

[excludes]
\t#Resource IDs of entities to skip entirely.
\tentities = ["testmod:king", "testmod:knight", "testmod:queen", "otherid:queen"]
\tforceScaleEntities = ["minecraft:zombie"]

[idle_detection]
\tenabled = true
'''

RARITY_LINES = ['minecraft:overworld|common|rare', 'testmod:forest|common|epic', 'minecraft:the_nether|rare|mythic',
                'minecraft:the_end|epic|ancient', 'testmod:moon|epic|ancient']
SPAWN_LINES = ['minecraft:overworld|0.02|NEEDS_SKY', 'testmod:forest|0.04|NEEDS_SURFACE', 'minecraft:the_nether|0.06|ANY',
               'minecraft:the_end|0.10|SURFACE_OUTER_END', 'testmod:moon|0.10|ANY']


def cfg(affix=None, gem=None, spawn=None):
    def block(name, lines):
        return '    S:"%s" <\n%s     >\n' % (name, ''.join('        %s\n' % x for x in lines))
    return ('# Configuration file\n\naffixes {\n    # a comment — with a dash\n'
            + block('Affix Convert Rarities', RARITY_LINES if affix is None else affix)
            + '    B:"Disable Quark Tooltips for Affix Items"=true\n}\n\n\ngems {\n'
            + block('Gem Dimensional Rarities', RARITY_LINES if gem is None else gem)
            + '}\n\n\nbosses {\n'
            + block('Boss Spawn Dimensions', SPAWN_LINES if spawn is None else spawn)
            + block('Boss Announce Sounds', ['block.end_portal.spawn'])
            + '}\n')


RULED = {"schema": 1,
         "difficulty": {"excludes": {"scope": "isBoss", "keep": []},
                        "dimensions": {"registryTiers": True, "tierOf": {}, "leaveOff": []}},
         "apotheosis": {
             "Affix Convert Rarities": {"tiers": {"1": "common|rare", "2": "common|epic", "3": "rare|mythic", "4": "epic|ancient"},
                                        "dimensions": {}, "leaveOff": []},
             "Gem Dimensional Rarities": {"tiers": {"1": "common|rare", "2": "common|epic", "3": "rare|mythic", "4": "epic|ancient"},
                                          "dimensions": {}, "leaveOff": []},
             "Boss Spawn Dimensions": {"tiers": {"1": "0.02|NEEDS_SKY", "2": "0.04|NEEDS_SURFACE", "3": "0.06|ANY", "4": "0.1|ANY"},
                                       "dimensions": {"minecraft:the_end": "0.10|SURFACE_OUTER_END"}, "leaveOff": []}}}


def owed_policy():
    p = json.loads(json.dumps(RULED))
    p['difficulty']['excludes']['scope'] = None
    p['apotheosis']['Boss Spawn Dimensions']['tiers']['4'] = None
    return p


def write(path, data, raw=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data if raw else (json.dumps(data, indent=1) if not isinstance(data, str) else data).encode('utf-8'))


def build(tmp, toml=None, adv=None, per_distro=None, policy=None, bosses=None, categories=None):
    """a pack-shaped folder; per_distro = {distro index: (toml, cfg)} overrides one distro's files; categories =
    {entity id: mob category} for dev/registry/entities.json (without it every category is unknown)"""
    write(os.path.join(tmp, 'kubejs', 'config', 'icraft', 'registry', 'bosses.json'), bosses or BOSSES)
    write(os.path.join(tmp, 'kubejs', 'config', 'icraft', 'registry', 'dimensions.json'), DIMS)
    reg = os.path.join(tmp, 'dev', 'registry')
    if categories is not None:
        write(os.path.join(reg, 'entities.json'), {"entities": dict((i, {"category": c}) for i, c in categories.items())})
    write(os.path.join(reg, 'entity_types.txt'), '\n'.join(ENTITY_TYPES) + '\n')
    write(os.path.join(reg, 'dimensions.txt'), '\n'.join(DIMENSIONS) + '\n')
    for fn in ('structures.txt', 'blocks.txt', 'items.txt'):
        write(os.path.join(reg, fn), '')
    for n, d in enumerate(DISTROS):
        t, c = (per_distro or {}).get(n, (None, None))
        t = t if t is not None else (toml if toml is not None else TOML)
        c = c if c is not None else (adv if adv is not None else cfg())
        if t is not False:
            write(os.path.join(tmp, d, DIFF), t.encode('utf-8') if isinstance(t, str) else t, raw=True)
        if c is not False:
            write(os.path.join(tmp, d, APOTH), c.encode('utf-8') if isinstance(c, str) else c, raw=True)
    pol = os.path.join(tmp, 'policy.json')
    write(pol, policy if policy is not None else RULED)
    return pol


def run(tmp, pol, *args):
    cmd = [sys.executable, '-I', '-B', TOOL] + list(args) + ['--pack', tmp, '--policy', pol]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    return r.returncode, r.stdout + r.stderr


def snapshot(tmp):
    out = {}
    for dp, _dn, fns in os.walk(tmp):
        for fn in fns:
            p = os.path.join(dp, fn)
            with open(p, 'rb') as f:
                out[os.path.relpath(p, tmp)] = f.read()
    return out


def summary_line(out):
    lines = [l for l in out.splitlines() if l.startswith('[external-lists] REPORT')]
    return lines[-1] if lines else ''


# ------------------------------------------------------------------------------------------------------ cases
# each case: (name, function(tmp) -> list of problems); an empty list passes

def expect(out, rc, want_rc, *texts, absent=()):
    bad = []
    if rc != want_rc:
        bad.append('exit %d, wanted %d' % (rc, want_rc))
    for t in texts:
        if t not in out:
            bad.append('the output does not hold: %s' % t)
    for t in absent:
        if t in out:
            bad.append('the output holds what it must not: %s' % t)
    return bad


def c_clean(tmp):
    pol = build(tmp)
    rc, out = run(tmp, pol)
    bad = expect(out, rc, 0, '| 0 findings; generate: ruled, ready', 'distros: agree')
    rc2, out2 = run(tmp, pol, 'check', '--strict')
    return bad + expect(out2, rc2, 0)


def toml_with(**kw):
    t = TOML
    for k, v in kw.items():
        t = re.sub(r'(?m)^\t%s = \[.*\]$' % k, '\t%s = %s' % (k, v), t)
    return t


def c_missing_boss(tmp):
    pol = build(tmp, toml=toml_with(entities='["testmod:king", "testmod:queen", "otherid:queen"]'))
    rc, out = run(tmp, pol)
    bad = expect(out, rc, 0, 'BOSS-NOT-EXCLUDED', 'testmod:knight (miniboss)', 'difficulty: 1 boss ids on the curve (not excluded)')
    rc2, out2 = run(tmp, pol, 'check', '--strict')
    return bad + expect(out2, rc2, 1)


def c_boss_not_monster(tmp):
    """the curve takes category monster only: a missing boss of another category is a note; on forceScaleEntities it
    is scaled again, so a finding"""
    cats = dict((i, 'monster') for i in ENTITY_TYPES)
    cats['testmod:knight'] = 'creature'
    pol = build(tmp, toml=toml_with(entities='["testmod:king", "testmod:queen", "otherid:queen"]'), categories=cats)
    rc, out = run(tmp, pol, 'check', '--strict')
    bad = expect(out, rc, 0, 'BOSS-NOT-SCALED', 'testmod:knight (miniboss), category creature', '| 0 findings', absent=('BOSS-NOT-EXCLUDED',))
    with open(os.path.join(tmp, DIFF), 'w', encoding='utf-8', newline='\n') as f:
        f.write(toml_with(entities='["testmod:king", "testmod:queen", "otherid:queen"]', forceScaleEntities='["testmod:knight"]'))
    rc, out = run(tmp, pol)
    return bad + expect(out, rc, 0, 'BOSS-NOT-EXCLUDED', 'testmod:knight (miniboss)')


def c_missing_second_id(tmp):
    pol = build(tmp, toml=toml_with(entities='["testmod:king", "testmod:knight", "testmod:queen"]'))
    rc, out = run(tmp, pol)
    return expect(out, rc, 0, 'otherid:queen (named, x3, second id of testmod:queen)')


def c_dead_entry(tmp):
    pol = build(tmp, toml=toml_with(entities='["testmod:king", "testmod:knight", "testmod:queen", "otherid:queen", "testmod:kingg", "testmod:ghost"]'))
    rc, out = run(tmp, pol)
    return expect(out, rc, 0, 'EXCLUDE-DEAD', 'testmod:kingg  near: testmod:king (a registry boss)',
                  'testmod:ghost  registry: absent, no such entity type', '2 dead entries')


def c_seen_as(tmp):
    pol = build(tmp)
    rc, out = run(tmp, pol)
    return expect(out, rc, 0, 'EXCLUDE-SEEN-AS', 'testmod:mage is typed minecraft:vindicator', absent=('testmod:mage (unlisted',))


def c_tier_mismatch(tmp):
    pol = build(tmp, toml=toml_with(t2='[]', t3='["minecraft:the_nether", "testmod:forest"]'))
    rc, out = run(tmp, pol)
    return expect(out, rc, 0, 'DIM-TIER', 'testmod:forest: t3 on the curve, registry tier 2', '1 tiers differ')


def c_dim_missing_and_dead(tmp):
    pol = build(tmp, toml=toml_with(t4='["minecraft:the_end", "testmod:nowhere"]'))
    rc, out = run(tmp, pol)
    return expect(out, rc, 0, 'DIM-MISSING', 'tier 4: testmod:moon', 'DIM-DEAD', 'testmod:nowhere', '1 dimensions not listed')


def c_apoth_dead_missing_shape(tmp):
    gem = [x for x in RARITY_LINES if not x.startswith('testmod:moon')] + ['deep_aether:the_aether|rare|ancient']
    affix = RARITY_LINES[:-1] + ['testmod:moon|epic']
    pol = build(tmp, adv=cfg(affix=affix, gem=gem))
    rc, out = run(tmp, pol)
    return expect(out, rc, 0, 'APOTH-DEAD', '"Gem Dimensional Rarities": 1 entry names no dimension',
                  'the dimension of that name: aether:the_aether', 'APOTH-MISSING', '"Gem Dimensional Rarities": 1 registry dimension is not on it',
                  'APOTH-SHAPE', 'testmod:moon|epic: "epic" is not min|max', 'Apotheosis: 1 dead entries')


def c_apoth_value(tmp):
    spawn = ['minecraft:overworld|0.03|NEEDS_SKY'] + SPAWN_LINES[1:]
    pol = build(tmp, adv=cfg(spawn=spawn))
    rc, out = run(tmp, pol)
    return expect(out, rc, 0, 'APOTH-VALUE', 'minecraft:overworld: 0.03|NEEDS_SKY in the file, 0.02|NEEDS_SKY ruled',
                  absent=('minecraft:the_end: 0.10', 'testmod:moon: 0.10'))   # the end's 0.10 is ruled 0.10, the moon's 0.10 ruled 0.1: equal


def c_distro_differ(tmp):
    pol = build(tmp, per_distro={1: (toml_with(entities='["testmod:king", "testmod:queen", "otherid:queen"]'), None)})
    rc, out = run(tmp, pol)
    return expect(out, rc, 0, 'DISTRO-DIFFER', 'server against dev: not in server: testmod:knight',
                  '(distros dev, client)', '(distro server)', 'distros: 1 key(s) differ')


def c_unreadable(tmp):
    pol = build(tmp, per_distro={2: (None, False)})
    rc, out = run(tmp, pol)
    return expect(out, rc, 0, 'NOT-READABLE', 'distribution/client/config/apotheosis/adventure.cfg: not readable',
                  'unreadable in client')


def c_registry_unreadable(tmp):
    pol = build(tmp)
    os.remove(os.path.join(tmp, 'kubejs', 'config', 'icraft', 'registry', 'bosses.json'))
    rc, out = run(tmp, pol)
    rc2, out2 = run(tmp, pol, 'check', '--strict')
    rc3, out3 = run(tmp, pol, 'generate')
    return expect(out, rc, 0, 'COULD NOT RUN') + expect(out2, rc2, 2) + expect(out3, rc3, 2)


def c_generate_owed(tmp):
    broken = toml_with(entities='["testmod:king"]')
    pol = build(tmp, toml=broken, policy=owed_policy())
    before = snapshot(tmp)
    rc, out = run(tmp, pol, 'generate')
    bad = expect(out, rc, 1, 'OWED   difficulty.excludes.scope', 'OWED   apotheosis "Boss Spawn Dimensions": 1 registry dimension(s) have no value',
                 'nothing written: 2 ruling(s) owed')
    rc2, out2 = run(tmp, pol)
    bad += expect(out2, rc2, 0, 'generate: 2 ruling(s) owed')
    if snapshot(tmp) != before:
        bad.append('generate wrote while rulings were owed')
    return bad


def c_generate_policy_problem(tmp):
    p = json.loads(json.dumps(RULED))
    p['difficulty']['excludes']['scope'] = 'nonsense'
    p['difficulty']['excludes']['keep'] = ['testmod:nobody']
    p['apotheosis']['Gem Dimensional Rarities']['tiers']['2'] = 'epic|common'
    p['apotheosis']['Boss Spawn Dimensions']['leaveOff'] = ['testmod:secret']
    p['difficulty']['extra'] = 1
    pol = build(tmp, policy=p)
    before = snapshot(tmp)
    rc, out = run(tmp, pol, 'generate')
    bad = expect(out, rc, 1, 'is not a system of the boss registry', 'testmod:nobody is not an entity type',
                 'the minimum epic is above the maximum common', 'testmod:secret is not a dimension of the registry',
                 'unknown key "extra"', 'nothing written: the policy has 5 problem(s)')
    if snapshot(tmp) != before:
        bad.append('generate wrote with a broken policy')
    return bad


def broken_everywhere():
    """the fixture broken in all three distros, each file in its own shape"""
    t_dev = toml_with(entities='["testmod:king", "testmod:kingg"]', t2='[]', t4='["minecraft:the_end", "testmod:nowhere"]')
    t_server = toml_with(entities='["testmod:king"] #a comment after the array').replace('\n', '\r\n')
    t_client = toml_with(t3='["minecraft:the_nether",\n\t\t"testmod:forest"]',
                         entities='[\n\t\t"testmod:king",\n\t\t"testmod:queen" # the queen\n\t]')
    c_dev = cfg(gem=RARITY_LINES[:-1] + ['deep_aether:the_aether|rare|ancient'])
    c_server = cfg(spawn=SPAWN_LINES[:2]).replace('\n', '\r\n')
    c_client = b'\xef\xbb\xbf' + cfg(affix=[]).encode('utf-8')
    return {0: (t_dev, c_dev), 1: (t_server, c_server), 2: (t_client, c_client)}


KEY_LINE = re.compile(r'^\s*(t[1-4]|entities)\s*=|^\s+[a-z0-9_]+:[a-z0-9_/]+\|')


def changed_outside_keys(old, new):
    """lines of `old` that generate changed and that are no key line (nor inside a multi-line key array)"""
    a, b = old.split(b'\n'), new.split(b'\n')
    inside, keyish = False, set()
    for i, raw in enumerate(a):
        s = raw.decode('utf-8', 'replace').lstrip('﻿')
        if KEY_LINE.match(s) or inside:
            keyish.add(i)
            if re.match(r'^\s*(t[1-4]|entities)\s*=\s*\[', s) and ']' not in s.split('#')[0]:
                inside = True
            elif inside and ']' in s.split('#')[0]:
                inside = False
    out = []
    for tag, i1, i2, _j1, _j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag in ('replace', 'delete'):
            out += [a[i] for i in range(i1, i2) if i not in keyish]
    return out


def c_generate_writes_only_keys(tmp):
    pol = build(tmp, per_distro=broken_everywhere())
    before = snapshot(tmp)
    rc, out = run(tmp, pol, 'generate', '--dry-run')
    bad = expect(out, rc, 0, 'would rewrite 6 file(s)', '+\tentities = ["testmod:king", "testmod:knight", "testmod:queen", "otherid:queen"]')
    if snapshot(tmp) != before:
        bad.append('--dry-run wrote')
    rc, out = run(tmp, pol, 'generate')
    bad += expect(out, rc, 0, 'rewrote 6 file(s); 8 key(s)')
    after = snapshot(tmp)
    for rel in sorted(before):
        if not rel.endswith(('.toml', '.cfg')):
            if before[rel] != after[rel]:
                bad.append('%s changed' % rel)
            continue
        extra = changed_outside_keys(before[rel], after[rel])
        if extra:
            bad.append('%s: lines outside the keys changed: %r' % (rel, extra[:3]))
        crlf_before = before[rel].count(b'\r\n') == before[rel].count(b'\n')
        crlf_after = after[rel].count(b'\r\n') == after[rel].count(b'\n')
        if crlf_before != crlf_after:
            bad.append('%s: line ends changed' % rel)
        if before[rel].startswith(b'\xef\xbb\xbf') != after[rel].startswith(b'\xef\xbb\xbf'):
            bad.append('%s: the BOM changed' % rel)
    srv = after[os.path.join('server_distribution', DIFF)].decode('utf-8')
    if '\tentities = ["testmod:king", "testmod:knight", "testmod:queen", "otherid:queen"] #a comment after the array\r' not in srv:
        bad.append('the comment after the server array was not kept')
    cli = after[os.path.join('distribution', 'client', DIFF)].decode('utf-8')
    if '# the queen' in cli or '\tt3 = ["minecraft:the_nether"]\n' not in cli:
        bad.append('the multi-line arrays of the client file were not replaced whole')
    rc, out = run(tmp, pol, 'check', '--strict')
    bad += expect(out, rc, 0, '| 0 findings; generate: ruled, ready', 'distros: agree')
    rc, out = run(tmp, pol, 'generate')
    bad += expect(out, rc, 0, 'rewrote 0 file(s)')
    if snapshot(tmp) != after:
        bad.append('the second generate changed a file')
    return bad


def c_generate_policy_shapes(tmp):
    p = json.loads(json.dumps(RULED))
    p['difficulty']['excludes'] = {"scope": "x3", "keep": ["minecraft:zombie"]}
    p['difficulty']['dimensions'] = {"registryTiers": True, "tierOf": {"testmod:moon": 3}, "leaveOff": ["testmod:forest"]}
    p['apotheosis']['Boss Spawn Dimensions']['leaveOff'] = ["testmod:moon"]
    pol = build(tmp, policy=p)
    rc, out = run(tmp, pol)
    bad = expect(out, rc, 0, 'EXCLUDE-EXTRA', 'testmod:knight (miniboss)', 'DIM-TIER',
                 'testmod:moon: t4 on the curve, tier 3 by the policy (tierOf; registry tier 4)',
                 'DIM-LEFT-OFF', 'APOTH-LEFT-OFF')
    rc, out = run(tmp, pol, 'generate')
    bad += expect(out, rc, 0)
    toml = open(os.path.join(tmp, DIFF), encoding='utf-8').read()
    for want in ('\tentities = ["testmod:king", "testmod:queen", "otherid:queen", "minecraft:zombie"]', '\tt2 = []',
                 '\tt3 = ["minecraft:the_nether", "testmod:moon"]', '\tt4 = ["minecraft:the_end"]'):
        if want not in toml:
            bad.append('the difficulty file does not hold: %s' % want)
    adv = open(os.path.join(tmp, APOTH), encoding='utf-8').read()
    if 'testmod:moon|0' in adv or 'minecraft:the_end|0.10|SURFACE_OUTER_END' not in adv or 'testmod:forest|0.04|NEEDS_SURFACE' not in adv:
        bad.append('the boss spawn list is not what the policy says')
    rc, out = run(tmp, pol, 'check', '--strict')
    return bad + expect(out, rc, 0, '| 0 findings')


def c_generate_scope_list(tmp):
    """the ruling of 2026-10-16: a designed health OR the x3 (a list of systems), plus an id kept by name"""
    p = json.loads(json.dumps(RULED))
    p['difficulty']['excludes'] = {"scope": ["hp", "x3"], "keep": ["minecraft:zombie"]}
    pol = build(tmp, policy=p)
    rc, out = run(tmp, pol)
    bad = expect(out, rc, 0, 'EXCLUDE-EXTRA', 'not in scope hp or x3', 'testmod:knight (miniboss)',
                 'KEEP-NOT-LISTED', '1 id(s) the policy keeps on the list are not on it: minecraft:zombie', absent=('BOSS-NOT-EXCLUDED',))
    rc, out = run(tmp, pol, 'generate')
    bad += expect(out, rc, 0)
    toml = open(os.path.join(tmp, DIFF), encoding='utf-8').read()
    if '\tentities = ["testmod:king", "testmod:queen", "otherid:queen", "minecraft:zombie"]' not in toml:
        bad.append('the exclude list is not the union of hp and x3 plus keep')
    rc, out = run(tmp, pol, 'check', '--strict')
    bad += expect(out, rc, 0, '| 0 findings')
    p['difficulty']['excludes']['scope'] = ['hp', 'nonsense']
    write(pol, p)
    rc, out = run(tmp, pol, 'generate')
    return bad + expect(out, rc, 1, 'difficulty.excludes.scope: ["hp", "nonsense"] is not a system')


def c_generate_keeps_order(tmp):
    """entries that stay keep their place, dropped ones go, new ones are appended: the diff shows only what changed"""
    t = toml_with(entities='["otherid:queen", "testmod:kingg", "testmod:king"]', t4='["testmod:moon"]')
    spawn = ['testmod:moon|0.10|ANY', 'deep_aether:the_aether|0.08|NEEDS_SURFACE', 'minecraft:overworld|0.05|NEEDS_SKY']
    pol = build(tmp, toml=t, adv=cfg(spawn=spawn))
    rc, out = run(tmp, pol, 'generate')
    bad = expect(out, rc, 0)
    toml = open(os.path.join(tmp, DIFF), encoding='utf-8').read()
    for want in ('\tentities = ["otherid:queen", "testmod:king", "testmod:knight", "testmod:queen"]', '\tt4 = ["testmod:moon", "minecraft:the_end"]'):
        if want not in toml:
            bad.append('the difficulty file does not hold: %s' % want)
    adv = open(os.path.join(tmp, APOTH), encoding='utf-8').read()
    want = ('        testmod:moon|0.10|ANY\n        minecraft:overworld|0.02|NEEDS_SKY\n        testmod:forest|0.04|NEEDS_SURFACE\n'
            '        minecraft:the_nether|0.06|ANY\n        minecraft:the_end|0.10|SURFACE_OUTER_END\n     >')
    if want not in adv:
        bad.append('the boss spawn list is not in the old order with the new lines appended')
    rc, out = run(tmp, pol, 'check', '--strict')
    return bad + expect(out, rc, 0, '| 0 findings')


REAL_FILES = [os.path.join('kubejs', 'config', 'icraft', 'registry', f) for f in ('bosses.json', 'dimensions.json')] + \
             [os.path.join('dev', 'registry', f) for f in ('entity_types.txt', 'dimensions.txt', 'structures.txt', 'blocks.txt',
                                                         'items.txt', 'entities.json', 'SOURCE.json')] + \
             [os.path.join(d, f) for d in DISTROS for f in (DIFF, APOTH)]


def copy_real(tmp):
    for rel in REAL_FILES:
        src = os.path.join(PACK, rel)
        if not os.path.isfile(src):
            continue
        os.makedirs(os.path.dirname(os.path.join(tmp, rel)), exist_ok=True)
        shutil.copyfile(src, os.path.join(tmp, rel))


def c_real_pack_copy(tmp):
    """the committed policy (ruled 2026-10-16) on a COPY of the pack's real files: only its keys change, the copy then
    checks clean, a second run changes nothing, and the ten real dimensions keep the values the policy copied"""
    copy_real(tmp)
    committed = os.path.join(HERE, 'external_lists.policy.json')
    before = snapshot(tmp)
    rc, out = run(tmp, committed)
    bad = expect(out, rc, 0, '[external-lists] REPORT (check only, nothing changed)')
    rc, out = run(tmp, committed, 'generate', '--dry-run')
    bad += expect(out, rc, 0, '(dry run: nothing written)')
    if snapshot(tmp) != before:
        bad.append('--dry-run wrote on the copy')
    rc, out = run(tmp, committed, 'generate')
    bad += expect(out, rc, 0, 'rewrote 6 file(s)')
    after = snapshot(tmp)
    for rel in before:
        if rel.endswith(('.toml', '.cfg')):
            extra = changed_outside_keys(before[rel], after[rel])
            if extra:
                bad.append('%s: lines outside the keys changed: %r' % (rel, extra[:3]))
        elif before[rel] != after[rel]:
            bad.append('%s changed' % rel)
    rc, out = run(tmp, committed, 'check', '--strict')
    bad += expect(out, rc, 0, '| 0 findings; generate: ruled, ready')
    rc, out = run(tmp, committed, 'generate')
    bad += expect(out, rc, 0, 'rewrote 0 file(s)')
    adv = after[APOTH].decode('utf-8')
    for line in ('minecraft:the_nether|0.08|ANY', 'minecraft:the_nether|rare|mythic', 'minecraft:the_end|0.10|SURFACE_OUTER_END'):
        if line not in adv:
            bad.append("today's value was not kept: %s" % line)
    return bad


CASES = [
    ('check: a clean fixture has no finding (and --strict exits 0)', c_clean),
    ('check: a registry boss missing from the exclude list', c_missing_boss),
    ('check: a boss of another category than monster is a note; on forceScaleEntities a finding', c_boss_not_monster),
    ('check: a second id (sameAs) missing from the exclude list', c_missing_second_id),
    ('check: exclude entries naming no entity, one of them an `absent` registry entry', c_dead_entry),
    ('check: a boss handed out under another type is a note, not a missing id', c_seen_as),
    ('check: a dimension on another tier than the registry', c_tier_mismatch),
    ('check: a registry dimension on no tier list, a tier entry naming no dimension', c_dim_missing_and_dead),
    ('check: Apotheosis dead entry, missing dimension, unreadable line', c_apoth_dead_missing_shape),
    ('check: an Apotheosis value that differs from the ruled policy', c_apoth_value),
    ('check: a distro that disagrees', c_distro_differ),
    ('check: a missing file is a finding, not a crash', c_unreadable),
    ('check: a registry that cannot be read (exit 0; --strict and generate exit 2)', c_registry_unreadable),
    ('generate: refused while a ruling is owed, nothing written', c_generate_owed),
    ('generate: refused on a policy problem, nothing written', c_generate_policy_problem),
    ('generate: only the keys, in all three distros; clean after; a no-op twice', c_generate_writes_only_keys),
    ('generate: scope, keep, tierOf and leaveOff do what the policy says', c_generate_policy_shapes),
    ('generate: a list scope (hp or x3) with an id kept by name', c_generate_scope_list),
    ('generate: entries that stay keep their place, new ones are appended', c_generate_keeps_order),
    ('real pack (a copy): the committed policy writes only its keys; clean after; a no-op twice', c_real_pack_copy),
]


def main():
    bad = 0
    for name, fn in CASES:
        with tempfile.TemporaryDirectory(prefix='el-test-') as tmp:
            try:
                problems = fn(tmp)
            except Exception as e:  # a case that crashes is a failed case, never a skipped one
                problems = ['crashed: %r' % e]
        print('%s  %s' % ('ok  ' if not problems else 'FAIL', name))
        for p in problems:
            print('      ' + p)
        bad += 1 if problems else 0
    print('\nRESULT: %d passed, %d failed' % (len(CASES) - bad, bad))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
