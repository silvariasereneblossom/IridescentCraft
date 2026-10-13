#!/usr/bin/env python3
"""intake_derive.py -- from evidence to an intake record.

Evidence, in the order it is trusted:
    a boot diff (dev/boot)        what the game REGISTERED with the mod in: ids per registry, entity facts, game
                                  rules, rejected data, mixins, new log lines. Only `add` and `update` have it.
    the registry snapshot         dev/registry: the game's own id lists of main, attributed to a mod by namespace.
                                  What the grandfathered records are made from.
    the per-jar inventory         dev/mods/inventory.py: what the jar ships. Static: a language key is not a
                                  registration.
    the pack's own state          the registries, the index, the tracked configs, the scripts, the quests.

One function per surface. Each returns the decisions the mod NEEDS (none when the mod does not touch the
surface) with the evidence, and, for a grandfathered mod, whether the pack already holds the answer.

WHEN A GRANDFATHERED DECISION COUNTS AS ANSWERED (the rule, in one place: `pack_answer` in each function):
only when the pack holds an answer for exactly that subject that a tool can read: the metafile's side; a
registry entry for the entity or the dimension; `stageMod` naming the mod; every armor piece in a weight tag;
every key mapping in the keybind baseline; every registered game rule in the defaults file; a tracked config in
every distro the jar installs to; a quest or Codex file naming the mod; the loot audit naming a rule for
every chest table. Anything else is OWED, with what the pack says about it listed as `pack` lines.
"""
import os
import re
from collections import OrderedDict

import intake_core as core

SHARED_NS = ('minecraft', 'forge', 'c')
ARMOR_RX = re.compile(r'_(helmet|chestplate|leggings|boots)$')
WEAPON_BASES = ('SwordItem', 'AxeItem', 'BowItem', 'CrossbowItem', 'TridentItem', 'ProjectileWeaponItem', 'ShieldItem')
ARMOR_BASES = ('ArmorItem',)
# first segment of a forge / c item tag that names a material or a food: two mods that both fill
# `forge:ingots/steel` each ship a steel ingot
MATERIAL_TAGS = ('ores', 'ingots', 'nuggets', 'gems', 'dusts', 'storage_blocks', 'raw_materials', 'plates', 'rods',
                 'gears', 'wires', 'crops', 'seeds', 'fruits', 'vegetables', 'grain', 'flour', 'dough', 'bread',
                 'milk', 'cheese', 'cooked_meat', 'raw_meat', 'salt', 'sugar')
CAP = 14


def cap(items, n=CAP):
    items = list(items)
    return items[:n] + (['... and %d more' % (len(items) - n)] if len(items) > n else [])


def join(items, n=CAP):
    items = list(items)
    return ', '.join(str(x) for x in items[:n]) + (' ... (%d in all)' % len(items) if len(items) > n else '')


# --------------------------------------------------------------------------- what the pack says (built once)

