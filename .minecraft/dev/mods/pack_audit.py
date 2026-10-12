#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""pack_audit.py -- the installed mods, audited against the pack's own systems.

    python -I .minecraft/dev/mods/pack_audit.py                       findings JSON + report (Markdown) into
                                                                      dev/mods/.cache/ (git-ignored)
    python -I .minecraft/dev/mods/pack_audit.py --out-dir DIR --name pack-audit-2026-10-12
    python -I .minecraft/dev/mods/pack_audit.py --logs auto           also read which mixin configs the server
                                                                      registered at its last boots (debug.log)

It joins four things and changes nothing:
    1. the per-jar inventory (inventory.py / jarscan.py): what every jar and nested jar ships
    2. the loot audit's two halves (audit_loot.py is run first): which structure chests roll which table, and
       which tables the pack's loot rules reach
    3. the pack's own lists (packlists.py): boss lists, dimension-to-tier lists, the three mod indexes,
       tracked configs, and every `ns:path` the scripts and configs name
    4. optional evidence from a boot: dev/registry/ (the boot gate's registry dump) and a logs folder

The report names mods and paths of this pack and is meant for the private repo: pass --out-dir.  This script
holds no pack data.

Everything here is STATIC evidence unless a line says otherwise.  A language key is not a registration, a class
that names BossEvent is not a boss, and a table no rule names may be assigned from code.  The report says which
findings a boot would settle.

Stdlib only; Python 3.11+.
"""
import argparse
import gzip
import json
import multiprocessing
import os
import re
import subprocess
import sys
import time
from collections import Counter, OrderedDict, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DEV = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, DEV)
import inventory as inv_mod  # noqa: E402
import packlists  # noqa: E402

KEY_BOSS_LISTS = ('0_lib_core.js BOSS_IDS', 'mob_scaling_unified.js BOSSES', 'boss_hp.js BOSS_HP',
                  'iridescent_difficulty excludes')
NOT_A_MOD_CONFIG = ('forge', 'fml', 'minecraft', 'defaultoptions', 'crash_assistant', 'paxi', 'kubejs', 'openloader',
                    'heracles', 'ftbquests', 'packwiz', 'icraft', 'iridescent')
HOOK_FLAGS = ('key-mappings', 'screen-init-hook', 'attribute-modification-event', 'damage-hook', 'spawn-hook',
              'loot-code', 'game-rule-register', 'trade-hook', 'boss-bar', 'ships-loot-modifiers',
              'tag-replace-in-shared-namespace', 'function-on-tick-tag', 'client-leaning', 'client-only-declared',
              'common-mixin-targets-client-class', 'mixin-config-not-declared')


def norm(s):
    return re.sub(r'[^a-z0-9]', '', str(s).lower())


def top_jar(pack_id):
    """'mod:a.jar!b.jar' -> 'a.jar'; 'vanilla' -> 'vanilla'"""
    if pack_id.startswith('mod:'):
        return pack_id[4:].split('!', 1)[0]
    return pack_id


def short(lst, n=6):
    lst = list(lst)
    return ', '.join(str(x) for x in lst[:n]) + (' ... (%d)' % len(lst) if len(lst) > n else '')


# --------------------------------------------------------------------------- inputs

def run_loot_audit(args):
    """Run audit_loot.py (it refreshes truth.json + harness.json in its cache) -> (truth, harness, findings)"""
    cache = inv_mod.scan_cache_dir(args.repo)
    fj = os.path.join(inv_mod.out_cache_dir(args.repo), 'loot_audit_findings.json')
    os.makedirs(os.path.dirname(fj), exist_ok=True)
    if not args.skip_loot_audit:
        cmd = [sys.executable, '-I', os.path.join(DEV, 'audit_loot.py'), '--mods', args.mods, '--repo', args.repo,
               '--summary', '--json', fj]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode not in (0, 1) or not os.path.isfile(fj):
            sys.stderr.write(r.stdout[-1500:] + r.stderr[-3000:])
            raise SystemExit('audit_loot.py failed (exit %s)' % r.returncode)
    out = []
    for name in ('truth.json', 'harness.json'):
        with open(os.path.join(cache, name), 'r', encoding='utf-8') as f:
            out.append(json.load(f))
    try:
        with open(fj, 'r', encoding='utf-8') as f:
            out.append(json.load(f))
    except (OSError, ValueError):
        out.append(None)
    return out


def force_skip_patterns(repo):
    """The launcher's server force-skip list (substring patterns), read from its source."""
    p = os.path.join(os.path.dirname(repo), 'iridescent-launcher', 'icraft-core', 'src', 'packwiz.rs')
    text = packlists.read_text(p)
    if text is None:
        return None
    m = re.search(r'FORCE_SKIP_PATTERNS[^=]*=\s*&\[(.*?)\];', text, re.S)
    if not m:
        return None
    return re.findall(r'"([^"]+)"', m.group(1))


def registered_mixin_configs(logs_dir):
    """`Registering mixin config: X` lines of debug.log and its rolled segments -> ({config: boots}, boots)"""
    if not logs_dir or not os.path.isdir(logs_dir):
        return None, 0
    files = sorted(f for f in os.listdir(logs_dir) if re.fullmatch(r'debug(-\d+)?\.log(\.gz)?', f))
    seen = Counter()
    boots = 0
    rx = re.compile(r'Registering mixin config: (\S+)')
    for f in files:
        p = os.path.join(logs_dir, f)
        try:
            fh = gzip.open(p, 'rt', encoding='utf-8', errors='replace') if f.endswith('.gz') else \
                open(p, 'r', encoding='utf-8', errors='replace')
        except OSError:
            continue
        got = set()
        with fh:
            for line in fh:
                if 'mixin config' in line:
                    m = rx.search(line)
                    if m:
                        got.add(m.group(1))
        if got:
            boots += 1
            seen.update(got)
    return (dict(seen) if boots else None), boots


# --------------------------------------------------------------------------- sections

def section_index(ctx):
    """Side labels, hashes, the server's effective mod set."""
    indexes, problems = ctx['indexes'], ctx['index_problems']
    inventory = ctx['inventory']
    out = OrderedDict()
    out['metafiles'] = dict((d, len(e)) for d, e in indexes.items())
    out['index_problems'] = problems
    labels = Counter()
    rows = {}
    for jar in sorted(set(inventory) | set(f for e in indexes.values() for f in e)):
        lab = tuple((indexes[d].get(jar) or {}).get('side', None) if jar in indexes[d] else '-'
                    for d in ('root', 'server', 'client'))
        rows[jar] = lab
        labels['root=%s server=%s client=%s' % tuple(repr(x) if x != '-' else 'absent' for x in lab)] += 1
    out['label_combinations'] = dict(labels.most_common())
    ctx['labels'] = rows
    skip = ctx['force_skip']
    server_set = []
    for jar, e in sorted(indexes['server'].items()):
        if e.get('side') == 'client':
            continue
        if skip and any(p.lower() in jar.lower() for p in skip):
            continue
        server_set.append(jar)
    out['server_effective_jars'] = len(server_set)
    out['server_force_skip_patterns'] = len(skip) if skip else None
    ctx['server_set'] = set(server_set)
    out['hashes'] = ctx['hashes']
    return out


def section_side(ctx):
    inventory = ctx['inventory']
    labels = ctx['labels']
    server_set = ctx['server_set']
    out = OrderedDict()

    def lab(jar):
        return dict(zip(('root', 'server', 'client'), labels.get(jar, ('-', '-', '-'))))

    lean, declared, quiet_client = [], [], []
    for jar, recs in inventory.items():
        top = recs[0]
        s = top['side']
        row = OrderedDict((('jar', jar), ('mods', [m.get('id') for m in top['identity']['mods']]),
                           ('reasons', s['reasons']), ('labels', lab(jar)), ('on_server', jar in server_set)))
        if s.get('declared') == 'client':
            declared.append(row)
        elif s.get('hint') == 'client':
            lean.append(row)
        elif labels.get(jar, ('-',) * 3)[1] in ('client', '-') and s['classes'] >= 5:
            row['classes_naming_client'] = '%d of %d' % (s['classes_naming_client_packages'], s['classes'])
            quiet_client.append(row)
    out['client_only_declared'] = declared
    out['client_leaning'] = lean
    out['client_leaning_on_server'] = [r for r in lean + declared if r['on_server']]
    out['kept_off_server_without_a_static_hint'] = quiet_client
    cm, mc = [], []
    for jar, recs in inventory.items():
        for r in recs:
            for cfg, mix, tgt in r['side'].get('common_mixins_into_client_classes', []):
                cm.append(OrderedDict((('jar', jar), ('archive', r['id'][4:]), ('config', cfg), ('mixin', mix),
                                       ('target', tgt), ('on_server', jar in server_set))))
            for m in r['side'].get('mod_classes', []):
                if m.get('client') and not m.get('dist_guard'):
                    mc.append(OrderedDict((('jar', jar), ('archive', r['id'][4:]), ('class', m['c']),
                                           ('on_server', jar in server_set))))
    out['common_mixins_into_client_classes'] = cm
    out['mod_class_names_client_without_guard'] = mc

    # nested jars
    nested = OrderedDict()
    n_arch = n_mods = 0
    ids = Counter()
    versions = defaultdict(set)
    bring = []
    for jar, recs in inventory.items():
        for r in recs[1:]:
            n_arch += 1
            mids = [m.get('id') for m in r['identity']['mods']]
            if mids:
                n_mods += 1
            for m in r['identity']['mods']:
                ids[m.get('id')] += 1
                versions[m.get('id')].add(str(m.get('version')))
            fl = [f for f in r['flags'] if f in HOOK_FLAGS]
            if fl:
                bring.append(OrderedDict((('parent', jar), ('nested', r['id'].split('!', 1)[1]), ('mods', mids),
                                          ('brings', fl), ('on_server', jar in server_set))))
    top_ids = set(m.get('id') for recs in inventory.values() for m in recs[0]['identity']['mods'])
    nested['archives'] = n_arch
    nested['parents'] = sum(1 for recs in inventory.values() if len(recs) > 1)
    nested['archives_that_are_mods'] = n_mods
    nested['distinct_mod_ids'] = len(ids)
    nested['mod_ids_also_installed_as_a_top_level_jar'] = sorted(i for i in ids if i in top_ids)
    nested['mod_ids_only_ever_nested'] = sorted(i for i in ids if i not in top_ids)
    nested['same_mod_nested_at_several_versions'] = dict(
        (i, sorted(v)) for i, v in sorted(versions.items()) if len(v) > 1)
    nested['most_nested'] = [[jar, len(recs) - 1] for jar, recs in
                             sorted(inventory.items(), key=lambda kv: -len(kv[1]))[:12] if len(recs) > 1]
    nested['what_nested_jars_bring'] = bring
    out['nested'] = nested

    fab = OrderedDict()
    fab['top_level_fabric_only'] = sorted(jar for jar, recs in inventory.items()
                                          if recs[0]['identity']['loader'].startswith('fabric'))
    fab['top_level_two_loader_jars'] = sorted(jar for jar, recs in inventory.items()
                                              if recs[0]['identity'].get('also_fabric_mod_json'))
    fab['nested_fabric_only'] = sorted(r['id'][4:] for recs in inventory.values() for r in recs[1:]
                                       if r['identity']['loader'].startswith('fabric'))
    out['fabric'] = fab

    # mixin declarations
    declared_anywhere = set()
    shipped_anywhere = set()
    for recs in inventory.values():
        for r in recs:
            for m in r['mixins']:
                if m.get('decl'):
                    declared_anywhere.add(m['cfg'])
                if not m.get('absent'):
                    shipped_anywhere.add(m['cfg'])
    reg = ctx.get('mixin_registered')
    und, absent, manifest_only, both = [], [], 0, 0
    configs = 0
    for jar, recs in inventory.items():
        for r in recs:
            for m in r['mixins']:
                if m.get('empty') or m.get('error'):
                    continue
                if m.get('absent'):
                    if m['cfg'] not in shipped_anywhere:
                        absent.append(OrderedDict((('jar', jar), ('archive', r['id'][4:]), ('config', m['cfg']))))
                    continue
                configs += 1
                n = sum(len(m.get(k, [])) for k in ('common', 'client', 'server'))
                if not m.get('decl'):
                    if n and m['cfg'] not in declared_anywhere and not m.get('decl_note'):
                        tg = sorted(set(t for v in m['targets'].values() for t in v))
                        low = m['cfg'].lower()
                        if len(m.get('missing', [])) >= n:
                            kind = 'names classes the jar does not ship'
                        elif 'fabric' in low or 'quilt' in low or any('/class_' in t for t in tg):
                            kind = 'leftover of another loader'
                        elif 'test' in low:
                            kind = 'test config'
                        else:
                            kind = 'DEAD: real mixins that never load'
                        row = OrderedDict((('jar', jar), ('archive', r['id'][4:]), ('config', m['cfg']),
                                           ('mixins', n), ('kind', kind), ('targets', tg[:8]),
                                           ('on_server', jar in ctx['server_set'])))
                        if reg is not None:
                            row['registered_in_server_boots'] = reg.get(m['cfg'], 0)
                        und.append(row)
                elif m['decl'] == ['manifest']:
                    manifest_only += 1
                elif 'mods.toml' in m['decl']:
                    both += 1
    mx = OrderedDict()
    mx['configs'] = configs
    mx['declared_in_manifest_only'] = manifest_only
    mx['declared_in_mods_toml'] = both
    mx['not_declared_anywhere'] = und
    mx['declared_but_shipped_by_no_jar'] = absent
    if reg is not None:
        mx['server_boots_read'] = ctx['mixin_boots']
        mx['configs_registered_on_server'] = len(reg)
        mo_reg = 0
        mo_not = []
        for jar, recs in inventory.items():
            if jar not in ctx['server_set']:
                continue
            for r in recs:
                for m in r['mixins']:
                    if m.get('decl') == ['manifest'] and not m.get('absent') and not m.get('empty') and not m.get('error'):
                        if reg.get(m['cfg']):
                            mo_reg += 1
                        else:
                            mo_not.append('%s (%s; common/client/server %d/%d/%d)' % (
                                m['cfg'], r['id'][4:], len(m.get('common', [])), len(m.get('client', [])), len(m.get('server', []))))
        mx['manifest_only_configs_on_server_registered'] = mo_reg
        mx['manifest_only_configs_on_server_not_registered'] = mo_not
    out['mixins'] = mx
    return out


def section_loot(ctx):
    truth, harness = ctx['truth'], ctx['harness']
    import audit_loot
    T = audit_loot.Truth(truth)
    packs = dict((p['id'], p) for p in truth.get('packs', []))
    mods = [m for m in harness['modifiers'] if m.get('registered')]
    all_tables = sorted(T.all_table_ids)
    table_rules = defaultdict(set)
    rx_cache = {}
    for m in mods:
        if m['kind'] != 'table':
            continue
        site = audit_loot.outer_site(m)
        for t in m['targets']:
            for kind, val in audit_loot.flat_targets(t):
                if kind == 'id':
                    hit = (val,)
                else:
                    if val not in rx_cache:
                        try:
                            rx = re.compile(val)
                            rx_cache[val] = [x for x in all_tables if rx.fullmatch(x)]
                        except re.error:
                            rx_cache[val] = []
                    hit = rx_cache[val]
                for x in hit:
                    table_rules[x].add(site)
    chest_global = 0
    dim_rules = Counter()
    for m in mods:
        if m['kind'] != 'type' or 'CHEST' not in [str(t) for t in m.get('types', [])]:
            continue
        gated = set()
        ungated = False
        for hnd, dims, chance, i in audit_loot.walk_handlers(m['handlers']):
            if dims is None:
                ungated = True
            else:
                gated.update(dims)
        if ungated:
            chest_global += 1
        for d in gated:
            dim_rules[d] += 1
    out = OrderedDict()
    out['rules'] = {'table_rules': sum(1 for m in mods if m['kind'] == 'table'),
                    'chest_type_rules_without_a_dimension_gate': chest_global,
                    'chest_type_rules_per_dimension': dict(sorted(dim_rules.items()))}
    rows = []
    for tid in sorted(T.tables):
        ev = (T.roots.get(tid) or {}).get('rolled_by', [])
        reach = [e for e in ev if (e.get('kind') == 'structure_nbt' and e.get('template_reachable') is True)
                 or (e.get('kind') == 'processor' and e.get('template_reachable') is not False)]
        if not reach:
            continue
        t = T.tables[tid]
        win = t.get('winner') or ''
        wk = (packs.get(win) or {}).get('kind')
        dims = sorted(T.table_dims(tid) or [])
        rows.append({'table': tid, 'winner': win, 'winner_kind': wk, 'dims': dims,
                     'kind': inv_mod.loot_kind(tid, t), 'table_rules': len(table_rules.get(tid, ())),
                     'pack_override': wk in ('paxi', 'kubejs_data'),
                     'dim_rules': sum(dim_rules.get(d, 0) for d in dims),
                     'items': len(t.get('items') or []),
                     'item_namespaces': sorted(set(i.split(':', 1)[0] for i in (t.get('items') or [])))[:12],
                     'valid': t.get('valid')})
    out['reachable_tables'] = len(rows)
    out['with_a_table_rule'] = sum(1 for r in rows if r['table_rules'])
    out['pack_override'] = sum(1 for r in rows if r['pack_override'])
    unt = [r for r in rows if not r['table_rules'] and not r['pack_override']]
    out['untouched'] = len(unt)
    out['untouched_no_dimension_rule_either'] = sum(1 for r in unt if r['dims'] and not r['dim_rules'])
    out['untouched_dimension_unknown'] = sum(1 for r in unt if not r['dims'])
    by_jar = defaultdict(list)
    for r in unt:
        by_jar[top_jar(r['winner'])].append(r)
    out['untouched_by_jar'] = OrderedDict(
        (jar, OrderedDict((('tables', len(v)), ('dims', sorted(set(d for r in v for d in r['dims']))),
                           ('no_dimension_rule', sum(1 for r in v if r['dims'] and not r['dim_rules'])),
                           ('dimension_unknown', sum(1 for r in v if not r['dims'])),
                           ('sample', [r['table'] for r in v[:6]]),
                           ('all', [r['table'] for r in v]))))
        for jar, v in sorted(by_jar.items(), key=lambda kv: (-len(kv[1]), kv[0])))
    ctx['untouched_by_jar'] = dict((jar, len(v)) for jar, v in by_jar.items())

    # forge loot modifiers
    glm = truth.get('forge_loot_modifiers') or {}
    items = truth.get('items') or {}
    tables = T.tables
    per_jar = defaultdict(list)
    for gid, g in sorted(glm.items()):
        strs = [s for s in g.get('strings', []) if s != g.get('type')]
        named_items = [s for s in strs if s in items][:5]
        named_tables = [s for s in (g.get('table_keys') or []) + strs if s in tables and s not in g.get('loot_table_ids', [])]
        on = g.get('loot_table_ids') or []
        if on:
            where = 'when the table is ' + short(on, 3)
        elif g.get('condition_types'):
            where = 'on any table passing ' + short([c.split(':', 1)[1] for c in g['condition_types']], 4)
        else:
            where = 'on EVERY table (no condition)'
        what = []
        if named_tables:
            what.append('rolls ' + short(sorted(set(named_tables)), 2))
        if named_items:
            what.append('names ' + short(named_items, 4))
        line = 'type %s; %s%s%s' % (g.get('type'), where, ('; ' + '; '.join(what)) if what else '',
                                    '' if g.get('active', True) else '; NOT in a global_loot_modifiers list (inactive)')
        per_jar[top_jar(g.get('pack', '?'))].append(OrderedDict((('id', gid), ('pack', g.get('pack')), ('does', line),
                                                                  ('active', g.get('active', True)))))
    lm = OrderedDict()
    lm['files'] = len(glm)
    lm['jars'] = len([j for j in per_jar if j not in ('kubejs_data',) and not j.startswith('paxi:')])
    lm['active'] = sum(1 for g in glm.values() if g.get('active', True))
    lm['unconditional'] = sum(1 for g in glm.values() if not g.get('loot_table_ids') and not g.get('condition_types'))
    lm['by_jar'] = OrderedDict((jar, v) for jar, v in sorted(per_jar.items(), key=lambda kv: (-len(kv[1]), kv[0])))
    lm['pack_global_list'] = (ctx.get('pack_glm_list') or 'not found')
    invy = ctx['inventory']
    lm['jars_with_a_global_loot_modifiers_list'] = sum(
        1 for recs in invy.values() if any(r['data'].get('global_loot_modifiers_json') for r in recs))
    lm['jars_with_modifier_files'] = sum(1 for recs in invy.values() if any(r['data']['loot_modifiers'] for r in recs))
    lm['modifier_files_in_jars'] = sum(len(r['data']['loot_modifiers']) for recs in invy.values() for r in recs)
    out['loot_modifiers'] = lm
    ctx['glm_by_jar'] = dict((jar, len(v)) for jar, v in per_jar.items())

    # vanilla table overrides
    ov = []
    ships_mc = []
    for jar, recs in ctx['inventory'].items():
        for r in recs:
            mc_tables = [t for k in r['data']['loot_tables'].values() for t in k if t.startswith('minecraft:')]
            if mc_tables:
                ships_mc.append(jar)
            for tid in r['data']['vanilla_overrides'].get('loot_tables', []):
                t = tables.get(tid) or {}
                ov.append(OrderedDict((('jar', jar), ('archive', r['id'][4:]), ('table', tid),
                                       ('winner', t.get('winner')),
                                       ('shipped_by', [s.get('pack') for s in t.get('sources', [])]),
                                       ('pack_rules', len(table_rules.get(tid, ()))))))
    out['vanilla_table_overrides'] = {'jars': len(set(o['jar'] for o in ov)), 'tables': len(ov),
                                      'jars_shipping_any_minecraft_table': len(set(ships_mc)), 'rows': ov}
    # tables the game's parser rejects (the loot audit's own finding)
    rej = [f for f in ((ctx.get('loot_findings') or {}).get('findings') or []) if f.get('code') == 'TABLE_REJECTED']
    out['rejected_tables'] = [OrderedDict((('key', f.get('key')), ('msg', f.get('msg')))) for f in rej]
    return out


def data_defined_ids(ctx, namespaces):
    """Ids a mod defines with a data file instead of a registry entry (Brutal Bosses: data/<ns>/bosses/<id>.json).
    -> {'ns:leaf': 'jar: data/ns/folder/...'} for the given namespaces, read from the jars' file lists."""
    import zipfile
    out = {}
    if not namespaces:
        return out
    for jar, recs in ctx['inventory'].items():
        if not any(ns in recs[0]['data']['namespaces'] for ns in namespaces):
            continue
        for base in (os.path.join(ctx['repo'], 'mods'), ctx['mods_dir']):
            p = os.path.join(base, jar)
            if os.path.isfile(p):
                break
        else:
            continue
        try:
            with zipfile.ZipFile(p) as zf:
                names = zf.namelist()
        except (OSError, zipfile.BadZipFile):
            continue
        for n in names:
            parts = n.split('/')
            if (len(parts) >= 4 and parts[0] == 'data' and parts[1] in namespaces and n.endswith('.json')
                    and parts[2] not in ('tags', 'loot_tables', 'advancements', 'recipes', 'lang')):
                out.setdefault(parts[1] + ':' + '/'.join(parts[3:])[:-5], '%s: %s' % (jar, n))
    return out


def section_rosters(ctx):
    inventory, truth = ctx['inventory'], ctx['truth']
    boss_lists, dim_lists = ctx['boss_lists'], ctx['dim_lists']
    mentions = ctx['mentions']
    registry = ctx.get('registry')
    out = OrderedDict()
    out['boss_lists'] = dict((k, len(v)) for k, v in boss_lists.items())
    known_entities = set(truth.get('entities') or {})
    reg_entities = (registry or {}).get('entities') or (registry or {}).get('entity_types')
    out['entity_evidence'] = 'registry dump (%d registered entity types)' % len(reg_entities) if reg_entities else \
        'static (language keys, loot tables, spawn eggs: %d ids)' % len(known_entities)
    owner = {}
    for jar, recs in inventory.items():
        for m in recs[0]['identity']['mods']:
            owner.setdefault(m.get('id'), jar)
    for jar, recs in inventory.items():
        for r in recs[1:]:
            for m in r['identity']['mods']:
                owner.setdefault(m.get('id'), jar)
    merged = {}
    weak_by_jar = Counter()
    for jar, recs in inventory.items():
        for r in recs:
            bl = r['code'].get('boss_like') or {}
            for e, info in bl.get('entities', {}).items():
                if info['strength'] != 'strong':
                    weak_by_jar[jar] += 1
                    continue
                ns = e.split(':', 1)[0]
                row = merged.get(e)
                if row is None:
                    row = merged[e] = OrderedDict((('entity', e), ('jar', 'vanilla' if ns == 'minecraft' else owner.get(ns, jar)),
                                                   ('evidence', [])))
                for ev in info['evidence']:
                    ev = ev if jar == row['jar'] else '%s (%s)' % (ev, jar)
                    if ev not in row['evidence']:
                        row['evidence'].append(ev)
    cands = []
    for e, row in merged.items():
        inl = [n for n, v in boss_lists.items() if e in v]
        row['in_lists'] = inl
        row['missing_from_key_lists'] = [n for n in KEY_BOSS_LISTS if n in boss_lists and e not in boss_lists[n]]
        row['missing_from_script_lists'] = [n for n in KEY_BOSS_LISTS[:3] if n in boss_lists and e not in boss_lists[n]]
        row['files_naming_it'] = len(mentions.files_for(e))
        if reg_entities:
            row['registered'] = e in reg_entities
            info2 = reg_entities.get(e)
            if isinstance(info2, dict) and info2.get('category'):
                row['category'] = info2['category']
        cands.append(row)
    cands.sort(key=lambda r: (len(r['in_lists']), r['entity']))
    out['boss_like_strong'] = len(cands)
    out['boss_like_in_no_list'] = [r for r in cands if not r['in_lists']]
    out['boss_like_in_some_lists_only'] = [r for r in cands if r['in_lists'] and r['missing_from_key_lists']]
    out['boss_like_in_every_key_list'] = [r['entity'] for r in cands if r['in_lists'] and not r['missing_from_key_lists']]
    out['boss_like_weak_by_jar'] = dict(weak_by_jar.most_common())
    out['boss_like_not_a_boss_for_the_scripts'] = [r for r in cands if r['in_lists'] and r['missing_from_script_lists']]
    ctx['boss_gaps_by_jar'] = Counter(r['jar'] for r in cands if r['in_lists'] and r['missing_from_script_lists'])
    # the difficulty mod's exclude list against the scripts' own boss lists
    script_bosses = set()
    for n in KEY_BOSS_LISTS[:3]:
        script_bosses |= boss_lists.get(n, set())
    excl = boss_lists.get('iridescent_difficulty excludes', set())
    out['script_bosses_not_excluded_from_the_difficulty_curve'] = sorted(script_bosses - excl)
    out['excluded_from_the_difficulty_curve_not_a_script_boss'] = sorted(excl - script_bosses)
    # list entries that name nothing
    ref = set(reg_entities) if reg_entities else known_entities
    data_ids = {} if reg_entities else data_defined_ids(
        ctx, set(e.split(':', 1)[0] for ids in boss_lists.values() for e in ids if e not in ref))
    phantom = []
    data_defined = []
    ref_ns = set(k.split(':', 1)[0] for k in ref)
    for name, ids in boss_lists.items():
        for e in sorted(ids):
            if e in data_ids:
                data_defined.append(OrderedDict((('list', name), ('id', e), ('defined_by', data_ids[e]))))
                continue
            if e not in ref:
                near = sorted(k for k in ref if k.split(':', 1)[0] == e.split(':', 1)[0]
                              and (norm(e.split(':', 1)[1]) in norm(k) or norm(k.split(':', 1)[1]) in norm(e)))[:3]
                phantom.append(OrderedDict((('list', name), ('id', e),
                                            ('mod_installed', e.split(':', 1)[0] in (truth.get('mods') or {}) or e.startswith('minecraft:')),
                                            ('namespace_has_entities', e.split(':', 1)[0] in ref_ns),
                                            ('closest_known', near))))
    out['list_entries_no_evidence'] = phantom
    out['list_entries_defined_by_a_data_file'] = data_defined
    in_all = set.union(*boss_lists.values()) if boss_lists else set()
    out['disagreements'] = OrderedDict()
    for a in KEY_BOSS_LISTS[:3]:
        for b in KEY_BOSS_LISTS[:3]:
            if a < b and a in boss_lists and b in boss_lists:
                out['disagreements']['in %s, not in %s' % (a, b)] = sorted(boss_lists[a] - boss_lists[b])
                out['disagreements']['in %s, not in %s' % (b, a)] = sorted(boss_lists[b] - boss_lists[a])
    out['distinct_ids_over_all_boss_lists'] = len(in_all)

    # dimensions
    shipped = OrderedDict()
    for did, d in sorted((truth.get('dimensions') or {}).items()):
        shipped[did] = top_jar(d.get('pack', '?').replace(' world_preset/normal', ''))
    reg_dims = (registry or {}).get('dimensions')
    drows = []
    for did, jar in shipped.items():
        tiers = dict((n, v[did]) for n, v in dim_lists.items() if did in v)
        tset = set(t for t in tiers.values() if t is not None)
        drows.append(OrderedDict((('dimension', did), ('jar', jar), ('listed_in', sorted(tiers)),
                                  ('missing_from', [n for n in dim_lists if did not in dim_lists[n]
                                                    and not (did == 'minecraft:overworld' and n.startswith('stage gates'))]),
                                  ('tiers', sorted(tset)), ('tier_conflict', len(tset) > 1),
                                  ('files_naming_it', len(mentions.files_for(did))))))
    out['dimensions_shipped'] = len(drows)
    out['dimension_lists'] = dict((k, len(v)) for k, v in dim_lists.items())
    out['dimensions_in_no_list'] = [r for r in drows if not r['listed_in']]
    out['dimensions_missing_from_a_list'] = [r for r in drows if r['listed_in'] and r['missing_from']]
    out['dimensions_tier_conflict'] = [r for r in drows if r['tier_conflict']]
    out['dimensions_in_every_list'] = [r['dimension'] for r in drows if not r['missing_from']]
    ref_d = set(reg_dims) if reg_dims else set(shipped)
    out['list_entries_that_are_no_dimension'] = [
        OrderedDict((('list', n), ('id', d))) for n, v in dim_lists.items() for d in sorted(v) if d not in ref_d]
    ctx['dim_gaps_by_jar'] = Counter(r['jar'] for r in drows if r['missing_from'])
    out['dimension_evidence'] = 'registry dump' if reg_dims else 'static (data/<ns>/dimension files, vanilla world preset)'
    return out


def section_shared(ctx):
    inventory = ctx['inventory']
    out = OrderedDict()
    rep, tick, load, ov_rec, ov_adv, ov_wg, alien, foreign = [], [], [], [], [], [], [], Counter()
    for jar, recs in inventory.items():
        for r in recs:
            arch = r['id'][4:]
            sh = r['data']['tags_into_shared_namespaces']
            for ns in ('minecraft', 'forge', 'c', 'other'):
                for reg, tid, replace, n in sh[ns]:
                    if replace:
                        rep.append(OrderedDict((('jar', jar), ('archive', arch), ('registry', reg), ('tag', tid),
                                                ('values', n))))
                    if ns == 'other':
                        foreign[(jar, tid.split(':', 1)[0])] += 1
            f = r['data']['functions']
            if f['on_tick_tag']:
                tick.append(OrderedDict((('jar', jar), ('archive', arch), ('functions', f['on_tick_tag']),
                                         ('replace', f['tick_tag_replace']), ('functions_shipped', len(f['ids'])))))
            if f['on_load_tag']:
                load.append(OrderedDict((('jar', jar), ('archive', arch), ('functions', f['on_load_tag']),
                                         ('replace', f['load_tag_replace']))))
            vo = r['data']['vanilla_overrides']
            for key, dst in (('recipes', ov_rec), ('advancements', ov_adv), ('worldgen', ov_wg)):
                if vo.get(key):
                    dst.append(OrderedDict((('jar', jar), ('archive', arch), ('n', len(vo[key])), ('ids', vo[key]))))
            al = r['data'].get('namespaces_no_installed_mod_has') or []
            heavy = []
            for ns in al:
                lt = sum(1 for k in r['data']['loot_tables'].values() for t in k if t.startswith(ns + ':'))
                st = sum(1 for t in r['data']['templates']['ids'] if t.startswith(ns + ':'))
                if lt or st:
                    heavy.append({'namespace': ns, 'loot_tables': lt, 'templates': st})
            if heavy:
                alien.append(OrderedDict((('jar', jar), ('archive', arch),
                                          ('mods', [m.get('id') for m in r['identity']['mods']]), ('namespaces', heavy))))
    out['tags_replace_true'] = rep
    out['functions_on_tick_tag'] = tick
    out['functions_on_load_tag'] = load
    out['vanilla_recipe_overrides'] = ov_rec
    out['vanilla_advancement_overrides'] = ov_adv
    out['vanilla_worldgen_overrides'] = ov_wg
    out['loot_or_structures_under_a_namespace_that_is_no_mod_id'] = alien
    top = Counter()
    for (jar, ns), n in foreign.items():
        top[jar] += n
    out['tags_into_other_mods_namespaces'] = {'jars': len(top), 'tags': sum(top.values()),
                                              'most': [[j, n] for j, n in top.most_common(10)]}
    return out


def section_dead(ctx):
    inventory, truth = ctx['inventory'], ctx['truth']
    out = OrderedDict()
    dead = []
    for jar, recs in inventory.items():
        for r in recs:
            d = r['data']['folders_1_21_layout']
            if d:
                gone = [k for k, v in d.items() if v['twin'] and not v['has_1_20_twin']]
                dead.append(OrderedDict((('jar', jar), ('archive', r['id'][4:]),
                                         ('folders', OrderedDict((k, v['files']) for k, v in d.items())),
                                         ('without_1_20_twin', gone),
                                         ('other_version_registries', [k for k, v in d.items() if not v['twin']]),
                                         ('sample', d[gone[0]]['sample'] if gone else next(iter(d.values()))['sample']))))
    out['folders_1_21_layout'] = dead
    out['folders_1_21_layout_jars'] = len(set(d['jar'] for d in dead))
    out['folders_1_21_layout_files'] = sum(sum(d['folders'].values()) for d in dead)
    # boss tags that live only in a 1.21 folder
    btag = []
    for jar, recs in inventory.items():
        for r in recs:
            bl = r['code'].get('boss_like') or {}
            for e, info in bl.get('entities', {}).items():
                ev = info['evidence']
                if any('1.21 folder' in x for x in ev) and not any(x.startswith('in #') and '1.21 folder' not in x for x in ev):
                    btag.append(OrderedDict((('jar', jar), ('entity', e))))
    out['boss_tag_only_in_a_1_21_folder'] = btag
    # loot tables naming ids with no static evidence
    items = truth.get('items') or {}
    mods = set(truth.get('mods') or {})
    packs = dict((p['id'], p) for p in truth.get('packs', []))
    bad = defaultdict(lambda: {'tables': 0, 'absent_mod_tables': 0, 'ids': Counter(), 'absent_mods': Counter()})
    n_tables = n_absent = 0
    for tid, t in (truth.get('loot_tables') or {}).items():
        if not t.get('valid'):
            continue
        wk = (packs.get(t.get('winner')) or {}).get('kind')
        if wk != 'mod':
            continue
        unknown = [i for i in (t.get('items') or []) if i not in items]
        if not unknown:
            continue
        if t.get('forge_conditions'):
            continue        # a load condition usually guards exactly this
        e = bad[top_jar(t['winner'])]
        e['tables'] += 1
        n_tables += 1
        absent = [i for i in unknown if i.split(':', 1)[0] not in mods and not i.startswith('minecraft:')]
        if absent:
            e['absent_mod_tables'] += 1
            n_absent += 1
            for i in absent:
                e['absent_mods'][i.split(':', 1)[0]] += 1
        for i in unknown:
            e['ids'][i] += 1
    out['tables_naming_unknown_items'] = {
        'tables': n_tables, 'of_which_name_a_mod_that_is_not_installed': n_absent,
        'by_jar': OrderedDict((jar, OrderedDict((('tables', e['tables']),
                                                ('naming_absent_mods', e['absent_mod_tables']),
                                                ('absent_mods', dict(e['absent_mods'].most_common(6))),
                                                ('sample_ids', [i for i, _ in e['ids'].most_common(5)]))))
                              for jar, e in sorted(bad.items(), key=lambda kv: (-kv[1]['absent_mod_tables'], -kv[1]['tables'])))}
    notes = truth.get('notes') or {}
    out['truth_notes'] = dict((k, notes[k]['count']) for k in ('structure_set_references_missing_structure',
                                                               'litho_missing_pool', 'rs_pool_additions',
                                                               'glm_listed_without_file', 'forge_condition_unknown',
                                                               'tag_replace_in_mod_tier', 'nested_jar_not_scanned')
                              if k in notes)
    out['glm_listed_without_file'] = (notes.get('glm_listed_without_file') or {}).get('items', [])
    return out


def section_config(ctx):
    inventory = ctx['inventory']
    tracked = ctx['tracked_configs']
    out = OrderedDict()
    names = dict((d, [(p, norm(p.split('/', 1)[1])) for p in sorted(v)]) for d, v in tracked.items())
    out['tracked_files'] = dict((d, len(v)) for d, v in tracked.items())

    def tracked_for(mid):
        n = norm(mid)
        if len(n) < 3:
            return {}
        return dict((d, sum(1 for p, np in v if n in np)) for d, v in names.items())

    none, partial = [], []
    for jar, recs in inventory.items():
        top = recs[0]
        ids = [m.get('id') for m in top['identity']['mods'] if m.get('id')]
        if not ids:
            continue
        has_spec = 'config_spec' in top['code']['hints'] or bool(top['code'].get('config_types'))
        got = Counter()
        for mid in ids + [os.path.splitext(jar)[0].split('-')[0]]:
            for d, n in tracked_for(mid).items():
                got[d] += n
        row = OrderedDict((('jar', jar), ('mods', ids), ('config_types', top['code'].get('config_types', [])),
                           ('tracked', dict(got))))
        if has_spec and not any(got.values()):
            none.append(row)
        elif has_spec and (not got.get('server') or not got.get('client') or not got.get('root')) and any(got.values()):
            partial.append(row)
    out['mods_with_a_config_spec'] = sum(1 for recs in inventory.values()
                                         if 'config_spec' in recs[0]['code']['hints'] or recs[0]['code'].get('config_types'))
    out['with_a_config_spec_and_no_tracked_config'] = none
    out['tracked_in_some_distros_only'] = partial
    # tracked configs whose name matches no installed mod (by name only)
    keys = set()
    for jar, recs in inventory.items():
        keys.add(norm(os.path.splitext(jar)[0]))
        for r in recs:
            for m in r['identity']['mods']:
                if m.get('id'):
                    keys.add(norm(m['id']))
                if m.get('name'):
                    keys.add(norm(m['name']))
    keys = set(k for k in keys if len(k) >= 3)
    orphans = []
    maybe = []
    seen = set()
    for p in sorted(tracked.get('root', ())):
        parts = p.split('/')
        if parts[0] != 'config' or len(parts) < 2:
            continue
        entry = parts[1]
        if entry in seen:
            continue
        seen.add(entry)
        stem = re.sub(r'\.(toml|json5?|cfg|txt|properties|ya?ml|snbt|conf|ini)$', '', entry)
        stem = re.sub(r'[-_.](common|client|server|forge|config|options|settings|general|main)$', '', stem)
        n = norm(stem)
        if len(n) < 3 or any(n.startswith(x) for x in NOT_A_MOD_CONFIG):
            continue
        if any(n in k or k in n for k in keys):
            continue
        row = OrderedDict((('entry', 'config/' + entry),
                           ('files', sum(1 for q in tracked['root'] if q.startswith('config/' + entry))),
                           ('in_distros', [d for d in tracked if any(q == 'config/' + entry or q.startswith('config/' + entry + '/') for q in tracked[d])])))
        if any(k[:6] == n[:6] for k in keys if len(k) >= 6):
            maybe.append(row)
        else:
            orphans.append(row)
    out['tracked_config_matching_no_installed_mod'] = orphans
    out['tracked_config_sharing_only_a_name_prefix_with_a_mod'] = maybe
    return out


def review_list(ctx, sections):
    """Thirty mods with the most unreviewed surfaces, each with the three things to decide first."""
    inventory = ctx['inventory']
    mentions = ctx['mentions']
    side, loot, rosters, shared, dead, config = (sections[k] for k in ('side', 'loot', 'rosters', 'shared', 'dead', 'config'))
    und = Counter(r['jar'] for r in side['mixins']['not_declared_anywhere'] if r['kind'].startswith('DEAD'))
    lean_srv = set(r['jar'] for r in side['client_leaning'] if r['on_server'])
    decl_srv = set(r['jar'] for r in side['client_only_declared'] if r['on_server'])
    cm_srv = Counter(r['jar'] for r in side['common_mixins_into_client_classes'] if r['on_server'])
    nested_bring = defaultdict(list)
    for r in side['nested']['what_nested_jars_bring']:
        nested_bring[r['parent']].append(r)
    rep = Counter(r['jar'] for r in shared['tags_replace_true'])
    tick = Counter(r['jar'] for r in shared['functions_on_tick_tag'])
    ov_loot = Counter(r['jar'] for r in loot['vanilla_table_overrides']['rows'])
    ov_rec = dict((r['jar'], r['n']) for r in shared['vanilla_recipe_overrides'])
    alien = set(r['jar'] for r in shared['loot_or_structures_under_a_namespace_that_is_no_mod_id'])
    dead_no_twin = set(d['jar'] for d in dead['folders_1_21_layout'] if d['without_1_20_twin'])
    no_cfg = set(r['jar'] for r in config['with_a_config_spec_and_no_tracked_config'])
    boss_no = Counter(r['jar'] for r in rosters['boss_like_in_no_list'])
    boss_some = Counter(r['jar'] for r in rosters['boss_like_not_a_boss_for_the_scripts'])
    dim_gap = ctx.get('dim_gaps_by_jar', {})
    unt = ctx.get('untouched_by_jar', {})
    glm = ctx.get('glm_by_jar', {})
    absent_tables = dict((jar, e['naming_absent_mods']) for jar, e in dead['tables_naming_unknown_items']['by_jar'].items())
    rows = []
    for jar, recs in inventory.items():
        top = recs[0]
        ids = [m.get('id') for m in top['identity']['mods'] if m.get('id')]
        spaces = set(ids)
        for r in recs:
            spaces.update(r['data'].get('namespaces_no_installed_mod_has') or [])
        named = len(set(f for ns in spaces for f in mentions.namespace_files(ns)))
        s = []            # (weight, surface, decision)
        if und.get(jar):
            s.append((9, 'mixin config never declared (%d)' % und[jar],
                      'its mixins do not load: is the feature they carry wanted (fix the jar) or is the mod dead weight'))
        if jar in decl_srv:
            s.append((6, 'declares itself client-only, delivered to the server',
                      'client label in the index: the server does not load it (or ignores the declaration)'))
        elif jar in lean_srv:
            s.append((3, 'leans client-only (%s), delivered to the server' % '; '.join(top['side']['reasons'][:1]),
                      'client-only or both: a library other mods need on the server stays, a pure client mod moves out'))
        if cm_srv.get(jar):
            s.append((5, 'common-listed mixin into a client class (%d), on the server' % cm_srv[jar],
                      'does the dedicated server skip that mixin cleanly (boot log), or does the jar need a client label'))
        if boss_no.get(jar):
            s.append((8, 'boss-like entities in NO boss list (%d)' % boss_no[jar],
                      'boss, miniboss or mob for each; today they scale as trash mobs'))
        if boss_some.get(jar):
            s.append((6, 'boss-like entities on a kill roster that scaling treats as trash mobs (%d)' % boss_some[jar],
                      'designed health and the x3 exemption for each (BOSS_IDS, BOSSES, boss_hp.js)'))
        if dim_gap.get(jar):
            s.append((8, 'dimensions missing from a tier list (%d)' % dim_gap[jar],
                      'the tier of each dimension, then the same id into every list'))
        n = unt.get(jar, 0)
        if n:
            s.append((min(8, 3 + n // 8), 'generated chest / archaeology tables no rule names (%d)' % n,
                      'what its structures\' chests should roll, and in which tier'))
        if glm.get(jar):
            s.append((min(7, 3 + glm[jar] // 5), 'loot modifiers it ships (%d), all active' % glm[jar],
                      'keep, retarget or switch off each loot modifier'))
        if ov_loot.get(jar):
            s.append((6, 'overrides vanilla loot tables (%d)' % ov_loot[jar],
                      'is each vanilla-table override wanted next to the pack\'s own rules'))
        if absent_tables.get(jar):
            s.append((5, 'loot tables naming items of a mod that is not installed (%d)' % absent_tables[jar],
                      'the game drops such a table whole: supply the table, or accept the empty chests'))
        if rep.get(jar):
            s.append((6, 'replace:true on shared tags (%d)' % rep[jar], 'is each replace wanted (it wipes other mods\' entries)'))
        if tick.get(jar):
            s.append((5, 'functions on the tick tag', 'is a per-tick function acceptable'))
        if ov_rec.get(jar):
            s.append((4, 'overrides vanilla recipes (%d)' % ov_rec[jar], 'is each vanilla recipe change wanted'))
        if nested_bring.get(jar):
            what = sorted(set(f for r in nested_bring[jar] for f in r['brings']))
            s.append((min(6, 2 + len(nested_bring[jar])), 'nested mods the index cannot see (%d) bring: %s'
                      % (len(nested_bring[jar]), ', '.join(what)),
                      'is each nested mod\'s behaviour wanted (hooks, keys, screens, loot code)'))
        if jar in alien:
            s.append((4, 'loot or structures under a namespace that is not its mod id',
                      'check every rule keyed on the mod id: it misses those tables'))
        if jar in dead_no_twin:
            s.append((3, '1.21-layout data with no 1.20.1 twin', 'does the pack need to supply what those files meant to add'))
        for flag, w, text, dec in (
                ('attribute-modification-event', 4, 'changes attributes of existing entities', 'does it stack with the pack\'s scaling'),
                ('spawn-hook', 3, 'hooks mob spawning', 'does it stack with the pack\'s spawn gates and buffs'),
                ('game-rule-register', 2, 'registers game rules', 'the value of each rule and its line in the defaults file'),
                ('trade-hook', 3, 'adds villager / wanderer trades', 'are its trades inside the tier economy'),
                ('screen-init-hook', 2, 'adds widgets to screens', 'is the button / tab wanted, and where')):
            if flag in top['flags']:
                s.append((w, text, dec))
        content = top['counts'].get('lang_items', 0) + top['counts'].get('lang_entities', 0) + \
            sum(top['counts'].get(k, 0) for k in ('loot_chests', 'structures', 'recipes'))
        if not named and content >= 20:
            s.append((5, 'no script or config of the pack names this mod (%d items, %d entities, %d recipes)'
                      % (top['counts'].get('lang_items', 0), top['counts'].get('lang_entities', 0), top['counts'].get('recipes', 0)),
                      'tier of its items and recipes: nothing gates them today'))
        if jar in no_cfg:
            s.append((2, 'has a config, none tracked in any distro', 'which values the pack sets and tracks'))
        if not s:
            continue
        s.sort(key=lambda x: -x[0])
        rows.append(OrderedDict((('jar', jar), ('mods', ids), ('score', sum(w for w, _, _ in s)),
                                 ('surfaces', len(s)), ('pack_files_naming_it', named),
                                 ('decide_first', [d for _, _, d in s[:3]]),
                                 ('unreviewed', [t for _, t, _ in s]))))
    rows.sort(key=lambda r: (-r['score'], -r['surfaces'], r['jar']))
    return rows


# --------------------------------------------------------------------------- report

def md_table(headers, rows):
    out = ['| ' + ' | '.join(headers) + ' |', '|' + '|'.join('---' for _ in headers) + '|']
    for r in rows:
        out.append('| ' + ' | '.join(str(c).replace('|', '\\|').replace('\n', ' ') for c in r) + ' |')
    return out


def live_defects(ctx, S):
    """Findings that look broken NOW (not merely unreviewed), strongest evidence first.  Each has a `kind`:
    defect (the evidence says it is broken), ruling (it looks wrong, and only the operator can say), known."""
    out = []

    def add(kind, title, evidence, detail, items):
        out.append(OrderedDict((('kind', kind), ('title', title), ('evidence', evidence), ('detail', detail),
                                ('items', items))))

    mx = S['side']['mixins']
    reg = ctx.get('mixin_registered')
    dead = [r for r in mx['not_declared_anywhere'] if r['kind'].startswith('DEAD')]
    if dead:
        conf = ''
        if reg is not None:
            conf = ' The server registered %d mixin configs at each of its last %d boots, and none of these.' % (
                mx['configs_registered_on_server'], ctx['mixin_boots'])
        add('defect', '%d mixin configs with real mixins are declared nowhere: those mixins never load' % len(dead),
            'static' + (' + the server\'s debug.log' if reg is not None else ''),
            'A Forge jar names its mixin configs in its manifest (MixinConfigs) or in mods.toml. These jars ship a config '
            'with mixins, name it in neither and have no MixinConnector class.' + conf,
            ['%s: %s, %d mixin(s) into %s%s' % (r['jar'], r['config'], r['mixins'],
                                                short([t.rsplit('/', 1)[-1] for t in r['targets']], 4),
                                                ' (on the server)' if r['on_server'] else '') for r in dead])
    h = ctx['hashes']
    if h['mismatch']:
        add('defect', '%d instance jars do not match the hash in their metafile' % len(set(m['jar'] for m in h['mismatch'])),
            'hashed', 'The jar on disk is not the file the index describes.',
            ['%s: %s index (%s) says %s..., the jar is %s...' % (m['jar'], m['index'], m['metafile'], m['index_hash'][:12], m['jar_hash'][:12])
             for m in h['mismatch']])
    ros = S['rosters']
    ph = [p for p in ros['list_entries_no_evidence'] if p['list'] == 'iridescent_difficulty excludes']
    if ph:
        add('defect', '%d entries of the difficulty mod\'s exclude list name no entity' % len(ph), ros['entity_evidence'],
            'The exclude list is the only boss exemption of the difficulty curve and it matches ids exactly. An entry '
            'that names nothing exempts nothing: the boss it was written for is scaled like any hostile mob.',
            ['%s%s' % (p['id'], (' (closest known id: %s)' % ', '.join(p['closest_known'])) if p['closest_known'] else
                       ('' if p['mod_installed'] else ' (that mod is not installed)')) for p in ph])
    ne = ros['script_bosses_not_excluded_from_the_difficulty_curve']
    if ne:
        add('ruling', '%d ids the scripts treat as bosses are not on the difficulty mod\'s exclude list' % len(ne),
            'the pack\'s own lists',
            'The scripts give these a designed health (boss_hp.js) or exempt them from the x3 (BOSS_IDS / BOSSES). The '
            'difficulty mod exempts only what its list names, so it scales them with the dimension curve on top. '
            'Intended for some, an omission for others: the list was written when the roster was 23 long.', [short(ne, 80)])
    drows = ros['dimensions_in_no_list'] + ros['dimensions_missing_from_a_list']
    miss = [r for r in drows if r['tiers'] and max(r['tiers']) > 1 and r['missing_from']]
    if miss:
        add('defect', '%d dimensions carry a tier in one list and are missing from others' % len(miss),
            'static (dimension files) + the pack\'s lists',
            'A list that does not name a dimension treats it as tier 1 (difficulty curve, affix and gem rarities) or '
            'does not gate it at all (stage gate).',
            ['%s: tier %s in %s; missing from %s' % (r['dimension'], '/'.join(str(t) for t in r['tiers']),
                                                     short([m.split(' (')[0] for m in r['listed_in']], 3),
                                                     short([m.split(' (')[0].replace('Apotheosis ', '') for m in r['missing_from']], 6))
             for r in miss])
    none = ros['dimensions_in_no_list']
    if none:
        add('ruling', '%d shipped dimensions are in no list at all' % len(none), 'static (dimension files)',
            'Enterable at tier 1, tier-1 difficulty and loot. Orbits and pocket dimensions may be meant to be; nobody has said so.',
            [short(['%s (%s)' % (r['dimension'], r['jar']) for r in none], 40)])
    nd = ros['list_entries_that_are_no_dimension']
    if nd:
        add('known', '%d dimension-list entries name a dimension no jar ships' % len(nd), ros['dimension_evidence'],
            'A gate or a rule keyed on an id that is not a dimension never applies (ruled 2026-10-11 for deep_aether:the_aether; the entries are still there).',
            ['%s in %s' % (r['id'], r['list']) for r in nd])
    other = [p for p in ros['list_entries_no_evidence'] if p['list'] != 'iridescent_difficulty excludes']
    if other:
        byl = defaultdict(list)
        for p in other:
            byl[p['list']].append(p['id'] + (' (mod not installed)' if not p['mod_installed'] else
                                             ('' if p['namespace_has_entities'] else ' (pseudo-id?)')))
        add('defect', '%d entries of the script boss lists name no known entity' % len(other), ros['entity_evidence'],
            'No language key, loot table or spawn egg of any installed jar carries these ids, and no data file defines '
            'them. A dead entry gives no health override, no exemption and no roster credit; in a percentage roster it '
            'is a kill nobody can make. "(pseudo-id?)" = the mod is installed and has no entity type at all under '
            'that namespace (a datapack mod): the entry is alive only if the script that reads the list maps the id itself.',
            ['%s: %s' % (k, short(v, 14)) for k, v in sorted(byl.items())])
    nob = ros['boss_like_in_no_list']
    if nob:
        add('ruling', '%d boss-like entities are in no boss list' % len(nob),
            'static: a boss bar in the entity\'s own class, or a bosses tag',
            'For every script and for the difficulty mod they are plain hostile mobs: x3 health, the dimension curve, no '
            'designed health, no tokens. Some are parts, phases or clones of a listed boss and may be right as they are.',
            ['%s (%s): %s' % (r['entity'], r['jar'], r['evidence'][0]) for r in nob])
    nsb = ros['boss_like_not_a_boss_for_the_scripts']
    if nsb:
        add('ruling', '%d boss-like entities are on a kill roster but not a boss for the scaling scripts' % len(nsb),
            'static + the pack\'s lists',
            'They count for the Codex or the boss rush, and scaling treats them as trash mobs (no designed health, the x3 applies).',
            [short(['%s' % r['entity'] for r in nsb], 60)])
    bt = S['dead']['boss_tag_only_in_a_1_21_folder']
    if bt:
        add('defect', '%d bosses are tagged as bosses only in a 1.21-layout folder the game never reads' % len(bt), 'static',
            'Anything that asks #forge:bosses (other mods\' boss checks, tag tests in scripts) does not see them.',
            ['%s (%s)' % (r['entity'], r['jar']) for r in bt])
    dd = [d for d in S['dead']['folders_1_21_layout'] if d['without_1_20_twin']]
    if dd:
        add('defect', '%d jars ship loot tables, recipes or tags only in a 1.21-layout folder: that content does not exist in game' % len(dd), 'static',
            'The 1.20.1 game reads loot_tables/, recipes/, advancements/, tags/items/; it never opens loot_table/, recipe/, '
            'advancement/, tags/item/. (Folders such as painting_variant or jukebox_song are registries 1.20.1 fills from '
            'code: data for another game version, not counted here.)',
            ['%s: %s (e.g. %s)' % (d['archive'], ', '.join('%s x%d' % (k, d['folders'][k]) for k in d['without_1_20_twin']), d['sample']) for d in dd])
    tu = S['dead']['tables_naming_unknown_items']
    if tu['of_which_name_a_mod_that_is_not_installed'] or S['loot']['rejected_tables']:
        add('known', '%d loot tables were rejected at the server\'s last boot; %d mod tables name items of a mod that is not installed'
            % (len(S['loot']['rejected_tables']), tu['of_which_name_a_mod_that_is_not_installed']),
            'the server\'s boot log (through the loot audit) + static',
            'The parser drops a table whole when one id is unknown. The loot audit already lists these as accepted findings.',
            ['%s: %d tables (%s)' % (jar, e['naming_absent_mods'], short(['%s x%d' % kv for kv in e['absent_mods'].items()], 4))
             for jar, e in tu['by_jar'].items() if e['naming_absent_mods']][:15])
    ip = sorted(set(p for d, ps in ctx['index_problems'].items() for p in ps))
    nh = sorted(set('%s (%s index)' % (u['jar'], u['index']) for u in h['unverifiable']))
    if ip or nh:
        add('known', '%d problems reading the mod indexes, %d entries with no usable hash' % (len(ip), len(nh)), 'parsed',
            'Index integrity is package M1; listed because the audit trips on them.', ip + ['no hash to check: ' + short(nh, 20)] if nh else ip)
    return out


def write_report(path, ctx, S, defects, review, meta):
    L = []
    w = L.append
    inv_n = len(ctx['inventory'])
    arch = sum(len(v) for v in ctx['inventory'].values())
    side, loot, ros, sh, dead, cfg, idx = (S[k] for k in ('side', 'loot', 'rosters', 'shared', 'dead', 'config', 'index'))
    w('# Pack audit against the per-jar inventory (%s)' % meta['date'])
    w('')
    w('<!-- INTERNAL ONLY. Generated by .minecraft/dev/mods/pack_audit.py; the machine-readable copy is %s. -->' % meta['json_name'])
    w('')
    w('Pack `%s`, %d jars (%d archives with nested jars), scanner v%s. Evidence is static unless a line says otherwise: '
      'see "What the static evidence cannot tell" at the end.' % (meta['head'], inv_n, arch, meta['scanner_version']))
    w('')
    w('Registry dump: %s. Server logs: %s.' % (meta['registry_dump'], meta['logs']))
    w('')
    w('## Headline numbers')
    w('')
    hl = meta['headline']
    for k, v in hl.items():
        w('- %s: **%s**' % (k, v))
    w('')
    w('## Findings that look like live defects')
    w('')
    w('DEFECT = the evidence says it is broken now. NEEDS A RULING = it looks wrong and only the operator can say. KNOWN = already on record, repeated because it is still there.')
    w('')
    if not defects:
        w('None.')
    kinds = {'defect': 'DEFECT', 'ruling': 'NEEDS A RULING', 'known': 'KNOWN'}
    for i, d in enumerate(defects, 1):
        w('### %d. [%s] %s' % (i, kinds.get(d['kind'], d['kind']), d['title']))
        w('')
        w('Evidence: %s. %s' % (d['evidence'], d['detail']))
        w('')
        for it in d['items']:
            w('- %s' % it)
        w('')
    # ------------------------------------------------------------------ side
    w('## 1. Side and safety')
    w('')
    w('Index metafiles: root %d, server %d, client %d. The server\'s effective mod set (server index, minus `side=client`, '
      'minus the launcher\'s %s force-skip patterns): **%d jars**.' % (idx['metafiles']['root'], idx['metafiles']['server'],
                                                                     idx['metafiles']['client'], idx['server_force_skip_patterns'], idx['server_effective_jars']))
    w('')
    h = idx['hashes']
    w('Hash check of the instance jars against their metafiles: %d jars, %d match every index that lists them, %d mismatches, '
      '%d in no index, %d entries whose hash format cannot be checked.' % (h['jars'], h['ok'], len(h['mismatch']), len(h['not_in_any_index']), len(h['unverifiable'])))
    if h['not_in_any_index']:
        w('')
        w('In no index: %s' % short(h['not_in_any_index'], 30))
    for d, miss in h['missing_jar'].items():
        w('')
        w('In the %s index but not in the instance: %s' % (d, short(miss, 30)))
    w('')
    w('Side labels (root / server / client index), by combination:')
    w('')
    L.extend(md_table(['labels', 'jars'], [[k, v] for k, v in idx['label_combinations'].items()]))
    w('')
    w('### Jars that lean client-only (%d declared, %d by hint)' % (len(side['client_only_declared']), len(side['client_leaning'])))
    w('')
    rows = []
    for r in side['client_only_declared'] + side['client_leaning']:
        rows.append([r['jar'], '; '.join(r['reasons']) or 'declared', r['labels']['root'], r['labels']['server'], r['labels']['client'],
                     'YES' if r['on_server'] else 'no'])
    L.extend(md_table(['jar', 'why', 'root', 'server', 'client', 'on server'], rows))
    w('')
    w('Kept off the server by its label with no static client hint (%d): %s' % (
        len(side['kept_off_server_without_a_static_hint']),
        short(['%s (%s)' % (r['jar'], r['classes_naming_client']) for r in side['kept_off_server_without_a_static_hint']], 40)))
    w('')
    w('### Common-listed mixins that target client classes (%d)' % len(side['common_mixins_into_client_classes']))
    w('')
    L.extend(md_table(['archive', 'config', 'mixin', 'target', 'on server'],
                      [[r['archive'], r['config'], r['mixin'], r['target'], 'YES' if r['on_server'] else 'no'] for r in side['common_mixins_into_client_classes']]))
    w('')
    w('### @Mod classes that name client classes with no Dist guard (%d)' % len(side['mod_class_names_client_without_guard']))
    w('')
    L.extend(md_table(['archive', 'class', 'on server'], [[r['archive'], r['class'], 'YES' if r['on_server'] else 'no'] for r in side['mod_class_names_client_without_guard']]))
    w('')
    mx = side['mixins']
    w('### Mixin configs')
    w('')
    w('%d configs with mixins. Declared in the manifest only: %d; named in mods.toml: %d; declared nowhere: %d; declared but shipped by no jar: %d.'
      % (mx['configs'], mx['declared_in_manifest_only'], mx['declared_in_mods_toml'], len(mx['not_declared_anywhere']), len(mx['declared_but_shipped_by_no_jar'])))
    if 'server_boots_read' in mx:
        w('')
        w('Server debug logs (%d boots): %d configs registered. Of the manifest-only configs of jars on the server, **%d are registered** and %d are not (%s). '
          'So a config named only in the manifest does load in this pack with the connector present: the 2026-05-07 ledger entry that says the connector drops such configs does not hold as a general rule.'
          % (mx['server_boots_read'], mx['configs_registered_on_server'], mx['manifest_only_configs_on_server_registered'],
             len(mx['manifest_only_configs_on_server_not_registered']), short(mx['manifest_only_configs_on_server_not_registered'], 8) or '-'))
    w('')
    if mx['not_declared_anywhere']:
        L.extend(md_table(['archive', 'config', 'mixins', 'what it is', 'targets', 'on server', 'server boots that registered it'],
                          [[r['archive'], r['config'], r['mixins'], r['kind'], short([t.rsplit('/', 1)[-1] for t in r['targets']], 5),
                            'YES' if r['on_server'] else 'no', r.get('registered_in_server_boots', 'not read')] for r in mx['not_declared_anywhere']]))
        w('')
    if mx['declared_but_shipped_by_no_jar']:
        w('Declared, shipped by no installed jar: %s' % short(['%s (%s)' % (r['config'], r['archive']) for r in mx['declared_but_shipped_by_no_jar']], 20))
        w('')
    ne = side['nested']
    w('### Nested jars')
    w('')
    w('%d nested archives in %d parents; %d of them are mods (%d distinct mod ids), the rest libraries. '
      '%d nested mod ids are also installed as a top-level jar; **%d exist only nested**, invisible to every index.'
      % (ne['archives'], ne['parents'], ne['archives_that_are_mods'], ne['distinct_mod_ids'],
         len(ne['mod_ids_also_installed_as_a_top_level_jar']), len(ne['mod_ids_only_ever_nested'])))
    w('')
    w('Only ever nested: %s' % short(ne['mod_ids_only_ever_nested'], 80))
    w('')
    w('Nested at several versions (Forge keeps the highest): %s' % short(['%s %s' % (k, '/'.join(v)) for k, v in ne['same_mod_nested_at_several_versions'].items()], 40))
    w('')
    w('What nested jars bring that the index cannot see (%d):' % len(ne['what_nested_jars_bring']))
    w('')
    L.extend(md_table(['parent', 'nested', 'mods', 'brings', 'on server'],
                      [[r['parent'], r['nested'], ', '.join(str(x) for x in r['mods']) or '-', ', '.join(r['brings']), 'YES' if r['on_server'] else 'no']
                       for r in ne['what_nested_jars_bring']]))
    w('')
    fb = side['fabric']
    w('### Fabric through the connector')
    w('')
    w('Fabric-only top-level jars: %d (%s). Two-loader jars (mods.toml and fabric.mod.json; Forge reads mods.toml): %d. Fabric-only nested archives: %d (%s).'
      % (len(fb['top_level_fabric_only']), short(fb['top_level_fabric_only'], 10), len(fb['top_level_two_loader_jars']),
         len(fb['nested_fabric_only']), short(fb['nested_fabric_only'], 12)))
    w('')
    # ------------------------------------------------------------------ loot
    w('## 2. Loot')
    w('')
    w('Pack rules: %d table rules, %d chest-type rules with no dimension gate (they reach every chest), dimension-gated chest rules: %s.'
      % (loot['rules']['table_rules'], loot['rules']['chest_type_rules_without_a_dimension_gate'],
         short(['%s %d' % kv for kv in loot['rules']['chest_type_rules_per_dimension'].items()], 30)))
    w('')
    w('Tables rolled by containers of GENERATED structure pieces: **%d**. A table rule names %d; a pack datapack overrides %d; '
      '**%d are named by no rule and no override** (%d of those in a dimension with no dimension-gated chest rule either, %d with no dimension evidence).'
      % (loot['reachable_tables'], loot['with_a_table_rule'], loot['pack_override'], loot['untouched'],
         loot['untouched_no_dimension_rule_either'], loot['untouched_dimension_unknown']))
    w('')
    L.extend(md_table(['jar', 'tables no rule names', 'dimensions', 'no dimension rule', 'dimension unknown', 'sample'],
                      [[jar, e['tables'], short(e['dims'], 4), e['no_dimension_rule'], e['dimension_unknown'], short(e['sample'], 3)]
                       for jar, e in loot['untouched_by_jar'].items()]))
    w('')
    lm = loot['loot_modifiers']
    w('### Forge loot modifiers')
    w('')
    w('%d distinct modifiers (%d files in %d jars; %d jars ship a `global_loot_modifiers.json` list), %d active, %d with no condition at all. '
      'The pack\'s own list is %s: it switches none of them off.'
      % (lm['files'], lm['modifier_files_in_jars'], lm['jars_with_modifier_files'], lm['jars_with_a_global_loot_modifiers_list'],
         lm['active'], lm['unconditional'], json.dumps(lm['pack_global_list'])))
    w('')
    for jar, rows in lm['by_jar'].items():
        types = Counter(r['does'].split(';', 1)[0] for r in rows)
        w('- **%s** (%d): %s' % (jar, len(rows), short(['%s x%d' % kv for kv in types.most_common()], 5)))
    w('')
    vt = loot['vanilla_table_overrides']
    w('### Vanilla loot tables overridden by a mod jar')
    w('')
    w('%d jars override %d vanilla tables (%d jars ship some `data/minecraft/loot_tables` file).' % (vt['jars'], vt['tables'], vt['jars_shipping_any_minecraft_table']))
    w('')
    grp = OrderedDict()
    for r in vt['rows']:
        grp.setdefault(r['archive'], []).append(r)
    L.extend(md_table(['archive', 'tables', 'which', 'a pack datapack wins over it', 'tables a pack rule names'],
                      [[a, len(v), short([r['table'][10:] for r in v], 6),
                        short([r['table'][10:] for r in v if str(r['winner']).startswith(('paxi:', 'kubejs'))], 4) or '-',
                        sum(1 for r in v if r['pack_rules'])] for a, v in grp.items()]))
    w('')
    # ------------------------------------------------------------------ rosters
    w('## 3. Rosters')
    w('')
    w('Boss lists read: %s. Distinct ids over all of them: %d. Entity evidence: %s.'
      % (', '.join('%s %d' % kv for kv in ros['boss_lists'].items()), ros['distinct_ids_over_all_boss_lists'], ros['entity_evidence']))
    w('')
    w('Boss-like entities with strong static evidence (a boss bar in the entity\'s own class, or a bosses tag): **%d**. '
      'In every key list: %d. In some lists only: %d (of which %d are not a boss for the three scaling scripts). **In no list: %d.**'
      % (ros['boss_like_strong'], len(ros['boss_like_in_every_key_list']), len(ros['boss_like_in_some_lists_only']),
         len(ros['boss_like_not_a_boss_for_the_scripts']), len(ros['boss_like_in_no_list'])))
    w('')
    w('The difficulty mod\'s exclude list against the scripts: %d ids are a boss for the scripts and not excluded (%s); %d are excluded and not a script boss (%s).'
      % (len(ros['script_bosses_not_excluded_from_the_difficulty_curve']), short(ros['script_bosses_not_excluded_from_the_difficulty_curve'], 60),
         len(ros['excluded_from_the_difficulty_curve_not_a_script_boss']), short(ros['excluded_from_the_difficulty_curve_not_a_script_boss'], 30)))
    w('')
    w('### Boss-like, in no boss list')
    w('')
    L.extend(md_table(['entity', 'jar', 'evidence', 'pack files naming it'],
                      [[r['entity'], r['jar'], '; '.join(r['evidence'][:2]), r['files_naming_it']] for r in ros['boss_like_in_no_list']]))
    w('')
    w('### Boss-like, in some lists only')
    w('')
    L.extend(md_table(['entity', 'jar', 'in', 'missing from'],
                      [[r['entity'], r['jar'], '; '.join(n.split(' ')[-1] for n in r['in_lists']), '; '.join(n.split(' ')[-1] if 'excludes' not in n else 'difficulty excludes' for n in r['missing_from_key_lists'])]
                       for r in ros['boss_like_in_some_lists_only']]))
    w('')
    w('Weak candidates (the entity only inherits a boss bar from a shared base class), per jar: %s' % short(['%s %d' % kv for kv in ros['boss_like_weak_by_jar'].items()], 30))
    w('')
    w('### List entries that name no known entity (%d)' % len(ros['list_entries_no_evidence']))
    w('')
    L.extend(md_table(['list', 'id', 'mod installed', 'closest known id'],
                      [[p['list'], p['id'], 'yes' if p['mod_installed'] else 'NO', ', '.join(p['closest_known'])] for p in ros['list_entries_no_evidence']]))
    w('')
    dd = ros['list_entries_defined_by_a_data_file']
    w('Not entity types but defined by a data file of the mod (%d, fine): %s' % (len(dd), short(sorted(set(d['id'] for d in dd)), 40)))
    w('')
    w('### Disagreements between the three script lists')
    w('')
    for k, v in ros['disagreements'].items():
        if v:
            w('- %s (%d): %s' % (k, len(v), short(v, 40)))
    w('')
    w('### Dimensions')
    w('')
    w('%d dimensions shipped (%s). Lists: %s.' % (ros['dimensions_shipped'], ros['dimension_evidence'], ', '.join('%s %d' % (k.split(' (')[0], v) for k, v in ros['dimension_lists'].items())))
    w('')
    L.extend(md_table(['dimension', 'jar', 'tiers given', 'listed in', 'missing from'],
                      [[r['dimension'], r['jar'], '/'.join(str(t) for t in r['tiers']) or '-', len(r['listed_in']),
                        '; '.join(m.split(' (')[0].replace('Apotheosis ', '') for m in r['missing_from']) or '-']
                       for r in ros['dimensions_in_no_list'] + ros['dimensions_missing_from_a_list']]))
    w('')
    w('In every list: %s' % short(ros['dimensions_in_every_list'], 30))
    w('')
    if ros['dimensions_tier_conflict']:
        w('Tier conflicts between lists: %s' % short(['%s %s' % (r['dimension'], r['tiers']) for r in ros['dimensions_tier_conflict']], 20))
        w('')
    w('List entries that are no shipped dimension: %s' % (short(['%s (%s)' % (r['id'], r['list'].split(' (')[0]) for r in ros['list_entries_that_are_no_dimension']], 30) or 'none'))
    w('')
    # ------------------------------------------------------------------ shared
    w('## 4. Shared namespaces')
    w('')
    w('### Tags written with replace:true outside the jar\'s own namespace (%d)' % len(sh['tags_replace_true']))
    w('')
    L.extend(md_table(['archive', 'registry', 'tag', 'values'], [[r['archive'], r['registry'], r['tag'], r['values']] for r in sh['tags_replace_true']]))
    w('')
    w('### Functions on the tick tag (%d jars) and the load tag (%d)' % (len(sh['functions_on_tick_tag']), len(sh['functions_on_load_tag'])))
    w('')
    L.extend(md_table(['archive', 'tag', 'functions', 'replace'],
                      [[r['archive'], 'tick', short(r['functions'], 6), r['replace']] for r in sh['functions_on_tick_tag']] +
                      [[r['archive'], 'load', short(r['functions'], 6), r['replace']] for r in sh['functions_on_load_tag']]))
    w('')
    w('### Overrides of vanilla data')
    w('')
    L.extend(md_table(['archive', 'kind', 'n', 'ids'],
                      [[r['archive'], 'recipes', r['n'], short(r['ids'], 8)] for r in sh['vanilla_recipe_overrides']] +
                      [[r['archive'], 'advancements', r['n'], short(r['ids'], 6)] for r in sh['vanilla_advancement_overrides']] +
                      [[r['archive'], 'worldgen', r['n'], short(r['ids'], 6)] for r in sh['vanilla_worldgen_overrides']]))
    w('')
    w('### Loot tables or structures under a namespace that is no installed mod id (%d archives)' % len(sh['loot_or_structures_under_a_namespace_that_is_no_mod_id']))
    w('')
    w('A rule keyed on the mod id misses these (the Epic Dungeons case).')
    w('')
    L.extend(md_table(['archive', 'mod ids', 'namespace: loot tables / templates'],
                      [[r['archive'], ', '.join(str(x) for x in r['mods']), '; '.join('%s: %d / %d' % (n['namespace'], n['loot_tables'], n['templates']) for n in r['namespaces'])]
                       for r in sh['loot_or_structures_under_a_namespace_that_is_no_mod_id']]))
    w('')
    t = sh['tags_into_other_mods_namespaces']
    w('Tags written into another mod\'s namespace: %d tags from %d jars (most: %s).' % (t['tags'], t['jars'], short(['%s %d' % (a, b) for a, b in t['most']], 6)))
    w('')
    # ------------------------------------------------------------------ dead
    w('## 5. Dead data')
    w('')
    w('### 1.21-layout folders (%d jars, %d files)' % (dead['folders_1_21_layout_jars'], dead['folders_1_21_layout_files']))
    w('')
    L.extend(md_table(['archive', 'folders: files', 'content absent in game (no 1.20.1 twin)', 'data for another version'],
                      [[r['archive'], '; '.join('%s: %d' % kv for kv in r['folders'].items()), ', '.join(r['without_1_20_twin']) or '-',
                        ', '.join(r['other_version_registries']) or '-'] for r in dead['folders_1_21_layout']]))
    w('')
    tu = dead['tables_naming_unknown_items']
    w('### Loot tables that name item ids with no static evidence')
    w('')
    w('%d valid mod tables (no load condition) name an item no installed jar shows a model, language key or tag for; %d of them name a mod that is not installed. '
      'The server\'s last boot log rejected %d tables (the loot audit\'s TABLE_REJECTED).' % (tu['tables'], tu['of_which_name_a_mod_that_is_not_installed'], len(loot['rejected_tables'])))
    w('')
    L.extend(md_table(['jar', 'tables', 'naming an absent mod', 'absent mods', 'sample ids'],
                      [[jar, e['tables'], e['naming_absent_mods'], short(['%s x%d' % kv for kv in e['absent_mods'].items()], 4), short(e['sample_ids'], 3)]
                       for jar, e in list(tu['by_jar'].items())[:40]]))
    w('')
    w('Other dangling references the loot scanner noted: %s' % (', '.join('%s %d' % kv for kv in dead['truth_notes'].items()) or 'none'))
    w('')
    # ------------------------------------------------------------------ config
    w('## 6. Config')
    w('')
    w('Tracked config files: %s. Mods with a Forge config spec (static hint): %d.' % (', '.join('%s %d' % kv for kv in cfg['tracked_files'].items()), cfg['mods_with_a_config_spec']))
    w('')
    w('### A config spec, and no tracked config in any distro (%d)' % len(cfg['with_a_config_spec_and_no_tracked_config']))
    w('')
    w(short(['%s [%s]' % (r['jar'], '/'.join(r['config_types']) or '?') for r in cfg['with_a_config_spec_and_no_tracked_config']], 400))
    w('')
    w('### Tracked in some distros only (%d)' % len(cfg['tracked_in_some_distros_only']))
    w('')
    w(short(['%s (%s)' % (r['jar'], ', '.join('%s %d' % kv for kv in sorted(r['tracked'].items()))) for r in cfg['tracked_in_some_distros_only']], 400))
    w('')
    w('### Tracked config entries whose name matches no installed mod (%d, by name only)' % len(cfg['tracked_config_matching_no_installed_mod']))
    w('')
    w(short(['%s (%d files; %s)' % (r['entry'], r['files'], '/'.join(r['in_distros'])) for r in cfg['tracked_config_matching_no_installed_mod']], 400))
    w('')
    w('Sharing only the first six letters of a name with an installed mod (%d, undecided): %s' % (
        len(cfg['tracked_config_sharing_only_a_name_prefix_with_a_mod']),
        short([r['entry'] for r in cfg['tracked_config_sharing_only_a_name_prefix_with_a_mod']], 400)))
    w('')
    # ------------------------------------------------------------------ review
    w('## 7. Review list: the thirty mods with the most unreviewed surfaces')
    w('')
    w('Score = weighted count of the surfaces above that nobody has ruled on. "Pack files" = scripts and configs that name any id of the mod.')
    w('')
    for i, r in enumerate(review[:30], 1):
        w('%d. **%s** (%s) score %d, %d surfaces, %d pack files name it' % (i, r['jar'], ', '.join(r['mods']) or '-', r['score'], r['surfaces'], r['pack_files_naming_it']))
        for d in r['decide_first']:
            w('   - decide: %s' % d)
        w('   - unreviewed: %s' % '; '.join(r['unreviewed']))
    w('')
    w('## What the static evidence cannot tell')
    w('')
    for line in meta['limits']:
        w('- %s' % line)
    w('')
    w('## Appendix: every Forge loot modifier, one line each')
    w('')
    for jar, rows in lm['by_jar'].items():
        w('**%s**' % jar)
        w('')
        for r in rows:
            w('- `%s`: %s' % (r['id'], r['does']))
        w('')
    w('## Appendix: every generated-structure table no rule names')
    w('')
    for jar, e in loot['untouched_by_jar'].items():
        w('- **%s** (%d): %s' % (jar, e['tables'], ', '.join(e['all'])))
    w('')
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(L) + '\n')


LIMITS = (
    'Registered ids. A language key, a model or a loot table is not a registration; entity ids here come from those. '
    'The boot gate\'s registry dump (dev/registry/) replaces this evidence when it exists.',
    'Entity category, attributes and whether an entity really shows a boss bar. A bar set up in a shared base class makes every subclass a weak candidate.',
    'Key mappings and their default keys (a class can name KeyMapping and register none), registered game rules, config file names and defaults.',
    'Loot tables assigned from code. A table no chest NBT names may still be rolled; a table no rule names may still be handled by a type or dimension rule.',
    'Whether a mixin applies. Only the `Registering mixin config` / `Mixing ... into ...` lines of a boot\'s debug.log show it.',
    'Dedicated-server safety. "Leans client" is a hint; a clean jar can carry an unsafe nested library, and a client-leaning jar can be harmless on the server.',
    'Which copy of a library nested in several jars loads, and which of two mod jars wins a file both ship.',
    'What event handlers do. "Hooks damage / spawns / attributes" names the event, not the effect.',
    'Config ownership is matched by name: a config whose file name does not contain the mod id is missed, and a leftover is only a candidate.',
)


def main():
    ap = argparse.ArgumentParser(description='Audit the installed mods against the pack\'s own systems.')
    ap.add_argument('--mods', default=inv_mod.default_mods_dir())
    ap.add_argument('--repo', default=os.path.dirname(DEV), help="the repo's .minecraft folder")
    ap.add_argument('--libraries', default=inv_mod.default_libraries())
    ap.add_argument('--no-cache', action='store_true')
    ap.add_argument('--jobs', type=int, default=0)
    ap.add_argument('--skip-loot-audit', action='store_true', help='reuse truth.json / harness.json as they are')
    ap.add_argument('--logs', default='', help='a logs folder with debug.log, or "auto" (dev/server_logs.py decides)')
    ap.add_argument('--out-dir', default='', help='where the report and the findings go (default: dev/mods/.cache)')
    ap.add_argument('--name', default='pack-audit-' + time.strftime('%Y-%m-%d'))
    args = ap.parse_args()
    args.repo = os.path.abspath(args.repo)
    args.mods = os.path.abspath(args.mods)
    out_dir = os.path.abspath(args.out_dir) if args.out_dir else inv_mod.out_cache_dir(args.repo)
    os.makedirs(out_dir, exist_ok=True)
    t0 = time.time()

    truth, harness, loot_findings = run_loot_audit(args)
    inventory, ictx, stats = inv_mod.build_inventory(args)
    ctx = {'inventory': inventory, 'truth': truth, 'harness': harness, 'loot_findings': loot_findings,
           'repo': args.repo, 'mods_dir': args.mods}
    ctx['indexes'], ctx['index_problems'] = packlists.read_indexes(args.repo)
    ctx['hashes'] = inv_mod.verify_against_index(args.mods, ctx['indexes'],
                                                 os.path.join(inv_mod.out_cache_dir(args.repo), 'hashes.json'))
    ctx['force_skip'] = force_skip_patterns(args.repo)
    ctx['boss_lists'], bp = packlists.boss_lists(args.repo)
    ctx['dim_lists'], dp = packlists.dimension_lists(args.repo)
    ctx['mentions'] = packlists.Mentions(args.repo)
    ctx['tracked_configs'] = packlists.tracked_configs(args.repo)
    ctx['registry'] = packlists.load_registry_dump(args.repo)
    pg = packlists.read_text(os.path.join(args.repo, 'kubejs', 'data', 'forge', 'loot_modifiers', 'global_loot_modifiers.json'))
    try:
        ctx['pack_glm_list'] = json.loads(pg) if pg else None
    except ValueError:
        ctx['pack_glm_list'] = 'unparseable'
    logs = args.logs
    logs_label = None
    if logs == 'auto':
        from server_logs import find_server_logs
        logs, logs_label = find_server_logs(args.repo)
    ctx['mixin_registered'], ctx['mixin_boots'] = registered_mixin_configs(logs) if logs else (None, 0)

    S = OrderedDict()
    S['index'] = section_index(ctx)
    S['side'] = section_side(ctx)
    S['loot'] = section_loot(ctx)
    S['rosters'] = section_rosters(ctx)
    S['shared'] = section_shared(ctx)
    S['dead'] = section_dead(ctx)
    S['config'] = section_config(ctx)
    review = review_list(ctx, S)
    defects = live_defects(ctx, S)

    try:
        head = subprocess.run(['git', '-C', args.repo, 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip()
    except OSError:
        head = '?'
    side, loot, ros, sh, dead, cfg = (S[k] for k in ('side', 'loot', 'rosters', 'shared', 'dead', 'config'))
    headline = OrderedDict()
    headline['jars / archives / nested'] = '%d / %d / %d' % (len(inventory), stats['archives'], stats['archives'] - len(inventory))
    headline['mod ids that exist only nested (no index sees them)'] = len(side['nested']['mod_ids_only_ever_nested'])
    headline['jars leaning client-only (declared + hinted), of which on the server'] = '%d + %d, %d' % (
        len(side['client_only_declared']), len(side['client_leaning']), len(side['client_leaning_on_server']))
    headline['mixin configs declared nowhere: with real mixins (dead) / leftovers'] = '%d / %d' % (
        sum(1 for r in side['mixins']['not_declared_anywhere'] if r['kind'].startswith('DEAD')),
        sum(1 for r in side['mixins']['not_declared_anywhere'] if not r['kind'].startswith('DEAD')))
    headline['Fabric-only jars through the connector (top level / nested); two-loader jars'] = '%d / %d; %d' % (
        len(side['fabric']['top_level_fabric_only']), len(side['fabric']['nested_fabric_only']), len(side['fabric']['top_level_two_loader_jars']))
    headline['generated-structure loot tables: total, named by no rule or override'] = '%d, %d' % (loot['reachable_tables'], loot['untouched'])
    headline['Forge loot modifiers: distinct / jars shipping them / with no condition'] = '%d / %d / %d' % (
        loot['loot_modifiers']['files'], loot['loot_modifiers']['jars_with_modifier_files'], loot['loot_modifiers']['unconditional'])
    headline['vanilla loot tables overridden by mod jars: tables / jars'] = '%d / %d' % (
        loot['vanilla_table_overrides']['tables'], loot['vanilla_table_overrides']['jars'])
    headline['boss-like entities (strong evidence): total, in no boss list, on a roster but trash mobs for scaling'] = '%d, %d, %d' % (
        ros['boss_like_strong'], len(ros['boss_like_in_no_list']), len(ros['boss_like_not_a_boss_for_the_scripts']))
    headline['script bosses the difficulty mod does not exclude'] = len(ros['script_bosses_not_excluded_from_the_difficulty_curve'])
    headline['boss-list entries naming no known entity'] = len(ros['list_entries_no_evidence'])
    headline['dimensions shipped: total, in no tier list, missing from at least one'] = '%d, %d, %d' % (
        ros['dimensions_shipped'], len(ros['dimensions_in_no_list']), len(ros['dimensions_missing_from_a_list']))
    headline['tags with replace:true in a shared namespace'] = len(sh['tags_replace_true'])
    headline['jars with functions on the tick tag'] = len(sh['functions_on_tick_tag'])
    headline['jars with 1.21-layout folders / files in them'] = '%d / %d' % (dead['folders_1_21_layout_jars'], dead['folders_1_21_layout_files'])
    headline['mod loot tables naming an item of a mod that is not installed'] = dead['tables_naming_unknown_items']['of_which_name_a_mod_that_is_not_installed']
    headline['mods with a config spec and no tracked config'] = len(cfg['with_a_config_spec_and_no_tracked_config'])
    headline['tracked config entries matching no installed mod (by name)'] = len(cfg['tracked_config_matching_no_installed_mod'])
    headline['instance jars that do not match their metafile hash'] = len(set(m['jar'] for m in ctx['hashes']['mismatch']))
    meta = OrderedDict((('date', time.strftime('%Y-%m-%d')), ('generated', time.strftime('%Y-%m-%dT%H:%M:%S')),
                        ('head', head), ('scanner_version', inv_mod.jarscan.SCANNER_VERSION),
                        ('json_name', args.name + '.findings.json'),
                        ('registry_dump', 'used' if ctx['registry'] else 'not present (dev/registry/): static evidence only'),
                        ('logs', (logs_label or logs) if ctx['mixin_registered'] is not None else 'not read'),
                        ('list_problems', bp + dp), ('inventory_stats', stats), ('headline', headline), ('limits', LIMITS)))
    findings = OrderedDict((('meta', meta), ('live_defects', defects), ('sections', S), ('review_list', review)))
    jpath = os.path.join(out_dir, args.name + '.findings.json')
    with open(jpath, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(findings, f, indent=1)
        f.write('\n')
    mpath = os.path.join(out_dir, args.name + '.md')
    write_report(mpath, ctx, S, defects, review, meta)
    print('pack_audit.py: %d jars, %.1fs' % (len(inventory), time.time() - t0))
    print('report   -> %s' % mpath)
    print('findings -> %s' % jpath)
    for k, v in headline.items():
        print('  %-78s %s' % (k, v))
    print('top findings: %d' % len(defects))
    for d in defects:
        print('  - [%s] %s' % (d['kind'], d['title']))
    return 0


if __name__ == '__main__':
    multiprocessing.freeze_support()
    sys.exit(main())
