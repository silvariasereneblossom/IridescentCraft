#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""jarscan.py -- the one archive scanner behind the loot audit and the per-jar inventory.

Reads (never executes, never extracts) one jar or zip, with every jar nested under META-INF/jarjar and
META-INF/jars, and returns one record: a `unit` per archive (the top-level one and each nested one, the
nested ones named `<parent>!<file>`).  A unit holds what that archive ships: mod ids, loot tables, structure
templates and their container NBT, worldgen wiring, tags, string constants of its classes, and (under `inv`)
the facts only the inventory reads: dependencies, side hints, mixin configs and their targets, recipes,
advancements, functions, tags by registry, language keys, class hints.

Two consumers, one cache:
    dev/loot_audit/truth.py     merges the units of every archive into the loot audit's ground truth
    dev/mods/inventory.py       turns the units of one jar into a per-mod record

Records are cached per archive under <cache dir>/jars, keyed by (file name, size, mtime, SCANNER_VERSION);
both consumers pass the same cache dir (<repo>/dev/loot_audit/.cache), so a jar is scanned once.  A change
to what a unit holds needs a SCANNER_VERSION bump.

The loot audit's output must not depend on the `inv` block: nothing here may add to a unit's `counts` or
`notes` on the inventory's behalf (truth.py prints both).