class PackState(object):
    """Everything about the pack a record is compared with. Built once for all mods; reads the repo only."""

    def __init__(self, inventory=None, findings=None):
        import packlists
        self.regs = core.Registries()
        self.findings = findings
        self.dump = self._dump()
        self.stage_mods = {}
        text = packlists.read_text(core.mc('kubejs/server_scripts/gates/astages_restrictions.js')) or ''
        for m in re.finditer(r"stageMod\(\s*'tier_(\d)'\s*,\s*'([a-z0-9_]+)'", packlists.strip_js_comments(text)):
            self.stage_mods[m.group(2)] = int(m.group(1))
        self.item_tags = {}
        for tag in ('armor_robe', 'armor_light', 'armor_medium', 'armor_heavy', 'magic_weapon'):
            ids = set()
            try:
                for v in core.read_json(core.mc('kubejs/data/icraft/tags/items/%s.json' % tag)).get('values') or []:
                    ids.add(v if isinstance(v, str) else v.get('id'))
            except (OSError, ValueError):
                pass
            self.item_tags[tag] = ids
        self.keybinds = packlists.keybind_baseline(MC_DIR)
        self.crust_rules = packlists.game_rule_defaults(MC_DIR)
        self.tracked = packlists.tracked_configs(MC_DIR)
        self.apoth = packlists.read_text(core.mc('config/apotheosis/adventure.cfg')) or ''
        self.dim_lists, _ = packlists.dimension_lists(MC_DIR)
        self.boss_lists, _ = packlists.boss_lists(MC_DIR)
        self._mentions = None
        self.quest_ns = self._namespaces_named(('config/heracles/quests', 'datapack_sources/iridescent_codex'))
        self.tag_writers = {}
        self.all_mod_ids = set()
        self.boss_like = {}                      # entity id -> [evidence], strong evidence only, from every jar
        self.boss_weak = {}
        for name, recs in (inventory or {}).items():
            for r in recs:
                self.all_mod_ids.update(m.get('id') for m in r['identity']['mods'])
                for e, info in ((r['code'].get('boss_like') or {}).get('entities') or {}).items():
                    if info['strength'] == 'strong':
                        own = e.split(':', 1)[0] in [m.get('id') for rr in recs for m in rr['identity']['mods']]
                        self.boss_like.setdefault(e, []).extend(
                            x if own else '%s (says %s)' % (x, name) for x in info['evidence'][:3])
                    else:
                        self.boss_weak.setdefault(e, name)
                for ns in ('forge', 'c'):
                    for reg, tag, _rep, _n in r['data']['tags_into_shared_namespaces'][ns]:
                        if reg == 'items' and material_tag(tag):
                            self.tag_writers.setdefault(tag, set()).add(name)

    def _dump(self):
        d = {'dimensions': [], 'entities': {}, 'structures': [], 'items': {}, 'game_rules': [], 'source': ''}
        root = core.mc('dev/registry')

        def lines(fn):
            try:
                with open(os.path.join(root, fn), 'r', encoding='utf-8') as f:
                    return [ln.strip() for ln in f if ln.strip()]
            except OSError:
                return []
        d['dimensions'] = lines('dimensions.txt')
        d['structures'] = lines('structures.txt')
        d['game_rules'] = lines('game_rules.txt')
        for i in lines('items.txt'):
            d['items'].setdefault(i.split(':', 1)[0], []).append(i)
        try:
            d['entities'] = core.read_json(os.path.join(root, 'entities.json')).get('entities') or {}
        except (OSError, ValueError):
            d['entities'] = dict((e, {}) for e in lines('entity_types.txt'))
        try:
            d['source'] = 'dev/registry @%s' % str(core.read_json(os.path.join(root, 'SOURCE.json')).get('commit'))[:8]
        except (OSError, ValueError):
            d['source'] = ''
        return d

    def _namespaces_named(self, roots):
        """namespace -> number of files under `roots` that name an id of it"""
        import packlists
        out = {}
        for rel in roots:
            for dp, _dn, fn in os.walk(core.mc(rel)):
                for f in fn:
                    if not f.endswith(('.json', '.snbt', '.txt', '.mcfunction', '.js')):
                        continue
                    text = packlists.read_text(os.path.join(dp, f)) or ''
                    for ns in set(t.split(':', 1)[0] for t in packlists.RX_ID.findall(text)):
                        out[ns] = out.get(ns, 0) + 1
        return out

    def mentions(self):
        if self._mentions is None:
            import packlists
            self._mentions = packlists.Mentions(MC_DIR)
        return self._mentions


MC_DIR = core.MC


def material_tag(tag):
    path = tag.split(':', 1)[-1]
    return '/' in path and path.split('/', 1)[0] in MATERIAL_TAGS


def config_hits(mod_ids, files):
    """Tracked config files that belong to one of the mod ids: the file or its first folder is named for it."""
    hits = []
    for f in sorted(files):
        parts = f.split('/')[1:]                       # drop config/ or defaultconfigs/
        if not parts:
            continue
        first = parts[0]
        stem = first.rsplit('.', 1)[0] if len(parts) == 1 else first
        for mid in mod_ids:
            if not mid or len(mid) < 3:
                continue
            if stem == mid or (len(parts) == 1 and re.match(re.escape(mid) + r'[-_.]', first)):
                hits.append(f)
                break
    return hits


# --------------------------------------------------------------------------- facts about one mod

def mod_facts(recs, state, boot=None):
    """What one jar (with its nested jars) ships and, as far as the evidence goes, registers."""
    top = recs[0]
    mod_ids = [m.get('id') for m in top['identity']['mods'] if m.get('id')]
    nested_ids = sorted(set(m.get('id') for r in recs[1:] for m in r['identity']['mods'] if m.get('id')) - set(mod_ids))
    ns = set(mod_ids) | set(nested_ids)
    for r in recs:
        ns.update(r['data'].get('namespaces_no_installed_mod_has') or [])
    ns -= set(SHARED_NS)
    f = {'top': top, 'recs': recs, 'mod_ids': mod_ids, 'nested_ids': nested_ids, 'namespaces': sorted(ns), 'boot': boot}
    if boot is not None:
        reg = boot.get('added') or {}
        f['source'] = 'boot %s against %s' % (boot.get('result'), boot.get('base'))
        f['dimensions'] = sorted(reg.get('dimensions') or [])
        f['entities'] = OrderedDict((e, (boot.get('entity_facts') or {}).get(e) or {}) for e in sorted(reg.get('minecraft:entity_type') or []))
        f['structures'] = sorted(reg.get('minecraft:worldgen/structure') or [])
        f['items'] = sorted(reg.get('minecraft:item') or [])
        f['game_rules'] = list(boot.get('game_rules') or [])
        f['registered'] = True
    else:
        d = state.dump
        own = lambda i: i.split(':', 1)[0] in ns
        f['source'] = d['source']
        f['dimensions'] = sorted(i for i in d['dimensions'] if own(i))
        f['entities'] = OrderedDict((e, d['entities'][e]) for e in sorted(d['entities']) if own(e))
        f['structures'] = sorted(i for i in d['structures'] if own(i))
        f['items'] = sorted(i for n in ns for i in d['items'].get(n, []))
        f['game_rules'] = None                      # a rule has no namespace: the snapshot cannot say whose it is
        f['registered'] = bool(d['source'])
    return f


