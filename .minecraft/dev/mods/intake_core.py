#!/usr/bin/env python3
"""intake_core.py -- intake records: what a record is, how it is read, and the gate.

One record per mod of the index: .minecraft/dev/mods/records/<metafile slug>.json. A record lists every
integration surface the mod touches as DECISIONS: what the mod's content does when nobody decides, the
question, and the answer once somebody gave one. `intake.py` writes records (add, update, audit) and
answers (decide, apply); this file is what every command and the gate share. It reads the repo only: no
jar, no instance, no boot, so the gate runs in the pre-push hook and in CI.

A decision:
    key        `side`, `boot`, `dimension:<id>`, `boss:<entity id>`, `loot:chests`, ... (SURFACES below)
    evidence   what the jar ships and, when a boot was made, what the game registered
    pack       what the pack already says about it (a list entry, a tracked config, a quest)
    default    what happens while nobody decides
    ask        the question; options: the short answers the tools know
    status     owed | decided
    answer, fields, by, on, note      when decided
    basis      where a decided answer lives when it is not in the record: `index` (the metafile's side),
               `registry` (kubejs/config/icraft/registry: the boss roster and the dimension tiers)
    raised     grandfather | add | update: who put the question

The boss roster and the dimension tiers have ONE home, the registries. A record never holds a copy: a
`boss:` or `dimension:` decision is DECIDED when the registry has the entry, whatever the record says, and
a tier written into a record is only an answer waiting for `intake.py apply`.

GRANDFATHERED = the mods listed in intake_baseline.json (the pack as it was at the first audit). Their owed
decisions are a backlog, reported by priority and never a failure. Every other mod of the index is NEW.

The gate (`intake.py check`) fails on:
    a mod of the index with no record, or a record made from another jar than the index names
    a NEW mod with a decision that is owed, or decided and not applied to its registry
    a record no metafile belongs to, or one that does not parse
    a client mod added, updated or removed since the client asset overrides were checked (the stamp
    dev/client_overrides/checked.json: the mod side of client_overrides.py --current)
It does not fail on the grandfathered backlog.

Needs Python 3.11 or newer. Standard library only.
"""
import json
import os
import re
import sys
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
MC = os.path.dirname(os.path.dirname(HERE))          # .minecraft
REPO = os.path.dirname(MC)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(MC, 'dev', 'rosters'))

SCHEMA = 1
TOOL_VERSION = 1
RECORDS_REL = 'dev/mods/records'
BUNDLE_NAME = 'grandfathered.json'      # every record of the first audit, in one file
BASELINE_REL = 'dev/mods/intake_baseline.json'
MANIFEST_REL = 'custom_jars_manifest.json'
REGISTRY_REL = 'kubejs/config/icraft/registry'
CLIENT_OVERRIDES_REL = 'dev/client_overrides/client_overrides.py'

STATUSES = ('owed', 'decided')
RAISED = ('grandfather', 'add', 'update')

