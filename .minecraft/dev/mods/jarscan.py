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

SCANNER_VERSION = 11

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


def class_pool(b):
    """One walk over a class file's constant pool.
    -> (utf8 {index: offset of the entry}, CONSTANT_String indexes, CONSTANT_Class {index: name index},
        offset of the byte after the pool or None when the pool is cut short); None = not a class file."""
    if b[:4] != b'\xca\xfe\xba\xbe':
        return None
    n = (b[8] << 8) | b[9]
    off = 10
    i = 1
    utf = {}
    sidx = []
    cidx = {}
    size = _CP_SIZE
    end = None
    try:
        while i < n:
            t = b[off]
            if t == 1:
                utf[i] = off
                off += 3 + ((b[off + 1] << 8) | b[off + 2])
            elif t == 8:
                sidx.append((b[off + 1] << 8) | b[off + 2])
                off += 3
            elif t == 7:
                cidx[i] = (b[off + 1] << 8) | b[off + 2]
                off += 3
            elif t == 5 or t == 6:
                off += 9
                i += 1
            else:
                off += size[t]
            i += 1
        end = off
    except (IndexError, KeyError):
        pass
    return utf, sidx, cidx, end


def pool_utf(b, utf, idx):
    """Bytes of the CONSTANT_Utf8 entry `idx` (None when there is no such entry)."""
    o = utf.get(idx)
    if o is None:
        return None
    return b[o + 3:o + 3 + ((b[o + 1] << 8) | b[o + 2])]


def pool_strings(b, pool):
    out = set()
    utf = pool[0]
    for s in pool[1]:
        o = utf.get(s)
        if o is not None:
            out.add(b[o + 3:o + 3 + ((b[o + 1] << 8) | b[o + 2])])
    return out


def class_strings(b):
    """Set of the UTF8 payloads referenced by CONSTANT_String entries (i.e. string literals)."""
    pool = class_pool(b)
    if pool is None:
        return None
    return pool_strings(b, pool)


def _u2(b, o):
    return (b[o] << 8) | b[o + 1]


def _skip_members(b, off):
    """Skip a fields[] or methods[] table -> offset after it."""
    n = _u2(b, off)
    off += 2
    for _ in range(n):
        ac = _u2(b, off + 6)
        off += 8
        for _ in range(ac):
            off += 6 + _S_I(b, off + 2)[0]
    return off


def _read_element(b, p, utf, depth=0):
    """element_value of an annotation -> (value, offset).  Class descriptors and strings come back as str,
    arrays as lists, nested annotations as (type, {name: value}); constants and enums as None."""
    tag = b[p]
    p += 1
    if tag == 0x73:                                     # 's' string
        v = pool_utf(b, utf, _u2(b, p))
        return (v.decode('utf-8', 'replace') if v is not None else None), p + 2
    if tag == 0x63:                                     # 'c' class
        v = pool_utf(b, utf, _u2(b, p))
        return (v.decode('utf-8', 'replace') if v is not None else None), p + 2
    if tag == 0x65:                                     # 'e' enum
        return None, p + 4
    if tag == 0x40:                                     # '@' annotation
        if depth > 8:
            raise ValueError('annotation nesting')
        return _read_annotation(b, p, utf, depth + 1)
    if tag == 0x5b:                                     # '[' array
        n = _u2(b, p)
        p += 2
        out = []
        for _ in range(n):
            v, p = _read_element(b, p, utf, depth + 1)
            out.append(v)
        return out, p
    if tag in (0x42, 0x43, 0x44, 0x46, 0x49, 0x4a, 0x53, 0x5a):
        return None, p + 2
    raise ValueError('bad element_value tag %r' % tag)


def _read_annotation(b, p, utf, depth=0):
    t = pool_utf(b, utf, _u2(b, p))
    n = _u2(b, p + 2)
    p += 4
    vals = {}
    for _ in range(n):
        k = pool_utf(b, utf, _u2(b, p))
        v, p = _read_element(b, p + 2, utf, depth)
        vals[k.decode('utf-8', 'replace') if k is not None else '?'] = v
    return ((t.decode('utf-8', 'replace') if t is not None else '?'), vals), p


def class_annotations(b, pool):
    """Class-level annotations (runtime visible and invisible) -> [(type descriptor, {element: value})]."""
    utf, end = pool[0], pool[3]
    if end is None:
        return []
    out = []
    try:
        off = end + 6
        off += 2 + 2 * _u2(b, off)                      # interfaces
        off = _skip_members(b, off)                     # fields
        off = _skip_members(b, off)                     # methods
        ac = _u2(b, off)
        off += 2
        for _ in range(ac):
            name = pool_utf(b, utf, _u2(b, off))
            ln = _S_I(b, off + 2)[0]
            body = off + 6
            if name in (b'RuntimeInvisibleAnnotations', b'RuntimeVisibleAnnotations'):
                p = body + 2
                for _ in range(_u2(b, body)):
                    ann, p = _read_annotation(b, p, utf)
                    out.append(ann)
            off = body + ln
    except (IndexError, ValueError, struct.error):
        pass
    return out


def mixin_targets(b):
    """Target classes of a mixin class, read from its @Mixin annotation (value = classes, targets = names),
    as internal names (net/minecraft/...).  None = not a class file; [] = no @Mixin annotation found."""
    pool = class_pool(b)
    if pool is None:
        return None
    out = []
    for t, vals in class_annotations(b, pool):
        if t != 'Lorg/spongepowered/asm/mixin/Mixin;':
            continue
        for v in as_list(vals.get('value')):
            if isinstance(v, str):
                out.append(v[1:-1] if v.startswith('L') and v.endswith(';') else v)
        for v in as_list(vals.get('targets')):
            if isinstance(v, str):
                out.append(v.replace('.', '/'))
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
            'class_dims': {}, 'class_prefix': [], 'class_leaf': {}, 'fam_ns': [], 'inv': {}}


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


