#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""inventory.py -- what a mod jar ships, statically, one record per jar.

    python -I .minecraft/dev/mods/inventory.py                  every installed jar: full records into the cache,
                                                                the compact summary into inventory-summary.json
    python -I .minecraft/dev/mods/inventory.py <jar> [...]      INTAKE SKELETON for a candidate jar (any path): each
                                                                pack system its content must be fitted into, what
                                                                happens by default, the decision someone must make
    python -I .minecraft/dev/mods/inventory.py --show <name>    the full record(s) of an installed jar (file name or
                                                                mod id, substring), as JSON
    python -I .minecraft/dev/mods/inventory.py --check          exit 1 when inventory-summary.json is out of date

Options: --mods DIR (default: the PrismLauncher instance), --repo DIR (the repo's .minecraft), --no-cache,
--jobs N, --json FILE (machine-readable copy of what is printed).

Nothing is executed and no jar is modified or extracted.  The scanner and its per-jar cache are shared with the
loot audit (jarscan.py; cache in dev/loot_audit/.cache, git-ignored).  Full records are written to
dev/mods/.cache/inventory.json (git-ignored); the committed summary holds counts and flags only, so a jar that
changes what it ships shows up in a diff.

A record (one per archive; a nested jar is its own record with `parent` set):
    identity    loader (forge, or fabric through Sinytra Connector), mod ids + versions, dependencies, licence
    side        clientSideOnly, displayTest, fabric environment, mixin list sizes, the hint and its reasons
    code        classes, classes that name client-only packages, the @Mod class, hints (BossEvent, KeyMapping,
                config specs and their types, loot code, attribute / spawn / hurt hooks, screen-init, ...),
                boss-bar classes with the entities they map to
    mixins      every config: where it is declared, its common / client / server lists, each mixin's targets
    access      access transformer / access widener: lines, classes, how many are client classes
    data        LISTS: loot tables by kind, Forge loot modifiers, worldgen structures, structure sets, template
                pools, biome modifiers, dimensions, dimension types, recipes by type, advancements, functions
                (and which are on the tick / load tags), damage types, tags written into minecraft / forge / c /
                another namespace (replace flagged), overrides of vanilla data, 1.21-layout folders
    lang        entity / item ids, key.* and gamerule.* keys, enchantments, effects, attributes
    flags       short codes for everything above that someone should look at

WHAT A JAR CANNOT TELL YOU (needs a real boot, see dev/registry when it exists): which ids are REGISTERED
(a language key or a model is not a registration), entity categories and attributes, the key mappings a mod
registers and their default keys, registered game rules, config defaults, loot tables assigned from code,
whether a mixin applies, and whether the jar is safe on a dedicated server.

Needs Python 3.11+ (tomllib).  Stdlib only.
"""
import argparse
import hashlib
import json
import multiprocessing
import os
import re
import sys
import time
from collections import Counter, OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import jarscan  # noqa: E402
import packlists  # noqa: E402

SUMMARY_NAME = 'inventory-summary.json'
CLIENT_PKG = ('net/minecraft/client/', 'com/mojang/blaze3d/')
SHARED_NS = ('minecraft', 'forge', 'c')
LOADER_TEXT = {'forge': 'forge', 'fabric': 'fabric (runs through Sinytra Connector)',
               'none': 'none (no mods.toml / fabric.mod.json: a library)'}
# first path segment -> loot table kind
LOOT_KINDS = (('chests', 'chests'), ('chest', 'chests'), ('entities', 'entities'), ('blocks', 'blocks'),
              ('archaeology', 'archaeology'), ('archeology', 'archaeology'), ('gameplay', 'gameplay'))
LOOT_TYPE_KIND = {'minecraft:chest': 'chests', 'minecraft:entity': 'entities', 'minecraft:block': 'blocks',
                  'minecraft:archaeology': 'archaeology', 'minecraft:fishing': 'gameplay', 'minecraft:gift': 'gameplay',
                  'minecraft:barter': 'gameplay'}
VANILLA_WG = (('pools', 'template_pool'), ('wg_structures', 'structure'), ('structure_sets', 'structure_set'),
              ('processor_lists', 'processor_list'), ('cfeatures', 'configured_feature'),
              ('pfeatures', 'placed_feature'), ('biomes', 'biome'), ('dimensions', 'dimension'),
              ('structures', 'template'))


def default_mods_dir():
    appdata = os.environ.get('APPDATA') or os.path.expanduser('~\\AppData\\Roaming')
    return os.path.join(appdata, 'PrismLauncher', 'instances', 'IridescentCraft', '.minecraft', 'mods')


def default_libraries():
    appdata = os.environ.get('APPDATA') or os.path.expanduser('~\\AppData\\Roaming')
    return os.path.join(appdata, 'PrismLauncher', 'libraries')


def scan_cache_dir(repo):
    return os.path.join(repo, 'dev', 'loot_audit', '.cache')


def out_cache_dir(repo):
    return os.path.join(repo, 'dev', 'mods', '.cache')


# --------------------------------------------------------------------------- vanilla / forge context

def base_context(repo, libraries, no_cache=False):
    """What the vanilla and Forge jars ship, so "override" can be told from "addition" -> ctx dict."""
    tasks = []
    van = jarscan.find_vanilla_jar(libraries)
    if van and os.path.isfile(van):
        tasks.append({'kind': 'vanilla', 'id': 'vanilla', 'path': van, 'classes': True, 'order': 0})
    forge = jarscan.find_forge_jar(libraries, repo)
    if forge and os.path.isfile(forge):
        tasks.append({'kind': 'forge', 'id': 'forge:' + os.path.basename(forge), 'path': forge, 'classes': True,
                      'order': 1})
    fams, _ = jarscan.scan_all(tasks, scan_cache_dir(repo), no_cache)
    ctx = {'vanilla_found': False, 'loot_tables': set(), 'recipes': set(), 'advancements': set(), 'wg': set(),
           'tags': {}, 'all_mod_ids': None, 'vanilla_jar': os.path.basename(van) if van else None,
           'forge_jar': os.path.basename(forge) if forge else None}
    for t in tasks:
        fam = fams.get(t['id']) or {}
        for u in fam.get('units', []):
            if u.get('depth', 0):
                continue
            inv = u.get('inv') or {}
            if t['kind'] == 'vanilla':
                ctx['vanilla_found'] = True
            ctx['loot_tables'].update(u.get('loot_tables', {}))
            for ns, ids in ((inv.get('recipes') or {}).get('ids') or {}).items():
                ctx['recipes'].update(ns + ':' + p for p in ids)
            for ns, ids in (inv.get('advancements') or {}).items():
                ctx['advancements'].update(ns + ':' + p for p in ids)
            for key, label in VANILLA_WG:
                ctx['wg'].update(label + ' ' + rid for rid in u.get(key, {}))
            ctx['wg'].update('dimension_type ' + rid for rid in inv.get('dimension_types', []))
            for reg, tags in (inv.get('tags') or {}).items():
                ctx['tags'].setdefault(reg, set()).update(tags)
    return ctx


# --------------------------------------------------------------------------- records

def loot_kind(tid, rec):
    path = tid.split(':', 1)[1]
    first = path.split('/', 1)[0]
    for seg, kind in LOOT_KINDS:
        if first == seg:
            return kind
    if '/chests/' in path:
        return 'chests'
    return LOOT_TYPE_KIND.get(rec.get('type') or '', 'other')


def norm_name(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


def boss_candidates(u):
    """Entities that look like bosses, from static evidence only -> ({entity id: [evidence]}, [unmatched classes])"""
    inv = u.get('inv') or {}
    code = inv.get('code') or {}
    ents = u.get('lang_entity') or []
    by_norm = {}
    for e in ents:
        by_norm.setdefault(norm_name(e.split(':', 1)[1]), e)

    def match(cls):
        simple = cls.rsplit('/', 1)[-1].split('$', 1)[0]
        n = norm_name(simple)
        for cand in (n, n.replace('entity', ''), re.sub(r'^entity|entity$|boss$', '', n)):
            if cand and cand in by_norm:
                return by_norm[cand]
        return None

    out = {}
    unmatched = []

    def add(e, rank, text):
        out.setdefault(e, []).append((rank, text))

    for row in code.get('boss', []):
        cls, root, below = row[0], row[1], row[2]
        if not (root.startswith('net/minecraft/world/entity/') and not root.startswith('net/minecraft/world/entity/ai/')):
            continue
        simple = cls.rsplit('/', 1)[-1]
        e = match(cls)
        if e:
            add(e, 1, 'boss bar in its class %s' % simple if len(row) < 4 else
                'its class %s uses the boss-bar class %s' % (simple, row[3].rsplit('/', 1)[-1]))
        elif not below:
            unmatched.append(cls)
        for k in below:
            e2 = match(k)
            if e2 and e2 != e:
                add(e2, 3, 'extends %s, which sets up a boss bar' % simple)
    for reg, tags in (inv.get('tag_values') or {}).items():
        if not reg.startswith('entity_type'):
            continue
        for tag, vals in tags.items():
            if tag.split(':', 1)[1] in ('bosses', 'boss'):
                for v in vals:
                    if v and not v.startswith('#'):
                        add(v, 0, 'in #%s%s' % (tag, '' if reg == 'entity_types' else
                                                 ' (1.21 folder: the game does not load it)'))
    res = {}
    for e, ev in out.items():
        ev = sorted(set(ev))
        res[e] = {'strength': 'strong' if ev[0][0] <= 1 else 'weak', 'evidence': [t for _, t in ev]}
    return res, sorted(unmatched)


def unit_record(u, fam_ids, ctx):
    inv = u.get('inv') or {}
    forge = inv.get('forge') or {}
    fabric = inv.get('fabric')
    code = inv.get('code') or {}
    uid = u['id']
    rec = OrderedDict()
    rec['id'] = uid
    rec['file'] = uid.rsplit('!', 1)[-1] if '!' in uid else uid.split(':', 1)[1]
    rec['parent'] = uid.rsplit('!', 1)[0] if '!' in uid else None
    rec['sha256'] = u.get('sha256')
    flags = []
    counts = Counter()

    # ---- identity
    mods = forge.get('mods') or [dict(id=m['id'], version=m.get('version')) for m in u.get('mods', [])]
    if u.get('mod_meta') == 'fabric' and fabric and fabric.get('name'):
        mods = [dict(id=fabric.get('id'), version=fabric.get('version'), name=fabric['name'])]
    ident = OrderedDict()
    ident['loader'] = LOADER_TEXT.get(u.get('mod_meta'), str(u.get('mod_meta')))
    ident['mods'] = mods
    man = inv.get('manifest') or {}
    for k, k2 in (('FMLModType', 'fml_mod_type'), ('Automatic-Module-Name', 'automatic_module'),
                  ('Implementation-Version', 'implementation_version'), ('MixinConnector', 'mixin_connector')):
        if man.get(k):
            ident[k2] = man[k]
    for k, k2 in (('modLoader', 'mod_loader'), ('loaderVersion', 'loader_version'), ('license', 'license')):
        if forge.get('top', {}).get(k) is not None:
            ident[k2] = forge['top'][k]
    if forge.get('parser') == 'regex' and forge.get('toml_error'):
        ident['mods_toml_note'] = 'not strict TOML (%s): read with the fallback reader' % forge['toml_error']
    ident['dependencies'] = forge.get('deps', [])
    if fabric:
        ident['fabric'] = fabric
        if u.get('mod_meta') == 'forge':
            ident['also_fabric_mod_json'] = True      # a two-loader jar: Forge reads mods.toml
    if inv.get('quilt'):
        ident['quilt_mod_json'] = True
    if inv.get('services'):
        ident['services'] = inv['services']
    if inv.get('coremods'):
        ident['coremods'] = inv['coremods']
    if inv.get('jarjar'):
        ident['jarjar'] = inv['jarjar']
    rec['identity'] = ident
    if u.get('mod_meta') == 'fabric':
        flags.append('fabric-via-connector')
    elif u.get('mod_meta') == 'none':
        flags.append('no-mod-metadata')
    if inv.get('services'):
        flags.append('service-jar')
    if inv.get('coremods'):
        flags.append('coremod')

    # ---- mixins
    mixins = inv.get('mixins') or []
    man_connector = (inv.get('manifest') or {}).get('MixinConnector')
    msum = Counter()
    client_targets_in_common = []
    for m in mixins:
        if m.get('absent'):
            flags.append('mixin-config-declared-but-absent')
            continue
        if m.get('error'):
            flags.append('mixin-config-unreadable')
            continue
        if m.get('empty'):
            continue
        for side in ('common', 'client', 'server'):
            msum[side] += len(m.get(side, []))
        if not m.get('decl'):
            if man_connector:
                m['decl_note'] = 'not named in the manifest; the jar has a MixinConnector class that can register it'
            elif sum(len(m.get(k, [])) for k in ('common', 'client', 'server')):
                flags.append('mixin-config-not-declared')
            else:
                flags.append('mixin-config-not-declared-empty')
        elif m['decl'] == ['manifest'] and u.get('mod_meta') == 'forge':
            counts['mixin_configs_manifest_only'] += 1
        if m.get('missing'):
            flags.append('mixin-class-missing')
        if m.get('refmap_missing'):
            flags.append('mixin-refmap-missing')
        if u.get('mod_meta') == 'forge':
            for name in m.get('common', []):
                for t in m.get('targets', {}).get(name, []):
                    if t.startswith(CLIENT_PKG):
                        client_targets_in_common.append([m['cfg'], name, t])
    rec['mixins'] = mixins
    counts['mixins_common'], counts['mixins_client'], counts['mixins_server'] = (
        msum['common'], msum['client'], msum['server'])

    # ---- side
    side = OrderedDict()
    reasons = []
    top = forge.get('top', {})
    if top.get('clientSideOnly') is True:
        side['client_side_only'] = True
        reasons.append('mods.toml clientSideOnly=true')
    dts = sorted(set(m['displayTest'] for m in forge.get('mods', []) if m.get('displayTest')))
    if dts:
        side['display_test'] = dts
    if fabric:
        side['fabric_environment'] = fabric.get('environment')
        if fabric.get('environment') == 'client':
            reasons.append('fabric.mod.json environment=client')
        eps = fabric.get('entrypoints') or {}
        if eps and 'client' in eps and 'main' not in eps and 'server' not in eps:
            reasons.append('fabric entrypoints: client only')
    dep_sides = Counter(str(d.get('side')).upper() for d in forge.get('deps', []) if d.get('side'))
    if dep_sides:
        side['dependency_sides'] = dict(dep_sides)
        if set(dep_sides) == set(['CLIENT']):
            reasons.append('every dependency is declared side=CLIENT')
    side['mixins'] = {'common': msum['common'], 'client': msum['client'], 'server': msum['server']}
    if msum['client'] and not msum['common'] and not msum['server']:
        reasons.append('every mixin (%d) is in the client list' % msum['client'])
    if client_targets_in_common:
        side['common_mixins_into_client_classes'] = client_targets_in_common
        flags.append('common-mixin-targets-client-class')
    n_cls = code.get('n', 0)
    side['classes'] = n_cls
    side['classes_naming_client_packages'] = code.get('client', 0)
    if n_cls >= 5 and code.get('client', 0) * 2 >= n_cls:
        reasons.append('%d of %d classes name client-only packages' % (code.get('client', 0), n_cls))
    mc = code.get('mod_classes') or []
    if mc:
        side['mod_classes'] = mc
        if any(m.get('client') and not m.get('dist_guard') for m in mc):
            flags.append('mod-class-names-client-no-dist-guard')
    declared = None
    if side.get('client_side_only') or (fabric and fabric.get('environment') == 'client'):
        declared = 'client'
    elif fabric and fabric.get('environment') == 'server':
        declared = 'server'
    side['declared'] = declared
    side['hint'] = 'client' if (declared == 'client' or reasons) else ('server' if declared == 'server' else None)
    side['reasons'] = reasons
    rec['side'] = side
    if declared == 'client':
        flags.append('client-only-declared')
    elif reasons:
        flags.append('client-leaning')

    # ---- code
    cd = OrderedDict()
    cd['classes'] = n_cls
    cd['client_classes'] = code.get('client', 0)
    cd['only_in_annotated'] = code.get('onlyin', 0)
    if code.get('mcreator'):
        cd['mcreator_classes'] = code['mcreator']
        flags.append('mcreator')
    cd['hints'] = dict((k, {'classes': v[0], 'sample': v[1][:25]}) for k, v in (code.get('hints') or {}).items())
    if code.get('config_types'):
        cd['config_types'] = code['config_types']
    if code.get('entity_roots'):
        cd['entity_base_classes'] = code['entity_roots']
    if code.get('item_roots'):
        cd['item_base_classes'] = code['item_roots']
    bosses, unmatched = boss_candidates(u)
    if bosses or unmatched:
        cd['boss_like'] = {'entities': dict(sorted(bosses.items())), 'unmatched_classes': unmatched}
    rec['code'] = cd
    counts['classes'] = n_cls
    counts['client_classes'] = code.get('client', 0)
    for label, flag in (('key_mapping', 'key-mappings'), ('game_rule_register', 'game-rule-register'),
                        ('loot_code', 'loot-code'), ('attr_modify', 'attribute-modification-event'),
                        ('spawn_hook', 'spawn-hook'), ('screen_init', 'screen-init-hook'), ('trades', 'trade-hook'),
                        ('hurt_hook', 'damage-hook')):
        if label in (code.get('hints') or {}):
            flags.append(flag)
    counts['boss_like'] = sum(1 for b in bosses.values() if b['strength'] == 'strong')
    counts['boss_like_weak'] = sum(1 for b in bosses.values() if b['strength'] == 'weak')
    if bosses or unmatched:
        flags.append('boss-bar')

    # ---- access transformer / widener
    if inv.get('at') or inv.get('aw'):
        rec['access'] = dict((k, inv[k]) for k in ('at', 'aw') if inv.get(k))
        counts['access_lines'] = sum(inv[k]['lines'] for k in ('at', 'aw') if inv.get(k))

    # ---- data
    data = OrderedDict()
    own = set(fam_ids)
    ns_all = inv.get('ns') or {}
    data['namespaces'] = dict((ns, sum(c.values())) for ns, c in ns_all.items())
    other_mods = ctx.get('all_mod_ids')
    alien = []
    for ns in ns_all:
        if ns in own or ns in SHARED_NS:
            continue
        if other_mods is not None and ns in other_mods:
            continue
        alien.append(ns)
    if alien:
        data['namespaces_no_installed_mod_has'] = sorted(alien)
        if other_mods is not None:
            flags.append('data-namespace-is-no-mod-id')
    lt = OrderedDict((k, []) for k in ('chests', 'archaeology', 'entities', 'blocks', 'gameplay', 'other'))
    for tid, t in sorted((u.get('loot_tables') or {}).items()):
        lt[loot_kind(tid, t)].append(tid)
    data['loot_tables'] = lt
    for k, v in lt.items():
        counts['loot_' + k] = len(v)
    glms = []
    for gid, g in sorted((u.get('glms') or {}).items()):
        glms.append(OrderedDict((('id', gid), ('type', g.get('type')), ('conditions', g.get('condition_types', [])),
                                 ('loot_table_ids', g.get('loot_table_ids', [])),
                                 ('table_keys', g.get('table_keys', [])),
                                 ('forge_conditions', g.get('forge_conditions')), ('error', g.get('error')),
                                 ('strings', (g.get('strings') or [])[:40]))))
    data['loot_modifiers'] = glms
    if u.get('glm_list'):
        data['global_loot_modifiers_json'] = u['glm_list']
    counts['loot_modifiers'] = len(glms)
    if glms:
        flags.append('ships-loot-modifiers')
    sts = []
    for sid, s in sorted((u.get('wg_structures') or {}).items()):
        e = OrderedDict((('id', sid), ('type', s.get('type')), ('start_pool', s.get('start_pool')),
                         ('biomes', s.get('biomes')), ('step', s.get('step'))))
        if s.get('mod_gate'):
            e['mod_gate'] = s['mod_gate']
        sts.append(e)
    data['structures'] = sts
    data['structure_sets'] = [OrderedDict((('id', sid), ('structures', s.get('structures')),
                                           ('placement', s.get('placement'))))
                              for sid, s in sorted((u.get('structure_sets') or {}).items())]
    data['template_pools'] = sorted(u.get('pools') or {})
    tmpl = u.get('structures') or {}
    data['templates'] = {'n': len(tmpl),
                         'with_loot_table_container': sum(1 for t in tmpl.values()
                                                          if any(c.get('loot_table') for c in t.get('containers', []))),
                         'ids': sorted(tmpl)}
    counts['structures'], counts['structure_sets'] = len(sts), len(data['structure_sets'])
    counts['template_pools'], counts['templates'] = len(data['template_pools']), len(tmpl)
    data['biome_modifiers'] = inv.get('biome_modifiers') or {}
    counts['biome_modifiers'] = len(data['biome_modifiers'])
    spawns = sorted(set(sp[0] for b in data['biome_modifiers'].values() for sp in b.get('sp', [])))
    if spawns:
        data['biome_modifier_spawns'] = spawns
    data['dimensions'] = sorted(u.get('dimensions') or {})
    data['dimension_types'] = inv.get('dimension_types') or []
    counts['dimensions'], counts['dimension_types'] = len(data['dimensions']), len(data['dimension_types'])
    if data['dimensions']:
        flags.append('ships-dimensions')
    rc = inv.get('recipes') or {}
    data['recipes'] = {'n': rc.get('n', 0), 'by_type': rc.get('types', {}), 'conditional': rc.get('cond', 0),
                       'unparseable': rc.get('bad', 0),
                       'by_namespace': dict((ns, len(v)) for ns, v in (rc.get('ids') or {}).items())}
    counts['recipes'] = rc.get('n', 0)
    adv = inv.get('advancements') or {}
    data['advancements'] = sorted(ns + ':' + p for ns, v in adv.items() for p in v)
    counts['advancements'] = len(data['advancements'])
    fn_tags = inv.get('fn_tags') or {}
    data['functions'] = {'ids': inv.get('functions') or [], 'on_tick_tag': (fn_tags.get('tick') or {}).get('v', []),
                         'on_load_tag': (fn_tags.get('load') or {}).get('v', []),
                         'tick_tag_replace': bool((fn_tags.get('tick') or {}).get('r')),
                         'load_tag_replace': bool((fn_tags.get('load') or {}).get('r'))}
    counts['functions'] = len(data['functions']['ids'])
    if data['functions']['on_tick_tag']:
        flags.append('function-on-tick-tag')
    if data['functions']['on_load_tag']:
        flags.append('function-on-load-tag')
    data['damage_types'] = inv.get('damage_types') or []
    counts['damage_types'] = len(data['damage_types'])

    # tags written outside the jar's own namespaces
    shared = OrderedDict((k, []) for k in ('minecraft', 'forge', 'c', 'other'))
    n_own = 0
    n_replace = 0
    for reg, tags in sorted((inv.get('tags') or {}).items()):
        for tid, (r, n) in sorted(tags.items()):
            ns = tid.split(':', 1)[0]
            if ns in own:
                n_own += 1
                continue
            row = [reg, tid, bool(r), n]
            shared[ns if ns in SHARED_NS else 'other'].append(row)
            if r:
                n_replace += 1
    data['tags_into_shared_namespaces'] = shared
    data['tags_in_own_namespaces'] = n_own
    counts['tags_minecraft'], counts['tags_forge'] = len(shared['minecraft']), len(shared['forge'])
    counts['tags_c'], counts['tags_other_ns'] = len(shared['c']), len(shared['other'])
    counts['tags_replace_shared'] = n_replace
    if n_replace:
        flags.append('tag-replace-in-shared-namespace')

    # overrides of vanilla data
    ov = OrderedDict()
    if ctx.get('vanilla_found'):
        v = sorted(t for t in (u.get('loot_tables') or {}) if t in ctx['loot_tables'] and t.split(':', 1)[0] not in own)
        if v:
            ov['loot_tables'] = v
        v = sorted(ns + ':' + p for ns, ids in (rc.get('ids') or {}).items() for p in ids
                   if ns not in own and (ns + ':' + p) in ctx['recipes'])
        if v:
            ov['recipes'] = v
        v = sorted(a for a in data['advancements'] if a.split(':', 1)[0] not in own and a in ctx['advancements'])
        if v:
            ov['advancements'] = v
        v = []
        for key, label in VANILLA_WG:
            v.extend(label + ' ' + rid for rid in (u.get(key) or {})
                     if rid.split(':', 1)[0] not in own and (label + ' ' + rid) in ctx['wg'])
        v.extend('dimension_type ' + rid for rid in data['dimension_types']
                 if rid.split(':', 1)[0] not in own and ('dimension_type ' + rid) in ctx['wg'])
        if v:
            ov['worldgen'] = sorted(v)
    else:
        ov['not_checked'] = 'the vanilla jar was not found (no PrismLauncher libraries folder)'
    data['vanilla_overrides'] = ov
    counts['vanilla_loot_overrides'] = len(ov.get('loot_tables', []))
    counts['vanilla_recipe_overrides'] = len(ov.get('recipes', []))
    counts['vanilla_advancement_overrides'] = len(ov.get('advancements', []))
    counts['vanilla_worldgen_overrides'] = len(ov.get('worldgen', []))
    if ov.get('loot_tables'):
        flags.append('overrides-vanilla-loot-tables')
    if ov.get('recipes'):
        flags.append('overrides-vanilla-recipes')
    if ov.get('worldgen'):
        flags.append('overrides-vanilla-worldgen')

    # 1.21-layout folders
    dead = OrderedDict()
    cats = Counter()
    for c in ns_all.values():
        cats.update(c)
    for k, (n, sample) in (inv.get('dead_dirs') or {}).items():
        twin = jarscan.DEAD_TWIN.get(k)
        dead[k] = {'files': n, 'sample': sample, 'has_1_20_twin': bool(twin and cats.get(twin)),
                   'twin': twin}
    data['folders_1_21_layout'] = dead
    counts['dead_files'] = sum(d['files'] for d in dead.values())
    if any(not d['has_1_20_twin'] for d in dead.values()):
        flags.append('1.21-folder-without-1.20-twin')
    elif dead:
        flags.append('1.21-folders')
    other_cats = dict((k, v) for k, v in sorted(cats.items()))
    data['files_by_folder'] = other_cats
    if inv.get('config_files'):
        data['config_like_files'] = inv['config_files']
    rec['data'] = data

    # ---- language
    lang = inv.get('lang') or {}
    lg = OrderedDict()
    lg['keys'] = lang.get('n', 0)
    lg['entities'] = u.get('lang_entity') or []
    lg['items'] = u.get('lang_item') or []
    lg['blocks'] = len(u.get('lang_block') or [])
    lg['key_mappings'] = lang.get('key') or {}
    lg['game_rules'] = lang.get('gamerule') or []
    lg['attributes'] = lang.get('attribute') or []
    lg['enchantments'] = lang.get('enchantment') or []
    lg['effects'] = lang.get('effect') or []
    lg['by_prefix'] = lang.get('prefix') or {}
    rec['lang'] = lg
    counts['lang_entities'], counts['lang_items'] = len(lg['entities']), len(lg['items'])
    counts['lang_keys'], counts['lang_gamerules'] = len(lg['key_mappings']), len(lg['game_rules'])
    counts['lang_enchantments'] = len(lg['enchantments'])
    if lg['game_rules'] and 'game-rule-register' not in flags:
        flags.append('game-rule-lang-keys')

    notes = list(inv.get('notes') or [])
    if inv.get('error'):
        notes.append(inv['error'])
    if notes:
        rec['notes'] = notes
    rec['counts'] = dict((k, v) for k, v in sorted(counts.items()) if v)
    rec['flags'] = sorted(set(flags))
    return rec


def family_records(fam, ctx):
    """One record per archive of a scanned family (the jar, then every nested jar)."""
    units = fam.get('units') or []
    fam_ids = set()
    for u in units:
        fam_ids.update(m['id'] for m in u.get('mods', []))
        if u.get('fabric_id'):
            fam_ids.add(u['fabric_id'])
        f = (u.get('inv') or {}).get('fabric') or {}
        fam_ids.update(f.get('provides') or [])
    recs = [unit_record(u, fam_ids, ctx) for u in units]
    if recs:
        kids = [r['id'] for r in recs[1:]]
        recs[0]['nested'] = kids
        skipped = sorted(set(n for u in units for n in u.get('skipped_nested', [])))
        if skipped:
            recs[0]['jars_not_under_jarjar'] = skipped
        if kids:
            recs[0]['flags'] = sorted(set(recs[0]['flags'] + ['nested-jars']))
    return recs


def family_summary(recs):
    """Compact, diff-friendly view of one top-level jar: counts over the jar and its nested jars, flags."""
    top = recs[0]
    counts = Counter()
    flags = set()
    for r in recs:
        counts.update(r['counts'])
        for f in r['flags']:
            flags.add(f if r is top else 'nested:' + f)
    out = OrderedDict()
    out['mods'] = ['%s@%s' % (m.get('id'), m.get('version')) for m in top['identity']['mods']]
    out['loader'] = top['identity']['loader'].split(' ', 1)[0]
    if top['side'].get('hint'):
        out['side_hint'] = top['side']['hint'] + (' (declared)' if top['side'].get('declared') else '')
    if len(recs) > 1:
        out['nested'] = OrderedDict(
            (r['id'].split('!', 1)[1], [m.get('id') for m in r['identity']['mods']]) for r in recs[1:])
    out['counts'] = dict((k, v) for k, v in sorted(counts.items()) if v)
    out['flags'] = sorted(flags)
    return out


def build_inventory(args, ctx=None):
    """Scan every installed jar -> (records by top-level jar file name, ctx, stats)"""
    t0 = time.time()
    if ctx is None:
        ctx = base_context(args.repo, args.libraries, args.no_cache)
    tasks, inst = jarscan.mod_tasks(args.mods, args.repo)
    fams, hits = jarscan.scan_all(tasks, scan_cache_dir(args.repo), args.no_cache, args.jobs)
    all_ids = set()
    for t in tasks:
        for u in (fams.get(t['id']) or {}).get('units', []):
            all_ids.update(m['id'] for m in u.get('mods', []))
            if u.get('fabric_id'):
                all_ids.add(u['fabric_id'])
    ctx = dict(ctx, all_mod_ids=all_ids)
    out = OrderedDict()
    errors = []
    for t in tasks:
        fam = fams.get(t['id']) or {}
        if fam.get('error') or not fam.get('units'):
            errors.append('%s: %s' % (t['id'], fam.get('error') or 'no units'))
            continue
        recs = family_records(fam, ctx)
        recs[0]['source'] = 'repo mods/ (committed custom jar)' if t.get('repo_copy') else 'instance mods/'
        if t.get('repo_copy'):
            recs[0]['instance_sha256'] = t.get('instance_sha256')
        out[os.path.basename(t['path'])] = recs
    stats = {'jars': len(out), 'archives': sum(len(v) for v in out.values()), 'cache_hits': hits,
             'scanned_now': len(tasks) - hits, 'elapsed_s': round(time.time() - t0, 1), 'errors': errors,
             'instance_jars': len(inst)}
    return out, ctx, stats


def summary_doc(inventory):
    doc = OrderedDict()
    doc['_about'] = ('Generated by dev/mods/inventory.py from the jars themselves: counts over each jar and its '
                     'nested jars, and flags. Static evidence only (a language key is not a registration). '
                     'Do not edit by hand; regenerate after a jar changes.')
    doc['scanner_version'] = jarscan.SCANNER_VERSION
    doc['jars'] = len(inventory)
    doc['archives'] = sum(len(v) for v in inventory.values())
    doc['mods'] = OrderedDict((name, family_summary(recs)) for name, recs in sorted(inventory.items(),
                                                                                    key=lambda kv: kv[0].lower()))
    return doc


def dump_json(doc):
    return json.dumps(doc, indent=1, ensure_ascii=True) + '\n'


# --------------------------------------------------------------------------- hashes against the index

def jar_hashes(path, formats=('sha1', 'sha256', 'sha512')):
    hs = dict((f, hashlib.new(f)) for f in formats)
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            for h in hs.values():
                h.update(chunk)
    return dict((k, h.hexdigest()) for k, h in hs.items())


def verify_against_index(mods_dir, indexes, cache_file=None):
    """Hash every instance jar and compare with the hash each index records for that file name.
    -> {'ok': n, 'mismatch': [...], 'unverifiable': [...], 'not_in_any_index': [...], 'missing_jar': {...}}"""
    cache = {}
    if cache_file and os.path.isfile(cache_file):
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                cache = json.load(f)
        except (OSError, ValueError):
            cache = {}
    jars = sorted(f for f in os.listdir(mods_dir) if f.endswith('.jar')) if os.path.isdir(mods_dir) else []
    res = {'jars': len(jars), 'ok': 0, 'mismatch': [], 'unverifiable': [], 'not_in_any_index': [],
           'missing_jar': {}}
    dirty = False
    for f in jars:
        p = os.path.join(mods_dir, f)
        st = os.stat(p)
        key = '%s|%d|%d' % (f, st.st_size, int(st.st_mtime))
        h = cache.get(key)
        if h is None:
            h = cache[key] = jar_hashes(p)
            dirty = True
        listed = False
        good = True
        for distro, entries in indexes.items():
            e = entries.get(f)
            if e is None:
                continue
            listed = True
            fmt = (e.get('hash_format') or '').lower()
            if fmt not in h or not e.get('hash'):
                res['unverifiable'].append({'jar': f, 'index': distro, 'hash_format': e.get('hash_format')})
                continue
            if h[fmt].lower() != str(e['hash']).lower():
                good = False
                res['mismatch'].append({'jar': f, 'index': distro, 'metafile': e['metafile'], 'hash_format': fmt,
                                        'index_hash': e['hash'], 'jar_hash': h[fmt]})
        if not listed:
            res['not_in_any_index'].append(f)
        elif good:
            res['ok'] += 1
    for distro, entries in indexes.items():
        miss = sorted(fn for fn in entries if fn not in set(jars))
        if miss:
            res['missing_jar'][distro] = miss
    if dirty and cache_file:
        os.makedirs(os.path.dirname(cache_file), exist_ok=True)
        with open(cache_file, 'w', encoding='utf-8') as f:
            json.dump(cache, f)
    return res


# --------------------------------------------------------------------------- intake skeleton

BOOT = 'NEEDS A BOOT'


def intake_skeleton(recs, repo, ctx):
    """One block per pack system (survey section C) for a candidate jar: what it ships that touches the system,
    what happens if nobody decides, the decision, and what the jar cannot tell.  -> list of dicts"""
    top = recs[0]
    names = []
    for r in recs:
        names.extend(m.get('id') for m in r['identity']['mods'])

    def every(path, default=None):
        out = []
        for r in recs:
            v = r
            for k in path:
                v = v.get(k) if isinstance(v, dict) else None
                if v is None:
                    break
            if v:
                out.append((r, v))
        return out

    def tag(r):
        return '' if r is top else ' [nested %s]' % r['file']

    boss_names, dim_names = {}, {}
    mentions = None
    have_repo = os.path.isdir(os.path.join(repo, 'kubejs', 'server_scripts'))
    if have_repo:
        boss_names, _ = packlists.boss_lists(repo)
        dim_names, _ = packlists.dimension_lists(repo)
    blocks = []

    def block(surface, ships, default, decide, boot=None, pack=None):
        blocks.append(OrderedDict((('surface', surface), ('ships', ships), ('default', default),
                                   ('decide', decide), ('needs_boot', boot or []), ('pack', pack or []))))

    # 1 side and server safety
    ships = []
    for r in recs:
        s = r['side']
        ships.append('%s%s: loader %s; mixins common/client/server %d/%d/%d; %d of %d classes name client packages'
                     % (r['file'], '' if r is top else ' (nested)', r['identity']['loader'].split(' ', 1)[0],
                        s['mixins']['common'], s['mixins']['client'], s['mixins']['server'],
                        s['classes_naming_client_packages'], s['classes']))
        if s.get('declared'):
            ships.append('   declared %s-only (%s)' % (s['declared'], '; '.join(s['reasons']) or 'fabric environment'))
        elif s['reasons']:
            ships.append('   leans client: ' + '; '.join(s['reasons']))
        for cfg, mix, tgt in s.get('common_mixins_into_client_classes', [])[:6]:
            ships.append('   COMMON-listed mixin %s (%s) targets the client class %s' % (mix, cfg, tgt))
        for m in s.get('mod_classes', []):
            if m.get('client'):
                ships.append('   its @Mod class %s names client classes%s' % (
                    m['c'].rsplit('/', 1)[-1], '' if m.get('dist_guard') else ' and has no Dist / DistExecutor guard'))
        for f in r['flags']:
            if f.startswith('mixin-'):
                ships.append('   ' + f)
    block('Side and dedicated-server safety', ships,
          'The jar is delivered wherever the index puts it. A client-only jar in the server index stops the server '
          'at load and the error names other mods.',
          ['side label in each of the three indexes (both / client / server)',
           'if client-only: keep it out of the server index and add it to every client-only list'],
          ['whether the dedicated server loads with it: only a headless boot proves it (a clean jar can carry an '
           'unsafe nested library)', 'whether each mixin applies (the `Mixing ... into ...` lines of debug.log)'])

    # 2 nested jars
    if len(recs) > 1:
        ships = []
        for r in recs[1:]:
            what = [f for f in r['flags'] if f not in ('no-mod-metadata',)]
            ships.append('%s: mods %s%s' % (r['id'].split('!', 1)[1], [m.get('id') for m in r['identity']['mods']] or '-',
                                            ('; ' + ', '.join(what)) if what else ''))
        block('Nested jars (invisible to the index)', ships,
              'Every nested mod loads with its parent; Forge keeps the highest version of a library that several '
              'jars nest. Nothing in the index says they exist.',
              ['is each nested mod wanted (its hooks, key mappings, screens and loot code come along)',
               'does a nested mod duplicate one the pack already has at another version'],
              ['which copy of a multiply-nested library actually loads'])

    # 3 tier gates
    items = sum(len(r['lang']['items']) for r in recs)
    block('Tier / stage gates', ['%d item language keys, %d recipes' % (items, sum(r['counts'].get('recipes', 0) for r in recs))],
          'Every item is tier 1: usable, craftable and visible from the first minute.',
          ['which items are gated, and how (stage gate, recipe removal, chest pool, boss drop)',
           'whether the whole mod is staged (stageMod)'],
          ['the registered item ids (a language key or model is not a registration)'])

    # 4 dimensions
    dims = [(r, d) for r in recs for d in r['data']['dimensions']]
    if dims:
        ships, pack = [], []
        for r, d in dims:
            ships.append('%s%s' % (d, tag(r)))
            if have_repo:
                inl = ['%s%s' % (n.split(' (')[0], '' if v.get(d) is None else ' = tier %s' % v[d])
                       for n, v in dim_names.items() if d in v]
                pack.append('%s: %s' % (d, ('listed in ' + '; '.join(inl)) if inl else 'in NO dimension list of the pack'))
        block('Dimension to tier', ships,
              'An unlisted dimension is tier 1 everywhere: enterable at once, tier-1 difficulty curve, no tier loot '
              'pools, tier-1 affix rarities.',
              ['the tier of each dimension, then the same id into every list: the stage gate, the difficulty config, '
               'the three Apotheosis lists, the loot rules'], ['the registered dimension id (must match exactly)'], pack)

    # 5 loot
    ships = []
    for r in recs:
        lt = r['data']['loot_tables']
        if any(lt.values()):
            ships.append('loot tables%s: %s' % (tag(r), ', '.join('%d %s' % (len(v), k) for k, v in lt.items() if v)))
        if r['data']['structures']:
            ships.append('worldgen structures%s: %d in %d sets; %d templates, %d with a loot container'
                         % (tag(r), len(r['data']['structures']), len(r['data']['structure_sets']),
                            r['data']['templates']['n'], r['data']['templates']['with_loot_table_container']))
        for g in r['data']['loot_modifiers'][:12]:
            ships.append('LOOT MODIFIER%s %s (type %s%s)' % (tag(r), g['id'], g['type'],
                                                             (', on ' + ', '.join(g['loot_table_ids'][:3])) if g['loot_table_ids'] else ''))
        if len(r['data']['loot_modifiers']) > 12:
            ships.append('   ... %d more loot modifiers' % (len(r['data']['loot_modifiers']) - 12))
        for t in r['data']['vanilla_overrides'].get('loot_tables', [])[:8]:
            ships.append('OVERRIDES the vanilla table %s%s' % (t, tag(r)))
        if 'loot_code' in r['code']['hints']:
            ships.append('loot code%s: %d classes use LootTableLoadEvent / LootModifier (%s)' % (
                tag(r), r['code']['hints']['loot_code']['classes'],
                ', '.join(c.rsplit('/', 1)[-1] for c in r['code']['hints']['loot_code']['sample'][:4])))
    if ships:
        block('Tiered loot', ships,
              "Its chests roll the mod's own table, minus the pack's global strips, plus the pools of the dimension "
              'they generate in. Its loot modifiers stay active (the pack does not replace the global list) and run '
              'on every table they match.',
              ['what each new structure\'s chests should roll, and in which tier',
               'whether each loot modifier stays, is retargeted, or is switched off',
               'whether a vanilla-table override is wanted (the pack\'s own overrides and rules sit on top)'],
              ['tables assigned from code (no chest NBT names them)', 'whether each table parses on this mod set'])

    # 6 bosses and mobs
    ships, pack = [], []
    for r in recs:
        bl = r['code'].get('boss_like') or {}
        weak = []
        for e, info in bl.get('entities', {}).items():
            if info['strength'] != 'strong':
                weak.append(e)
                continue
            ships.append('boss-like%s: %s  (%s)' % (tag(r), e, '; '.join(info['evidence'][:3])))
            if have_repo:
                inl = [n for n, v in boss_names.items() if e in v]
                pack.append('%s: %s' % (e, ('in ' + '; '.join(inl)) if inl else 'in NO boss list of the pack'))
        if weak:
            ships.append('%d more entities%s only inherit a boss bar from a shared base class (weak): %s%s'
                         % (len(weak), tag(r), ', '.join(weak[:12]), ' ...' if len(weak) > 12 else ''))
        for c in bl.get('unmatched_classes', [])[:8]:
            ships.append('boss bar in class %s%s, no entity language key matches its name' % (c.rsplit('/', 1)[-1], tag(r)))
        if r['lang']['entities']:
            ships.append('%d entity language keys%s: %s%s' % (len(r['lang']['entities']), tag(r),
                                                              ', '.join(r['lang']['entities'][:10]),
                                                              ' ...' if len(r['lang']['entities']) > 10 else ''))
        if r['data'].get('biome_modifier_spawns'):
            ships.append('adds spawns through biome modifiers%s: %s' % (tag(r), ', '.join(r['data']['biome_modifier_spawns'][:10])))
        for h, text in (('attr_modify', 'changes attributes of EXISTING entities (EntityAttributeModificationEvent)'),
                        ('spawn_hook', 'hooks mob spawning (MobSpawnEvent)'),
                        ('hurt_hook', 'hooks damage (LivingHurt / LivingDamage / LivingAttack)')):
            if h in r['code']['hints']:
                ships.append('%s%s: %s' % (text, tag(r), ', '.join(c.rsplit('/', 1)[-1] for c in r['code']['hints'][h]['sample'][:4])))
    if ships:
        block('Bosses, mobs and scaling', ships,
              'An entity nobody lists is a plain hostile mob: x3.0 health plus the dimension curve, no boss health '
              'table, no tokens, drops, compass, quest or Codex page. A hostile mob registered outside the MONSTER '
              'category is not scaled at all; a projectile registered as MONSTER gets health and gear.',
              ['boss, miniboss or mob for each boss-like entity, then the same id into every boss list',
               'which helper entities go on the equipment and scaling blacklists',
               'whether an attribute, spawn or damage hook is wanted next to the pack\'s own'],
              ['the registered entity ids, each entity\'s MobCategory and base attributes',
               'which entities really show a boss bar (a bar set up in a shared base class is inherited by all)'], pack)

    # 7 gear
    ships = []
    for r in recs:
        ib = r['code'].get('item_base_classes') or {}
        if ib:
            ships.append('item classes%s by base: %s' % (tag(r), ', '.join('%s %d' % kv for kv in sorted(ib.items()))))
        if 'curio_item' in r['code']['hints']:
            ships.append('curio items%s: %d classes' % (tag(r), r['code']['hints']['curio_item']['classes']))
        if r['lang']['enchantments']:
            ships.append('enchantments%s: %s' % (tag(r), ', '.join(r['lang']['enchantments'][:12])))
        if r['lang']['attributes']:
            ships.append('attributes%s: %s' % (tag(r), ', '.join(r['lang']['attributes'][:8])))
    if ships:
        block('Armor / weapon class, Apotheosis, attributes', ships,
              'Armor is "medium" (no effect); a staff resolves to a sword or to nothing. Gear gets affixes by its item '
              'class, and the mod\'s chests get the catch-all 20 % affix items. A new enchantment is lootable and '
              'tradeable. A new attribute is outside the pack\'s attribute sync.',
              ['weight class of each armor set and the class of each weapon (the icraft:armor_* and magic_weapon tags)',
               'Apotheosis category overrides and loot rules for its tables',
               'whether each enchantment is allowed in loot and trades'],
              ['the registered item ids and their real classes (a mod may build items without a class of its own)'])

    # 8 duplicates / shared tags
    ships = []
    for r in recs:
        sh = r['data']['tags_into_shared_namespaces']
        for ns in ('forge', 'c', 'minecraft', 'other'):
            if sh[ns]:
                rep = [t for t in sh[ns] if t[2]]
                ships.append('%d tags into %s%s%s: %s%s' % (
                    len(sh[ns]), ns if ns != 'other' else 'other namespaces', tag(r),
                    (' (%d with replace:true: %s)' % (len(rep), ', '.join('%s %s' % (t[0], t[1]) for t in rep[:5]))) if rep else '',
                    ', '.join(sorted(set(t[1] for t in sh[ns]))[:6]), ' ...' if len(sh[ns]) > 6 else ''))
        for k in ('recipes', 'advancements', 'worldgen'):
            v = r['data']['vanilla_overrides'].get(k)
            if v:
                ships.append('OVERRIDES %d vanilla %s%s: %s%s' % (len(v), k, tag(r), ', '.join(v[:6]), ' ...' if len(v) > 6 else ''))
        if r['data'].get('namespaces_no_installed_mod_has'):
            ships.append('data namespaces that are not its mod id%s: %s' % (tag(r), ', '.join(r['data']['namespaces_no_installed_mod_has'])))
    if ships:
        block('Shared namespaces, duplicates and overrides', ships,
              'Its entries join the shared tags, so its ores, ingots and foods become interchangeable with the '
              'pack\'s; duplicates coexist (there is no unification layer). replace:true wipes every other mod\'s '
              'entries in that tag. A vanilla override wins over the vanilla file and loses to the pack\'s datapacks.',
              ['which duplicate is the canonical one (and what happens to the other: hidden, recipe removed)',
               'whether each replace:true and each vanilla override is wanted',
               'if the data namespace is not the mod id: every pack rule keyed on the mod id misses its tables'],
              ['which of two mods wins a file both ship (no order between mod jars)'])

    # 9 functions
    ships = []
    for r in recs:
        f = r['data']['functions']
        if f['ids']:
            ships.append('%d functions%s; on the tick tag: %s; on the load tag: %s' % (
                len(f['ids']), tag(r), ', '.join(f['on_tick_tag']) or 'none', ', '.join(f['on_load_tag']) or 'none'))
    if ships:
        block('Functions', ships,
              'A function on minecraft:tick runs twenty times a second for the whole server; one that fails to '
              'parse disables the tag\'s whole list for that pack with a single boot warning.',
              ['is a per-tick function acceptable (cost, what it summons or loots)'],
              ['whether every function parses on this mod set'])

    # 10 keys
    ships = []
    for r in recs:
        if r['lang']['key_mappings']:
            ships.append('%d key.* language keys%s: %s' % (len(r['lang']['key_mappings']), tag(r),
                                                           ', '.join(list(r['lang']['key_mappings'])[:8])))
        if 'key_mapping' in r['code']['hints']:
            ships.append('%d classes use KeyMapping%s' % (r['code']['hints']['key_mapping']['classes'], tag(r)))
    if ships:
        block('Key mappings', ships,
              'The mod\'s compiled default keys apply unaudited and may stack on keys the pack already uses.',
              ['the default key of each mapping (dev/gen_keybinds.ps1: baseline, overrides, allowed stacks)'],
              ['the mapping names it registers and their default keys: only a client boot shows them (a class can '
               'name KeyMapping and register none)'])

    # 11 screens
    ships = ['%s: %d classes hook screen init (%s)' % (r['file'], r['code']['hints']['screen_init']['classes'],
                                                        ', '.join(c.rsplit('/', 1)[-1] for c in r['code']['hints']['screen_init']['sample'][:4]))
             for r in recs if 'screen_init' in r['code']['hints']]
    if ships:
        block('Inventory buttons and screens', ships,
              'A widget lands where the mod puts it, on top of whatever the pack already shows there.',
              ['is the button / tab wanted, and where'], ['widget positions: only a client shows them'])

    # 12 worldgen
    ships = []
    for r in recs:
        for s in r['data']['structure_sets'][:10]:
            pl = s.get('placement') or {}
            ships.append('structure set %s%s: spacing %s separation %s (%d structures)' % (
                s['id'], tag(r), pl.get('spacing'), pl.get('separation'), len(s.get('structures') or [])))
        if len(r['data']['structure_sets']) > 10:
            ships.append('   ... %d more structure sets' % (len(r['data']['structure_sets']) - 10))
        bm = Counter(b.get('t') for b in r['data']['biome_modifiers'].values())
        if bm:
            ships.append('biome modifiers%s: %s' % (tag(r), ', '.join('%d %s' % (n, t) for t, n in bm.most_common())))
        wg = dict((k, v) for k, v in r['data']['files_by_folder'].items() if k.startswith('worldgen/'))
        if wg:
            ships.append('worldgen files%s: %s' % (tag(r), ', '.join('%d %s' % (v, k[9:]) for k, v in sorted(wg.items()))))
    if ships:
        block('Worldgen', ships,
              'Ores, structure spacing and biome weights stay at the mod\'s defaults; a structure generates in every '
              'biome its own tags name, in whatever dimension those biomes are.',
              ['spacing / separation of each structure set against the pack\'s density',
               'ores and features: keep, retune or remove (the worldgen override datapack)'],
              ['feature-order cycles and what actually generates'])

    # 13 game rules
    ships = []
    for r in recs:
        if r['lang']['game_rules']:
            ships.append('%d gamerule.* keys%s: %s' % (len(r['lang']['game_rules']), tag(r), ', '.join(r['lang']['game_rules'][:8])))
        if 'game_rule_register' in r['code']['hints']:
            ships.append('%d classes register game rules%s' % (r['code']['hints']['game_rule_register']['classes'], tag(r)))
    if ships:
        pack = []
        if have_repo:
            known = packlists.game_rule_defaults(repo)
            if known is not None:
                pack.append('config/Crust/default_game_rules.toml lists %d rules; a rule it does not list brings the '
                            'boot error back' % len(known))
        block('Game rules', ships,
              'A new rule keeps the mod\'s default, and the defaults file must list it or the boot logs an error.',
              ['the value of each rule, and its line in the game-rule defaults file'],
              ['the registered rule names (language keys are not the rule ids)'], pack)

    # 14 config
    ships = []
    for r in recs:
        if 'config_spec' in r['code']['hints'] or r['code'].get('config_types'):
            ships.append('%s: Forge config spec in %d classes, types %s' % (
                r['file'], r['code']['hints'].get('config_spec', {}).get('classes', 0),
                ', '.join(r['code'].get('config_types', [])) or 'not found statically'))
        if r['data'].get('config_like_files'):
            ships.append('%s ships config-like files: %s' % (r['file'], ', '.join(r['data']['config_like_files'][:6])))
    if ships:
        block('Config per distro', ships,
              'The server and every client generate their own default config; nothing tracks it and the values can '
              'differ between boxes. A SERVER-type config lives in the world folder.',
              ['which values the pack sets, and whether the file is tracked in the three distros',
               'whether a server-only value belongs on the server\'s override layer'],
              ['the file names and default values (built in code): boot once and read the generated files'])

    # 15 dead data
    ships = []
    for r in recs:
        for k, d in r['data']['folders_1_21_layout'].items():
            ships.append('%d files under %s/%s%s (%s)' % (d['files'], '<ns>', k, tag(r),
                                                          'a 1.20.1-layout folder of that kind is there too, not necessarily with the same files' if d['has_1_20_twin']
                                                          else 'NO 1.20.1 twin: this content is absent in game'))
    if ships:
        block('Data the game never reads', ships,
              'A 1.21-layout folder is ignored by 1.20.1: tags, loot tables or advancements in it do not exist in game.',
              ['is something expected from those files (a boss tag, a recipe) that the pack must supply itself'], [])

    block('Codex, quests, wiki', ['mod ids: ' + ', '.join(str(n) for n in names if n)],
          'The mod appears in the generated mod list only: no Codex page, no quest, no tier note.',
          ['Codex and quest mention; removal plan (deny-list pattern, config and script references)'], [])
    return blocks


def render_skeleton(recs, blocks):
    top = recs[0]
    out = []
    mods = ', '.join('%s %s' % (m.get('id'), m.get('version')) for m in top['identity']['mods']) or '(no mod id)'
    out.append('INTAKE SKELETON  %s' % top['file'])
    out.append('  mods: %s   loader: %s   sha256: %s' % (mods, top['identity']['loader'], top['sha256']))
    deps = ['%s%s %s' % (d['id'], '' if d.get('mandatory') else '?', d.get('range') or '')
            for d in top['identity']['dependencies'] if d['id'] not in ('minecraft', 'forge')]
    if deps:
        out.append('  depends on: %s   (? = optional)' % ', '.join(deps))
    out.append('  flags: %s' % (', '.join(top['flags']) or 'none'))
    out.append('  Static evidence only. Lines marked %s cannot be answered from the jar.' % BOOT)
    out.append('')
    for i, b in enumerate(blocks, 1):
        out.append('%d. %s' % (i, b['surface'].upper()))
        for s in b['ships']:
            out.append('     ' + s)
        for s in b['pack']:
            out.append('     pack: ' + s)
        out.append('   default : ' + b['default'])
        for s in b['decide']:
            out.append('   DECIDE  : ' + s)
        for s in b['needs_boot']:
            out.append('   %s: %s' % (BOOT, s))
        out.append('')
    return '\n'.join(out)


# --------------------------------------------------------------------------- main

def find_installed(inventory, needle):
    needle = needle.lower()
    hits = []
    for name, recs in inventory.items():
        if needle in name.lower() or any(needle == str(m.get('id')).lower() for r in recs for m in r['identity']['mods']):
            hits.append(name)
    return hits


def main():
    ap = argparse.ArgumentParser(description='Per-jar inventory of the installed mods, or an intake skeleton for a jar.')
    ap.add_argument('jars', nargs='*', help='candidate jar(s): print the intake skeleton instead of scanning the pack')
    ap.add_argument('--mods', default=default_mods_dir())
    ap.add_argument('--repo', default=os.path.dirname(os.path.dirname(HERE)), help="the repo's .minecraft folder")
    ap.add_argument('--libraries', default=default_libraries(), help='PrismLauncher libraries (vanilla / Forge jars)')
    ap.add_argument('--no-cache', action='store_true', help='rescan every jar')
    ap.add_argument('--jobs', type=int, default=0)
    ap.add_argument('--show', default='', help='print the full record(s) of an installed jar (file name or mod id)')
    ap.add_argument('--check', action='store_true', help='exit 1 when %s is out of date' % SUMMARY_NAME)
    ap.add_argument('--json', default='', help='also write what is printed as JSON')
    args = ap.parse_args()
    args.repo = os.path.abspath(args.repo)
    args.mods = os.path.abspath(args.mods)

    if args.jars:
        ctx = base_context(args.repo, args.libraries, args.no_cache)
        # mod ids of the installed pack, so "another mod's namespace" can be told from "no mod's namespace"
        try:
            with open(os.path.join(out_cache_dir(args.repo), 'inventory.json'), 'r', encoding='utf-8') as f:
                installed = json.load(f)
            ctx['all_mod_ids'] = set(m.get('id') for recs in installed['records'].values() for r in recs
                                     for m in r['identity']['mods'])
        except (OSError, ValueError, KeyError):
            pass
        docs = []
        rc = 0
        for jar in args.jars:
            jar = os.path.abspath(jar)
            if not os.path.isfile(jar):
                print('not a file: %s' % jar, file=sys.stderr)
                rc = 2
                continue
            task = {'kind': 'mod', 'id': 'mod:' + os.path.basename(jar), 'path': jar, 'classes': True, 'order': 2}
            fams, _ = jarscan.scan_all([task], scan_cache_dir(args.repo), args.no_cache, 1)
            fam = fams.get(task['id']) or {}
            if fam.get('error') or not fam.get('units'):
                print('cannot read %s: %s' % (jar, fam.get('error')), file=sys.stderr)
                rc = 2
                continue
            recs = family_records(fam, ctx)
            blocks = intake_skeleton(recs, args.repo, ctx)
            print(render_skeleton(recs, blocks))
            docs.append({'jar': os.path.basename(jar), 'sha256': recs[0]['sha256'], 'records': recs, 'skeleton': blocks})
        if args.json:
            with open(args.json, 'w', encoding='utf-8', newline='\n') as f:
                f.write(dump_json(docs))
        return rc

    inventory, ctx, stats = build_inventory(args)
    if not inventory:
        print('no jars found in %s' % args.mods, file=sys.stderr)
        return 2
    if args.show:
        hits = find_installed(inventory, args.show)
        if not hits:
            print('no installed jar matches %r' % args.show, file=sys.stderr)
            return 2
        doc = OrderedDict((h, inventory[h]) for h in hits)
        sys.stdout.write(dump_json(doc))
        return 0
    summary = dump_json(summary_doc(inventory))
    spath = os.path.join(HERE, SUMMARY_NAME)
    if args.check:
        try:
            with open(spath, 'r', encoding='utf-8') as f:
                current = f.read()
        except OSError:
            current = None
        if current != summary:
            print('[inventory] %s is OUT OF DATE (a jar changed what it ships, or the scanner changed). '
                  'Regenerate: python -I .minecraft/dev/mods/inventory.py' % SUMMARY_NAME)
            return 1
        print('[inventory] %s is up to date (%d jars).' % (SUMMARY_NAME, len(inventory)))
        return 0
    od = out_cache_dir(args.repo)
    os.makedirs(od, exist_ok=True)
    full = OrderedDict((('scanner_version', jarscan.SCANNER_VERSION), ('generated', time.strftime('%Y-%m-%dT%H:%M:%S')),
                        ('stats', stats), ('records', inventory)))
    tmp = os.path.join(od, 'inventory.json.tmp')
    with open(tmp, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(full, f, separators=(',', ':'))
    os.replace(tmp, os.path.join(od, 'inventory.json'))
    with open(spath, 'w', encoding='utf-8', newline='\n') as f:
        f.write(summary)
    flags = Counter(f for recs in inventory.values() for f in family_summary(recs)['flags'])
    print('inventory.py: %d jars, %d archives (%d nested) | cache hits %d, scanned %d | %.1fs'
          % (stats['jars'], stats['archives'], stats['archives'] - stats['jars'], stats['cache_hits'],
             stats['scanned_now'], stats['elapsed_s']))
    print('full records -> %s (%.1f MB)' % (os.path.join(od, 'inventory.json'),
                                            os.path.getsize(os.path.join(od, 'inventory.json')) / 1e6))
    print('summary      -> %s (%.0f KB)' % (spath, os.path.getsize(spath) / 1e3))
    for e in stats['errors']:
        print('ERROR ' + e)
    print('flags: ' + ', '.join('%s=%d' % kv for kv in sorted(flags.items())))
    if args.json:
        with open(args.json, 'w', encoding='utf-8', newline='\n') as f:
            f.write(dump_json(full))
    return 0


if __name__ == '__main__':
    multiprocessing.freeze_support()
    sys.exit(main())
