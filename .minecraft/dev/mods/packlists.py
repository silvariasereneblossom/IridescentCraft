#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""packlists.py -- the pack's own lists, read straight from the repo (nothing is executed).

A mod's content has to be fitted into lists the pack keeps by hand: which entities are bosses, which tier a
dimension belongs to, which mods are client-only.  This module reads those lists so the per-jar inventory
(inventory.py) and the pack audit (pack_audit.py) can say "this id is in these lists and missing from those".

Two ways in:
    named lists     boss_lists(), dimension_lists(): the lists whose meaning is known, by name
    mentions        Mentions(repo): every `ns:path` token in every script and config file, so any id can be
                    asked "which files of the pack name you at all"

The named lists of the SCRIPTS are the script registries since 2026-10-13 (kubejs/config/icraft/registry/
bosses.json and dimensions.json, read through dev/rosters/rosters.py): the scripts hold no boss or dimension
list of their own any more. The callers only see {list name: set of ids}.

Stdlib only.
"""
import json
import os
import re

try:
    import tomllib
except ImportError:
    tomllib = None

RX_ID = re.compile(r'(?<![a-z0-9_.\-/:#])([a-z0-9_.\-]+:[a-z0-9_./\-]+)')
RX_QUOTED_ID = re.compile(r'''['"`]([a-z0-9_.\-]+:[a-z0-9_./\-]+)['"`]''')
DISTROS = (('root', ''), ('server', 'server_distribution'), ('client', os.path.join('distribution', 'client')))


def read_text(path):
    try:
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            return f.read()
    except OSError:
        return None


def strip_js_comments(src):
    """Blank out // and /* */ comments (string literals are kept)."""
    rx = re.compile(r'''"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`|//[^\n]*|/\*.*?\*/''', re.S)
    return rx.sub(lambda m: m.group(0) if m.group(0)[0] in '"\'`' else ' ' * len(m.group(0)), src)


def literal_after(src, anchor):
    """The bracketed literal ([...] or {...}) that follows the first match of `anchor` -> text or None."""
    m = re.search(anchor, src)
    if not m:
        return None
    i = m.end()
    while i < len(src) and src[i] not in '[{':
        i += 1
    if i >= len(src):
        return None
    close = {'[': ']', '{': '}'}
    stack = []
    start = i
    quote = None
    while i < len(src):
        c = src[i]
        if quote:
            if c == '\\':
                i += 1
            elif c == quote:
                quote = None
        elif c in '"\'`':
            quote = c
        elif c in '[{':
            stack.append(close[c])
        elif c in ']}':
            if not stack or stack.pop() != c:
                return None
            if not stack:
                return src[start:i + 1]
        i += 1
    return None


def ids_in(text):
    return set(RX_QUOTED_ID.findall(text or ''))


def toml_file(path):
    text = read_text(path)
    if text is None or tomllib is None:
        return None
    try:
        return tomllib.loads(text)
    except Exception:
        return None


def cfg_list(text, name):
    """A Forge .cfg string list: S:"<name>" < ... > -> [lines]"""
    m = re.search(r'S:"%s"\s*<(.*?)^\s*>' % re.escape(name), text or '', re.S | re.M)
    if not m:
        return []
    return [ln.strip() for ln in m.group(1).splitlines() if ln.strip() and not ln.strip().startswith('#')]


# --------------------------------------------------------------------------- named lists

# list name -> system of the boss registry (dev/rosters/rosters.py BOSS_SYSTEMS). The first two are one flag
# (`boss`) read by two scripts.
BOSS_LIST_SOURCES = (
    ('bosses.json boss: core.isBoss', 'isBoss'),
    ('bosses.json boss: no mob-tier health', 'tierHpExcluded'),
    ('bosses.json hp: designed health', 'hp'),
    ('bosses.json kind named: trophy-boss tokens', 'tokensNamed'),
    ('bosses.json rush: boss-rush rosters', 'rush'),
)


def _rosters():
    import sys
    d = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'rosters'))
    if d not in sys.path:
        sys.path.insert(0, d)
    import rosters
    return rosters


def boss_lists(repo):
    """-> ({list name: set(entity ids)}, [problems])"""
    out = {}
    problems = []
    rosters = _rosters()
    try:
        reg = rosters.load(repo)
        for name, system in BOSS_LIST_SOURCES:
            ids = set(reg.boss_ids(system))
            # a second entity id of a boss (`sameAs`: progressivebosses:wither is the Wither) is that boss for every
            # script, so for an audit of ENTITY ids it is in every list its boss is in
            out[name] = ids | set(a for a, t in reg.aliases.items() if t in ids)
    except rosters.RegistryError as e:
        problems.append('boss registry: %s' % e)
    cfg = toml_file(os.path.join(repo, 'config', 'iridescent_difficulty-common.toml'))
    if cfg is None:
        problems.append('iridescent_difficulty-common.toml: not readable')
    else:
        out['iridescent_difficulty excludes'] = set(x for x in (cfg.get('excludes') or {}).get('entities', [])
                                                    if isinstance(x, str))
    return out, problems


