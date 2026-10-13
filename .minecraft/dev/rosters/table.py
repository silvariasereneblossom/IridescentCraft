#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""The proof table of the registries: every boss id and every dimension id against every consuming system,
once from the lists the scripts held (a commit that still has them) and once from the registry of this tree.

    python .minecraft/dev/rosters/table.py                     # compare; exit 1 when a cell differs
    python .minecraft/dev/rosters/table.py --out table.md      # ... and write the whole table
    python .minecraft/dev/rosters/table.py --old <commit>      # another commit that still has the lists
    python .minecraft/dev/rosters/table.py --old-tree <dir>    # ... or a folder that holds kubejs/

The OLD side is read out of the script sources by legacy_lists.js (node evaluates each list literal). The NEW
side is rosters.py, the same statement of "what a system gets from an entry" that suite `registry` of
dev/engine-tests holds the script-side reader to. So: old lists == rosters.py (this tool), rosters.py == what a
script is answered on the production engine (the suite).

What is compared:
  bosses      one row per entity id, one column per system (the five copies of the excluded-spellcaster list are
              five columns, each against the one `caster` flag)
  arenas      the old table is keyed by an arena key and names no entity; it is compared key by key, field by
              field and in order with the arena table the registry yields, and each key is shown on its entity's row
  dimensions  one row per dimension id, one column per system
  loot        every .anyDimension(...) call of the loot scripts, by file and position: the ids the old call
              listed against the ids the call of this tree gets (a literal, or icraft.dims.inTier / inTiers)