# --------------------------------------------------------------------------- inventory: class hints
#
# Everything from here to scan_unit_inventory fills u['inv'], which only dev/mods/inventory.py reads.

_CLIENT_PREFIX = (b'net/minecraft/client/', b'com/mojang/blaze3d/')
_MOD_ANN = b'Lnet/minecraftforge/fml/common/Mod;'
_ONLYIN_ANN = b'Lnet/minecraftforge/api/distmarker/OnlyIn;'
_CONFIG_TYPE = b'net/minecraftforge/fml/config/ModConfig$Type'
_DIST_GUARDS = frozenset((b'net/minecraftforge/fml/DistExecutor', b'net/minecraftforge/fml/loading/FMLEnvironment',
                          b'net/minecraftforge/api/distmarker/Dist'))
# a class that NAMES one of these (a CONSTANT_Class entry: it calls, extends, casts to or catches it)
_HINT_CLASSES = {}
for _label, _names in (
        ('boss_event', ('net/minecraft/server/level/ServerBossEvent', 'net/minecraft/world/BossEvent',
                        'net/minecraft/world/BossEvent$BossBarColor', 'net/minecraft/world/BossEvent$BossBarOverlay')),
        ('key_mapping', ('net/minecraft/client/KeyMapping', 'net/minecraftforge/client/event/RegisterKeyMappingsEvent',
                         'net/fabricmc/fabric/api/client/keybinding/v1/KeyBindingHelper')),
        ('config_spec', ('net/minecraftforge/common/ForgeConfigSpec', 'net/minecraftforge/common/ForgeConfigSpec$Builder')),
        ('game_rule_register', ('net/minecraft/world/level/GameRules$Category',)),
        ('loot_code', ('net/minecraftforge/event/LootTableLoadEvent', 'net/minecraftforge/common/loot/LootModifier',
                       'net/minecraftforge/common/loot/IGlobalLootModifier')),
        ('attr_create', ('net/minecraftforge/event/entity/EntityAttributeCreationEvent',)),
        ('attr_modify', ('net/minecraftforge/event/entity/EntityAttributeModificationEvent',)),
        ('attr_register', ('net/minecraft/world/entity/ai/attributes/RangedAttribute',)),
        ('spawn_hook', ('net/minecraftforge/event/entity/living/MobSpawnEvent$FinalizeSpawn',
                        'net/minecraftforge/event/entity/living/MobSpawnEvent$PositionCheck',
                        'net/minecraftforge/event/entity/living/MobSpawnEvent$SpawnPlacementCheck',
                        'net/minecraftforge/event/entity/living/MobSpawnEvent$AllowDespawn',
                        'net/minecraftforge/event/entity/living/MobSpawnEvent')),
        ('entity_join', ('net/minecraftforge/event/entity/EntityJoinLevelEvent',)),
        ('hurt_hook', ('net/minecraftforge/event/entity/living/LivingHurtEvent',
                       'net/minecraftforge/event/entity/living/LivingDamageEvent',
                       'net/minecraftforge/event/entity/living/LivingAttackEvent')),
        ('screen_init', ('net/minecraftforge/client/event/ScreenEvent$Init', 'net/minecraftforge/client/event/ScreenEvent$Init$Post',
                         'net/minecraftforge/client/event/ScreenEvent$Init$Pre')),
        ('trades', ('net/minecraftforge/event/village/VillagerTradesEvent',
                    'net/minecraftforge/event/village/WandererTradesEvent')),
        ('commands', ('net/minecraftforge/event/RegisterCommandsEvent',)),
        ('reload_listener', ('net/minecraftforge/event/AddReloadListenerEvent',)),
        ('server_tick', ('net/minecraftforge/event/TickEvent$ServerTickEvent', 'net/minecraftforge/event/TickEvent$LevelTickEvent',
                         'net/minecraftforge/event/TickEvent$PlayerTickEvent')),
        ('entity_type', ('net/minecraft/world/entity/EntityType$Builder',)),
        ('curio_item', ('top/theillusivec4/curios/api/type/capability/ICurioItem',)),
        ('fabric_client_entry', ('net/fabricmc/api/ClientModInitializer',)),
):
    for _n in _names:
        _HINT_CLASSES[_n.encode()] = _label
_HINT_NAMES = frozenset(_HINT_CLASSES)
_HINT_KEEP = 25                   # class names kept per hint
_HINT_KEEP_ALL = ('boss_event',)  # hints whose class list is kept longer (the roster audit maps them to entities)
# first ancestor outside the jar -> what kind of thing the class is (hint only: mods also extend each other)
_ITEM_ROOTS = ('ArmorItem', 'SwordItem', 'AxeItem', 'PickaxeItem', 'ShovelItem', 'HoeItem', 'DiggerItem', 'TieredItem',
               'BowItem', 'CrossbowItem', 'ProjectileWeaponItem', 'ShieldItem', 'TridentItem', 'ElytraItem', 'Item')


def new_class_hints():
    return {'client': 0, 'onlyin': 0, 'mcreator': 0, 'errors': 0, 'hints': {}, 'mod_classes': [],
            'config_types': set(), 'supers': {}, 'boss': [], 'bossrefs': {}}