def dimension_lists(repo):
    """-> ({list name: {dimension id: tier or None}}, [problems]).  tier None = listed, no tier in that list."""
    out = {}
    problems = []
    rosters = _rosters()
    reg = None
    try:
        reg = rosters.load(repo)
        out['stage gates (dimensions.json stageGate)'] = dict((i, reg.dims[i]['tier']) for i in reg.dim_ids('stageGate'))
    except rosters.RegistryError as e:
        problems.append('dimension registry: %s' % e)
    cfg = toml_file(os.path.join(repo, 'config', 'iridescent_difficulty-common.toml'))
    if cfg is None:
        problems.append('iridescent_difficulty-common.toml: not readable')
    else:
        d = {}
        for k, v in (cfg.get('dimensions') or {}).items():
            m = re.fullmatch(r't(\d)', k)
            if m and isinstance(v, list):
                for dim in v:
                    d[dim] = int(m.group(1))
        out['difficulty curve (iridescent_difficulty-common.toml)'] = d
    text = read_text(os.path.join(repo, 'config', 'apotheosis', 'adventure.cfg'))
    if text is None:
        problems.append('apotheosis/adventure.cfg: not found')
    else:
        for name in ('Affix Convert Rarities', 'Gem Dimensional Rarities', 'Boss Spawn Dimensions'):
            lines = cfg_list(text, name)
            if not lines:
                problems.append('apotheosis/adventure.cfg: list "%s" not found' % name)
                continue
            out['Apotheosis "%s"' % name] = dict((ln.split('|', 1)[0], None) for ln in lines if ':' in ln)
    # the loot rules: the tier groups of the registry (flag `loot`), plus every dimension a rule names by id
    root = os.path.join(repo, 'kubejs', 'server_scripts')
    dims = {}
    if reg is not None:
        for i in reg.dim_ids('loot'):
            dims[i] = None
    for dp, dn, fn in os.walk(os.path.join(root, 'loot')):
        for f in fn:
            if f.endswith('.js'):
                src = strip_js_comments(read_text(os.path.join(dp, f)) or '')
                for m in re.finditer(r"\.anyDimension\(((?:[^()]|\([^()]*\))*)\)", src):
                    for dim in ids_in(m.group(1)):
                        dims[dim] = None
    out['loot rules (dimensions.json loot + .anyDimension ids in kubejs/server_scripts/loot)'] = dims
    return out, problems


def game_rule_defaults(repo):
    """Rule names listed in config/Crust/default_game_rules.toml -> set (None when the file is missing)."""
    text = read_text(os.path.join(repo, 'config', 'Crust', 'default_game_rules.toml'))
    if text is None:
        return None
    out = set()
    for m in re.finditer(r'^\s*[a-z_]+\.([A-Za-z0-9_.\-:]+)\s*=', text, re.M):
        out.add(m.group(1))
    return out


def keybind_baseline(repo):
    """Key-mapping names in dev/gen_keybinds.ps1 (the 2026-08-27 capture) -> set (None when unreadable)."""
    text = read_text(os.path.join(repo, 'dev', 'gen_keybinds.ps1'))
    if text is None:
        return None
    return set(re.findall(r"^\s*'([^'|\s]+)\|[^']*'", text, re.M))     # 'mapping name|key[|modifier]'


# --------------------------------------------------------------------------- mentions

MENTION_ROOTS = (
    ('kubejs/server_scripts', ('.js',)), ('kubejs/startup_scripts', ('.js',)), ('kubejs/client_scripts', ('.js',)),
    ('kubejs/data', ('.json',)), ('config', ('.toml', '.cfg', '.json', '.json5', '.txt', '.properties', '.yaml', '.yml',
                                              '.snbt')),
    ('defaultconfigs', ('.toml',)),
)
MENTION_SKIP_DIRS = ('config/paxi', 'config/heracles', 'config/ftbquests', 'config/openloader')


class Mentions(object):
    """Which files of the pack name an id.  Built once: {id: [repo-relative files]}."""

    def __init__(self, repo, max_bytes=2000000):
        self.repo = repo
        self.by_id = {}
        self.files = 0
        for rel_root, exts in MENTION_ROOTS:
            root = os.path.join(repo, rel_root.replace('/', os.sep))
            for dp, dn, fn in os.walk(root):
                rel_dir = os.path.relpath(dp, repo).replace('\\', '/')
                if any(rel_dir == s or rel_dir.startswith(s + '/') for s in MENTION_SKIP_DIRS):
                    dn[:] = []
                    continue
                for f in sorted(fn):
                    if not f.endswith(exts):
                        continue
                    p = os.path.join(dp, f)
                    try:
                        if os.path.getsize(p) > max_bytes:
                            continue
                    except OSError:
                        continue
                    text = read_text(p)
                    if text is None:
                        continue
                    if f.endswith('.js'):
                        text = strip_js_comments(text)
                    self.files += 1
                    rel = rel_dir + '/' + f
                    for tok in set(RX_ID.findall(text)):
                        self.by_id.setdefault(tok.rstrip('.'), []).append(rel)

    def files_for(self, rid):
        return self.by_id.get(rid, [])

    def namespace_files(self, ns):
        """Files that name ANY id of a namespace -> {file: count}"""
        out = {}
        pre = ns + ':'
        for rid, files in self.by_id.items():
            if rid.startswith(pre):
                for f in files:
                    out[f] = out.get(f, 0) + 1
        return out