def all_of(recs, *path):
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


def tag_of(r, top):
    return '' if r is top else ' [nested %s]' % r['file']


# --------------------------------------------------------------------------- the surfaces

def d_side(f, m, state, mode):
    ev = []
    lean = None
    for r in f['recs']:
        s = r['side']
        ev.append('%s%s: loader %s; mixins common/client/server %d/%d/%d; %d of %d classes name client packages' % (
            r['file'], '' if r is f['top'] else ' (nested)', r['identity']['loader'].split(' ', 1)[0],
            s['mixins']['common'], s['mixins']['client'], s['mixins']['server'], s['classes_naming_client_packages'], s['classes']))
        if s.get('declared'):
            ev.append('declares itself %s-only%s (%s)' % (s['declared'], tag_of(r, f['top']), '; '.join(s['reasons']) or 'fabric environment'))
        elif s['reasons']:
            ev.append('leans client-only%s: %s' % (tag_of(r, f['top']), '; '.join(s['reasons'])))
        if r is f['top'] and (s.get('declared') == 'client' or s.get('hint')):
            lean = s.get('declared') or 'hint'
        for cfg, mix, tgt in (s.get('common_mixins_into_client_classes') or [])[:4]:
            ev.append('COMMON-listed mixin %s (%s) targets the client class %s' % (mix, cfg, tgt))
        for mc_ in s.get('mod_classes') or []:
            if mc_.get('client') and not mc_.get('dist_guard'):
                ev.append('its @Mod class %s names client classes with no Dist guard' % mc_['c'].rsplit('/', 1)[-1])
    d = {'evidence': ev, 'pack': ['the index installs it on: %s' % m['side']]}
    if mode == 'grandfather' and lean and m['side'] != 'client':
        d['ask'] = 'it leans client-only and the index delivers it to the server: both (a library the server needs) or client'
        return [d]
    d.update(status='decided', basis='index', answer=m['side'])
    return [d]


def d_nested(f, m, state, mode):
    ev = []
    for r in f['recs'][1:]:
        ids = [x.get('id') for x in r['identity']['mods'] if x.get('id')]
        if not ids:
            continue
        what = [x for x in r['flags'] if x not in ('no-mod-metadata', 'service-jar')]
        ev.append('%s: mods %s%s' % (r['id'].split('!', 1)[1], ', '.join(ids), ('; ' + ', '.join(what)) if what else ''))
    return [{'evidence': cap(ev)}] if ev else []


def d_tier_gate(f, m, state, mode):
    lang_items = sum(len(r['lang']['items']) for r in f['recs'])
    recipes = sum(r['counts'].get('recipes', 0) for r in f['recs'])
    if not f['items'] and not lang_items:
        return []
    ev = ['%s%d item language keys, %d recipes' % (
        ('%d registered items (%s); ' % (len(f['items']), f['source'])) if f['registered'] else '', lang_items, recipes)]
    pack = []
    staged = [(mid, state.stage_mods[mid]) for mid in f['mod_ids'] if mid in state.stage_mods]
    d = {'evidence': ev, 'pack': pack}
    if staged:
        pack.append('the whole mod is staged: ' + ', '.join("stageMod('tier_%d', '%s')" % (t, mid) for mid, t in staged))
        d.update(status='decided', basis='gates/astages_restrictions.js', answer='stage',
                 fields=OrderedDict((mid, 'tier_%d' % t) for mid, t in staged))
        return [d]
    if mode == 'grandfather':
        hits = {}
        for ns in f['namespaces']:
            for fn, n in state.mentions().namespace_files(ns).items():
                if fn.startswith(('kubejs/server_scripts/gates/', 'kubejs/server_scripts/recipes/')):
                    hits[fn] = hits.get(fn, 0) + n
        if hits:
            pack.append('%d of its ids are named in gate and recipe scripts: %s' % (
                sum(hits.values()), join(sorted(hits, key=lambda k: -hits[k]), 4)))
        else:
            pack.append('no gate or recipe script names an id of it')
    return [d]


def d_dimensions(f, m, state, mode):
    shipped = OrderedDict()
    for r, dims in all_of(f['recs'], 'data', 'dimensions'):
        for dim in dims:
            shipped[dim] = r
    out = []
    for dim in sorted(set(f['dimensions']) | set(shipped)):
        ev = []
        if dim in f['dimensions']:
            ev.append('registered (%s)' % f['source'])
        elif f['registered']:
            ev.append('shipped as a data file and NOT registered (%s): the id may never exist in game' % f['source'])
        if dim in shipped:
            ev.append('data file in %s' % shipped[dim]['file'])
        pack = []
        for name, lst in state.dim_lists.items():
            if dim in lst:
                pack.append('%s%s' % (name.split(' (')[0], '' if lst[dim] is None else ': tier %s' % lst[dim]))
        d = {'subject': dim, 'evidence': ev, 'pack': pack or ['in no dimension list of the pack']}
        if state.regs.dim(dim) is not None:
            d.update(status='decided', basis='registry')
        out.append(d)
    return out