def note_class_hints(acc, cname, b, pool):
    utf, cidx, end = pool[0], pool[2], pool[3]
    refs = set()
    for ni in cidx.values():
        o = utf.get(ni)
        if o is not None:
            refs.add(b[o + 3:o + 3 + ((b[o + 1] << 8) | b[o + 2])])
    client = False
    if b.find(b'net/minecraft/client/') >= 0 or b.find(b'com/mojang/blaze3d/') >= 0:
        for r in refs:
            if r.startswith(_CLIENT_PREFIX):
                client = True
                break
    if client:
        acc['client'] += 1
    if b.find(_ONLYIN_ANN) >= 0:
        acc['onlyin'] += 1
    if cname.startswith('net/mcreator/'):
        acc['mcreator'] += 1
    hit = refs & _HINT_NAMES
    if hit:
        for label in set(_HINT_CLASSES[r] for r in hit):
            e = acc['hints'].get(label)
            if e is None:
                e = acc['hints'][label] = [0, []]
            e[0] += 1
            if len(e[1]) < (400 if label in _HINT_KEEP_ALL else _HINT_KEEP):
                e[1].append(cname)
            if label == 'boss_event':
                acc['boss'].append(cname)
    if b.find(b'oss') >= 0:
        # classes of other packages with "boss" in the name: a jar's own ServerBossEvent subclass is found
        # below, and the entities that use it are boss-bar candidates too
        loc = [r.decode('utf-8', 'replace') for r in refs
               if (b'Boss' in r or b'boss' in r) and not r.startswith(b'net/minecraft/')]
        if loc:
            acc['bossrefs'][cname] = loc
    if _CONFIG_TYPE in refs:
        for o in utf.values():
            ln = (b[o + 1] << 8) | b[o + 2]
            if ln == 6:
                v = b[o + 3:o + 9]
                if v in (b'COMMON', b'CLIENT', b'SERVER'):
                    acc['config_types'].add(v.decode())
    if b.find(_MOD_ANN) >= 0:
        acc['mod_classes'].append({'c': cname, 'client': client, 'dist_guard': bool(refs & _DIST_GUARDS)})
    if end is not None and len(b) >= end + 6:
        sup = pool_utf(b, utf, cidx.get(_u2(b, end + 4)))
        if sup:
            acc['supers'][cname] = sup.decode('utf-8', 'replace')


def finish_class_hints(acc, n_classes):
    supers = acc['supers']

    def root(c):
        n = 0
        while c in supers and n < 60:
            c = supers[c]
            n += 1
        return c

    ent = Counter()
    itm = Counter()
    for c in supers:
        r = root(c)
        if r.startswith('net/minecraft/world/entity/') and not r.startswith('net/minecraft/world/entity/ai/'):
            ent[r[len('net/minecraft/world/entity/'):]] += 1
        elif r.startswith('net/minecraft/world/item/') and r.rpartition('/')[2] in _ITEM_ROOTS:
            itm[r.rpartition('/')[2]] += 1
    out = {'n': n_classes, 'client': acc['client'], 'onlyin': acc['onlyin']}
    if acc['mcreator']:
        out['mcreator'] = acc['mcreator']
    if acc['errors']:
        out['errors'] = acc['errors']
    if acc['hints']:
        out['hints'] = dict((k, [v[0], sorted(v[1])]) for k, v in sorted(acc['hints'].items()))
    if acc['mod_classes']:
        out['mod_classes'] = sorted(acc['mod_classes'], key=lambda m: m['c'])
    if acc['config_types']:
        out['config_types'] = sorted(acc['config_types'])
    if acc['boss']:
        # [class, first ancestor outside the jar, classes of the jar that extend it]: a boss bar set up in a
        # base class is inherited by every entity below it
        kids = defaultdict(list)
        for c, sup in supers.items():
            kids[sup].append(c)

        def below(c):
            found, todo = [], [c]
            while todo and len(found) < 120:
                for k in kids.get(todo.pop(), ()):
                    found.append(k)
                    todo.append(k)
            return sorted(found)

        rows = dict((c, [c, root(c), below(c)]) for c in acc['boss'])
        helpers = set(c for c in acc['boss'] if root(c) in ('net/minecraft/server/level/ServerBossEvent',
                                                           'net/minecraft/world/BossEvent'))
        for c, loc in acc['bossrefs'].items():
            if c not in rows:
                via = sorted(h for h in loc if h in helpers)
                if via:
                    rows[c] = [c, root(c), below(c), via[0]]
        out['boss'] = [rows[c] for c in sorted(rows)]
    if ent:
        out['entity_roots'] = dict(ent.most_common(40))
    if itm:
        out['item_roots'] = dict(itm.most_common())
    return out


# --------------------------------------------------------------------------- inventory: metadata and data

try:
    import tomllib
except ImportError:               # Python 3.10: the regex reader below is used for every mods.toml
    tomllib = None

# data/<ns>/<folder> names that only a 1.21+ game reads (1.20.1 uses the plural, or has no such registry)
DEAD_DIRS = frozenset(('loot_table', 'recipe', 'advancement', 'structure', 'function', 'predicate', 'item_modifier',
                       'painting_variant', 'enchantment', 'enchantment_provider', 'jukebox_song', 'wolf_variant',
                       'banner_pattern', 'trial_spawner', 'instrument', 'data_maps', 'neoforge'))