# --------------------------------------------------------------------------- the three mod indexes

def read_indexes(repo):
    """-> ({distro: {jar file name: {'metafile', 'name', 'side', 'hash', 'hash_format', 'mode'}}},
           {distro: [problems]})"""
    out = {}
    problems = {}
    for distro, rel in DISTROS:
        d = os.path.join(repo, rel, 'mods', '.index') if rel else os.path.join(repo, 'mods', '.index')
        entries = {}
        probs = []
        if not os.path.isdir(d):
            probs.append('index folder missing: %s' % d)
        else:
            for f in sorted(os.listdir(d)):
                if not f.endswith('.pw.toml'):
                    continue
                text = read_text(os.path.join(d, f)) or ''
                data = None
                if tomllib is not None:
                    try:
                        data = tomllib.loads(text)
                    except Exception as e:
                        probs.append('%s: not valid TOML (%s)' % (f, str(e)[:80]))
                if data is None:
                    data = {'download': {}}
                    for k in ('filename', 'name', 'side'):
                        m = re.search(r"^%s\s*=\s*['\"](.*)['\"]\s*$" % k, text, re.M)
                        if m:
                            data[k] = m.group(1)
                    for k in ('hash', 'hash-format', 'mode'):
                        m = re.search(r"^%s\s*=\s*['\"](.*)['\"]\s*$" % re.escape(k), text, re.M)
                        if m:
                            data['download'][k] = m.group(1)
                fn = data.get('filename')
                if not isinstance(fn, str):
                    probs.append('%s: no filename' % f)
                    continue
                dl = data.get('download') if isinstance(data.get('download'), dict) else {}
                e = {'metafile': f, 'name': data.get('name'), 'side': data.get('side'), 'hash': dl.get('hash'),
                     'hash_format': dl.get('hash-format'), 'mode': dl.get('mode')}
                if fn in entries:
                    probs.append('duplicate metafiles for %s: %s and %s' % (fn, entries[fn]['metafile'], f))
                    e['duplicate_of'] = entries[fn]['metafile']
                entries[fn] = e
        out[distro] = entries
        problems[distro] = probs
    return out, problems


def client_only_lists(repo):
    """The hand lists that say "client-only" -> {list name: set(jar file names or name patterns)}"""
    out = {}
    text = read_text(os.path.join(repo, 'server_distribution', 'client_only_mods.txt'))
    if text is not None:
        out['server_distribution/client_only_mods.txt'] = set(
            ln.strip() for ln in text.splitlines() if ln.strip() and not ln.strip().startswith('#'))
    return out


def tracked_configs(repo):
    """Config file names (relative, lower case) per distro -> {distro: set}"""
    out = {}
    for distro, rel in DISTROS:
        found = set()
        for sub in ('config', 'defaultconfigs'):
            root = os.path.join(repo, rel, sub) if rel else os.path.join(repo, sub)
            for dp, dn, fn in os.walk(root):
                for f in fn:
                    found.add((sub + '/' + os.path.relpath(os.path.join(dp, f), root)).replace('\\', '/').lower())
        out[distro] = found
    return out


def load_registry_dump(repo):
    """The boot gate's registry dump (dev/registry/), when it exists.

    The static inventory can only GUESS registered ids from language keys and loot tables.  The dump is the
    game's own answer.  Expected shape (the reader accepts a single JSON file or one file per registry):
        entities    {id: {'category': 'monster' | 'creature' | 'misc' | ..., ...}}  or a list of ids
        dimensions, items, blocks, structures, game_rules, key_mappings ...   {id: ...} or [ids]
        mixins_applied   [config or class names]
    -> {registry name: {id: info}} or None when there is no dump."""
    root = os.path.join(repo, 'dev', 'registry')
    if not os.path.isdir(root):
        return None
    out = {}
    meta = {}
    for dp, dn, fn in os.walk(root):
        for f in sorted(fn):
            if not f.endswith('.json'):
                continue
            try:
                with open(os.path.join(dp, f), 'r', encoding='utf-8') as fh:
                    data = json.load(fh)
            except (OSError, ValueError):
                continue
            if isinstance(data, dict) and any(isinstance(v, (dict, list)) for v in data.values()) and \
                    not all(isinstance(k, str) and ':' in k for k in data):
                items = data.items()            # one file holding several registries
            else:
                items = [(f[:-5], data)]
            for name, val in items:
                if isinstance(val, list):
                    val = dict(((x if isinstance(x, str) else x.get('id')), (x if isinstance(x, dict) else {}))
                               for x in val if isinstance(x, (str, dict)))
                if isinstance(val, dict):
                    out.setdefault(str(name), {}).update(val)
                else:
                    meta[str(name)] = val
    if not out:
        return None
    out['_meta'] = meta
    return out