def d_bosses(f, m, state, mode):
    """An entity belongs to the mod that owns its namespace, whichever jar carries the evidence (an add-on's
    bosses tag names the entities of the mod it extends)."""
    mine = lambda e: e.split(':', 1)[0] in f['namespaces']
    cand = OrderedDict((e, list(ev)) for e, ev in state.boss_like.items() if mine(e))
    for e, facts in f['entities'].items():
        tags = [t for t in (facts.get('tags') or []) if t.endswith(':bosses') or t.endswith('/bosses')]
        if tags:
            cand.setdefault(e, []).append('tagged %s (%s)' % (', '.join('#' + t for t in tags), f['source']))
    for e in list(state.regs.bosses) + list(state.regs.aliases):
        if mine(e):
            cand.setdefault(e, [])
    out = []
    for e in cand:
        ev = list(cand[e])
        facts = f['entities'].get(e)
        if facts is not None:
            hp = (facts.get('attributes') or {}).get('minecraft:generic.max_health')
            ev.append('registered: category %s%s (%s)' % (facts.get('category'), '' if hp is None else ', base health %s' % hp, f['source']))
        elif f['registered']:
            ev.append('NOT a registered entity type (%s)' % f['source'])
        pack = []
        d = {'subject': e, 'evidence': ev, 'pack': pack}
        if state.regs.boss(e) is not None:
            d.update(status='decided', basis='registry')
        else:
            pack.append('in no boss list of the pack')
        if any(e in v for k, v in state.boss_lists.items() if k.startswith('iridescent_difficulty')):
            pack.append("on the difficulty mod's exclude list (no dimension curve)")
        elif state.regs.boss(e) is not None:
            pack.append("NOT on the difficulty mod's exclude list: the dimension curve applies on top")
        out.append(d)
    f['weak_boss_like'] = sorted(e for e in state.boss_weak if mine(e) and e not in cand)
    return out


def d_loot_chests(f, m, state, mode):
    ev, tables = [], []
    for r in f['recs']:
        lt = r['data']['loot_tables']
        t = r['data']['templates']
        if r['data']['structures'] or t.get('with_loot_table_container'):
            ev.append('%d structures in %d sets%s; %d templates, %d with a loot container' % (
                len(r['data']['structures']), len(r['data']['structure_sets']), tag_of(r, f['top']), t['n'], t['with_loot_table_container']))
        if lt['chests'] or lt['archaeology']:
            tables.extend(lt['chests'] + lt['archaeology'])
            ev.append('%d chest and %d archaeology tables%s: %s' % (len(lt['chests']), len(lt['archaeology']), tag_of(r, f['top']),
                                                                    join(lt['chests'] + lt['archaeology'], 8)))
        if 'loot_code' in r['code']['hints']:
            ev.append('%d classes assign or change loot from code%s (a table no chest NBT names)' % (
                r['code']['hints']['loot_code']['classes'], tag_of(r, f['top'])))
    if not tables and not any(r['data']['templates'].get('with_loot_table_container') for r in f['recs']):
        return []
    d = {'evidence': ev, 'pack': []}
    if mode == 'grandfather' and state.findings is not None:
        loot = (state.findings.get('sections') or {}).get('loot') or {}
        un = (loot.get('untouched_by_jar') or {}).get(f['top']['file'])
        when = (state.findings.get('meta') or {}).get('date')
        if un:
            d['pack'].append('loot audit %s: %d generated-structure table(s) no rule and no override names: %s' % (
                when, un.get('tables'), join(un.get('sample') or [], 8)))
        else:
            d['pack'].append('loot audit %s: every table a generated structure of it rolls is named by a rule or an override' % when)
            d.update(status='decided', basis='loot audit %s' % when, answer='tiered')
    return [d]


def d_loot_modifiers(f, m, state, mode):
    ev = []
    for r in f['recs']:
        for g in r['data']['loot_modifiers']:
            ev.append('%s%s: type %s%s' % (g['id'], tag_of(r, f['top']), g['type'],
                                           (', on ' + ', '.join(g['loot_table_ids'][:3])) if g.get('loot_table_ids') else ', on every table its conditions match'))
    return [{'evidence': cap(ev)}] if ev else []


def d_loot_vanilla(f, m, state, mode):
    ev = []
    for r in f['recs']:
        for t in r['data']['vanilla_overrides'].get('loot_tables') or []:
            ev.append('%s%s' % (t, tag_of(r, f['top'])))
    return [{'evidence': cap(ev)}] if ev else []