DEAD_TAG_DIRS = frozenset(('item', 'block', 'entity_type', 'fluid', 'game_event', 'function'))
DEAD_TWIN = {'loot_table': 'loot_tables', 'recipe': 'recipes', 'advancement': 'advancements',
             'structure': 'structures', 'function': 'functions', 'predicate': 'predicates',
             'item_modifier': 'item_modifiers', 'tags/item': 'tags/items', 'tags/block': 'tags/blocks',
             'tags/entity_type': 'tags/entity_types', 'tags/fluid': 'tags/fluids',
             'tags/game_event': 'tags/game_events', 'tags/function': 'tags/functions'}
_TAG_VALUES_FOR = ('entity_types', 'functions')      # registries whose tag members the inventory keeps
_MANIFEST_KEYS = ('MixinConfigs', 'MixinConnector', 'FMLModType', 'Automatic-Module-Name', 'Implementation-Version',
                  'Implementation-Title', 'FMLCorePluginContainsFMLMod', 'Fabric-Loom-Version')
_TOML_TOP = ('modLoader', 'loaderVersion', 'license', 'clientSideOnly', 'showAsResourcePack', 'showAsDataPack')
_RX_RECIPE_TYPE = re.compile(r'"type"\s*:\s*"([^"]+)"')


def read_manifest(raw):
    """Main section of a MANIFEST.MF, with continuation lines joined -> {key: value}."""
    out = {}
    key = None
    for line in raw.decode('utf-8', 'replace').replace('\r\n', '\n').replace('\r', '\n').split('\n'):
        if not line:
            if out:
                break
            continue
        if line[0] == ' ' and key is not None:
            out[key] += line[1:]
            continue
        k, sep, v = line.partition(':')
        if sep:
            key = k.strip()
            out[key] = v.strip()
    return out


def parse_mods_toml_full(text, manifest):
    """mods.toml -> {'parser', 'top', 'top_keys', 'mods', 'deps', 'mixins'} (identity, side hints, deps)."""
    out = {'parser': 'regex', 'top': {}, 'top_keys': [], 'mods': [], 'deps': [], 'mixins': []}
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    data = None
    if tomllib is not None:
        try:
            data = tomllib.loads(text)
            out['parser'] = 'toml'
        except Exception as e:      # Forge's reader accepts files a strict TOML parser refuses
            out['toml_error'] = str(e)[:160]

    def ver(v):
        v = None if v is None else str(v)
        if v and '${' in v:
            v = manifest.get('Implementation-Version') or v
        return v

    if isinstance(data, dict):
        out['top_keys'] = sorted(data)
        for k in _TOML_TOP:
            if isinstance(data.get(k), (str, bool, int, float)):
                out['top'][k] = data[k]
        for m in as_list(data.get('mods')):
            if isinstance(m, dict) and isinstance(m.get('modId'), str):
                e = {'id': m['modId'], 'version': ver(m.get('version'))}
                for k, k2 in (('displayName', 'name'), ('displayTest', 'displayTest')):
                    if isinstance(m.get(k), str):
                        e[k2] = m[k]
                out['mods'].append(e)
        deps = data.get('dependencies')
        if isinstance(deps, dict):
            for owner, lst in deps.items():
                for d in as_list(lst):
                    if isinstance(d, dict) and isinstance(d.get('modId'), str):
                        out['deps'].append({'of': owner, 'id': d['modId'], 'mandatory': d.get('mandatory'),
                                            'range': d.get('versionRange'), 'ordering': d.get('ordering'),
                                            'side': d.get('side')})
        for m in as_list(data.get('mixins')):
            if isinstance(m, dict) and isinstance(m.get('config'), str):
                out['mixins'].append(m['config'])
        for k, v in data.items():
            if k.lower() == 'mixinconfigs':
                out['mixins'].extend(x for x in as_list(v) if isinstance(x, str))
        return out
    for k in _TOML_TOP:
        m = re.search(r'^[ \t]*%s[ \t]*=[ \t]*["\']?([^"\'\n#]+)' % k, text.split('[[', 1)[0], re.M)
        if m:
            v = m.group(1).strip()
            out['top'][k] = True if v == 'true' else (False if v == 'false' else v)
    secs = re.split(r'^[ \t]*\[\[\s*mods\s*\]\][ \t]*(?:#.*)?$', text, flags=re.M)
    for sec in secs[1:]:
        sec = re.split(r'^[ \t]*\[', sec, maxsplit=1, flags=re.M)[0]

        def g(k, sec=sec):
            mm = re.search(r'^[ \t]*%s[ \t]*=[ \t]*["\']([^"\']*)["\']' % k, sec, re.M)
            return mm.group(1) if mm else None

        if g('modId'):
            e = {'id': g('modId'), 'version': ver(g('version'))}
            if g('displayName'):
                e['name'] = g('displayName')
            if g('displayTest'):
                e['displayTest'] = g('displayTest')
            out['mods'].append(e)
    for owner, body in re.findall(r'\[\[\s*dependencies\.([^\]]+?)\s*\]\](.*?)(?=\n[ \t]*\[\[|\Z)', text, re.S):
        def g(k, body=body):
            mm = re.search(r'^[ \t]*%s[ \t]*=[ \t]*["\']?([^"\'\n#]+)' % k, body, re.M)
            return mm.group(1).strip() if mm else None

        if g('modId'):
            mand = g('mandatory')
            out['deps'].append({'of': owner.strip(), 'id': g('modId'),
                                'mandatory': True if mand == 'true' else (False if mand == 'false' else mand),
                                'range': g('versionRange'), 'ordering': g('ordering'), 'side': g('side')})
    for m in re.finditer(r'^[ \t]*mixinConfigs[ \t]*=[ \t]*\[([^\]]*)\]', text, re.M | re.I):
        out['mixins'].extend(re.findall(r'["\']([^"\']+)["\']', m.group(1)))
    for body in re.findall(r'\[\[\s*mixins\s*\]\](.*?)(?=\n[ \t]*\[|\Z)', text, re.S):
        m = re.search(r'^[ \t]*config[ \t]*=[ \t]*["\']([^"\']+)["\']', body, re.M)
        if m:
            out['mixins'].append(m.group(1))
    return out