Needs node (the lints need it too) and git.
"""
import argparse
import io
import json
import os
import re
import subprocess
import sys
import tarfile
import tempfile
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rosters  # noqa: E402

# the last commit of main whose scripts still hold the lists (the commit the registries were built from)
LAST_LIST_COMMIT = 'afd5343d'

# old list (legacy_lists.js) -> registry system (rosters.BOSS_SYSTEMS)
BOSS_COLUMNS = [
    ('isBoss', 'isBoss'), ('tierHpExcluded', 'tierHpExcluded'), ('hp', 'hp'), ('x3', 'x3'), ('x3DamageSkip', 'x3DamageSkip'),
    ('perKill', 'perKill'), ('tokensNamed', 'tokensNamed'), ('tokensMiniboss', 'tokensMiniboss'), ('rush', 'rush'),
    ('rushCreditsAs', 'phase'), ('relicDrop', 'relic'), ('witchInk', 'witchInk'), ('abyssBoss', 'abyssBoss'),
    ('vorpalMeleeBlock', 'vorpalMelee'), ('vorpalArcaneBlock', 'vorpalArcane'),
    ('casterAffixOverworld', 'caster'), ('casterAffixSkyshatter', 'caster'), ('casterMobEquipment', 'caster'),
    ('casterMobTier', 'caster'), ('casterAscension', 'caster'),
]
DIM_COLUMNS = ['stageGate', 'exploration', 'mobEquipment', 'deathPenalty', 'classPassives']


def die(msg, code=2):
    sys.stderr.write('table.py: ' + msg + '\n')
    sys.exit(code)


def canon(v):
    """one cell as text: equal values give equal text"""
    if v is None:
        return '-'
    if v is True:
        return 'yes'
    if isinstance(v, float) and v == int(v):
        v = int(v)
    if isinstance(v, (dict, list)):
        return json.dumps(v, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return str(v)


def run_legacy(tree, loot_only=False):
    cmd = ['node', os.path.join(HERE, 'legacy_lists.js'), tree] + (['--loot-only'] if loot_only else [])
    try:
        r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except OSError as e:
        die('node could not be started (%s)' % e)
    try:
        doc = json.loads(r.stdout.decode('utf-8'), object_pairs_hook=OrderedDict)
    except ValueError:
        die('legacy_lists.js printed no JSON for %s:\n%s' % (tree, r.stderr.decode('utf-8', 'replace')[-2000:]))
    if doc.get('problems'):
        die('legacy_lists.js could not read every list of %s (an unread list is never taken as empty):\n  %s'
            % (tree, '\n  '.join(doc['problems'])))
    return doc


def export_tree(repo, ref, into):
    """kubejs/server_scripts and kubejs/startup_scripts of a commit, unpacked under <into>/kubejs"""
    paths = ['.minecraft/kubejs/server_scripts', '.minecraft/kubejs/startup_scripts']
    try:
        r = subprocess.run(['git', '-C', repo, 'archive', '--format=tar', ref] + paths, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except OSError as e:
        die('git could not be started (%s)' % e)
    if r.returncode != 0:
        die('git archive %s failed: %s' % (ref, r.stderr.decode('utf-8', 'replace').strip()))
    with tarfile.open(fileobj=io.BytesIO(r.stdout)) as tar:
        for m in tar.getmembers():
            if not m.isfile():
                continue
            rel = m.name.split('/', 1)[1] if m.name.startswith('.minecraft/') else None
            if rel is None or '..' in rel.split('/'):
                continue
            dest = os.path.join(into, *rel.split('/'))
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, 'wb') as f:
                f.write(tar.extractfile(m).read())
    return into


def old_boss_cell(old, column, entity):
    v = old['bosses'][column].get(entity)
    if v is None:
        return None
    if column == 'relicDrop':     # the registry calls the item `item`; the script builds the same record from it
        return OrderedDict([('item', v['relic']), ('chance', v['chance']), ('looting', v['looting'])])
    return v


RX_TIER = re.compile(r"^\(\s*icraft\.dims\.inTier\(\s*(\d)\s*,\s*'loot'\s*\)\s*\)$")
RX_TIERS = re.compile(r"^\(\s*icraft\.dims\.inTiers\(\s*\[([\d\s,]+)\]\s*,\s*'loot'\s*\)\s*\)$")


def loot_site_ids(site, reg):
    """the ids a call of THIS tree gets -> (ids or None, tiers or None)"""
    if site.get('ids') is not None:
        return site['ids'], None
    text = site.get('text') or ''
    m = RX_TIER.match(text)
    if m:
        t = int(m.group(1))
        return reg.dims_in_tier(t, 'loot'), [t]
    m = RX_TIERS.match(text)
    if m:
        tiers = [int(x) for x in m.group(1).replace(' ', '').split(',') if x]
        ids = []
        for t in tiers:
            ids.extend(reg.dims_in_tier(t, 'loot'))
        return ids, tiers
    return None, None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--old', default=LAST_LIST_COMMIT, help='a commit whose scripts still hold the lists (default %(default)s)')
    ap.add_argument('--old-tree', help='a folder that holds kubejs/server_scripts and kubejs/startup_scripts, instead of --old')
    ap.add_argument('--pack', default=os.path.normpath(os.path.join(HERE, '..', '..')), help='the .minecraft folder whose registry is the NEW side')
    ap.add_argument('--out', help='write the whole table to this file (Markdown)')
    args = ap.parse_args()

    pack = os.path.abspath(args.pack)
    try:
        reg = rosters.load(pack)
    except rosters.RegistryError as e:
        die(str(e))

    tmp = None
    if args.old_tree:
        old_tree = os.path.abspath(args.old_tree)
        old_name = old_tree
    else:
        repo = os.path.dirname(pack)
        r = subprocess.run(['git', '-C', repo, 'rev-parse', '--short=12', args.old + '^{commit}'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if r.returncode != 0:
            die('%s is not a commit here: %s' % (args.old, r.stderr.decode('utf-8', 'replace').strip()))
        old_name = 'commit ' + r.stdout.decode().strip()
        tmp = tempfile.TemporaryDirectory(prefix='icraft-rosters-')
        old_tree = export_tree(repo, args.old, tmp.name)
    old = run_legacy(old_tree)
    new_loot = run_legacy(pack, loot_only=True)['loot']

    lines = []
    out = lines.append
    diffs = []
    out('# Registries against the lists the scripts held')
    out('')
    out('OLD = the script lists of %s (read by legacy_lists.js). NEW = the registry of this tree (rosters.py).' % old_name)
    out('`-` = not in that system. A cell is one value; where OLD and NEW differ it reads `OLD => NEW` and counts.')
    out('')

    # ---- bosses ---------------------------------------------------------------------------------------------
    ids = []
    for col, _ in BOSS_COLUMNS:
        for i in old['bosses'][col]:
            if i not in ids:
                ids.append(i)
    for i in reg.bosses:
        if i not in ids:
            ids.append(i)
    order = list(reg.bosses.keys()) + [i for i in ids if i not in reg.bosses]
    arena_entity = reg.arena_entity()
    new_arenas = reg.arenas()
    old_arenas = old.get('arenas') or OrderedDict()
    entity_arena = dict((e, k) for k, e in arena_entity.items())

    heads = ['entity'] + [c for c, _ in BOSS_COLUMNS] + ['arena']
    out('## Bosses: %d ids x %d columns' % (len(order), len(BOSS_COLUMNS) + 1))
    out('')
    out('| ' + ' | '.join(heads) + ' |')
    out('|' + '---|' * len(heads))
    cells = 0
    for i in order:
        entry = reg.bosses.get(i)
        row = [i]
        for col, system in BOSS_COLUMNS:
            o = canon(old_boss_cell(old, col, i))
            n = canon(rosters.boss_cell(entry, system)) if entry is not None else '-'
            cells += 1
            if o != n:
                diffs.append('boss %s, %s: old %s, registry %s' % (i, col, o, n))
                row.append('%s => %s' % (o, n))
            else:
                row.append(o if len(o) <= 60 else o[:57] + '...')
        key = entity_arena.get(i)
        o = canon(old_arenas.get(key)) if key else '-'
        n = canon(new_arenas.get(key)) if key else '-'
        cells += 1
        if o != n:
            diffs.append('boss %s, arena %s: old %s, registry %s' % (i, key, o, n))
            row.append('%s => %s' % (o, n))
        else:
            row.append(key if key else '-')
        out('| ' + ' | '.join(row) + ' |')
    out('')
    absent_new = [i for i in order if i not in reg.bosses]
    if absent_new:
        for i in absent_new:
            diffs.append('boss %s: in an old list, no registry entry' % i)
    out('%d cells. Ids only the registry has (no old list names them): %s.' % (
        cells, ', '.join(i for i in reg.bosses if i not in ids or all(old_boss_cell(old, c, i) is None for c, _ in BOSS_COLUMNS)) or 'none'))
    out('')

    # ---- arenas ---------------------------------------------------------------------------------------------
    out('## Arenas: %d keys, every field, and the order' % len(old_arenas))
    out('')
    out('| arena key | entity (registry) | fields equal | record |')
    out('|---|---|---|---|')
    for key in list(old_arenas.keys()) + [k for k in new_arenas if k not in old_arenas]:
        o = canon(old_arenas.get(key))
        n = canon(new_arenas.get(key))
        if o != n:
            diffs.append('arena %s: old %s, registry %s' % (key, o, n))
        out('| %s | %s | %s | %s |' % (key, arena_entity.get(key, '-'), 'yes' if o == n else 'NO', o if o == n else o + ' => ' + n))
    if list(old_arenas.keys()) != list(new_arenas.keys()):
        diffs.append('arena order: old %s, registry %s' % (list(old_arenas.keys()), list(new_arenas.keys())))
    out('')
    out('Order of the keys: %s.' % ('identical' if list(old_arenas.keys()) == list(new_arenas.keys()) else 'DIFFERENT'))
    out('')

    # ---- counts the scripts print -----------------------------------------------------------------------------
    x3_named = len([i for i in reg.boss_ids('x3') if rosters.boss_cell(reg.bosses[i], 'tokensNamed') is not None])
    x3_extra = len(reg.boss_ids('x3')) - x3_named
    oc = old['counts']
    count_rows = [
        ('x3 boot line: named', oc['x3']['named'], x3_named),
        ('x3 boot line: extras', oc['x3']['extras'], x3_extra),
        ('x3 set size', len(old['bosses']['x3']), len(reg.boss_ids('x3'))),
    ]
    for t in ('1', '2', '3'):
        count_rows.append(('rush roster T%s size' % t, oc['rush'].get(t), len([i for i in reg.boss_ids('rush') if reg.bosses[i]['rush'] == int(t)])))
    count_rows.append(('named bosses (kill line)', len(old['bosses']['tokensNamed']), len(reg.boss_ids('tokensNamed'))))
    count_rows.append(('minibosses (kill line)', len(old['bosses']['tokensMiniboss']), len(reg.boss_ids('tokensMiniboss'))))
    out('## Counts the scripts print or compute')
    out('')
    out('| count | old | registry |')
    out('|---|---|---|')
    for name, o, n in count_rows:
        if o != n:
            diffs.append('count %s: old %s, registry %s' % (name, o, n))
        out('| %s | %s | %s |' % (name, o, n))
    out('')

    # ---- dimensions -------------------------------------------------------------------------------------------
    dim_ids = list(reg.dims.keys())
    for col in DIM_COLUMNS:
        for i in old['dimensions'][col]:
            if i not in dim_ids:
                dim_ids.append(i)

    def old_dim_cell(col, i):
        v = old['dimensions'][col].get(i)
        return v

    def new_dim_cell(col, i):
        e = reg.dims.get(i)
        if e is None:
            return None
        v = rosters.dim_cell(e, col)
        if v is None:
            return None
        if col == 'stageGate':       # the script: stageDimension('tier_' + tier, id, restriction id)
            return OrderedDict([('stage', 'tier_%d' % e['tier']), ('restriction', v)])
        if col == 'exploration':     # the script: { tier: the dimension's tier, key: ... }
            return OrderedDict([('tier', e['tier']), ('key', v)])
        return v

    # loot: site by site, and from the sites that ask for ONE tier the old group of that tier
    out_loot = []
    old_sites = OrderedDict(((s['file'], s['call']), s) for s in old['loot'])
    new_sites = OrderedDict(((s['file'], s['call']), s) for s in new_loot)
    tier_group_old = {}
    for key in list(old_sites.keys()) + [k for k in new_sites if k not in old_sites]:
        o = old_sites.get(key)
        n = new_sites.get(key)
        o_ids = o.get('ids') if o else None
        o_text = canon(o_ids) if o_ids is not None else ('(not a literal: %s)' % o.get('text') if o else '(no such call)')
        if n is None:
            n_text, tiers = '(no such call)', None
        else:
            n_ids, tiers = loot_site_ids(n, reg)
            n_text = canon(n_ids) if n_ids is not None else '(not a literal: %s)' % n.get('text')
        same = (o_text == n_text)
        if not same:
            diffs.append('loot call %s #%d: old %s, this tree %s' % (key[0], key[1], o_text, n_text))
        if tiers and len(tiers) == 1 and o_ids is not None:
            t = tiers[0]
            if t in tier_group_old and tier_group_old[t] != o_ids:
                diffs.append('loot tier %d: two old calls that now ask for this tier listed different ids' % t)
            tier_group_old[t] = o_ids
        how = ('tier %s from the registry' % '+'.join(str(t) for t in tiers)) if tiers else 'as written'
        out_loot.append('| %s | %d | %s | %s | %s |' % (key[0], key[1], 'yes' if same else 'NO', how, o_text if same else o_text + ' => ' + n_text))

    heads = ['dimension'] + DIM_COLUMNS + ['loot group (tier)']
    out('## Dimensions: %d ids x %d columns' % (len(dim_ids), len(heads) - 1))
    out('')
    out('| ' + ' | '.join(heads) + ' |')
    out('|' + '---|' * len(heads))
    dcells = 0
    for i in dim_ids:
        row = [i]
        for col in DIM_COLUMNS:
            o = canon(old_dim_cell(col, i))
            n = canon(new_dim_cell(col, i))
            dcells += 1
            if o != n:
                diffs.append('dimension %s, %s: old %s, registry %s' % (i, col, o, n))
                row.append('%s => %s' % (o, n))
            else:
                row.append(o if len(o) <= 48 else o[:45] + '...')
        o_t = [t for t, g in tier_group_old.items() if i in g]
        o = canon(o_t[0]) if len(o_t) == 1 else ('-' if not o_t else canon(o_t))
        e = reg.dims.get(i)
        n_v = rosters.dim_cell(e, 'loot') if e is not None else None
        # a tier no migrated call asks for has no old group to compare with
        n = canon(n_v) if (n_v in tier_group_old) else '-'
        dcells += 1
        if o != n:
            diffs.append('dimension %s, loot group: old calls %s, registry %s' % (i, o, n))
            row.append('%s => %s' % (o, n))
        else:
            row.append(o if n_v is None or n_v in tier_group_old else '- (registry: %s, no call asks for the tier)' % n_v)
        out('| ' + ' | '.join(row) + ' |')
    out('')
    out('%d cells. stageGate and exploration are shown as the script builds them from the entry (the stage and the '
        'token tier are the dimension\'s tier).' % dcells)
    out('')
    out('## Loot: %d .anyDimension(...) calls' % len(out_loot))
    out('')
    out('| file | call | same ids, same order | this tree | ids |')
    out('|---|---|---|---|---|')
    lines.extend(out_loot)
    out('')

    out('## Result')
    out('')
    if diffs:
        out('**%d difference(s):**' % len(diffs))
        out('')
        for dline in diffs:
            out('- ' + dline)
    else:
        out('**Identical: %d boss cells, %d arenas (fields and order), %d counts, %d dimension cells, %d loot calls.**'
            % (cells, len(old_arenas), len(count_rows), dcells, len(out_loot)))
    out('')

    text = '\n'.join(lines)
    if args.out:
        with open(args.out, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
    if tmp is not None:
        tmp.cleanup()
    if diffs:
        print('table.py: %d difference(s) between the old lists (%s) and the registry:' % (len(diffs), old_name))
        for dline in diffs[:60]:
            print('  ' + dline)
        if len(diffs) > 60:
            print('  ... and %d more' % (len(diffs) - 60))
        sys.exit(1)
    print('table.py: identical to the lists of %s: %d boss cells (%d ids x %d columns), %d arenas (fields and order), '
          '%d counts, %d dimension cells (%d ids x %d columns), %d loot calls%s'
          % (old_name, cells, len(order), len(BOSS_COLUMNS) + 1, len(old_arenas), len(count_rows), dcells, len(dim_ids),
             len(DIM_COLUMNS) + 1, len(out_loot), ('; table written to ' + args.out) if args.out else ''))
    sys.exit(0)


if __name__ == '__main__':
    main()