def d_duplicates(f, m, state, mode):
    ev = []
    mine = f['top']['file']
    for r in f['recs']:
        for ns in ('forge', 'c'):
            for reg, tag, _rep, _n in r['data']['tags_into_shared_namespaces'][ns]:
                if reg != 'items' or not material_tag(tag):
                    continue
                others = sorted(state.tag_writers.get(tag, set()) - {mine})
                if others:
                    ev.append('#%s is also filled by %s' % (tag, join(others, 4)))
    ev = sorted(set(ev))
    return [{'evidence': cap(ev)}] if ev else []


def gear_bases(f):
    bases = {}
    for r in f['recs']:
        for k, v in (r['code'].get('item_base_classes') or {}).items():
            bases[k] = bases.get(k, 0) + v
    return bases


def d_armor(f, m, state, mode):
    bases = gear_bases(f)
    pieces = [i for i in f['items'] if ARMOR_RX.search(i)]
    if not any(b in bases for b in ARMOR_BASES) and not pieces:
        return []
    ev = ['%s%s' % ('ArmorItem classes: %d' % bases.get('ArmorItem', 0),
                    ('; %d registered items named like armor pieces (%s)' % (len(pieces), f['source'])) if f['registered'] else '')]
    tagged = dict((i, [t for t in ('armor_robe', 'armor_light', 'armor_medium', 'armor_heavy') if i in state.item_tags[t]]) for i in pieces)
    untagged = [i for i in pieces if not tagged[i]]
    d = {'evidence': ev, 'pack': []}
    if pieces:
        counts = OrderedDict()
        for i in pieces:
            for t in tagged[i]:
                counts[t] = counts.get(t, 0) + 1
        d['pack'].append('%d of %d pieces are in a weight tag%s' % (len(pieces) - len(untagged), len(pieces),
                                                                    (' (%s)' % ', '.join('%s %d' % (k[6:], v) for k, v in counts.items())) if counts else ''))
        if untagged:
            d['pack'].append('in no weight tag (medium by default): ' + join(untagged, 8))
        elif mode == 'grandfather':
            d.update(status='decided', basis='kubejs/data/icraft/tags/items/armor_*.json',
                     answer='mixed' if len(counts) > 1 else (list(counts) or ['armor_medium'])[0][6:])
    return [d]


def d_weapon(f, m, state, mode):
    bases = gear_bases(f)
    have = [(b, bases[b]) for b in WEAPON_BASES if b in bases]
    if not have:
        return []
    magic = [i for i in f['items'] if i in state.item_tags['magic_weapon']]
    d = {'evidence': ['weapon classes: ' + ', '.join('%s %d' % kv for kv in have)],
         'pack': ['%d of its items are tagged icraft:magic_weapon' % len(magic)] if f['items'] else []}
    return [d]


def d_apotheosis(f, m, state, mode):
    bases = gear_bases(f)
    have = [(b, bases[b]) for b in ARMOR_BASES + WEAPON_BASES if b in bases]
    curios = sum(r['code']['hints'].get('curio_item', {}).get('classes', 0) for r in f['recs'])
    ench = [e for r in f['recs'] for e in r['lang']['enchantments']]
    if not have and not ench:
        return []
    ev = []
    if have:
        ev.append('gear classes: ' + ', '.join('%s %d' % kv for kv in have) + ('; curio item classes: %d' % curios if curios else ''))
    if ench:
        ev.append('%d enchantments (lootable and tradeable unless the pack says otherwise): %s' % (len(ench), join(ench, 8)))
    over = [ln.strip() for ln in state.apoth.splitlines()
            if '|' in ln and ln.strip().split(':', 1)[0] in f['namespaces'] and not ln.strip().startswith('#')]
    pack = ['%d line(s) of apotheosis/adventure.cfg name it: %s' % (len(over), join(over, 4))] if over else \
        ['apotheosis/adventure.cfg names nothing of it']
    return [{'evidence': ev, 'pack': pack}]


def d_keys(f, m, state, mode):
    names, classes = [], 0
    for r in f['recs']:
        names.extend(k for k in r['lang']['key_mappings'] if not k.startswith('key.categories.'))
        classes += r['code']['hints'].get('key_mapping', {}).get('classes', 0)
    if not names and (not classes or mode == 'grandfather'):
        return []                                  # a class that names KeyMapping registers none as often as not
    names = sorted(set(names))
    ev = ['%d key.* language keys%s: %s' % (len(names), ('; %d classes use KeyMapping' % classes) if classes else '', join(names, 8))
          if names else '%d classes use KeyMapping, no key.* language key' % classes]
    d = {'evidence': ev, 'pack': []}
    if state.keybinds is not None and names:
        known = [n for n in names if n in state.keybinds]
        d['pack'].append('%d of %d are in the keybind baseline (dev/gen_keybinds.ps1)' % (len(known), len(names)))
        if mode == 'grandfather' and known:
            # a language key is not a mapping: the ones the client capture did not see are no mappings, or were
            # added after the capture. The capture is what a person audited.
            d.update(status='decided', basis='dev/gen_keybinds.ps1 (the client capture)', answer='default')
    return [d]