def _tag_registry(rest):
    """['items', 'a', 'b.json'] -> ('items', 'a/b'); ['worldgen', 'biome', 'x.json'] -> ('worldgen/biome', 'x')"""
    if rest[0] == 'worldgen' and len(rest) > 2:
        return 'worldgen/' + rest[1], '/'.join(rest[2:])[:-5]
    return rest[0], '/'.join(rest[1:])[:-5]


def scan_unit_inventory(u, src):
    """Fill u['inv'] with what only the per-jar inventory reads.  Reads the archive a second time for the few
    file kinds scan_unit_data does not keep (recipes, most tags, mixin configs, language keys by prefix)."""
    inv = u.setdefault('inv', {})
    names = src.names
    nameset = set(names)
    inv_notes = inv['notes'] = []

    def note(msg):
        if len(inv_notes) < 40:
            inv_notes.append(msg)

    # ---- identity
    man = {}
    if 'META-INF/MANIFEST.MF' in nameset:
        try:
            man = read_manifest(src.read('META-INF/MANIFEST.MF'))
        except Exception as e:
            note('MANIFEST unreadable: %s' % e)
    inv['manifest'] = dict((k, man[k]) for k in _MANIFEST_KEYS if k in man)
    declared = {}                 # mixin config -> [where it is declared]

    def declare(cfg, where, env=None):
        cfg = cfg.strip()
        if not cfg:
            return
        e = declared.setdefault(cfg, {'decl': []})
        if where not in e['decl']:
            e['decl'].append(where)
        if env:
            e['env'] = env

    for cfg in (man.get('MixinConfigs') or '').split(','):
        declare(cfg, 'manifest')
    if 'META-INF/mods.toml' in nameset:
        try:
            t = parse_mods_toml_full(src.read('META-INF/mods.toml').decode('utf-8-sig', 'replace'), man)
            for cfg in t.pop('mixins'):
                declare(cfg, 'mods.toml')
            inv['forge'] = t
        except Exception as e:
            note('mods.toml unreadable: %s: %s' % (type(e).__name__, e))
    for meta in ('fabric.mod.json', 'quilt.mod.json'):
        if meta not in nameset:
            continue
        obj, err, _ = load_json(src.read(meta))
        if not isinstance(obj, dict):
            note('%s unparseable: %s' % (meta, err))
            continue
        if meta == 'quilt.mod.json':
            inv['quilt'] = True
            continue
        f = {'id': obj.get('id'), 'version': str(obj.get('version')), 'environment': obj.get('environment', '*')}
        if isinstance(obj.get('name'), str):
            f['name'] = obj['name']
        for k in ('depends', 'recommends', 'suggests', 'breaks', 'conflicts'):
            if isinstance(obj.get(k), dict) and obj[k]:
                f[k] = dict((str(a), (b if isinstance(b, str) else json.dumps(b))) for a, b in sorted(obj[k].items()))
        if isinstance(obj.get('entrypoints'), dict):
            f['entrypoints'] = dict((str(k), len(as_list(v))) for k, v in sorted(obj['entrypoints'].items()))
        if isinstance(obj.get('accessWidener'), str):
            f['accessWidener'] = obj['accessWidener']
        if isinstance(obj.get('provides'), list):
            f['provides'] = [x for x in obj['provides'] if isinstance(x, str)]
        if isinstance(obj.get('jars'), list):
            f['jars'] = [x.get('file') for x in obj['jars'] if isinstance(x, dict) and isinstance(x.get('file'), str)]
        for m in as_list(obj.get('mixins')):
            if isinstance(m, str):
                declare(m, 'fabric.mod.json')
            elif isinstance(m, dict) and isinstance(m.get('config'), str):
                declare(m['config'], 'fabric.mod.json', m.get('environment'))
        inv['fabric'] = f
    svc = sorted(n[len('META-INF/services/'):] for n in names if n.startswith('META-INF/services/') and not n.endswith('/'))
    if svc:
        inv['services'] = svc
    if 'META-INF/coremods.json' in nameset:
        obj, err, _ = load_json(src.read('META-INF/coremods.json'))
        inv['coremods'] = sorted(str(v) for v in obj.values()) if isinstance(obj, dict) else ['?']
    if 'META-INF/jarjar/metadata.json' in nameset:
        obj, err, _ = load_json(src.read('META-INF/jarjar/metadata.json'))
        jj = []
        for e in as_list(obj.get('jars') if isinstance(obj, dict) else None):
            if not isinstance(e, dict):
                continue
            ident = e.get('identifier') or {}
            vers = e.get('version') or {}
            jj.append({'path': e.get('path'), 'group': ident.get('group'), 'artifact': ident.get('artifact'),
                       'version': vers.get('artifactVersion'), 'range': vers.get('range')})
        inv['jarjar'] = jj

    # ---- access transformer / access widener
    for at_name, key in (('META-INF/accesstransformer.cfg', 'at'), ((inv.get('fabric') or {}).get('accessWidener'), 'aw')):
        if not at_name or at_name not in nameset:
            continue
        try:
            text = src.read(at_name).decode('utf-8', 'replace')
        except Exception as e:
            note('%s unreadable: %s' % (at_name, e))
            continue
        n = 0
        classes = set()
        for line in text.splitlines():
            line = line.split('#', 1)[0].strip()
            if not line or line.startswith('accessWidener'):
                continue
            parts = line.split()
            if len(parts) < 2:
                continue
            n += 1
            classes.add((parts[1] if key == 'at' else parts[2] if len(parts) > 2 else parts[1]).replace('/', '.'))
        cl = sorted(c for c in classes if c.startswith('net.minecraft.client.') or c.startswith('com.mojang.blaze3d.'))
        inv[key] = {'file': at_name, 'lines': n, 'classes': sorted(classes)[:300], 'n_classes': len(classes),
                    'client_classes': len(cl)}

    # ---- mixin configs
    for n in names:
        if '/' not in n and n.endswith('.json') and 'mixin' in n.lower() and n not in declared:
            declared[n] = {'decl': []}
    mixins = []
    for cfg in sorted(declared):
        e = {'cfg': cfg, 'decl': declared[cfg]['decl']}
        if declared[cfg].get('env'):
            e['env'] = declared[cfg]['env']
        if cfg not in nameset:
            e['absent'] = True
            mixins.append(e)
            continue
        obj, err, _ = load_json(src.read(cfg))
        if not isinstance(obj, dict):
            e['error'] = err or 'not an object'
            mixins.append(e)
            continue
        if 'package' not in obj and not any(k in obj for k in ('mixins', 'client', 'server')):
            if not e['decl']:
                continue          # a refmap or some other json that only has "mixin" in its name
            e['empty'] = True     # a declared config with no mixins of its own (mixinextras.init ...)
            mixins.append(e)
            continue
        pkg = obj.get('package') if isinstance(obj.get('package'), str) else ''
        e['pkg'] = pkg
        for k in ('required', 'plugin', 'refmap', 'minVersion', 'compatibilityLevel'):
            if isinstance(obj.get(k), (str, bool, int, float)):
                e[k] = obj[k]
        if e.get('refmap') and e['refmap'] not in nameset:
            e['refmap_missing'] = True
        targets = {}
        missing = []
        for side, key in (('common', 'mixins'), ('client', 'client'), ('server', 'server')):
            lst = [x for x in as_list(obj.get(key)) if isinstance(x, str)]
            e[side] = lst
            for mname in lst:
                cn = ((pkg + '.' if pkg else '') + mname).replace('.', '/') + '.class'
                if cn not in nameset:
                    missing.append(mname)
                    continue
                try:
                    tg = mixin_targets(src.read(cn))
                except Exception:
                    tg = None
                if tg:
                    targets[mname] = sorted(set(tg))
        e['targets'] = targets
        if missing:
            e['missing'] = missing
        mixins.append(e)
    if mixins:
        inv['mixins'] = mixins

    # ---- data/
    ns_cat = defaultdict(Counter)
    recipes = {'n': 0, 'types': Counter(), 'ids': defaultdict(list), 'cond': 0, 'bad': 0}
    adv = defaultdict(list)
    functions = []
    fn_tags = {}
    tags = defaultdict(dict)
    tag_values = defaultdict(dict)
    damage_types = []
    dim_types = []
    biome_mods = {}
    dead = Counter()
    dead_sample = {}
    assets_ns = Counter()
    cfg_like = []
    top = Counter()
    lang = {'n': 0, 'prefix': Counter(), 'key': {}, 'gamerule': [], 'attribute': [], 'enchantment': [],
            'effect': [], 'files': 0}
    for name in names:
        if name.endswith('/'):
            continue
        head, _, tail = name.partition('/')
        top[head if tail else '<root>'] += 1
        if head == 'data':
            parts = name.split('/')
            if len(parts) < 4:
                continue
            ns, cat = parts[1], parts[2]
            rest = parts[3:]
            catkey = cat
            if cat in ('worldgen', 'forge') and len(rest) > 1:
                catkey = cat + '/' + rest[0]
            elif cat == 'tags' and len(rest) > 1:
                catkey = 'tags/' + _tag_registry(rest)[0]
            ns_cat[ns][catkey] += 1
            try:
                if cat in DEAD_DIRS or (cat == 'tags' and len(rest) > 1 and rest[0] in DEAD_TAG_DIRS):
                    dk = cat if cat != 'tags' else 'tags/' + rest[0]
                    dead[dk] += 1
                    dead_sample.setdefault(dk, name)
                    if dk == 'tags/entity_type' and name.endswith('.json'):
                        # not loaded by 1.20.1, but it is the author's own list (c:bosses ...)
                        obj, err, _ = load_json(src.read(name))
                        if obj is not None:
                            tag_values['entity_type (1.21 folder, not loaded)'][ns + ':' + '/'.join(rest[1:])[:-5]] =                                 [v for v, _ in parse_tag_file(obj).get('v', [])]
                elif cat == 'recipes':
                    if not name.endswith('.json'):
                        continue
                    raw = src.read(name)
                    recipes['n'] += 1
                    recipes['ids'][ns].append('/'.join(rest)[:-5])
                    obj, err, _ = load_json(raw)
                    if isinstance(obj, dict):
                        t = obj.get('type')
                        recipes['types'][nid(t) if isinstance(t, str) and t else '<no type>'] += 1
                        if any(k in obj for k in _COND_KEYS):
                            recipes['cond'] += 1
                    else:
                        recipes['bad'] += 1
                        m = _RX_RECIPE_TYPE.search(raw.decode('utf-8', 'replace'))
                        recipes['types'][(nid(m.group(1)) if m else '<unparseable>')] += 1
                elif cat == 'advancements':
                    if name.endswith('.json'):
                        adv[ns].append('/'.join(rest)[:-5])
                elif cat == 'functions':
                    if name.endswith('.mcfunction'):
                        functions.append(ns + ':' + '/'.join(rest)[:-11])
                elif cat == 'tags':
                    if not name.endswith('.json') or len(rest) < 2:
                        continue
                    reg, path = _tag_registry(rest)
                    tid = ns + ':' + path
                    if reg == 'items' and tid in u['item_tags']:
                        f = u['item_tags'][tid]
                    elif reg == 'worldgen/biome' and tid in u['biome_tags']:
                        f = u['biome_tags'][tid]
                    else:
                        obj, err, _ = load_json(src.read(name))
                        if obj is None:
                            continue
                        f = parse_tag_file(obj)
                    tags[reg][tid] = [1 if f.get('r') else 0, len(f.get('v', []))]
                    if reg in _TAG_VALUES_FOR:
                        tag_values[reg][tid] = [v for v, _ in f.get('v', [])]
                    if reg == 'functions' and ns == 'minecraft' and path in ('tick', 'load'):
                        fn_tags[path] = {'r': bool(f.get('r')), 'v': [v for v, _ in f.get('v', [])]}
                elif cat == 'damage_type':
                    if name.endswith('.json'):
                        damage_types.append(ns + ':' + '/'.join(rest)[:-5])
                elif cat == 'dimension_type':
                    if name.endswith('.json'):
                        dim_types.append(ns + ':' + '/'.join(rest)[:-5])
                elif cat == 'forge' and rest[0] == 'biome_modifier' and len(rest) > 1 and name.endswith('.json'):
                    obj, err, _ = load_json(src.read(name))
                    if not isinstance(obj, dict):
                        continue
                    rec = {'t': nid(obj.get('type'), 'forge')}
                    b = [x for x in norm_ref_list(obj.get('biomes')) if isinstance(x, str)]
                    if b:
                        rec['b'] = b[:8]
                    sp = []
                    for s in as_list(obj.get('spawners')):
                        if isinstance(s, dict) and isinstance(s.get('type'), str):
                            sp.append([nid(s['type']), s.get('weight'), s.get('minCount'), s.get('maxCount')])
                    if sp:
                        rec['sp'] = sp
                    rm = [x for x in norm_ref_list(obj.get('entity_types')) if isinstance(x, str)]
                    if rm:
                        rec['rm'] = rm
                    if 'features' in obj:
                        rec['f'] = len(as_list(obj.get('features')))
                        if isinstance(obj.get('step'), str):
                            rec['step'] = obj['step']
                    biome_mods[ns + ':' + '/'.join(rest[1:])[:-5]] = rec
            except Exception as e:
                note('error reading %s: %s: %s' % (name, type(e).__name__, e))
        elif head == 'assets':
            parts = name.split('/')
            if len(parts) < 3:
                continue
            assets_ns[parts[1]] += 1
            if len(parts) == 4 and parts[2] == 'lang' and parts[3] == 'en_us.json':
                try:
                    obj, err, _ = load_json(src.read(name))
                except Exception:
                    obj = None
                if not isinstance(obj, dict):
                    continue
                lang['files'] += 1
                for k, v in obj.items():
                    if not isinstance(k, str):
                        continue
                    lang['n'] += 1
                    kp = k.split('.')
                    lang['prefix'][kp[0]] += 1
                    if kp[0] == 'key':
                        if len(lang['key']) < 400:
                            lang['key'][k] = v if isinstance(v, str) else None
                    elif kp[0] == 'gamerule':
                        if not k.endswith('.description') and len(lang['gamerule']) < 200:
                            lang['gamerule'].append(k)
                    elif kp[0] == 'attribute':
                        if len(lang['attribute']) < 200:
                            lang['attribute'].append(k)
                    elif kp[0] == 'enchantment' and len(kp) == 3:
                        lang['enchantment'].append(kp[1] + ':' + kp[2])
                    elif kp[0] == 'effect' and len(kp) == 3:
                        lang['effect'].append(kp[1] + ':' + kp[2])
        elif not name.endswith('.class'):
            low = name.lower()
            if (low.startswith(('defaultconfigs/', 'defaultconfig/', 'config/', 'configs/'))
                    or ('/' not in name and low.endswith(('.toml', '.json5', '.cfg')))):
                if len(cfg_like) < 30:
                    cfg_like.append(name)
    inv['top'] = dict(top.most_common(12))
    inv['ns'] = dict((ns, dict(c)) for ns, c in sorted(ns_cat.items()))
    if assets_ns:
        inv['assets_ns'] = dict(sorted(assets_ns.items()))
    if recipes['n']:
        inv['recipes'] = {'n': recipes['n'], 'types': dict(sorted(recipes['types'].items())),
                          'ids': dict((ns, sorted(v)) for ns, v in sorted(recipes['ids'].items())),
                          'cond': recipes['cond'], 'bad': recipes['bad']}
    if adv:
        inv['advancements'] = dict((ns, sorted(v)) for ns, v in sorted(adv.items()))
    if functions:
        inv['functions'] = sorted(functions)
    if fn_tags:
        inv['fn_tags'] = fn_tags
    if tags:
        inv['tags'] = dict((reg, dict(sorted(t.items()))) for reg, t in sorted(tags.items()))
    if tag_values:
        inv['tag_values'] = dict((reg, dict(sorted(t.items()))) for reg, t in sorted(tag_values.items()))
    if damage_types:
        inv['damage_types'] = sorted(damage_types)
    if dim_types:
        inv['dimension_types'] = sorted(dim_types)
    if biome_mods:
        inv['biome_modifiers'] = dict(sorted(biome_mods.items()))
    if dead:
        inv['dead_dirs'] = dict((k, [v, dead_sample[k]]) for k, v in sorted(dead.items()))
    if cfg_like:
        inv['config_files'] = cfg_like
    if lang['files']:
        inv['lang'] = {'n': lang['n'], 'prefix': dict(lang['prefix'].most_common(30)), 'key': lang['key'],
                       'gamerule': sorted(lang['gamerule']), 'attribute': sorted(lang['attribute']),
                       'enchantment': sorted(set(lang['enchantment'])), 'effect': sorted(set(lang['effect']))}


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
    hints = new_class_hints()
    for name in src.names:
        if not name.endswith('.class'):
            continue
        n_classes += 1
        try:
            b = src.read(name)
        except Exception:
            continue
        pool = class_pool(b)
        if pool is None:
            continue
        try:
            note_class_hints(hints, name[:-6], b, pool)
        except Exception:
            hints['errors'] += 1
        strs = pool_strings(b, pool)
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
    u.setdefault('inv', {})['code'] = finish_class_hints(hints, n_classes)


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
        try:
            scan_unit_inventory(u, src)
        except Exception as e:      # never into u['notes']: the loot audit prints those
            u['inv']['error'] = 'inventory scan crashed: %s: %s' % (type(e).__name__, e)
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