Stdlib only.
"""
import hashlib
import io
import json
import os
import re
import struct
import time
import zipfile
import zlib
from collections import Counter, defaultdict

SCANNER_VERSION = 10

NESTED_DIRS = ('META-INF/jarjar', 'META-INF/jars')
END_BIOMES = ['minecraft:the_end', 'minecraft:end_highlands', 'minecraft:end_midlands',
              'minecraft:small_end_islands', 'minecraft:end_barrens']

# SRG names of Level.OVERWORLD / NETHER / END (Forge 1.20.1 production jars)
SRG_DIM_FIELDS = ((b'f_46428_', 'minecraft:overworld'), (b'f_46429_', 'minecraft:the_nether'),
                  (b'f_46430_', 'minecraft:the_end'))


RX_NS = re.compile(r'[a-z0-9_.\-]+\Z')
RX_PATH = re.compile(r'[a-z0-9_./\-]+\Z')
RX_RL = re.compile(r'[a-z0-9_.\-]+:[a-z0-9_./\-]+\Z')
RXB_JSON_RL = re.compile(rb'"(#?[a-z0-9_.\-]+:[a-z0-9_./\-]+)"')
RXB_CONST = re.compile(rb'([a-z0-9_.\-]+:)?([a-z0-9_./\-]+)')
RXB_ASSET_EXT = re.compile(rb'\.(?:png|json|ogg|obj|mcmeta|txt|glsl|fsh|vsh|properties|toml|cfg|js|html|md|'
                           rb'class|jar|zip|gif|jpg|mtl|bin|dat|lang|snbt|mcfunction|nbt|xml|yml|yaml|csv)\Z')
RXB_RECIPE = re.compile(rb'((?:[a-z0-9_.\-]+:)?[a-z0-9_./\-]{3,})\x01')


# --------------------------------------------------------------------------- small helpers

def sha1(b):
    return hashlib.sha1(b).hexdigest()


def nid(s, default_ns='minecraft'):
    """Normalise a resource location string to ns:path (None if not a string)."""
    if not isinstance(s, str) or not s:
        return None
    if s[0] == ':':
        return default_ns + s
    if ':' in s:
        return s
    return default_ns + ':' + s


_RX_COMMENT = re.compile(r'"(?:\\.|[^"\\])*"|//[^\n]*|/\*.*?\*/', re.S)
_RX_TRAIL = re.compile(r'"(?:\\.|[^"\\])*"|,(\s*[}\]])')


def _strip_lenient(text):
    text = _RX_COMMENT.sub(lambda m: m.group(0) if m.group(0)[0] == '"' else ' ', text)
    return _RX_TRAIL.sub(lambda m: m.group(0) if m.group(1) is None else m.group(1), text)


def load_json(raw):
    """-> (obj, error, lenient).  obj is None when it cannot be parsed at all.

    lenient is False (strict JSON), 'control_chars' (raw control characters inside a string: Gson accepts
    these even in strict mode, so the file is VALID in game) or 'comments' (needed // or /* */ comments or
    trailing commas stripped: only Gson's lenient reader accepts that)."""
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = raw.decode('latin-1')
    try:
        return json.loads(text), None, False
    except RecursionError:
        return None, 'recursion limit', False
    except ValueError as e:
        err = str(e)
    try:
        return json.loads(text, strict=False), err, 'control_chars'
    except (ValueError, RecursionError):
        pass
    try:
        return json.loads(_strip_lenient(text), strict=False), err, 'comments'
    except (ValueError, RecursionError):
        return None, err, False


def as_list(v):
    if v is None:
        return []
    if isinstance(v, list):
        return v
    return [v]


# --------------------------------------------------------------------------- NBT (structure templates)

_S_I = struct.Struct('>i').unpack_from
_S_H = struct.Struct('>h').unpack_from
_S_Q = struct.Struct('>q').unpack_from
_S_F = struct.Struct('>f').unpack_from
_S_D = struct.Struct('>d').unpack_from
_BLOCK_RUN_A = re.compile(rb'(?:\x09\x00\x03pos\x03\x00\x00\x00\x03.{12}\x03\x00\x05state.{4}\x00){1,4096}', re.S)
_BLOCK_RUN_B = re.compile(rb'(?:\x03\x00\x05state.{4}\x09\x00\x03pos\x03\x00\x00\x00\x03.{12}\x00){1,4096}', re.S)


def _rd(b, off, t):
    """Generic NBT payload reader -> (value, new offset).  Primitive arrays become None."""
    if t == 8:
        n = (b[off] << 8) | b[off + 1]
        off += 2
        return b[off:off + n].decode('utf-8', 'replace'), off + n
    if t == 3:
        return _S_I(b, off)[0], off + 4
    if t == 10:
        d = {}
        while True:
            tt = b[off]
            if tt == 0:
                return d, off + 1
            n = (b[off + 1] << 8) | b[off + 2]
            off += 3
            k = b[off:off + n].decode('utf-8', 'replace')
            off += n
            d[k], off = _rd(b, off, tt)
    if t == 1:
        v = b[off]
        return (v - 256 if v > 127 else v), off + 1
    if t == 9:
        et = b[off]
        n = _S_I(b, off + 1)[0]
        off += 5
        if n <= 0:
            return [], off
        if et == 3:
            return list(struct.unpack_from('>%di' % n, b, off)), off + 4 * n
        if et == 6:
            return list(struct.unpack_from('>%dd' % n, b, off)), off + 8 * n
        if et == 5:
            return list(struct.unpack_from('>%df' % n, b, off)), off + 4 * n
        if et == 1:
            return list(b[off:off + n]), off + n
        if et == 2:
            return list(struct.unpack_from('>%dh' % n, b, off)), off + 2 * n
        if et == 4:
            return list(struct.unpack_from('>%dq' % n, b, off)), off + 8 * n
        out = []
        for _ in range(n):
            v, off = _rd(b, off, et)
            out.append(v)
        return out, off
    if t == 2:
        return _S_H(b, off)[0], off + 2
    if t == 4:
        return _S_Q(b, off)[0], off + 8
    if t == 5:
        return _S_F(b, off)[0], off + 4
    if t == 6:
        return _S_D(b, off)[0], off + 8
    if t == 7:
        return None, off + 4 + _S_I(b, off)[0]
    if t == 11:
        return None, off + 4 + 4 * _S_I(b, off)[0]
    if t == 12:
        return None, off + 4 + 8 * _S_I(b, off)[0]
    raise ValueError('bad NBT tag %d at %d' % (t, off))


def _read_blocks(b, off, out):
    """Reads the template `blocks` list, keeping only the elements that carry block-entity nbt."""
    et = b[off]
    n = _S_I(b, off + 1)[0]
    off += 5
    if n <= 0:
        return off, 0
    if et != 10:
        for _ in range(n):
            _, off = _rd(b, off, et)
        return off, n
    i = 0
    while i < n:
        m = _BLOCK_RUN_A.match(b, off) or _BLOCK_RUN_B.match(b, off)
        if m is not None:
            cnt = (m.end() - off) // 36
            if cnt > n - i:
                cnt = n - i
            off += cnt * 36
            i += cnt
            continue
        d, off = _rd(b, off, 10)
        i += 1
        if 'nbt' in d:
            out.append(d)
    return off, n


_CONT_SUB = ('chest', 'barrel', 'crate', 'shulker', 'dispenser', 'dropper', 'hopper', 'suspicious_')
_CONT_TOK = {'urn', 'pot', 'urns', 'pots', 'vase', 'loot', 'coffin', 'sarcophagus', 'cabinet', 'drawer'}


def looks_like_container(block):
    if not block:
        return False
    if block.startswith('lootr:'):
        return True
    p = block.partition(':')[2] or block
    for s in _CONT_SUB:
        if s in p:
            return True
    for tok in re.split(r'[_/.\-]', p):
        if tok in _CONT_TOK:
            return True
    return False


def _deep_loot(v, owner, out, depth=0, skip_top=False):
    """Collect (key, table, owner id) for every LootTable / DeathLootTable string below v."""
    if depth > 24:
        return
    if isinstance(v, dict):
        oid = v.get('id')
        if not isinstance(oid, str):
            oid = owner
        for k, x in v.items():
            if k == 'LootTable' or k == 'DeathLootTable':
                if isinstance(x, str) and x and not (skip_top and depth == 0 and k == 'LootTable'):
                    out.append((k, x, oid))
            elif isinstance(x, (dict, list)):
                _deep_loot(x, oid, out, depth + 1)
    elif isinstance(v, list):
        for x in v:
            if isinstance(x, (dict, list)):
                _deep_loot(x, owner, out, depth + 1)


def analyse_template(raw):
    """gzip/raw NBT structure template -> compact record."""
    rec = {}
    if raw[:2] == b'\x1f\x8b':
        b = zlib.decompressobj(31).decompress(raw)
    elif raw[:1] == b'\x0a':
        b = raw
        rec['uncompressed'] = True
    elif raw[:1] == b'\x78':
        b = zlib.decompress(raw)
        rec['zlib'] = True
    else:
        raise ValueError('not gzip / NBT (magic %r)' % raw[:4])
    if not b or b[0] != 10:
        raise ValueError('root tag is not a compound')
    off = 3 + ((b[1] << 8) | b[2])
    size = None
    palette = None
    palettes = None
    entities = []
    blocks = []
    nblocks = 0
    while True:
        tt = b[off]
        if tt == 0:
            break
        n = (b[off + 1] << 8) | b[off + 2]
        name = b[off + 3:off + 3 + n]
        off += 3 + n
        if name == b'blocks' and tt == 9:
            off, nblocks = _read_blocks(b, off, blocks)
            continue
        v, off = _rd(b, off, tt)
        if name == b'size':
            size = v
        elif name == b'palette':
            palette = v
        elif name == b'palettes':
            palettes = v
        elif name == b'entities':
            entities = v or []
    if palette is None and palettes:
        palette = palettes[0]
        rec['palettes'] = len(palettes)
    palette = palette or []
    rec['size'] = size if isinstance(size, list) else None
    rec['blocks'] = nblocks
    containers = []
    eloot = []
    markers = []
    jig = Counter()
    for d in blocks:
        nbt = d.get('nbt')
        if not isinstance(nbt, dict):
            continue
        st = d.get('state')
        block = None
        if isinstance(st, int) and 0 <= st < len(palette) and isinstance(palette[st], dict):
            block = nid(palette[st].get('Name'))
        beid = nbt.get('id') if isinstance(nbt.get('id'), str) else None
        if nbt.get('mode') == 'DATA' and 'metadata' in nbt:
            md = nbt.get('metadata')
            if isinstance(md, str) and md not in markers:
                markers.append(md)
        if 'pool' in nbt and ('final_state' in nbt or 'joint' in nbt or 'target' in nbt
                              or block == 'minecraft:jigsaw'):
            jig[(nid(nbt.get('pool')) or '', str(nbt.get('name') or ''), str(nbt.get('target') or ''))] += 1
        lt = nbt.get('LootTable')
        items = nbt.get('Items')
        nitems = len(items) if isinstance(items, list) else 0
        has_lt = isinstance(lt, str)
        if has_lt or nitems or looks_like_container(block) or (beid and looks_like_container(beid)):
            c = {'block': block or beid or '?', 'loot_table': (nid(lt) if lt else '') if has_lt else None,
                 'fixed_items': nitems, 'pos': d.get('pos')}
            if beid and nid(beid) != block:
                c['be_id'] = nid(beid)
            seed = nbt.get('LootTableSeed')
            if isinstance(seed, int) and seed:
                c['loot_table_seed'] = seed
            containers.append(c)
        deep = []
        _deep_loot(nbt, beid or block, deep, skip_top=True)
        for k, tb, oid in deep:
            e = {'entity': nid(oid) if oid else '?', 'source': 'block_entity', 'block': block or beid or '?'}
            e['loot_table' if k == 'LootTable' else 'death_loot_table'] = nid(tb)
            eloot.append(e)
    for ent in entities:
        if not isinstance(ent, dict):
            continue
        nbt = ent.get('nbt')
        if not isinstance(nbt, dict):
            continue
        deep = []
        _deep_loot(nbt, None, deep)
        top = nbt.get('id') if isinstance(nbt.get('id'), str) else '?'
        for k, tb, oid in deep:
            e = {'entity': nid(oid) if oid else nid(top)}
            if nid(oid) != nid(top):
                e['source'] = 'nested_in:' + str(nid(top))
            e['loot_table' if k == 'LootTable' else 'death_loot_table'] = nid(tb)
            eloot.append(e)
    rec['entities'] = len(entities)
    rec['containers'] = containers
    rec['entity_loot'] = eloot
    rec['data_markers'] = markers
    rec['jigsaws'] = [{'pool': k[0], 'name': k[1], 'target': k[2], 'n': v} for k, v in sorted(jig.items())]
    return rec


# --------------------------------------------------------------------------- .class constant pools

_CP_SIZE = {3: 5, 4: 5, 7: 3, 9: 5, 10: 5, 11: 5, 12: 5, 15: 4, 16: 3, 17: 5, 18: 5, 19: 3, 20: 3}


def class_strings(b):
    """Set of the UTF8 payloads referenced by CONSTANT_String entries (i.e. string literals)."""
    if b[:4] != b'\xca\xfe\xba\xbe':
        return None
    n = (b[8] << 8) | b[9]
    off = 10
    i = 1
    utf = {}
    sidx = []
    size = _CP_SIZE
    try:
        while i < n:
            t = b[off]
            if t == 1:
                utf[i] = off
                off += 3 + ((b[off + 1] << 8) | b[off + 2])
            elif t == 8:
                sidx.append((b[off + 1] << 8) | b[off + 2])
                off += 3
            elif t == 5 or t == 6:
                off += 9
                i += 1
            else:
                off += size[t]
            i += 1
    except (IndexError, KeyError):
        pass
    out = set()
    for s in sidx:
        o = utf.get(s)
        if o is not None:
            out.add(b[o + 3:o + 3 + ((b[o + 1] << 8) | b[o + 2])])
    return out


# --------------------------------------------------------------------------- JSON analysers

_COMPOSITE = ('minecraft:alternatives', 'minecraft:group', 'minecraft:sequence')
_COND_KEYS = ('forge:conditions', 'fabric:load_conditions', 'neoforge:conditions', 'porting_lib:conditions',
              'conditions')
# Every name the three vanilla 1.20.1 loot registries hold (the string constants of LootPoolEntries,
# LootItemFunctions and LootItemConditions in client-1.20.1-*-srg.jar, read 2026-10-11).  Hard-coded
# vanilla knowledge, NOT derived from files.  A `minecraft:` name outside these sets does not exist in this
# version: the parser throws "Unknown type" and the whole table is dropped (the condition `alternative`
# became `any_of` in 1.20; the function `set_written_book_pages` is 1.20.5+).
VANILLA_LOOT_TYPES = {
    'entry': frozenset(('alternatives', 'dynamic', 'empty', 'group', 'item', 'loot_table', 'sequence', 'tag')),
    'function': frozenset((
        'apply_bonus', 'copy_name', 'copy_nbt', 'copy_state', 'enchant_randomly', 'enchant_with_levels',
        'exploration_map', 'explosion_decay', 'fill_player_head', 'furnace_smelt', 'limit_count',
        'looting_enchant', 'reference', 'set_attributes', 'set_banner_pattern', 'set_contents', 'set_count',
        'set_damage', 'set_enchantments', 'set_instrument', 'set_loot_table', 'set_lore', 'set_name', 'set_nbt',
        'set_potion', 'set_stew_effect')),
    'condition': frozenset((
        'all_of', 'any_of', 'block_state_property', 'damage_source_properties', 'entity_properties',
        'entity_scores', 'inverted', 'killed_by_player', 'location_check', 'match_tool', 'random_chance',
        'random_chance_with_looting', 'reference', 'survives_explosion', 'table_bonus', 'time_check',
        'value_check', 'weather_check')),
}


def analyse_loot(obj):
    if not isinstance(obj, dict):
        raise ValueError('root is not a JSON object')
    items, tags, refs, setlt, other_items = set(), set(), set(), set(), set()
    other = Counter()
    odd = {'entry': set(), 'function': set(), 'condition': set()}

    def note_type(kind, name):
        """Type names outside the vanilla registry ('' = no type key: the game reads "Unknown type ''")."""
        if name is None:
            odd[kind].add('')
        elif not (name.startswith('minecraft:') and name[10:] in VANILLA_LOOT_TYPES[kind]):
            odd[kind].add(name)

    def conds(cs, depth=0):
        if not isinstance(cs, list) or depth > 16:
            return
        for c in cs:
            if not isinstance(c, dict):
                continue
            note_type('condition', nid(c.get('condition')))
            if isinstance(c.get('term'), dict):          # inverted
                conds([c['term']], depth + 1)
            conds(c.get('terms'), depth + 1)             # any_of / all_of

    def funcs(fs):
        if not isinstance(fs, list):
            return
        for f in fs:
            if not isinstance(f, dict):
                continue
            fn = nid(f.get('function'))
            note_type('function', fn)
            conds(f.get('conditions'))
            if fn == 'minecraft:set_loot_table':
                x = nid(f.get('name'))
                if x:
                    setlt.add(x)
            elif fn == 'minecraft:set_contents':
                for c in as_list(f.get('entries')):
                    entry(c)

    def entry(e):
        if not isinstance(e, dict):
            return 0
        note_type('entry', nid(e.get('type')))
        conds(e.get('conditions'))
        t = nid(e.get('type')) or '<missing type>'
        name = nid(e.get('name'))
        n = 0
        if t == 'minecraft:item':
            if name:
                items.add(name)
            n = 1
        elif t == 'minecraft:tag':
            if name:
                tags.add(name)
            n = 1
        elif t == 'minecraft:loot_table':
            if name:
                refs.add(name)
            n = 1
        elif t == 'minecraft:empty' or t in _COMPOSITE:
            n = 0
        elif t == 'minecraft:dynamic':
            n = 1
        else:
            other[t] += 1
            n = 1
            st = e.get('stack')
            for x in (e.get('name'), e.get('item'), st.get('item') if isinstance(st, dict) else None,
                      st.get('id') if isinstance(st, dict) else None):
                if isinstance(x, str) and x:
                    other_items.add(nid(x))
        ch = e.get('children')
        if isinstance(ch, list):
            for c in ch:
                n += entry(c)
        funcs(e.get('functions'))
        return n

    pools = obj.get('pools')
    if not isinstance(pools, list):
        pools = []
    npools = nonempty = 0
    for p in pools:
        if not isinstance(p, dict):
            continue
        npools += 1
        real = 0
        for e in as_list(p.get('entries')):
            real += entry(e)
        if real:
            nonempty += 1
        conds(p.get('conditions'))
        funcs(p.get('functions'))
    funcs(obj.get('functions'))
    cond = None
    for k in _COND_KEYS:
        if k in obj:
            cond = k
            break
    t = obj.get('type')
    rec = {'type': nid(t) if isinstance(t, str) else None, 'items': sorted(items), 'tags': sorted(tags),
           'table_refs': sorted(refs), 'empty': nonempty == 0, 'pools': npools,
           'forge_conditions': bool(cond)}
    if cond:
        rec['condition_key'] = cond
        cs = json.dumps(obj.get(cond), sort_keys=True)
        rec['conditions'] = obj.get(cond) if len(cs) <= 600 else cs[:600] + '...'
    if other:
        rec['other_entry_types'] = dict(other)
    if other_items:
        rec['other_entry_items'] = sorted(other_items)
    if setlt:
        rec['set_loot_table'] = sorted(setlt)
    if any(odd.values()):
        rec['nonvanilla_types'] = dict((k, sorted(v)) for k, v in odd.items() if v)
    return rec


def proc_loot(obj):
    """Every `loot_table` string below obj, with the nearest enclosing processor_type."""
    out = []

    def walk(v, ptype, depth):
        if depth > 30:
            return
        if isinstance(v, dict):
            pt = v.get('processor_type')
            if isinstance(pt, str):
                ptype = nid(pt)
            for k, x in v.items():
                if k == 'loot_table' and isinstance(x, str) and x:
                    out.append([nid(x), ptype])
                elif isinstance(x, (dict, list)):
                    walk(x, ptype, depth + 1)
        elif isinstance(v, list):
            for x in v:
                if isinstance(x, (dict, list)):
                    walk(x, ptype, depth + 1)

    walk(obj, None, 0)
    return out


def analyse_pool_elements(elements):
    """-> (templates, features, procs{proc:[templates]}, inline_loot, element type counts)"""
    els, feats = set(), set()
    procs = defaultdict(set)
    inline = []
    et = Counter()

    def walk(el, depth):
        if not isinstance(el, dict) or depth > 8:
            return
        t = el.get('element_type')
        if isinstance(t, str):
            et[nid(t)] += 1
        loc = el.get('location')
        tid = None
        if isinstance(loc, str):
            tid = nid(loc)
            els.add(tid)
        f = el.get('feature')
        if isinstance(f, str):
            feats.add(nid(f))
        pr = el.get('processors')
        if isinstance(pr, str):
            p = nid(pr)
            if p != 'minecraft:empty' and tid:
                procs[p].add(tid)
        elif pr:
            for tb, pt in proc_loot(pr):
                inline.append([tb, pt, tid])
        sub = el.get('elements')
        if isinstance(sub, list):
            for c in sub:
                walk(c, depth + 1)
        for k in ('delegate', 'element'):
            v = el.get(k)
            if isinstance(v, dict):
                walk(v, depth + 1)

    for e in as_list(elements):
        if isinstance(e, dict):
            inner = e.get('element')
            walk(inner if isinstance(inner, dict) else e, 0)
    return els, feats, procs, inline, et


def analyse_pool(obj):
    if not isinstance(obj, dict):
        raise ValueError('root is not a JSON object')
    els, feats, procs, inline, et = analyse_pool_elements(obj.get('elements'))
    fb = obj.get('fallback')
    rec = {'fallback': nid(fb) if isinstance(fb, str) else None, 'elements': sorted(els),
           'features': sorted(feats)}
    if procs:
        rec['procs'] = {k: sorted(v) for k, v in procs.items()}
    if inline:
        rec['inline_loot'] = inline
    rec['etypes'] = dict(et)
    return rec


def rl_strings(raw, keep_tags=False):
    out = set()
    for s in RXB_JSON_RL.findall(raw):
        if s[:1] == b'#':
            if keep_tags:
                out.add(s.decode())
        else:
            out.add(s.decode())
    return out


def parse_tag_file(obj):
    if not isinstance(obj, dict):
        raise ValueError('root is not a JSON object')
    vals = []
    for v in as_list(obj.get('values')):
        if isinstance(v, str):
            req = True
            s = v
        elif isinstance(v, dict) and isinstance(v.get('id'), str):
            s = v['id']
            req = v.get('required', True) is not False
        else:
            continue
        s = ('#' + nid(s[1:])) if s.startswith('#') else nid(s)
        vals.append([s, req])
    rec = {'r': bool(obj.get('replace', False)), 'v': vals}
    rem = []
    for v in as_list(obj.get('remove')):
        s = v if isinstance(v, str) else (v.get('id') if isinstance(v, dict) else None)
        if isinstance(s, str):
            rem.append(('#' + nid(s[1:])) if s.startswith('#') else nid(s))
    if rem:
        rec['x'] = rem
    return rec


def norm_ref_list(v):
    """A biome / feature holder-set field: id | #tag | [ids] -> list of normalised strings (or raw dict)."""
    out = []
    for s in as_list(v):
        if isinstance(s, str) and s:
            out.append(('#' + nid(s[1:])) if s.startswith('#') else nid(s))
        elif isinstance(s, dict):
            out.append(s if len(json.dumps(s)) <= 2000 else {'type': s.get('type'), 'truncated': True})
    return out


def analyse_dimension(obj):
    rec = {'type': None, 'gen_type': None, 'bs_type': None, 'biomes': [], 'tags': []}
    if not isinstance(obj, dict):
        return rec
    t = obj.get('type')
    rec['type'] = nid(t) if isinstance(t, str) else ('<inline>' if isinstance(t, dict) else None)
    gen = obj.get('generator')
    if not isinstance(gen, dict):
        return rec
    rec['gen_type'] = nid(gen.get('type'))
    bs = gen.get('biome_source')
    biomes = set()
    if isinstance(bs, dict):
        bt = nid(bs.get('type'))
        rec['bs_type'] = bt
        if isinstance(bs.get('preset'), str):
            rec['preset'] = nid(bs['preset'])
        if isinstance(bs.get('biome'), str):
            biomes.add(nid(bs['biome']))
        bl = bs.get('biomes')
        for e in as_list(bl):
            if isinstance(e, str):
                if e.startswith('#'):
                    rec['tags'].append(nid(e[1:]))
                else:
                    biomes.add(nid(e))
            elif isinstance(e, dict) and isinstance(e.get('biome'), str):
                biomes.add(nid(e['biome']))
        if bt == 'minecraft:the_end':
            biomes.update(END_BIOMES)
    else:
        st = gen.get('settings')
        if isinstance(st, dict) and isinstance(st.get('biome'), str):
            biomes.add(nid(st['biome']))
            rec['bs_type'] = 'flat'
    rec['biomes'] = sorted(biomes)
    return rec


def parse_mods_toml(text, manifest):
    mods = []
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    secs = re.split(r'^[ \t]*\[\[\s*mods\s*\]\][ \t]*(?:#.*)?$', text, flags=re.M)
    for sec in secs[1:]:
        sec = re.split(r'^[ \t]*\[', sec, maxsplit=1, flags=re.M)[0]
        m = re.search(r'^[ \t]*modId[ \t]*=[ \t]*["\']([^"\']+)["\']', sec, re.M)
        if not m:
            continue
        v = re.search(r'^[ \t]*version[ \t]*=[ \t]*["\']([^"\']*)["\']', sec, re.M)
        ver = v.group(1) if v else None
        if ver and '${' in ver:
            ver = manifest.get('Implementation-Version') or ver
        mods.append({'id': m.group(1), 'version': ver, 'loader': 'forge'})
    return mods


# --------------------------------------------------------------------------- archive sources

class ZipSrc(object):
    def __init__(self, zf):
        self.zf = zf
        self.names = zf.namelist()

    def read(self, name):
        return self.zf.read(name)


class DirSrc(object):
    def __init__(self, root, prefix=''):
        self.root = root
        self.prefix = prefix
        names = []
        for dp, dn, fn in os.walk(root):
            rel = os.path.relpath(dp, root).replace('\\', '/')
            rel = '' if rel == '.' else rel + '/'
            for f in fn:
                names.append(prefix + rel + f)
        names.sort()
        self.names = names

    def read(self, name):
        with open(os.path.join(self.root, name[len(self.prefix):].replace('/', os.sep)), 'rb') as f:
            return f.read()


def new_unit(uid):
    return {'id': uid, 'mods': [], 'mod_meta': 'none', 'manifest': {}, 'pack_mcmeta': None,
            'loot_tables': {}, 'structures': {}, 'pools': {}, 'processor_lists': {}, 'wg_structures': {},
            'structure_sets': {}, 'biome_tags': {}, 'item_tags': {}, 'dimensions': {}, 'world_presets': {},
            'biomes': {}, 'cfeatures': {}, 'pfeatures': {}, 'biome_mods': {}, 'litho': {},
            'rs_pool_additions': {}, 'glms': {}, 'glm_list': None,
            'adv_loot': {}, 'fn_loot': {}, 'other_rl': {}, 'other_files': [],
            'lang_entity': [], 'lang_item': [], 'lang_block': [], 'item_models': [],
            'counts': {}, 'notes': [], 'skipped_nested': [],
            'class_n': 0, 'class_names': [], 'class_rl': {}, 'class_path': {}, 'class_path_ns': {},
            'class_dims': {}, 'class_prefix': [], 'class_leaf': {}, 'fam_ns': []}


_BLOCK_KEYS = ('Name', 'block', 'blocks', 'state', 'fluid', 'ignored_blocks')
_RX_FN_LOOT = re.compile(r'\bloot\s+(?:give|insert|spawn|replace)\b[^\n]*?\s(?:loot|fish)\s+([a-z0-9_.:/\-]+)')
_RX_FN_NBT = re.compile(r'(?:Death)?LootTable\s*:\s*\\?"?([a-z0-9_.:/\-]+)')


def scan_unit_data(u, src):
    names = src.names
    nameset = set(names)
    counts = Counter()
    notes = u['notes']

    def note(msg):
        if len(notes) < 60:
            notes.append(msg)
        else:
            counts['notes_dropped'] += 1

    # ---- mod metadata
    man = {}
    if 'META-INF/MANIFEST.MF' in nameset:
        try:
            for line in src.read('META-INF/MANIFEST.MF').decode('utf-8', 'replace').splitlines():
                k, sep, v = line.partition(':')
                if sep:
                    man[k.strip()] = v.strip()
        except Exception as e:
            note('MANIFEST unreadable: %s' % e)
    u['manifest'] = {k: man[k] for k in ('Implementation-Version', 'FMLModType') if k in man}
    if 'META-INF/mods.toml' in nameset:
        try:
            u['mods'] = parse_mods_toml(src.read('META-INF/mods.toml').decode('utf-8-sig', 'replace'), man)
            u['mod_meta'] = 'forge'
        except Exception as e:
            note('mods.toml unreadable: %s' % e)
    if 'fabric.mod.json' in nameset:
        obj, err, _ = load_json(src.read('fabric.mod.json'))
        if isinstance(obj, dict) and isinstance(obj.get('id'), str):
            if u['mod_meta'] == 'none':
                u['mod_meta'] = 'fabric'
                u['mods'].append({'id': obj['id'], 'version': str(obj.get('version')), 'loader': 'fabric'})
            else:
                u['fabric_id'] = obj['id']
        elif u['mod_meta'] == 'none':
            u['mod_meta'] = 'fabric'
            note('fabric.mod.json unparseable: %s' % err)
    if 'pack.mcmeta' in nameset:
        obj, err, _ = load_json(src.read('pack.mcmeta'))
        pm = {}
        if isinstance(obj, dict):
            if 'filter' in obj:
                pm['filter'] = obj['filter']
            if 'overlays' in obj:
                pm['overlays'] = True
            pk = obj.get('pack')
            if isinstance(pk, dict):
                pm['pack_format'] = pk.get('pack_format')
        else:
            pm['error'] = err
        u['pack_mcmeta'] = pm

    other = u['other_rl']
    other_files = u['other_files']

    def add_other(name, raw):
        found = RXB_JSON_RL.findall(raw)
        if not found:
            return
        fi = None
        for s in set(found):
            if s[:1] == b'#':
                continue
            if fi is None:
                fi = len(other_files)
                other_files.append(name)
            k = s.decode()
            e = other.get(k)
            if e is None:
                other[k] = [1, fi]
            else:
                e[0] += 1
                if len(e) < 4:
                    e.append(fi)

    def std(rec, raw, obj, err, lenient):
        rec['sha1'] = sha1(raw)
        if isinstance(obj, dict) and 'forge:conditions' in obj:
            cs = json.dumps(obj['forge:conditions'])
            rec['forge_conditions'] = obj['forge:conditions'] if len(cs) <= 800 else [{'type': 'truncated'}]
        if obj is None:
            rec['error'] = err
        elif lenient == 'comments':
            rec['lenient_only'] = True
            rec['error'] = err
        return rec

    for name in names:
        if name.endswith('/'):
            continue
        if name.startswith('data/'):
            parts = name.split('/')
            if len(parts) < 4:
                continue
            ns, cat = parts[1], parts[2]
            if cat == 'recipes':
                continue
            rest = parts[3:]
            is_json = name.endswith('.json')
            try:
                if cat == 'loot_tables':
                    if not is_json:
                        continue
                    path = '/'.join(rest)[:-5]
                    if not (RX_NS.match(ns) and RX_PATH.match(path)):
                        counts['invalid_resource_path'] += 1
                        note('invalid resource path (not loaded by MC): ' + name)
                        continue
                    raw = src.read(name)
                    obj, err, lenient = load_json(raw)
                    rec = {'sha1': sha1(raw), 'valid': obj is not None}
                    if obj is None:
                        rec['error'] = err
                    else:
                        try:
                            rec.update(analyse_loot(obj))
                            rec['jsha1'] = sha1(json.dumps(obj, sort_keys=True, separators=(',', ':')).encode('utf-8'))
                        except Exception as e:
                            rec['valid'] = False
                            rec['error'] = 'structure: %s' % e
                        if lenient == 'comments':
                            rec['lenient_only'] = True
                            rec['error'] = err
                        elif lenient:
                            rec['raw_control_chars_in_strings'] = True
                    u['loot_tables'][ns + ':' + path] = rec
                elif cat == 'loot_table':
                    counts['loot_table_singular_dir(1.21 layout, not loaded)'] += 1
                elif cat == 'structure':
                    counts['structure_singular_dir(1.21 layout, not loaded)'] += 1
                elif cat == 'structures':
                    if not name.endswith('.nbt'):
                        counts['structures_non_nbt_skipped'] += 1
                        note('non-.nbt file under structures/ skipped: ' + name)
                        continue
                    path = '/'.join(rest)[:-4]
                    if not (RX_NS.match(ns) and RX_PATH.match(path)):
                        counts['invalid_resource_path'] += 1
                        note('invalid resource path (not loaded by MC): ' + name)
                        continue
                    raw = src.read(name)
                    try:
                        rec = analyse_template(raw)
                    except Exception as e:
                        rec = {'error': '%s: %s' % (type(e).__name__, e), 'containers': [], 'entity_loot': [],
                               'data_markers': [], 'jigsaws': [], 'size': None}
                        note('template parse failed: %s (%s)' % (name, rec['error']))
                    rec['sha1'] = sha1(raw)
                    u['structures'][ns + ':' + path] = rec
                elif cat == 'tags':
                    if not is_json:
                        continue
                    if rest[0] == 'items' and len(rest) > 1:
                        key, path = 'item_tags', '/'.join(rest[1:])[:-5]
                    elif rest[0] == 'worldgen' and len(rest) > 2 and rest[1] == 'biome':
                        key, path = 'biome_tags', '/'.join(rest[2:])[:-5]
                    else:
                        continue
                    obj, err, lenient = load_json(src.read(name))
                    if obj is None:
                        note('tag unparseable: %s (%s)' % (name, err))
                        continue
                    u[key][ns + ':' + path] = parse_tag_file(obj)
                elif cat == 'advancements':
                    if not is_json:
                        continue
                    raw = src.read(name)
                    if b'"loot"' not in raw:
                        continue
                    obj, err, _ = load_json(raw)
                    if isinstance(obj, dict) and isinstance(obj.get('rewards'), dict):
                        lt = [nid(x) for x in as_list(obj['rewards'].get('loot')) if isinstance(x, str)]
                        if lt:
                            u['adv_loot'][ns + ':' + '/'.join(rest)[:-5]] = lt
                elif cat == 'functions':
                    if not name.endswith('.mcfunction'):
                        continue
                    raw = src.read(name)
                    if b'loot' not in raw and b'LootTable' not in raw:
                        continue
                    text = raw.decode('utf-8', 'replace')
                    found = set(_RX_FN_LOOT.findall(text)) | set(_RX_FN_NBT.findall(text))
                    found = sorted(nid(x) for x in found if x)
                    if found:
                        u['fn_loot'][ns + ':' + '/'.join(rest)[:-11]] = found
                elif not is_json:
                    continue
                elif cat == 'worldgen' and len(rest) > 1:
                    sub = rest[0]
                    rid = ns + ':' + '/'.join(rest[1:])[:-5]
                    raw = src.read(name)
                    add_other(name, raw)
                    if sub == 'template_pool':
                        obj, err, lenient = load_json(raw)
                        rec = std({}, raw, obj, err, lenient)
                        if obj is not None:
                            try:
                                rec.update(analyse_pool(obj))
                            except Exception as e:
                                rec['error'] = 'structure: %s' % e
                        u['pools'][rid] = rec
                    elif sub == 'processor_list':
                        obj, err, lenient = load_json(raw)
                        rec = std({}, raw, obj, err, lenient)
                        rec['loot'] = proc_loot(obj) if obj is not None else []
                        rec['strings'] = sorted(rl_strings(raw))
                        u['processor_lists'][rid] = rec
                    elif sub == 'structure':
                        obj, err, lenient = load_json(raw)
                        rec = std({}, raw, obj, err, lenient)
                        if isinstance(obj, dict):
                            rec['type'] = nid(obj.get('type'))
                            sp = obj.get('start_pool')
                            if isinstance(sp, str):
                                rec['start_pool'] = nid(sp)
                            elif isinstance(sp, dict):
                                try:
                                    rec['inline_pool'] = analyse_pool(sp)
                                except Exception:
                                    pass
                            if isinstance(obj.get('size'), int):
                                rec['size'] = obj['size']
                            if 'biomes' in obj:
                                rec['biomes'] = norm_ref_list(obj.get('biomes'))
                            if isinstance(obj.get('step'), str):
                                rec['step'] = obj['step']
                            # Integrated API mod gates (comma-separated mod ids, split without trimming)
                            gate = {}
                            for k in ('required_mods', 'illegal_mods', 'change_pool_mods'):
                                if isinstance(obj.get(k), str) and obj[k]:
                                    gate[k] = obj[k].split(',')
                            if isinstance(obj.get('new_pool'), str):
                                gate['new_pool'] = nid(obj['new_pool'])
                            if gate:
                                rec['mod_gate'] = gate
                            pl = proc_loot(obj)
                            if pl:
                                rec['loot'] = pl
                        rec['strings'] = sorted(rl_strings(raw))
                        u['wg_structures'][rid] = rec
                    elif sub == 'structure_set':
                        obj, err, lenient = load_json(raw)
                        rec = std({}, raw, obj, err, lenient)
                        if isinstance(obj, dict):
                            sts = []
                            for e in as_list(obj.get('structures')):
                                if isinstance(e, dict) and isinstance(e.get('structure'), str):
                                    sts.append([nid(e['structure']), e.get('weight')])
                                elif isinstance(e, str):
                                    sts.append([nid(e), None])
                            rec['structures'] = sts
                            pl = obj.get('placement')
                            if isinstance(pl, dict):
                                rec['placement'] = {k: pl[k] for k in (
                                    'type', 'spacing', 'separation', 'frequency', 'frequency_reduction_method',
                                    'salt', 'distance', 'spread', 'count', 'preferred_biomes') if k in pl
                                    and not isinstance(pl[k], (dict, list))}
                                if 'exclusion_zone' in pl:
                                    rec['placement']['exclusion_zone'] = pl['exclusion_zone']
                        u['structure_sets'][rid] = rec
                    elif sub == 'biome':
                        obj, err, lenient = load_json(raw)
                        feats = set()
                        if isinstance(obj, dict):
                            for step in as_list(obj.get('features')):
                                for f in as_list(step):
                                    if isinstance(f, str):
                                        feats.add(('#' + nid(f[1:])) if f.startswith('#') else nid(f))
                        u['biomes'][rid] = sorted(feats)
                    elif sub == 'configured_feature':
                        obj, err, lenient = load_json(raw)
                        rec = {'type': None, 'strings': sorted(rl_strings(raw))}
                        if isinstance(obj, dict):
                            rec['type'] = nid(obj.get('type'))
                            refs = set()
                            blockish = set()
                            otherv = set()

                            def fwalk(v, depth, key):
                                if depth > 30:
                                    return
                                if isinstance(v, dict):
                                    for k, x in v.items():
                                        if k in ('feature', 'features', 'default'):
                                            for s in as_list(x):
                                                if isinstance(s, str):
                                                    refs.add(nid(s))
                                        if isinstance(x, (dict, list)):
                                            fwalk(x, depth + 1, k)
                                        elif isinstance(x, str) and x:
                                            (blockish if k in _BLOCK_KEYS else otherv).add(nid(x))
                                elif isinstance(v, list):
                                    for x in v:
                                        if isinstance(x, (dict, list)):
                                            fwalk(x, depth + 1, key)
                                        elif isinstance(x, str) and x:
                                            (blockish if key in _BLOCK_KEYS else otherv).add(nid(x))

                            fwalk(obj, 0, None)
                            if refs:
                                rec['pf_refs'] = sorted(refs)
                            # strings that only ever appear as a block / fluid name cannot be template ids
                            rec['strings'] = sorted(x for x in rec['strings'] if x in otherv or x not in blockish)
                        u['cfeatures'][rid] = rec
                    elif sub == 'placed_feature':
                        obj, err, lenient = load_json(raw)
                        rec = {'feature': None, 'strings': sorted(rl_strings(raw))}
                        if isinstance(obj, dict) and isinstance(obj.get('feature'), str):
                            rec['feature'] = nid(obj['feature'])
                        u['pfeatures'][rid] = rec
                    elif sub == 'world_preset':
                        obj, err, lenient = load_json(raw)
                        if isinstance(obj, dict) and isinstance(obj.get('dimensions'), dict):
                            u['world_presets'][rid] = {nid(k): analyse_dimension(v)
                                                       for k, v in obj['dimensions'].items()}
                elif cat == 'dimension':
                    rid = ns + ':' + '/'.join(rest)[:-5]
                    raw = src.read(name)
                    add_other(name, raw)
                    obj, err, lenient = load_json(raw)
                    rec = analyse_dimension(obj)
                    rec['sha1'] = sha1(raw)
                    rec['strings'] = sorted(rl_strings(raw, keep_tags=True))
                    u['dimensions'][rid] = rec
                elif cat == 'forge' and rest[0] == 'biome_modifier' and len(rest) > 1:
                    rid = ns + ':' + '/'.join(rest[1:])[:-5]
                    raw = src.read(name)
                    add_other(name, raw)
                    obj, err, lenient = load_json(raw)
                    if isinstance(obj, dict) and 'features' in obj:
                        u['biome_mods'][rid] = {'type': nid(obj.get('type'), 'forge'),
                                                'biomes': norm_ref_list(obj.get('biomes')),
                                                'features': norm_ref_list(obj.get('features'))}
                elif cat == 'lithostitched' and rest[0] == 'worldgen_modifier' and len(rest) > 1:
                    rid = ns + ':' + '/'.join(rest[1:])[:-5]
                    raw = src.read(name)
                    add_other(name, raw)
                    obj, err, lenient = load_json(raw)
                    if isinstance(obj, dict):
                        t = nid(obj.get('type'), 'lithostitched')
                        rec = {'type': t}
                        if 'predicate' in obj:
                            rec['predicate'] = obj['predicate']
                        if t and t.endswith('add_template_pool_elements'):
                            els, feats, procs, inline, et = analyse_pool_elements(obj.get('elements'))
                            rec['pools'] = norm_ref_list(obj.get('template_pools'))
                            rec['elements'] = sorted(els)
                            rec['features'] = sorted(feats)
                            if procs:
                                rec['procs'] = {k: sorted(v) for k, v in procs.items()}
                            if inline:
                                rec['inline_loot'] = inline
                        elif t and t.endswith('add_structure_set_entries'):
                            rec['sets'] = norm_ref_list(obj.get('structure_sets') or obj.get('structure_set'))
                            rec['entries'] = [[nid(e.get('structure')), e.get('weight')]
                                              for e in as_list(obj.get('entries'))
                                              if isinstance(e, dict) and isinstance(e.get('structure'), str)]
                        u['litho'][rid] = rec
                elif cat == 'pool_additions':
                    rid = ns + ':' + '/'.join(rest)[:-5]
                    raw = src.read(name)
                    add_other(name, raw)
                    obj, err, lenient = load_json(raw)
                    if isinstance(obj, dict):
                        els, feats, procs, inline, et = analyse_pool_elements(obj.get('elements'))
                        rec = {'target': nid(obj['name']) if isinstance(obj.get('name'), str) else rid,
                               'elements': sorted(els), 'features': sorted(feats)}
                        conds = sorted(set(str(e.get('condition')) for e in as_list(obj.get('elements'))
                                           if isinstance(e, dict) and e.get('condition')))
                        if conds:
                            rec['conditions'] = conds
                        if procs:
                            rec['procs'] = {k: sorted(v) for k, v in procs.items()}
                        if inline:
                            rec['inline_loot'] = inline
                        u['rs_pool_additions'][rid] = rec
                elif cat == 'rs_pool_additions':
                    counts['rs_pool_additions_dir(legacy name, not read by Repurposed Structures 7.x)'] += 1
                    add_other(name, src.read(name))
                elif cat == 'loot_modifiers':
                    raw = src.read(name)
                    add_other(name, raw)
                    obj, err, lenient = load_json(raw)
                    path = '/'.join(rest)[:-5]
                    if ns == 'forge' and path == 'global_loot_modifiers':
                        if isinstance(obj, dict):
                            u['glm_list'] = {'replace': bool(obj.get('replace')),
                                             'entries': [nid(x) for x in as_list(obj.get('entries'))
                                                         if isinstance(x, str)]}
                    else:
                        rec = {'sha1': sha1(raw)}
                        if isinstance(obj, dict):
                            rec['type'] = nid(obj.get('type'))
                            tabs, ctypes, tkeys = set(), set(), set()

                            def gwalk(v, depth):
                                if depth > 30:
                                    return
                                if isinstance(v, dict):
                                    for k, x in v.items():
                                        if k == 'loot_table_id' and isinstance(x, str):
                                            tabs.add(nid(x))
                                        elif 'table' in k.lower() and isinstance(x, str) and RX_RL.match(nid(x) or ''):
                                            tkeys.add(nid(x))
                                        elif k == 'condition' and isinstance(x, str):
                                            ctypes.add(nid(x))
                                        elif isinstance(x, (dict, list)):
                                            gwalk(x, depth + 1)
                                elif isinstance(v, list):
                                    for x in v:
                                        if isinstance(x, (dict, list)):
                                            gwalk(x, depth + 1)

                            gwalk(obj, 0)
                            rec['loot_table_ids'] = sorted(tabs)
                            rec['condition_types'] = sorted(ctypes)
                            if tkeys:
                                rec['table_keys'] = sorted(tkeys)
                            if 'forge:conditions' in obj:
                                cs = json.dumps(obj['forge:conditions'])
                                rec['forge_conditions'] = obj['forge:conditions'] if len(cs) <= 800 else \
                                    [{'type': 'truncated'}]
                        else:
                            rec['error'] = err
                        rec['strings'] = sorted(rl_strings(raw))[:400]
                        u['glms'][ns + ':' + path] = rec
                else:
                    add_other(name, src.read(name))
            except Exception as e:
                counts['file_errors'] += 1
                note('error reading %s: %s: %s' % (name, type(e).__name__, e))
        elif name.startswith('assets/'):
            parts = name.split('/')
            if len(parts) == 4 and parts[2] == 'lang' and parts[3] == 'en_us.json':
                try:
                    obj, err, _ = load_json(src.read(name))
                except Exception as e:
                    obj, err = None, str(e)
                if not isinstance(obj, dict):
                    note('lang unparseable: %s (%s)' % (name, err))
                    continue
                ent, itm, blk = set(u['lang_entity']), set(u['lang_item']), set(u['lang_block'])
                for k in obj:
                    if not isinstance(k, str):
                        continue
                    kp = k.split('.')
                    if len(kp) != 3:
                        continue
                    if kp[0] == 'entity':
                        ent.add(kp[1] + ':' + kp[2])
                    elif kp[0] == 'item':
                        itm.add(kp[1] + ':' + kp[2])
                    elif kp[0] == 'block':
                        blk.add(kp[1] + ':' + kp[2])
                u['lang_entity'], u['lang_item'], u['lang_block'] = sorted(ent), sorted(itm), sorted(blk)
            elif len(parts) == 5 and parts[2] == 'models' and parts[3] == 'item' and name.endswith('.json'):
                u['item_models'].append(parts[1] + ':' + parts[4][:-5])
        elif '/data/' in name and '/loot_tables/' in name:
            counts['non_root_data_loot_tables(sub-pack folder, not scanned)'] += 1
        elif '/data/' in name and '/structures/' in name:
            counts['non_root_data_structures(sub-pack folder, not scanned)'] += 1
    u['counts'] = dict(counts)


def scan_unit_classes(u, src, fam_ns_b, fam_paths_b, fam_dims_b, fam_leaves_b):
    cls_names = []
    rl = {}
    leafs = {}
    paths = {}
    path_ns = {}
    cdims = {}
    prefixes = set()
    n_classes = 0
    dim_consts = {b'minecraft:overworld': 'minecraft:overworld', b'minecraft:the_nether': 'minecraft:the_nether',
                  b'minecraft:the_end': 'minecraft:the_end'}
    for d in fam_dims_b:
        dim_consts[d] = d.decode()
    fullmatch = RXB_CONST.fullmatch
    for name in src.names:
        if not name.endswith('.class'):
            continue
        n_classes += 1
        try:
            b = src.read(name)
        except Exception:
            continue
        strs = class_strings(b)
        if not strs:
            continue
        ci = None
        nshits = None
        strs = sorted(strs)
        for s in strs:
            ln = len(s)
            if ln < 2 or ln > 160:
                continue
            m = fullmatch(s)
            if m is None:
                if b'\x01' in s:
                    pm = RXB_RECIPE.match(s)
                    if pm:
                        prefixes.add(pm.group(1))
                continue
            if m.group(1):
                if s.find(b'://') >= 0 or RXB_ASSET_EXT.search(s):
                    continue
                target = rl
            else:
                if s[-1:] in (b'/', b'_') and ln >= 4:
                    prefixes.add(s)
                target = paths
                if s not in fam_paths_b:
                    if b'/' not in s:
                        if s not in fam_leaves_b:
                            continue
                        target = leafs
                    elif RXB_ASSET_EXT.search(s):
                        continue
            if ci is None:
                ci = len(cls_names)
                cls_names.append(name[:-6])
            k = s.decode('ascii')
            e = target.get(k)
            if e is None:
                target[k] = [1, ci]
            else:
                e[0] += 1
                if len(e) < 4:
                    e.append(ci)
            if target is paths:
                if nshits is None:
                    nshits = [x.decode('ascii') for x in strs if x in fam_ns_b]
                if nshits:
                    cur = path_ns.get(k)
                    if cur is None:
                        path_ns[k] = list(nshits)
                    else:
                        for x in nshits:
                            if x not in cur:
                                cur.append(x)
            elif target is rl and s[-1:] in (b'/', b'_'):
                prefixes.add(s)
        if ci is not None:
            dh = [dim for key, dim in SRG_DIM_FIELDS if key in b]
            for s in strs:
                d = dim_consts.get(s)
                if d and d not in dh:
                    dh.append(d)
            if dh:
                cdims[str(ci)] = dh
    u['class_n'] = n_classes
    u['class_names'] = cls_names
    u['class_rl'] = rl
    u['class_path'] = paths
    u['class_path_ns'] = path_ns
    u['class_leaf'] = leafs
    u['class_dims'] = cdims
    u['class_prefix'] = sorted(p.decode('ascii') for p in prefixes if len(p) <= 120)


def scan_family(task):
    """Scan one top-level archive (jar / zip), including nested jars.  Runs in a worker process."""
    t0 = time.time()
    path = task['path']
    st = os.stat(path)
    rec = {'v': SCANNER_VERSION, 'task_id': task['id'], 'kind': task['kind'],
           'key': [os.path.basename(path), st.st_size, int(st.st_mtime)], 'path': path, 'units': []}
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    rec['sha256'] = h.hexdigest()
    opened = []

    def collect(zf, uid, depth, sha):
        src = ZipSrc(zf)
        u = new_unit(uid)
        u['sha256'] = sha
        u['depth'] = depth
        opened.append((u, src))
        for n in src.names:
            if not n.endswith('.jar'):
                continue
            d, _, base = n.rpartition('/')
            if d in NESTED_DIRS and depth < 5:
                try:
                    b = zf.read(n)
                    sub = zipfile.ZipFile(io.BytesIO(b))
                except Exception as e:
                    u['notes'].append('nested jar unreadable: %s (%s)' % (n, e))
                    continue
                collect(sub, uid + '!' + base, depth + 1, hashlib.sha256(b).hexdigest())
            else:
                u['skipped_nested'].append(n)

    try:
        zf = zipfile.ZipFile(path)
    except Exception as e:
        rec['error'] = 'cannot open: %s' % e
        return rec
    collect(zf, task['id'], 0, rec['sha256'])
    for u, src in opened:
        try:
            scan_unit_data(u, src)
        except Exception as e:
            u['notes'].append('unit data scan crashed: %s: %s' % (type(e).__name__, e))
    fam_ns = set(['minecraft'])
    own_ns = set()
    fam_paths = set()
    fam_dims = set()
    for u, _ in opened:
        for m in u['mods']:
            own_ns.add(m['id'])
        for key in ('loot_tables', 'structures', 'pools'):
            for rid in u[key]:
                ns, _, p = rid.partition(':')
                own_ns.add(ns)
                fam_paths.add(p)
        for rid in u['dimensions']:
            fam_dims.add(rid)
    fam_ns |= own_ns
    fam_leaves = set()
    for pth in fam_paths:
        if '/' in pth and not pth.startswith('blocks/') and not pth.startswith('entities/'):
            leaf = pth.rpartition('/')[2]
            if len(leaf) >= 4 and leaf not in fam_paths:
                fam_leaves.add(leaf)
    for u, src in opened:
        u['fam_ns'] = sorted(own_ns)
        if task.get('classes'):
            try:
                scan_unit_classes(u, src, set(x.encode() for x in fam_ns), set(x.encode() for x in fam_paths),
                                  set(x.encode() for x in fam_dims), set(x.encode() for x in fam_leaves))
            except Exception as e:
                u['notes'].append('class scan crashed: %s: %s' % (type(e).__name__, e))
    rec['units'] = [u for u, _ in opened]
    rec['elapsed'] = round(time.time() - t0, 2)
    return rec


def cache_path(cache_dir, task):
    base = re.sub(r'[^A-Za-z0-9_.\-]+', '_', os.path.basename(task['path']))[:80]
    return os.path.join(cache_dir, 'jars', '%s.%s.json' % (base, sha1(task['path'].lower().encode('utf-8'))[:10]))


def cache_load(cache_dir, task):
    p = cache_path(cache_dir, task)
    try:
        st = os.stat(task['path'])
        with open(p, 'r', encoding='utf-8') as f:
            rec = json.load(f)
        if rec.get('v') == SCANNER_VERSION and rec.get('key') == [os.path.basename(task['path']), st.st_size,
                                                                 int(st.st_mtime)] \
                and rec.get('task_id') == task['id'] and bool(rec.get('classes')) == bool(task.get('classes')):
            return rec
    except (OSError, ValueError):
        pass
    return None


def scan_family_cached(task):
    try:
        rec = scan_family(task)
    except Exception as e:
        rec = {'v': SCANNER_VERSION, 'task_id': task['id'], 'kind': task['kind'], 'path': task['path'],
               'units': [], 'error': '%s: %s' % (type(e).__name__, e)}
    rec['classes'] = bool(task.get('classes'))
    cd = task.get('cache_dir')
    if cd and 'error' not in rec:
        p = cache_path(cd, task)
        try:
            os.makedirs(os.path.dirname(p), exist_ok=True)
            tmp = p + '.%d.tmp' % os.getpid()
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(rec, f, separators=(',', ':'))
            os.replace(tmp, p)
        except OSError:
            pass
    return rec