def d_game_rules(f, m, state, mode):
    ev = []
    lang = sorted(set(k for r in f['recs'] for k in r['lang']['game_rules']))
    classes = sum(r['code']['hints'].get('game_rule_register', {}).get('classes', 0) for r in f['recs'])
    if f['game_rules']:
        ev.append('registered by the boot: ' + ', '.join('%s = %s' % (n, v) for n, v in f['game_rules']))
    if lang or classes:
        ev.append('%d gamerule.* language keys; %d classes register game rules%s' % (
            len(lang), classes, (': ' + join(lang, 6)) if lang else ''))
    if not ev:
        return []
    d = {'evidence': ev, 'pack': []}
    if state.crust_rules is not None:
        if f['game_rules'] is not None:
            miss = [n for n, _v in f['game_rules'] if n not in state.crust_rules]
            d['pack'].append('config/Crust/default_game_rules.toml %s' % (
                ('does NOT list: ' + ', '.join(miss) + ' (the boot logs an error until it does)') if miss else 'lists every rule it registers'))
        else:
            miss = [r for r in state.dump['game_rules'] if r not in state.crust_rules]
            d['pack'].append('config/Crust/default_game_rules.toml lists %d of the %d registered rules of main' % (
                len(state.dump['game_rules']) - len(miss), len(state.dump['game_rules'])))
            if mode == 'grandfather' and state.dump['game_rules'] and not miss:
                d.update(status='decided', basis='config/Crust/default_game_rules.toml', answer='set')
    return [d]


def d_config(f, m, state, mode):
    ev = []
    for r in f['recs']:
        types = r['code'].get('config_types') or []
        if 'config_spec' in r['code']['hints'] or types:
            ev.append('%s: a Forge config spec%s' % (r['file'], (', types ' + ', '.join(types)) if types else ''))
        if r['data'].get('config_like_files'):
            ev.append('%s ships config-like files: %s' % (r['file'], join(r['data']['config_like_files'], 5)))
    gen = (f['boot'] or {}).get('config_generated') if f['boot'] else None
    if gen:
        ev.append('the boot generated, and the tree does not track: ' + join(gen, 10))
    if not ev:
        return []
    want = {'both': ('root', 'server', 'client'), 'client': ('root', 'client'), 'server': ('root', 'server')}[m['side']]
    hits = dict((distro, config_hits(f['mod_ids'], state.tracked.get(distro, ()))) for distro in ('root', 'server', 'client'))
    d = {'evidence': ev, 'pack': []}
    if any(hits.values()):
        names = sorted(set(x for v in hits.values() for x in v))
        d['pack'].append('tracked: %s (%s)' % (join(names, 5), ', '.join('%s %d' % (k, len(hits[k])) for k in ('root', 'server', 'client'))))
        lack = [k for k in want if not hits[k]]
        if lack:
            d['pack'].append('no tracked config in: ' + ', '.join(lack))
        elif mode == 'grandfather':
            d.update(status='decided', basis='tracked config', answer='tracked')
    else:
        d['pack'].append('no config of it is tracked in any distro')
    return [d]


def d_worldgen(f, m, state, mode):
    ev = []
    for r in f['recs']:
        sets = r['data']['structure_sets']
        for s in sets[:8]:
            pl = s.get('placement') or {}
            ev.append('structure set %s%s: spacing %s, separation %s' % (s['id'], tag_of(r, f['top']), pl.get('spacing'), pl.get('separation')))
        if len(sets) > 8:
            ev.append('... and %d more structure sets' % (len(sets) - 8))
        bm = {}
        for b in r['data']['biome_modifiers'].values():
            bm[b.get('t')] = bm.get(b.get('t'), 0) + 1
        if bm:
            ev.append('biome modifiers%s: %s' % (tag_of(r, f['top']), ', '.join('%d %s' % (n, t) for t, n in sorted(bm.items(), key=lambda kv: -kv[1]))))
        if r['data'].get('biome_modifier_spawns'):
            ev.append('adds mob spawns%s: %s' % (tag_of(r, f['top']), join(r['data']['biome_modifier_spawns'], 8)))
        wg = dict((k[9:], v) for k, v in r['data']['files_by_folder'].items() if k.startswith('worldgen/') and k[9:] not in ('structure', 'structure_set', 'template_pool', 'processor_list'))
        if wg:
            ev.append('worldgen files%s: %s' % (tag_of(r, f['top']), ', '.join('%d %s' % (v, k) for k, v in sorted(wg.items()))))
    return [{'evidence': ev}] if ev else []