# --------------------------------------------------------------------------- task lists / running a scan

def find_vanilla_jar(libs):
    d = os.path.join(libs, 'com', 'mojang', 'minecraft', '1.20.1')
    if os.path.isdir(d):
        for f in sorted(os.listdir(d)):
            if f.endswith('-client.jar'):
                return os.path.join(d, f)
    for dp, dn, fn in os.walk(libs):
        for f in fn:
            if f.endswith('.jar') and 'minecraft' in f.lower():
                p = os.path.join(dp, f)
                try:
                    with zipfile.ZipFile(p) as zf:
                        zf.getinfo('data/minecraft/loot_tables/chests/simple_dungeon.json')
                    return p
                except Exception:
                    pass
    return None


def find_forge_jar(libs, repo):
    d = os.path.join(libs, 'net', 'minecraftforge', 'forge')
    if not os.path.isdir(d):
        return None
    want = None
    try:
        with open(os.path.join(repo, 'mmc-pack.json'), 'r', encoding='utf-8') as f:
            for c in json.load(f).get('components', []):
                if c.get('uid') == 'net.minecraftforge':
                    want = '1.20.1-' + str(c.get('version'))
    except (OSError, ValueError):
        pass
    cands = sorted(x for x in os.listdir(d) if x.startswith('1.20.1-'))
    if want in cands:
        cands = [want]
    for v in reversed(cands):
        p = os.path.join(d, v, 'forge-%s-universal.jar' % v)
        if os.path.isfile(p):
            return p
    return None