# surface -> (title, the question, the short answers the tools know, what happens while nobody decides)
SURFACES = OrderedDict((
    ('side', ('Side and dedicated-server safety', 'both, client or server', ('both', 'client', 'server'),
              'The jar is installed wherever its metafile says. A client-only jar on the dedicated server stops '
              'the server at load, and the error names other mods.')),
    ('boot', ('Boot diff', 'does the dedicated server boot with it, with no regression', ('pass', 'accepted', 'client-only'),
              'Nothing boots the pack before a push: a jar that breaks the server is found by the next unattended '
              'restart.')),
    ('nested', ('Nested jars', 'is each nested mod wanted', ('keep', 'reject'),
                'Every nested mod loads with its parent: its hooks, key mappings, screens and loot code come along, '
                'and nothing in the index says it exists.')),
    ('tier-gate', ('Tier / stage gates', 'which tier its items belong to and how they are gated',
                   ('tier-1', 'stage', 'recipes', 'loot-only'),
                   'Every item is tier 1: usable, craftable and visible from the first minute.')),
    ('dimensions', ('Dimension tier', 'tier 1 to 4, or untiered', ('1', '2', '3', '4', 'untiered'),
                    'A dimension nobody lists is tier 1 everywhere: enterable at once, the tier-1 difficulty curve, '
                    'no tier loot pools, tier-1 affix rarities.')),
    ('bosses', ('Boss, miniboss or mob', 'named, miniboss, unlisted or mob', ('named', 'miniboss', 'unlisted', 'mob'),
                'An entity nobody lists is a plain hostile mob: x3.0 health plus the dimension curve, no designed '
                'health, no tokens, compass, quest or Codex page.')),
    ('loot:chests', ('Structure chests', "what each structure's chests roll", ('keep', 'tiered', 'strip'),
                     "Its chests roll the mod's own tables, minus the pack's global strips, plus the pools of the "
                     'dimension they generate in; the catch-all Apotheosis rule adds affix items.')),
    ('loot:modifiers', ('Loot modifiers', 'keep, retarget or switch off each loot modifier', ('keep', 'retarget', 'off'),
                        'Every loot modifier it ships stays active and runs on every table it matches.')),
    ('loot:vanilla', ('Vanilla loot tables it replaces', 'keep its copy or override it', ('keep', 'override'),
                      "Its copy wins over the vanilla table and loses to the pack's own datapacks.")),
    ('duplicates', ('Duplicate items and ores', 'which duplicate is canonical', ('coexist', 'this', 'other'),
                    'Duplicates coexist: items that share a forge tag are interchangeable in recipes, and every '
                    'copy stays craftable and visible.')),
    ('armor-class', ('Armor weight class', 'robe, light, medium or heavy for each armor set',
                     ('robe', 'light', 'medium', 'heavy', 'mixed'),
                     'Armor in no weight tag is "medium": no effect.')),
    ('weapon-class', ('Weapon class', 'the class of each weapon', ('default', 'magic', 'mixed'),
                      'A weapon in no class tag is what its Java class says; a staff resolves to a sword or to '
                      'nothing.')),
    ('apotheosis', ('Apotheosis category', 'the affix category of its gear', ('default', 'overrides'),
                    'Gear gets affixes by its item class; an item Apotheosis cannot classify gets none.')),
    ('keys', ('Key mappings', 'the default key of each mapping', ('default', 'rebound', 'unbound'),
              "The mod's compiled default keys apply and may stack on keys the pack already uses.")),
    ('game-rules', ('Game rules', 'the value of each rule', ('default', 'set'),
                    "A new rule keeps the mod's default, and the game-rule defaults file must list it or the boot "
                    'logs an error.')),
    ('config', ('Config per distro', 'which values the pack sets, and where the file is tracked',
                ('default', 'tracked'),
                'The server and every client generate their own default config; the values can differ between '
                'boxes.')),
    ('worldgen', ('Worldgen', 'keep, retune or remove its structure spacing, ores and features',
                  ('keep', 'retune', 'remove'),
                  "Ores, structure spacing and biome weights stay at the mod's defaults.")),
    ('shared-data', ('Shared namespaces and overrides', 'is each override, replace:true tag and per-tick function wanted',
                     ('keep', 'override'),
                     "A replace:true tag wipes every other mod's entries; a vanilla override wins over the vanilla "
                     'file; a function on the tick tag runs twenty times a second.')),
    ('codex', ('Codex and quests', 'Codex page, quest, or none', ('none', 'codex', 'quest', 'both'),
               'The mod appears in the generated mod list only: no Codex page and no quest.')),
))
# the surfaces whose decisions are one per subject (`dimension:<id>`, `boss:<id>`); every other key is its surface
KEY_PREFIX = {'dimensions': 'dimension', 'bosses': 'boss'}
REGISTRY_SURFACES = ('dimensions', 'bosses')
# audit order: a mod that adds one of these is reviewed before one that does not (first match wins)
PRIORITY_CLASSES = (
    ('dimensions', 'adds a dimension'),
    ('bosses', 'adds a boss-like entity'),
    ('structures', 'adds structures'),
    ('loot', 'ships loot modifiers or replaces vanilla loot tables'),
    ('content', 'other content'),
    ('none', 'nothing owed'),
)