def d_shared(f, m, state, mode):
    ev = []
    for r in f['recs']:
        sh = r['data']['tags_into_shared_namespaces']
        for ns in ('minecraft', 'forge', 'c', 'other'):
            rep = [t for t in sh[ns] if t[2]]
            if rep:
                ev.append('replace:true on %d tag(s) of %s%s: %s' % (len(rep), ns if ns != 'other' else "another mod's namespace",
                                                                    tag_of(r, f['top']), join(['%s %s' % (t[0], t[1]) for t in rep], 5)))
        for k in ('recipes', 'advancements', 'worldgen'):
            v = r['data']['vanilla_overrides'].get(k)
            if v:
                ev.append('overrides %d vanilla %s%s: %s' % (len(v), k, tag_of(r, f['top']), join(v, 5)))
        fn = r['data']['functions']
        if fn['on_tick_tag'] or fn['on_load_tag']:
            ev.append('functions%s on the tick tag: %s; on the load tag: %s' % (
                tag_of(r, f['top']), join(fn['on_tick_tag'], 4) or 'none', join(fn['on_load_tag'], 4) or 'none'))
        for k, dd in r['data']['folders_1_21_layout'].items():
            if dd.get('twin') and not dd.get('has_1_20_twin'):
                ev.append('%d file(s) under a 1.21-layout folder `%s`%s with no 1.20.1 twin: that content does not exist in game' % (
                    dd['files'], k, tag_of(r, f['top'])))
        alien = r['data'].get('namespaces_no_installed_mod_has')
        if alien:
            ev.append('data under a namespace that is no mod id%s: %s (a pack rule keyed on the mod id misses it)' % (
                tag_of(r, f['top']), ', '.join(alien)))
        for h, text in (('attr_modify', 'changes attributes of entities it does not own'), ('spawn_hook', 'hooks mob spawning'),
                        ('hurt_hook', 'hooks damage'), ('trade_hook', 'adds villager or wanderer trades'),
                        ('loot_code', 'changes loot from code')):
            if h in r['code']['hints']:
                f.setdefault('hooks', []).append('%s%s (%d classes)' % (text, tag_of(r, f['top']), r['code']['hints'][h]['classes']))
    changed = (f['boot'] or {}).get('entities_changed') if f['boot'] else None
    if changed:
        ev.append('the boot shows it changes %d entity type(s) of other mods: %s' % (len(changed), join(changed, 8)))
    return [{'evidence': cap(ev)}] if ev else []


def d_codex(f, m, state, mode):
    content = bool(f['items'] or f['entities'] or f['structures'] or f['dimensions']
                   or any(r['lang']['items'] or r['lang']['entities'] for r in f['recs']))
    if not content:
        return []
    n = sum(state.quest_ns.get(ns, 0) for ns in f['namespaces'])
    d = {'evidence': ['mod ids: ' + ', '.join(f['mod_ids'] or ['(none)'])], 'pack': []}
    if n:
        d['pack'].append('%d quest and Codex file(s) name an id of it' % n)
        if mode == 'grandfather':
            d.update(status='decided', basis='config/heracles/quests, datapack_sources/iridescent_codex', answer='quest')
    else:
        d['pack'].append('no quest and no Codex file names an id of it')
    return [d]


SURFACE_FUNCTIONS = OrderedDict((
    ('side', d_side), ('nested', d_nested), ('tier-gate', d_tier_gate), ('dimensions', d_dimensions), ('bosses', d_bosses),
    ('loot:chests', d_loot_chests), ('loot:modifiers', d_loot_modifiers), ('loot:vanilla', d_loot_vanilla),
    ('duplicates', d_duplicates), ('armor-class', d_armor), ('weapon-class', d_weapon), ('apotheosis', d_apotheosis),
    ('keys', d_keys), ('game-rules', d_game_rules), ('config', d_config), ('worldgen', d_worldgen),
    ('shared-data', d_shared), ('codex', d_codex),
))


# --------------------------------------------------------------------------- the record

def boot_decision(m, boot, mode):
    """The boot diff as a decision: answered by the tool when the boot is clean, owed otherwise."""
    d = {'key': 'boot', 'surface': 'boot', 'raised': mode, 'evidence': [], 'pack': []}
    if m['side'] == 'client':
        d.update(status='decided', answer='client-only', basis='index',
                 evidence=['client-only: the server index does not carry it, the server mod set is unchanged',
                           'NOT verified by any tool: a client launch with it'])
        return d
    if boot is None:
        d.update(status='owed', evidence=['no boot was made (--no-boot)'],
                 ask='boot the tree with the mod in: python .minecraft/dev/mods/intake.py add ... (without --no-boot)')
        return d
    d['evidence'] = list(boot.get('lines') or [])
    if boot.get('verdict') == 'PASS' and not boot.get('regressions'):
        d.update(status='decided', answer='pass', basis='boot %s against %s' % (boot.get('result'), boot.get('base')), on=boot.get('when'))
    else:
        d.update(status='owed', ask='fix what the boot reports and run the command again, or accept it with a reason '
                                    '(intake.py decide <mod> boot accepted --note "...")')
        d['evidence'] = ['REGRESSION: ' + r for r in boot.get('regressions') or []] + d['evidence']
    return d