def file_sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def mod_tasks(mods_dir, repo):
    """One task per mod jar: every *.jar of the instance `mods_dir` plus every *.jar of <repo>/mods.  A jar
    whose file name also exists in <repo>/mods is read from the repo (the committed custom jars).
    -> (tasks, instance jar names)"""
    repo_mods = os.path.join(repo, 'mods')
    repo_jars = set(f for f in os.listdir(repo_mods) if f.endswith('.jar')) if os.path.isdir(repo_mods) else set()
    inst_jars = set(f for f in os.listdir(mods_dir) if f.endswith('.jar')) if os.path.isdir(mods_dir) else set()
    tasks = []
    for f in sorted(inst_jars | repo_jars):
        t = {'kind': 'mod', 'id': 'mod:' + f, 'classes': True, 'order': 2}
        if f in repo_jars:
            t['path'] = os.path.join(repo_mods, f)
            t['repo_copy'] = True
            t['instance_sha256'] = file_sha256(os.path.join(mods_dir, f)) if f in inst_jars else None
        else:
            t['path'] = os.path.join(mods_dir, f)
        tasks.append(t)
    return tasks, inst_jars


def scan_all(tasks, cache_dir, no_cache=False, jobs=0):
    """Scan every task, from the cache where it is still valid -> ({task id: record}, cache hits)."""
    import multiprocessing
    fams = {}
    todo = []
    hits = 0
    for t in tasks:
        rec = None if no_cache else cache_load(cache_dir, t)
        if rec is not None:
            fams[t['id']] = rec
            hits += 1
        else:
            t2 = dict(t)
            t2['cache_dir'] = cache_dir
            todo.append(t2)
    todo.sort(key=lambda t: -os.path.getsize(t['path']))
    jobs = jobs or max(1, min(16, (os.cpu_count() or 4) - 2))
    if todo:
        if jobs > 1 and len(todo) > 2:
            with multiprocessing.Pool(min(jobs, len(todo))) as pool:
                for rec in pool.imap_unordered(scan_family_cached, todo, chunksize=1):
                    fams[rec['task_id']] = rec
        else:
            for t in todo:
                rec = scan_family_cached(t)
                fams[rec['task_id']] = rec
    return fams, hits