class IntakeError(Exception):
    pass


def mc(*parts):
    return os.path.join(MC, *[x for part in parts for x in part.split('/')])


def read_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f, object_pairs_hook=OrderedDict)


def dump_json(doc):
    return json.dumps(doc, indent=2, ensure_ascii=True) + '\n'


def write_text(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def slug_of(metafile):
    return metafile[:-len('.pw.toml')] if metafile.endswith('.pw.toml') else metafile


def surface_of(key):
    for surface, prefix in KEY_PREFIX.items():
        if key.startswith(prefix + ':'):
            return surface
    return key


def key_for(surface, subject=None):
    return '%s:%s' % (KEY_PREFIX[surface], subject) if surface in KEY_PREFIX else surface


# --------------------------------------------------------------------------- the index

def own_jars():
    """File names of the pack's own jars (custom_jars_manifest.json): built here, released by the
    custom-jar-release procedure, rebuilt under one name. A record of one is not tied to a hash."""
    try:
        return set(read_json(mc(MANIFEST_REL)).get('jars') or {})
    except (OSError, ValueError):
        return set()


def load_index(errors=None):
    """Every mod of the index, source first, then the client-distro-only overlay -> [dict]"""
    import mod_index
    errs = [] if errors is None else errors
    policy = mod_index.load_policy()
    source = mod_index.load_source(errs)
    overlay = mod_index.load_overlay(policy, set(mod_index.list_metafiles(mod_index.SOURCE_REL)), errs)
    own = own_jars()
    out = []
    for m, where in [(m, 'source') for m in source] + [(m, 'client-distro-only') for m in overlay]:
        import tomllib
        dl = (tomllib.loads(m['text']).get('download') or {})
        out.append({'slug': slug_of(m['meta']), 'metafile': m['meta'], 'jar': m['filename'], 'side': m['side'],
                    'name': m['name'], 'hash': '%s:%s' % (dl.get('hash-format'), dl.get('hash')), 'where': where,
                    'own': m['filename'] in own, 'mode': m['mode'], 'url': dl.get('url') or ''})
    return out


# --------------------------------------------------------------------------- records, baseline

def record_path(slug):
    return mc(RECORDS_REL, slug + '.json')


def bundle_path():
    return mc(RECORDS_REL, BUNDLE_NAME)


def read_bundle():
    """The grandfathered records, one file -> its document ({} when there is none)."""
    try:
        return read_json(bundle_path())
    except OSError:
        return OrderedDict()


def load_records(problems=None):
    """-> {slug: record}, from <slug>.json files and from the bundle. A record that does not parse, has the
    wrong shape or exists twice goes to `problems`. A record read from the bundle carries `_bundle`."""
    out = OrderedDict()
    d = mc(RECORDS_REL)
    if not os.path.isdir(d):
        return out

    def note(text):
        if problems is not None:
            problems.append(text)
    for fn in sorted(os.listdir(d)):
        if not fn.endswith('.json'):
            continue
        try:
            doc = read_json(os.path.join(d, fn))
        except (OSError, ValueError) as ex:
            note('%s/%s: does not parse (%s)' % (RECORDS_REL, fn, ex))
            continue
        if fn == BUNDLE_NAME:
            recs = doc.get('records') if isinstance(doc, dict) else None
            if not isinstance(recs, dict):
                note('%s/%s: no "records" object' % (RECORDS_REL, fn))
                continue
            pairs = [(slug, rec, '%s/%s, record %s' % (RECORDS_REL, fn, slug)) for slug, rec in recs.items()]
        else:
            pairs = [(fn[:-5], doc, '%s/%s' % (RECORDS_REL, fn))]
        for slug, rec, where in pairs:
            bad = shape_problems(rec, slug)
            if bad:
                for b_ in bad:
                    note('%s: %s' % (where, b_))
                continue
            if slug in out:
                note('%s: a record of %s exists twice (its own file and the bundle)' % (where, slug))
                continue
            if fn == BUNDLE_NAME:
                rec['_bundle'] = True
            out[slug] = rec
    return out


def shape_problems(rec, slug):
    bad = []
    if not isinstance(rec, dict):
        return ['not an object']
    if rec.get('schema') != SCHEMA:
        bad.append('schema is %r (this tool reads %d)' % (rec.get('schema'), SCHEMA))
    if rec.get('mod') != slug:
        bad.append('`mod` is %r, the file is named for %r' % (rec.get('mod'), slug))
    for k in ('jar', 'hash', 'side'):
        if not isinstance(rec.get(k), str) or not rec.get(k):
            bad.append('`%s` is missing' % k)
    decs = rec.get('decisions')
    if not isinstance(decs, list):
        return bad + ['`decisions` is not a list']
    seen = set()
    for i, d in enumerate(decs):
        if not isinstance(d, dict) or not isinstance(d.get('key'), str):
            bad.append('decision %d has no key' % i)
            continue
        k = d['key']
        if k in seen:
            bad.append('decision %s is written twice' % k)
        seen.add(k)
        if surface_of(k) not in SURFACES:
            bad.append('decision %s: unknown surface' % k)
        if d.get('status') not in STATUSES:
            bad.append('decision %s: status is %r (owed or decided)' % (k, d.get('status')))
        if d.get('raised') not in RAISED:
            bad.append('decision %s: raised is %r' % (k, d.get('raised')))
        if d.get('status') == 'decided' and not d.get('basis') and d.get('answer') in (None, ''):
            bad.append('decision %s: decided, with no answer and no basis' % k)
    return bad


RECORD_ORDER = ('schema', 'mod', 'name', 'jar', 'hash', 'side', 'own', 'mod_ids', 'nested_mod_ids', 'namespaces', 'raised',
                'made', 'boot', 'adds', 'notes', 'decisions', 'not_touched', 'history')
DECISION_ORDER = ('key', 'surface', 'subject', 'status', 'answer', 'fields', 'basis', 'by', 'on', 'note', 'ask', 'options',
                  'default', 'evidence', 'pack', 'raised')


def empty(v):
    return v is None or v is False or (isinstance(v, (list, dict, str)) and len(v) == 0)


def record_doc(rec, compact=False):
    """A record in its written form: fixed key order, nothing empty. compact (the bundle): the question, the
    options and the default of a decision are left out where they are the surface's own (SURFACES has them)."""
    doc = OrderedDict()
    for k in RECORD_ORDER:
        if k in ('schema', 'mod', 'decisions') or (k in rec and not empty(rec[k])):
            doc[k] = rec.get(k)
    for k in rec:
        if k not in doc and not k.startswith('_') and not empty(rec[k]):
            doc[k] = rec[k]
    decs = []
    for d in rec['decisions']:
        surface = d.get('surface') or surface_of(d['key'])
        o = OrderedDict()
        for k in DECISION_ORDER + tuple(x for x in d if x not in DECISION_ORDER):
            if k not in d or empty(d[k]):
                continue
            if compact and surface in SURFACES:
                _title, ask, options, default = SURFACES[surface]
                if (k == 'ask' and d[k] == ask) or (k == 'options' and list(d[k]) == list(options)) or (k == 'default' and d[k] == default):
                    continue
            o[k] = d[k]
        decs.append(o)
    doc['decisions'] = decs
    return doc


def save_record(rec):
    """Back to where it came from: the bundle for a grandfathered record, <slug>.json for any other."""
    if rec.get('_bundle'):
        save_bundle({rec['mod']: rec})
    else:
        write_text(record_path(rec['mod']), dump_json(record_doc(rec)))


BUNDLE_ABOUT = [
    'The intake records of the GRANDFATHERED mods (the pack as it was at the first audit), one entry per metafile.',
    'One file, because a push of 300 or more changed files turns the next sync of the server into a full download.',
    'A mod added later has a file of its own next to this one: records/<metafile name>.json.',
    'Read one with: python -I .minecraft/dev/mods/intake.py show <mod>. Answer with intake.py decide. Do not edit by hand.',
    'A decision without `ask`, `options` and `default` has the ones of its surface (SURFACES in dev/mods/intake_core.py).',
]


def write_bundle(recs):
    out = OrderedDict((('about', BUNDLE_ABOUT), ('schema', SCHEMA), ('records', OrderedDict((k, recs[k]) for k in sorted(recs)))))
    write_text(bundle_path(), json.dumps(out, indent=1, ensure_ascii=True) + chr(10))


def save_bundle(records, replace=False):
    """Write records into the bundle: merged into what is there, or (replace) as its whole content."""
    recs = OrderedDict() if replace else OrderedDict((k, v) for k, v in (read_bundle().get('records') or {}).items())
    for slug, rec in records.items():
        recs[slug] = record_doc(rec, compact=True)
    write_bundle(recs)


def delete_record(slug):
    """-> where it was removed from, or None"""
    if os.path.isfile(record_path(slug)):
        os.remove(record_path(slug))
        return '%s/%s.json' % (RECORDS_REL, slug)
    recs = read_bundle().get('records') or {}
    if slug in recs:
        write_bundle(OrderedDict((k, v) for k, v in recs.items() if k != slug))
        return '%s/%s (the entry %s)' % (RECORDS_REL, BUNDLE_NAME, slug)
    return None


def load_baseline():
    """-> {slug: jar file name at the first audit}; {} when there is no baseline yet."""
    try:
        return OrderedDict(read_json(mc(BASELINE_REL)).get('grandfathered') or {})
    except OSError:
        return OrderedDict()


# --------------------------------------------------------------------------- the registries

class Registries(object):
    """The boss roster and the dimension tiers, read through dev/rosters (the one reader the tools share)."""

    def __init__(self, minecraft_root=None):
        self.error = None
        self.bosses, self.aliases, self.dims = {}, {}, {}
        try:
            import rosters
            reg = rosters.load(minecraft_root or MC)
            self.bosses = reg.bosses
            self.aliases = reg.aliases
            self.dims = reg.dims
        except Exception as ex:                    # a missing or broken registry: every answer is "not there"
            self.error = str(ex)

    def boss(self, eid):
        if eid in self.aliases:
            return {'sameAs': self.aliases[eid]}
        return self.bosses.get(eid)

    def dim(self, did):
        return self.dims.get(did)

    def describe(self, surface, subject):
        e = self.boss(subject) if surface == 'bosses' else self.dim(subject)
        if e is None:
            return None
        if e.get('sameAs'):
            return 'a second id of %s' % e['sameAs']
        bits = []
        if surface == 'bosses':
            bits.append(str(e.get('kind')))
        if e.get('tier') is not None:
            bits.append('tier %s' % e['tier'])
        if e.get('hp') is not None:
            bits.append('hp %s' % e['hp'])
        if e.get('flags'):
            bits.append('flags ' + ' '.join(e['flags']))
        if e.get('rush') is not None:
            bits.append('rush %s' % e['rush'])
        if e.get('stageGate'):
            bits.append('gate ' + e['stageGate'])
        if e.get('absent'):
            bits.append('kept though not registered')
        return ', '.join(bits)


NO_ENTRY_ANSWERS = {'bosses': ('mob',), 'dimensions': ('untiered',)}


def effective(d, regs):
    """-> (state, text). state: decided | owed | unapplied (answered in the record, the registry entry is missing)."""
    surface = d.get('surface') or surface_of(d['key'])
    if surface in REGISTRY_SURFACES:
        text = regs.describe(surface, d.get('subject'))
        if text is not None:
            return 'decided', text + '  [registry]'
        if d.get('status') == 'decided' and d.get('basis') != 'registry':
            if d.get('answer') in NO_ENTRY_ANSWERS[surface]:
                return 'decided', answer_text(d)
            return 'unapplied', answer_text(d)
        return 'owed', None
    if d.get('status') == 'decided':
        return 'decided', answer_text(d)
    return 'owed', None


def answer_text(d):
    bits = []
    if d.get('answer') not in (None, ''):
        bits.append(str(d['answer']))
    if d.get('fields'):
        bits.append(' '.join('%s=%s' % (k, json.dumps(v) if isinstance(v, (list, dict)) else v) for k, v in d['fields'].items()))
    if d.get('basis'):
        bits.append('[%s]' % d['basis'])
    if d.get('by'):
        bits.append('(%s%s)' % (d['by'], (' ' + d['on']) if d.get('on') else ''))
    return '  '.join(bits)


def owed_of(rec, regs):
    """-> ([owed decisions], [decided-but-unapplied decisions])"""
    owed, unapplied = [], []
    for d in rec.get('decisions') or []:
        st, _ = effective(d, regs)
        if st == 'owed':
            owed.append(d)
        elif st == 'unapplied':
            unapplied.append(d)
    return owed, unapplied


def priority(rec, regs):
    """-> (class index, class key, score). The class is what the mod ADDS; the score orders within a class:
    owed decisions about dimensions count most, then bosses, then loot, then the rest."""
    adds = rec.get('adds') or {}
    owed, unapplied = owed_of(rec, regs)
    owed = owed + unapplied
    if not owed:
        cls = 'none'
    elif adds.get('dimensions'):
        cls = 'dimensions'
    elif adds.get('boss_like'):
        cls = 'bosses'
    elif adds.get('structures'):
        cls = 'structures'
    elif adds.get('loot_modifiers') or adds.get('vanilla_loot_tables'):
        cls = 'loot'
    else:
        cls = 'content'
    weight = {'dimensions': 100, 'bosses': 30, 'loot:chests': 10, 'loot:modifiers': 8, 'loot:vanilla': 8}
    score = sum(weight.get(d.get('surface') or surface_of(d['key']), 1) for d in owed)
    idx = [k for k, _ in PRIORITY_CLASSES].index(cls)
    return idx, cls, score


# --------------------------------------------------------------------------- the client asset overrides

def client_overrides():
    """dev/client_overrides/client_overrides.py as a module (its stamp and the client index), or None when the tree
    has no such tool."""
    path = mc(*CLIENT_OVERRIDES_REL.split('/'))
    if not os.path.isfile(path):
        return None
    import importlib.util
    spec = importlib.util.spec_from_file_location('client_overrides_for_intake', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def client_override_touches(jar):
    """What of `jar` the client asset overrides depend on, as the stamp says -> [labels]; None when the stamp does
    not list the jar or cannot be read (then nobody knows: check again)."""
    co = client_overrides()
    if co is None:
        return []
    try:
        was = co.load_stamp()['jars'].get(jar)
    except co.Cannot:
        return None
    return None if was is None else list(was.get('touches') or [])


# --------------------------------------------------------------------------- the gate

def gate(regs=None):
    """-> (failures, notes, summary dict). Reads the index, the records, the baseline and the registries."""
    regs = regs or Registries()
    failures, notes = [], []
    index_errors = []
    try:
        index = load_index(index_errors)
    except Exception as ex:
        return (['the mod index could not be read (%s): run python .minecraft/dev/mods/mod_index.py check' % ex], [], {})
    for e in index_errors:
        notes.append('mod index: ' + e + '  (mod_index.py check is the gate for this)')
    record_problems = []
    records = load_records(record_problems)
    failures.extend(record_problems)
    unreadable = set()
    for p_ in record_problems:
        mm = re.match(r'[^:]*/([^/:,]+)[.]json(?:, record ([^:]+))?:', p_)
        if mm:
            unreadable.add(mm.group(2) or mm.group(1))
    bundle_broken = any(p_.startswith('%s/%s:' % (RECORDS_REL, BUNDLE_NAME)) for p_ in record_problems)
    baseline = load_baseline()
    if regs.error:
        notes.append('the boss and dimension registries could not be read (%s): their decisions count as owed' % regs.error)
    by_slug = dict((m['slug'], m) for m in index)
    stats = {'mods': len(index), 'records': 0, 'grandfathered': 0, 'new': 0, 'owed': 0, 'mods_owing': 0, 'new_complete': 0}
    for m in index:
        slug = m['slug']
        new = slug not in baseline
        stats['new' if new else 'grandfathered'] += 1
        rec = records.get(slug)
        if rec is None:
            if slug not in unreadable and not (bundle_broken and not new):
                failures.append('NO RECORD   %s (%s)%s: python .minecraft/dev/mods/intake.py add' % (
                    slug, m['jar'], '' if new else ', a mod of the first audit'))
            continue
        stats['records'] += 1
        stale = rec['jar'] != m['jar'] or (not m['own'] and rec['hash'] != m['hash'])
        if stale:
            failures.append('NO RECORD OF THIS JAR   %s: the index names %s, its record was made from %s: '
                            'python .minecraft/dev/mods/intake.py update %s <the new jar>' % (slug, m['jar'], rec['jar'], slug))
            continue
        if rec['side'] != m['side']:
            failures.append('SIDE   %s: the index says %s, its record says %s: python .minecraft/dev/mods/intake.py decide %s side %s'
                            % (slug, m['side'], rec['side'], slug, m['side']))
        owed, unapplied = owed_of(rec, regs)
        if new:
            if owed:
                failures.append('OWED   %s is a new mod with %d decision(s) owed: %s' % (
                    slug, len(owed), ', '.join(d['key'] for d in owed)))
            if unapplied:
                failures.append('NOT APPLIED   %s: decided in the record, no registry entry: %s  (python .minecraft/dev/mods/intake.py apply %s)'
                                % (slug, ', '.join(d['key'] for d in unapplied), slug))
            if not owed and not unapplied:
                stats['new_complete'] += 1
        else:
            late = [d for d in owed + unapplied if d.get('raised') != 'grandfather']
            if late:
                failures.append('OWED   %s: %d decision(s) raised by an update are owed: %s' % (
                    slug, len(late), ', '.join(d['key'] for d in late)))
            n = len(owed) + len(unapplied)
            stats['owed'] += n
            stats['mods_owing'] += 1 if n else 0
    for slug in records:
        if slug not in by_slug:
            failures.append('RECORD WITHOUT A MOD   %s: no metafile of that name is in the index (%s). A removed mod: '
                            'python .minecraft/dev/mods/intake.py remove takes the record out with it' % (
                                slug, '%s/%s' % (RECORDS_REL, BUNDLE_NAME if records[slug].get('_bundle') else slug + '.json')))
    # the client asset overrides (kubejs/assets) are right only for the jars they were checked with: a client mod
    # added, updated or removed since is refused like an owed decision. The pack's own jars and edits of the override
    # files are the other half of the stamp: the pre-push block "Client asset overrides" (client_overrides.py --current)
    co = client_overrides()
    if co is not None:
        try:
            stale, _gone = co.stale_jars(co.load_stamp(), co.client_index(), own=False)
        except co.Cannot as ex:
            failures.append('CLIENT OVERRIDES   %s' % ex)
        else:
            slug_of_jar = dict((m['jar'], m['slug']) for m in index)
            for jar, why in stale:
                failures.append('CLIENT OVERRIDES   %s: %s: %s --check' % (
                    '%s (%s)' % (slug_of_jar[jar], jar) if jar in slug_of_jar else jar, why, co.TOOL))
    return failures, notes, stats


def gate_line(stats):
    return ('%d mods in the index, %d records; %d grandfathered (%d decisions owed in %d of them: the backlog, not a '
            'failure), %d new (%d complete)' % (stats.get('mods', 0), stats.get('records', 0), stats.get('grandfathered', 0),
                                                stats.get('owed', 0), stats.get('mods_owing', 0), stats.get('new', 0),
                                                stats.get('new_complete', 0)))


# --------------------------------------------------------------------------- reading a record as a person

def render(rec, regs, baseline=None, width=118):
    import textwrap
    out = []

    def wrap(prefix, text):
        lines = textwrap.wrap(text, width=width - len(prefix)) or ['']
        out.append(prefix + lines[0])
        out.extend(' ' * len(prefix) + ln for ln in lines[1:])

    new = baseline is not None and rec['mod'] not in baseline
    out.append('INTAKE RECORD  %s  (%s)' % (rec['mod'], rec.get('name') or ''))
    out.append('  jar   : %s   %s' % (rec['jar'], rec['hash'] if len(rec['hash']) < 60 else rec['hash'][:28] + '...'))
    out.append('  side  : %s      mod ids: %s%s' % (rec['side'], ', '.join(rec.get('mod_ids') or []) or '-',
                                                    ('      nested: ' + ', '.join(rec['nested_mod_ids'])) if rec.get('nested_mod_ids') else ''))
    made = rec.get('made') or {}
    out.append('  made  : %s by %s%s%s' % (made.get('date'), rec.get('raised'),
                                           '' if baseline is None else ('   NEW (every decision must be answered)' if new else '   grandfathered'),
                                           ('   evidence: ' + made['registry']) if made.get('registry') else ''))
    b = rec.get('boot')
    if b:
        out.append('  boot  : %s against %s: %s, %d regression(s)%s' % (b.get('result'), b.get('base'), b.get('verdict'),
                                                                     len(b.get('regressions') or []),
                                                                     ('   ' + b['when']) if b.get('when') else ''))
        for r in b.get('regressions') or []:
            wrap('          REGRESSION ', r)
        for k, v in (b.get('registered') or {}).items():
            wrap('          + %-22s ' % k, '%d: %s%s' % (v['n'], ', '.join(v['ids']), ' ...' if v['n'] > len(v['ids']) else ''))
        for ln in b.get('lines') or []:
            wrap('          ', ln)
    for n in rec.get('notes') or []:
        wrap('  note  : ', n)
    owed, unapplied = owed_of(rec, regs)
    out.append('  %d decision(s): %d owed, %d decided and not applied' % (len(rec['decisions']), len(owed), len(unapplied)))
    out.append('')
    for i, d in enumerate(rec['decisions'], 1):
        st, text = effective(d, regs)
        surface = d.get('surface') or surface_of(d['key'])
        title = SURFACES[surface][0]
        mark = {'owed': 'OWED', 'decided': 'decided', 'unapplied': 'DECIDED, NOT APPLIED'}[st]
        out.append('%2d. %s  [%s]%s' % (i, d['key'], mark, ('  ' + text) if text else ''))
        out.append('      %s%s' % (title, ('  (asked by %s)' % d['raised']) if d.get('raised') != rec.get('raised') else ''))
        for e in d.get('evidence') or []:
            wrap('      ships  : ', e)
        for e in d.get('pack') or []:
            wrap('      pack   : ', e)
        wrap('      default: ', d.get('default') or SURFACES[surface][3])
        if st != 'decided':
            wrap('      DECIDE : ', '%s  (%s)' % (d.get('ask') or SURFACES[surface][1], ' | '.join(d.get('options') or SURFACES[surface][2])))
        if d.get('note'):
            wrap('      note   : ', d['note'])
        out.append('')
    if rec.get('not_touched'):
        wrap('  not touched: ', ', '.join(rec['not_touched']))
    for h in rec.get('history') or []:
        wrap('  history: ', '%s  %s' % (h.get('date'), h.get('what')))
    return '\n'.join(out)