def build_record(recs, m, state, mode, boot=None, today='', previous=None):
    """-> record dict. `previous` (an existing record of the same mod) keeps its answers: a decision somebody
    made is never lost to a regeneration, and a question that was already put keeps who put it."""
    f = mod_facts(recs, state, boot)
    old = dict((d['key'], d) for d in (previous or {}).get('decisions') or [])
    decisions, not_touched = [], []
    if mode in ('add', 'update') or 'boot' in old:
        decisions.append(boot_decision(m, boot, mode) if mode in ('add', 'update') else old['boot'])
    for surface, fn in SURFACE_FUNCTIONS.items():
        got = fn(f, m, state, mode)
        if not got:
            not_touched.append(surface)
            continue
        title, ask, options, default = core.SURFACES[surface]
        for d in got:
            key = core.key_for(surface, d.get('subject'))
            full = OrderedDict((('key', key), ('surface', surface)))
            if d.get('subject'):
                full['subject'] = d['subject']
            full['status'] = d.get('status', 'owed')
            for k in ('answer', 'fields', 'basis'):
                if d.get(k) not in (None, '', {}):
                    full[k] = d[k]
            full['ask'] = d.get('ask') or ask
            full['options'] = list(options)
            full['default'] = default
            full['evidence'] = d.get('evidence') or []
            full['pack'] = d.get('pack') or []
            full['raised'] = mode
            prev = old.get(key)
            if prev is not None:
                full['raised'] = prev.get('raised', mode)
                if surface == 'loot:chests' and state.findings is None and str(prev.get('basis', '')).startswith('loot audit'):
                    # this run has no loot audit to ask (--findings): what the last one said stands
                    for k in ('status', 'answer', 'basis', 'pack'):
                        if k in prev:
                            full[k] = prev[k]
                elif surface == 'loot:chests' and state.findings is None and prev.get('pack'):
                    full['pack'] = prev['pack']
                if prev.get('status') == 'decided' and prev.get('by'):       # a person's answer wins over a derived one
                    for k in ('status', 'answer', 'fields', 'basis', 'by', 'on', 'note'):
                        if k in prev:
                            full[k] = prev[k]
                        else:
                            full.pop(k, None)
            decisions.append(full)
    top = recs[0]
    rec = OrderedDict()
    rec['schema'] = core.SCHEMA
    rec['mod'] = m['slug']
    rec['name'] = m['name']
    rec['jar'] = m['jar']
    rec['hash'] = m['hash']
    rec['side'] = m['side']
    rec['own'] = bool(m.get('own'))
    rec['mod_ids'] = f['mod_ids']
    rec['nested_mod_ids'] = f['nested_ids']
    rec['namespaces'] = f['namespaces']
    rec['raised'] = (previous or {}).get('raised') or mode
    rec['made'] = OrderedDict((('date', today), ('tool', core.TOOL_VERSION), ('registry', f['source']),
                               ('jar_sha256', top.get('sha256'))))
    if state.findings is not None and mode == 'grandfather':
        rec['made']['audit'] = 'pack audit %s (loot section)' % (state.findings.get('meta') or {}).get('date')
    elif previous and (previous.get('made') or {}).get('audit'):
        rec['made']['audit'] = previous['made']['audit']
    if boot is not None:
        rec['boot'] = OrderedDict((k, boot[k]) for k in ('result', 'base', 'verdict', 'when', 'regressions', 'registered', 'lines') if k in boot)
    rec['adds'] = OrderedDict((
        ('dimensions', len(set(f['dimensions']) | set(d for r in recs for d in r['data']['dimensions']))),
        ('boss_like', sum(1 for d in decisions if d['surface'] == 'bosses')),
        ('structures', len(f['structures']) or sum(len(r['data']['structures']) for r in recs)),
        ('loot_modifiers', sum(len(r['data']['loot_modifiers']) for r in recs)),
        ('vanilla_loot_tables', sum(len(r['data']['vanilla_overrides'].get('loot_tables') or []) for r in recs)),
        ('items', len(f['items'])), ('entities', len(f['entities'])),
    ))
    notes = []
    if f.get('weak_boss_like'):
        notes.append('%d more entities only inherit a boss bar from a shared base class (no decision asked): %s' % (
            len(f['weak_boss_like']), join(f['weak_boss_like'], 10)))
    if f.get('hooks'):
        notes.append('code hooks that come with it (no decision asked): ' + '; '.join(f['hooks']))
    if boot is None and not f['registered']:
        notes.append('no registry evidence: the decisions are made from the jar alone (a language key is not a registration)')
    rec['notes'] = notes
    rec['decisions'] = decisions
    rec['not_touched'] = not_touched
    if previous and previous.get('history'):
        rec['history'] = list(previous['history'])
    if previous and previous.get('_bundle'):
        rec['_bundle'] = True
    return rec
