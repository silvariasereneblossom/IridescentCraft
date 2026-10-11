#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""truth.py -- ground-truth scanner for the IridescentCraft loot audit.

Reads (never executes) the vanilla 1.20.1 jar, the Forge universal jar, every installed mod jar (incl.
jar-in-jar under META-INF/jarjar and META-INF/jars), the Paxi datapack zips and kubejs/data, and writes one
JSON describing which loot tables / structure templates / worldgen wiring actually ship, who wins each
override, and where every loot table can be rolled from.

    python -I truth.py [--mods DIR] [--repo REPO] [--out FILE] [--no-cache]
                       [--vanilla JAR] [--forge JAR] [--libraries DIR] [--jobs N] [--pretty]

Stdlib only.  Per-archive results are cached under <repo>/dev/loot_audit/.cache/jars, keyed by
(filename, size, mtime, SCANNER_VERSION); --no-cache ignores the existing entries and rewrites them.
Default output: <repo>/dev/loot_audit/.cache/truth.json.

Pack priority (low -> high, "last wins"):
    vanilla(0) < forge universal jar(1) < every mod jar(2, NO relative order between mods)
    < paxi zips (3.., UNLISTED zips first, then datapack_load_order.json order) < kubejs_data
Paxi 4.0 (PaxiRepositorySource.loadPacksFromFiles + MixinPackRepositoryForge.rebuildSelected, decompiled
2026-10-11): the zips named in loadOrder are pulled out of the enabled list and re-appended on top, in
that order; a zip the file does not name stays below every listed one.
A jar whose filename also exists in <repo>/mods is read from the repo (pack.repo_copy = true).

Top-level keys of the output
    meta, stats, notes            run info, headline counts, everything skipped / assumed
    packs                         [{id, kind, order, path, sha256, loads_data, repo_copy?, modids?, counts}]
    mods                          {modid: {jar, version, loader}}
    loot_tables                   {id: {type, sources[{pack, sha1}], winner, valid, error, items, tags,
                                   table_refs, empty, forge_conditions, + optional: lenient_only,
                                   raw_control_chars_in_strings, condition_key, conditions, other_entry_types,
                                   other_entry_items, set_loot_table, multi_mod, mod_content_differs, winner_note}}
    structures                    {template id: {pack, size, containers[{block, loot_table, fixed_items, pos,
                                   loot_table_seed?, be_id?}], entity_loot[], data_markers[], jigsaws[{pool,
                                   name, target, n}]}}      loot_table: null = no LootTable tag, "" = empty string
    template_pools                {id: {pack, fallback, elements, features, added_elements?, added_by?,
                                   missing_templates?, reached_by?}}
    processor_loot                [{processor_list | inline_in, loot_table, processor_type, templates, ...}]
    worldgen_structures           {id: {pack, type, start_pool, size, biomes_raw, biomes, dimensions,
                                   in_structure_sets, step, referenced_templates, referenced_pools, ...}}
    structure_sets                {id: {pack, structures[{structure, weight, added_by?}], placement}}
    dimensions                    {dimension id: {pack, dimension_type, generator, biome_source, biomes}}
    biome_tags / biome_tags_missing
    biome_dimensions              {biome: [dimension ids]}; evidence per mapping in biome_dimension_evidence;
                                  biomes that cannot be placed are listed in biome_dimensions_unknown
    template_reach                {template id: {reachable, confidence, dimensions, via[{kind, detail, ...}],
                                   dim_hints?, unplaced_structures?}}
    table_roots                   {table id: {exists, rolled_by[{kind, detail, ...}], only_nested?,
                                   no_roll_evidence?}}
    forge_loot_modifiers          {glm id: {pack, type, active, loot_table_ids, condition_types, table_keys,
                                   strings, sources?}}    (Forge global loot modifiers shipped as data)
    entities / items              {id: [evidence]}  entities: lang, loot_table, spawn_egg
                                  items: tsv, model, lang (item.* key), lang_block (block.* key), kubejs
    item_tags, item_tag_members (every tag, in full), item_tags_broken,
    item_tags_unknown_required_members
    paxi_drift                    zip vs datapack_sources/<name> comparison

template_reach.via kinds, strongest first (= template_reach.confidence):
    jigsaw              BFS from a worldgen structure that is in >= 1 structure set: start_pool -> elements ->
                        jigsaw pools (+fallback), honouring the structure's `size` like JigsawPlacement does
    vanilla_code        vanilla structure TYPE that places a fixed template-path prefix from code (hard-coded map)
    structure_json      the template id (or a pool that leads to it) is a string in a placed structure's JSON
    feature_json        a configured feature names the template AND a placed feature of it is in a biome /
                        forge biome_modifier / reachable pool (feature_json_unplaced = named, never placed)
    class_const         full "ns:path" string literal in a .class
    class_const_pool    reached only from a pool whose id is a string literal in a .class
    processor_json      named in a processor_list JSON
    class_const_path    bare path literal in a class of the jar family that ships the template (weaker)
    class_const_prefix  only a PREFIX of the id is a literal (string concatenation) in that family (weak)
    class_const_leaf    only the last path segment is a literal in that family (weakest)
`dimensions` come from the biomes of the placing structures / features; `dim_hints` are guesses from the
class that names the template (Level.OVERWORLD/NETHER/END field refs, dimension id literals).

table_roots.rolled_by kinds:
    structure_nbt, structure_entity   container / entity NBT in a template (carries template_reachable,
                                      confidence, dimensions copied from template_reach)
    processor           worldgen processor (append_loot ...) or inline processor carrying a loot_table
    nested_in           child of a `minecraft:loot_table` entry in the winning version of <detail>.  Forge only
                        runs global loot modifiers for the ROOT table, so this is NOT a root roll
    set_loot_table      named by a set_loot_table function inside <detail> (rolled later as a root)
    advancement_reward, function
    class_const         full id literal in a .class (detail = jar + class)
    class_const_path    bare path literal in a class of a jar whose own namespaces include the table's (weaker)
    class_const_leaf    only the last path segment is a literal in such a jar (weakest)
    glm_reference       named in a Forge GLM JSON outside a forge:loot_table_id condition (usually: the GLM
                        rolls / injects this table)
    glm_condition       a GLM is conditioned on this table (proves nothing about the table being rolled)
    other_json          the id is a string in some other data/** JSON (detail = pack:file)
    vanilla_builtin     table shipped by the vanilla jar (rolled from vanilla code; nested_only marks the three
                        fishing sub-tables that vanilla never rolls directly)
    entity_default      <ns>:entities/<id> and entity type <ns>:<id> is known
    block_default       <ns>:blocks/<id> (block existence not checked)
"""
import argparse
import hashlib
import io
import json
import multiprocessing
import os
import re
import struct
import sys
import time
import zipfile
import zlib
from collections import Counter, defaultdict, deque

SCANNER_VERSION = 9

NESTED_DIRS = ('META-INF/jarjar', 'META-INF/jars')
END_BIOMES = ['minecraft:the_end', 'minecraft:end_highlands', 'minecraft:end_midlands',
              'minecraft:small_end_islands', 'minecraft:end_barrens']
VANILLA_DIMS = ('minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end')
# vanilla structure TYPES whose pieces are placed from code by template-path prefix (not via jigsaw)
VANILLA_CODE_TEMPLATES = {
    'minecraft:end_city': 'end_city/',
    'minecraft:igloo': 'igloo/',
    'minecraft:shipwreck': 'shipwreck/',
    'minecraft:ocean_ruin': 'underwater_ruin/',
    'minecraft:woodland_mansion': 'woodland_mansion/',
    'minecraft:ruined_portal': 'ruined_portal/',
    'minecraft:nether_fossil': 'nether_fossils/',
}
# vanilla tables that vanilla code never rolls directly (FishingHook rolls gameplay/fishing, which nests these).
# Hard-coded vanilla knowledge, NOT derived from files.
VANILLA_NESTED_ONLY = ('minecraft:gameplay/fishing/fish', 'minecraft:gameplay/fishing/junk',
                       'minecraft:gameplay/fishing/treasure')
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


def analyse_loot(obj):
    if not isinstance(obj, dict):
        raise ValueError('root is not a JSON object')
    items, tags, refs, setlt, other_items = set(), set(), set(), set(), set()
    other = Counter()

    def funcs(fs):
        if not isinstance(fs, list):
            return
        for f in fs:
            if not isinstance(f, dict):
                continue
            fn = nid(f.get('function'))
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


# --------------------------------------------------------------------------- merge

class Notes(object):
    def __init__(self):
        self.d = defaultdict(list)
        self.n = Counter()

    def add(self, cat, msg, cap=150):
        self.n[cat] += 1
        if len(self.d[cat]) < cap:
            self.d[cat].append(msg)

    def dump(self):
        out = {}
        for k in sorted(self.d):
            out[k] = {'count': self.n[k], 'items': self.d[k]}
        return out


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


def kubejs_registered_items(repo, notes):
    root = os.path.join(repo, 'kubejs', 'startup_scripts')
    out = set()
    rx_reg = re.compile(r'StartupEvents\s*\.\s*registry\s*\(\s*([\'"])([^\'"]+)\1')
    rx_create = re.compile(r'\.create\s*\(\s*([\'"`])([^\'"`]*)\1')
    rx_any = re.compile(r'\.create\s*\(')
    for dp, dn, fn in os.walk(root):
        for f in fn:
            if not f.endswith('.js'):
                continue
            try:
                with open(os.path.join(dp, f), 'r', encoding='utf-8', errors='replace') as fh:
                    text = fh.read()
            except OSError:
                continue
            regs = list(rx_reg.finditer(text))
            for i, m in enumerate(regs):
                kind = m.group(2).replace('minecraft:', '')
                if kind not in ('item', 'block'):
                    continue
                seg = text[m.end():regs[i + 1].start() if i + 1 < len(regs) else len(text)]
                lit = 0
                for c in rx_create.finditer(seg):
                    rid = c.group(2)
                    if not rid or '$' in rid or not RX_PATH.match(rid.replace(':', '/')):
                        continue
                    lit += 1
                    out.add(rid if ':' in rid else 'kubejs:' + rid)
                dyn = len(rx_any.findall(seg)) - lit
                if dyn > 0:
                    notes.add('kubejs_dynamic_create',
                              '%s: %d .create(...) call(s) with a non-literal id in a %s registry handler'
                              % (os.path.relpath(os.path.join(dp, f), repo).replace('\\', '/'), dyn, kind))
    return out


def paxi_drift(repo, notes):
    zdir = os.path.join(repo, 'config', 'paxi', 'datapacks')
    sdir = os.path.join(repo, 'datapack_sources')
    out = {'packs': {}, 'zips_without_source': [], 'sources_without_zip': []}
    zips = sorted(f for f in os.listdir(zdir) if f.lower().endswith('.zip')) if os.path.isdir(zdir) else []
    srcs = sorted(d for d in os.listdir(sdir) if os.path.isdir(os.path.join(sdir, d))) if os.path.isdir(sdir) else []
    zset = set(z[:-4] for z in zips)
    out['sources_without_zip'] = [s for s in srcs if s not in zset]
    for z in zips:
        name = z[:-4]
        if name not in srcs:
            out['zips_without_source'].append(z)
            continue
        zfiles = {}
        try:
            with zipfile.ZipFile(os.path.join(zdir, z)) as zf:
                for n in zf.namelist():
                    if not n.endswith('/'):
                        zfiles[n.replace('\\', '/')] = zf.read(n)
        except Exception as e:
            notes.add('paxi_drift', '%s unreadable: %s' % (z, e))
            continue
        sfiles = {}
        root = os.path.join(sdir, name)
        for dp, dn, fn in os.walk(root):
            for f in fn:
                p = os.path.join(dp, f)
                sfiles[os.path.relpath(p, root).replace('\\', '/')] = p
        only_zip = sorted(set(zfiles) - set(sfiles))
        only_src = sorted(set(sfiles) - set(zfiles))
        differ = []
        for n in sorted(set(zfiles) & set(sfiles)):
            with open(sfiles[n], 'rb') as f:
                sb = f.read()
            if sb != zfiles[n] and sb.replace(b'\r\n', b'\n') != zfiles[n].replace(b'\r\n', b'\n'):
                differ.append(n)

        def lt(lst):
            return [x for x in lst if '/loot_tables/' in x]

        out['packs'][z] = {
            'source': 'datapack_sources/' + name,
            'files_zip': len(zfiles), 'files_source': len(sfiles),
            'only_in_zip': len(only_zip), 'only_in_source': len(only_src), 'different': len(differ),
            'loot_tables': {'only_in_zip': lt(only_zip), 'only_in_source': lt(only_src), 'different': lt(differ)},
            'sample': {'only_in_zip': [x for x in only_zip if '/loot_tables/' not in x][:25],
                       'only_in_source': [x for x in only_src if '/loot_tables/' not in x][:25],
                       'different': [x for x in differ if '/loot_tables/' not in x][:25]},
        }
    return out


def merge_tags(live_units, key, notes):
    """-> {tag: {'entries': [(value, required)], 'remove': set, 'packs': [..]}} honouring replace."""
    defs = {}
    for pk, u in live_units:
        for tag, f in u.get(key, {}).items():
            d = defs.get(tag)
            if d is None:
                d = defs[tag] = {'entries': [], 'remove': [], 'packs': []}
            o = pk['order']
            if f.get('r'):
                if pk['kind'] == 'mod' and any(e[2] == o for e in d['entries']):
                    notes.add('tag_replace_in_mod_tier',
                              '%s %s: %s sets replace:true while another mod jar also defines it '
                              '(relative mod order unknown; same-tier entries kept)' % (key, tag, pk['id']))
                d['entries'] = [e for e in d['entries'] if e[2] >= o]
                d['remove'] = [e for e in d['remove'] if e[1] >= o]
            for val, req in f.get('v', []):
                d['entries'].append((val, req, o))
            for val in f.get('x', []):
                d['remove'].append((val, o))
            d['packs'].append(pk['id'])
    return defs


def make_tag_resolver(defs):
    memo = {}

    def resolve(tag, stack=()):
        """-> (members set, missing-required set) or None when the tag is not defined at all."""
        if tag in memo:
            return memo[tag]
        d = defs.get(tag)
        if d is None:
            return None
        if tag in stack:
            return (set(), set())
        out = set()
        missing = set()
        for val, req, _ in d['entries']:
            if val is None:
                continue
            if val[0] == '#':
                r = resolve(val[1:], stack + (tag,))
                if r is None:
                    if req:
                        missing.add(val)
                else:
                    out |= r[0]
                    if req:
                        missing |= r[1]
            else:
                out.add(val)
        for val, _ in d['remove']:
            if val and val[0] == '#':
                r = resolve(val[1:], stack + (tag,))
                if r:
                    out -= r[0]
            else:
                out.discard(val)
        if not stack:
            memo[tag] = (out, missing)
        return (out, missing)

    return resolve


def litho_predicate(p, modids):
    """-> (value, certain)"""
    if p is None:
        return True, True
    if not isinstance(p, dict):
        return True, False
    t = str(p.get('type', ''))
    t = t.split(':')[-1]
    if t == 'mod_loaded':
        return (p.get('mod_id') in modids), True
    if t == 'true':
        return True, True
    if t in ('all_of', 'any_of'):
        vals = [litho_predicate(x, modids) for x in as_list(p.get('predicates'))]
        cert = all(c for _, c in vals)
        if t == 'all_of':
            return all(v for v, _ in vals), cert
        return any(v for v, _ in vals), cert
    if t == 'not':
        v, c = litho_predicate(p.get('predicate'), modids)
        return (not v), c
    return True, False


def eval_forge_conditions(conds, modids):
    """-> True / False / None (a condition type this scanner does not understand)"""

    def one(c):
        if not isinstance(c, dict):
            return None
        t = str(c.get('type'))
        if t == 'forge:mod_loaded':
            return c.get('modid') in modids
        if t == 'forge:true':
            return True
        if t == 'forge:false':
            return False
        if t == 'forge:not':
            r = one(c.get('value'))
            return None if r is None else (not r)
        if t in ('forge:and', 'forge:or'):
            vals = [one(x) for x in as_list(c.get('values'))]
            if t == 'forge:and':
                return False if False in vals else (None if None in vals else True)
            return True if True in vals else (None if None in vals else False)
        return None

    res = True
    for c in as_list(conds):
        r = one(c)
        if r is False:
            return False
        if r is None:
            res = None
    return res


def build_truth(args, fams, tasks, kubejs_units, t_scan, cache_hits, notes):
    repo = args.repo
    # ------------------------------------------------------------------ packs / units
    packs = []
    units = []          # (pack, unit) in priority order
    task_by_id = dict((t['id'], t) for t in tasks)
    fam_of_pack = {}
    for t in tasks:
        fam = fams.get(t['id'])
        if fam is None:
            continue
        if fam.get('error'):
            notes.add('archive_errors', '%s: %s' % (t['id'], fam['error']))
            continue
        for u in fam['units']:
            pk = {'id': u['id'], 'kind': t['kind'], 'order': t['order'],
                  'path': t['path'] if u.get('depth', 0) == 0 else t['path'] + '!' + u['id'].split('!', 1)[1],
                  'sha256': u.get('sha256')}
            if u.get('depth', 0):
                pk['nested'] = True
            if t['kind'] in ('mod', 'forge'):
                pk['mod_meta'] = u['mod_meta']
                pk['modids'] = [m['id'] for m in u['mods']]
            if t.get('repo_copy') and not u.get('depth', 0):
                pk['repo_copy'] = True
                pk['instance_sha256'] = t.get('instance_sha256')
                pk['sha256_differs_from_instance'] = (t.get('instance_sha256') is not None
                                                      and t.get('instance_sha256') != u.get('sha256'))
                if t.get('instance_sha256') is None:
                    pk['instance_missing'] = True
            loads = True
            if t['kind'] == 'mod' and u['mod_meta'] == 'none':
                loads = False
            if t['kind'] == 'paxi':
                if u.get('pack_mcmeta') is None:
                    loads = False
                    pk['not_a_datapack'] = True
                    notes.add('paxi_not_a_datapack', '%s has no pack.mcmeta at its root' % u['id'])
            pk['loads_data'] = loads
            pm = u.get('pack_mcmeta') or {}
            if pm.get('filter'):
                pk['pack_filter'] = pm['filter']
                notes.add('pack_filter', '%s declares a pack.mcmeta filter (NOT applied by this scanner): %s'
                          % (u['id'], json.dumps(pm['filter'])[:300]))
            pk['counts'] = {k: len(u[k]) for k in ('loot_tables', 'structures', 'pools', 'wg_structures',
                                                   'structure_sets', 'item_tags') if u.get(k)}
            if u.get('class_n'):
                pk['counts']['classes'] = u['class_n']
            packs.append(pk)
            units.append((pk, u))
            fam_of_pack[pk['id']] = t['id']
            if not loads and any(u.get(k) for k in ('loot_tables', 'structures', 'pools', 'item_tags')):
                notes.add('data_in_non_mod_jar',
                          '%s has no mods.toml / fabric.mod.json: its data (%s) is assumed NOT loaded and is '
                          'excluded' % (u['id'], pk['counts']))
            for n in u.get('notes', []):
                notes.add('unit_notes', '%s: %s' % (u['id'], n), cap=400)
            for k, v in (u.get('counts') or {}).items():
                if k != 'notes_dropped':
                    notes.add('unit_counts', '%s: %s = %d' % (u['id'], k, v), cap=400)
            for n in u.get('skipped_nested', []):
                notes.add('nested_jar_not_scanned', '%s!%s (not under META-INF/jarjar or META-INF/jars)'
                          % (u['id'], n))
    for pk, u in kubejs_units:
        packs.append(pk)
        units.append((pk, u))
        for n in u.get('notes', []):
            notes.add('unit_notes', '%s: %s' % (u['id'], n), cap=400)
    units.sort(key=lambda x: (x[0]['order'], x[0]['id']))
    packs.sort(key=lambda p: (p['order'], p['id']))
    live = [(pk, u) for pk, u in units if pk.get('loads_data', True)]
    pack_by_id = dict((p['id'], p) for p in packs)
    fam_modids = defaultdict(set)
    for pk, u in units:
        fam_modids[fam_of_pack.get(pk['id'], pk['id'])].update(m['id'] for m in u.get('mods', []))
    pack_modids = {}
    for pk, u in units:
        pack_modids[pk['id']] = fam_modids[fam_of_pack.get(pk['id'], pk['id'])]

    # ------------------------------------------------------------------ mods
    mods = {}
    for pk, u in units:
        for m in u.get('mods', []):
            e = mods.get(m['id'])
            if e is None:
                mods[m['id']] = {'jar': pk['id'], 'version': m.get('version'), 'loader': m.get('loader')}
            else:
                e.setdefault('also_in', []).append({'jar': pk['id'], 'version': m.get('version')})
        if u.get('fabric_id') and u['fabric_id'] not in mods:
            mods[u['fabric_id']] = {'jar': pk['id'], 'version': None, 'loader': 'fabric(alias of forge jar)'}
    modids = set(mods)
    mods = dict(sorted(mods.items()))

    def gather(key):
        out = defaultdict(list)
        for pk, u in live:
            for rid, rec in u.get(key, {}).items():
                if 'forge_conditions' in rec and key != 'loot_tables':
                    r = eval_forge_conditions(rec['forge_conditions'], modids)
                    if r is False:
                        notes.add('forge_condition_false', '%s %s in %s is disabled by forge:conditions %s'
                                  % (key, rid, pk['id'], json.dumps(rec['forge_conditions'])[:160]))
                        continue
                    if r is None:
                        notes.add('forge_condition_unknown', '%s %s in %s: forge:conditions not understood, '
                                  'assumed TRUE: %s' % (key, rid, pk['id'],
                                                        json.dumps(rec['forge_conditions'])[:160]))
                out[rid].append((pk['order'], pk['id'], rec))
        return out

    def choose(rid, srcs):
        """srcs sorted ascending -> (winner tuple, note or None, tied candidates)"""
        top = srcs[-1][0]
        cands = [s for s in srcs if s[0] == top]
        if len(cands) == 1:
            return cands[0], None, cands
        if len(set(c[2].get('sha1') for c in cands)) == 1:
            return cands[0], None, cands
        ns = rid.split(':')[0]
        non_owner = [c for c in cands if ns not in pack_modids.get(c[1], ())]
        if len(non_owner) == 1 and len(cands) > 1:
            return non_owner[0], 'tie between mod jars: non-owner jar assumed to load after the owner (GUESS)', cands
        return cands[-1], 'tie between mod jars with different content: winner is a GUESS (alphabetical last)', cands

    # ------------------------------------------------------------------ loot tables
    lt_src = gather('loot_tables')
    loot_tables = {}
    lt_stats = Counter()
    diff_pairs = Counter()
    overridden = []
    for tid in sorted(lt_src):
        srcs = sorted(lt_src[tid], key=lambda s: (s[0], s[1]))
        win, wnote, cands = choose(tid, srcs)
        rec = win[2]
        out = {'type': rec.get('type'),
               'sources': [{'pack': s[1], 'sha1': s[2].get('sha1')} for s in srcs],
               'winner': win[1], 'valid': bool(rec.get('valid')), 'error': rec.get('error'),
               'items': rec.get('items', []), 'tags': rec.get('tags', []), 'table_refs': rec.get('table_refs', []),
               'empty': rec.get('empty', True) if rec.get('valid') else None,
               'forge_conditions': bool(rec.get('forge_conditions'))}
        for k in ('lenient_only', 'raw_control_chars_in_strings', 'condition_key', 'conditions',
                  'other_entry_types', 'other_entry_items', 'set_loot_table', 'pools'):
            if k in rec:
                out[k] = rec[k]
        if wnote:
            out['winner_note'] = wnote
        modsrc = [s for s in srcs if pack_by_id[s[1]]['kind'] == 'mod']
        if len(modsrc) > 1:
            out['multi_mod'] = True
            out['mod_content_differs'] = len(set(s[2].get('sha1') for s in modsrc)) > 1
            lt_stats['shipped_by_2+_mod_jars'] += 1
            if out['mod_content_differs']:
                lt_stats['shipped_by_2+_mod_jars_different_content'] += 1
        if len(srcs) > 1:
            kinds = [pack_by_id[s[1]]['kind'] for s in srcs]
            seen_pairs = set()
            for i in range(len(srcs)):
                for j in range(i + 1, len(srcs)):
                    if srcs[i][2].get('sha1') != srcs[j][2].get('sha1'):
                        seen_pairs.add((kinds[i], kinds[j]))
            for pr in seen_pairs:
                diff_pairs['%s -> %s' % pr] += 1
            wk = pack_by_id[win[1]]['kind']
            if wk in ('paxi', 'kubejs_data'):
                lower = [s for s in srcs if pack_by_id[s[1]]['kind'] in ('vanilla', 'forge', 'mod')]
                if lower and any(s[2].get('sha1') != rec.get('sha1') for s in lower):
                    same_json = all(s[2].get('jsha1') == rec.get('jsha1') for s in lower)
                    overridden.append({'table': tid, 'winner': win[1], 'overrides': [s[1] for s in lower],
                                       'formatting_only': bool(same_json and rec.get('jsha1'))})
        if not out['valid']:
            lt_stats['invalid'] += 1
        if out.get('lenient_only'):
            lt_stats['lenient_only'] += 1
        if out['empty']:
            lt_stats['empty'] += 1
        if out['forge_conditions']:
            lt_stats['with_load_conditions'] += 1
        loot_tables[tid] = out
    shipped = set(loot_tables)

    # ------------------------------------------------------------------ structure templates
    st_src = gather('structures')
    structures = {}
    tmpl_packs = defaultdict(set)      # template -> family task ids that ship it
    for tid in sorted(st_src):
        srcs = sorted(st_src[tid], key=lambda s: (s[0], s[1]))
        win, wnote, cands = choose(tid, srcs)
        rec = win[2]
        out = {'pack': win[1], 'size': rec.get('size'), 'containers': rec.get('containers', []),
               'entity_loot': rec.get('entity_loot', []), 'data_markers': rec.get('data_markers', []),
               'jigsaws': rec.get('jigsaws', [])}
        for k in ('error', 'palettes', 'uncompressed', 'zlib'):
            if k in rec:
                out[k] = rec[k]
        if len(srcs) > 1:
            out['sources'] = [{'pack': s[1], 'sha1': s[2].get('sha1')} for s in srcs]
        if wnote:
            out['winner_note'] = wnote
        structures[tid] = out
        for s in srcs:
            tmpl_packs[tid].add(fam_of_pack.get(s[1], s[1]))
    templates = set(structures)

    # ------------------------------------------------------------------ template pools (+ lithostitched)
    pool_src = gather('pools')
    pools = {}
    for pid in sorted(pool_src):
        srcs = sorted(pool_src[pid], key=lambda s: (s[0], s[1]))
        win, wnote, cands = choose(pid, srcs)
        rec = win[2]
        els = set(rec.get('elements', []))
        feats = set(rec.get('features', []))
        procs = defaultdict(set)
        inline = list(rec.get('inline_loot', []))
        for k, v in (rec.get('procs') or {}).items():
            procs[k].update(v)
        out = {'pack': win[1], 'fallback': rec.get('fallback')}
        if wnote:
            for c in cands:          # ambiguous winner: over-approximate with the union
                els.update(c[2].get('elements', []))
                feats.update(c[2].get('features', []))
                for k, v in (c[2].get('procs') or {}).items():
                    procs[k].update(v)
                inline.extend(c[2].get('inline_loot', []))
            out['winner_note'] = wnote + ' -- elements are the UNION of the tied jars'
        if len(srcs) > 1:
            out['sources'] = [{'pack': s[1], 'sha1': s[2].get('sha1')} for s in srcs]
        if rec.get('error'):
            out['error'] = rec['error']
        out['_els'] = els
        out['_feats'] = feats
        out['_procs'] = procs
        out['_inline'] = inline
        out['_added'] = set()
        pools[pid] = out
    has_litho = 'lithostitched' in modids
    litho_sets = defaultdict(list)      # structure set -> [(structure, weight, modifier)]
    litho_n = Counter()
    for pk, u in live:
        for mid, rec in u.get('litho', {}).items():
            t = rec.get('type') or ''
            val, cert = litho_predicate(rec.get('predicate'), modids)
            if not has_litho:
                litho_n['ignored: lithostitched mod not installed'] += 1
                continue
            if not val:
                litho_n['predicate false (skipped)'] += 1
                continue
            if not cert:
                litho_n['predicate not understood (assumed true)'] += 1
            if t.endswith('add_template_pool_elements'):
                litho_n['add_template_pool_elements applied'] += 1
                for target in rec.get('pools', []):
                    if not isinstance(target, str) or target.startswith('#'):
                        notes.add('litho_unresolved_target', '%s: %r' % (mid, target))
                        continue
                    p = pools.get(target)
                    if p is None:
                        notes.add('litho_missing_pool', '%s targets pool %s which no pack ships' % (mid, target))
                        continue
                    p['_added'].update(rec.get('elements', []))
                    p['_feats'].update(rec.get('features', []))
                    for k, v in (rec.get('procs') or {}).items():
                        p['_procs'][k].update(v)
                    p['_inline'].extend(rec.get('inline_loot', []))
                    p.setdefault('added_by', []).append(mid)
            elif t.endswith('add_structure_set_entries'):
                litho_n['add_structure_set_entries applied'] += 1
                for target in rec.get('sets', []):
                    if isinstance(target, str):
                        for st, w in rec.get('entries', []):
                            litho_sets[target].append((st, w, mid))
            else:
                litho_n['other type: ' + t] += 1
    for k, v in litho_n.items():
        notes.add('lithostitched', '%s: %d' % (k, v))
    has_rs = 'repurposed_structures' in modids
    for pk, u in live:
        for aid, rec in u.get('rs_pool_additions', {}).items():
            if not has_rs:
                notes.add('rs_pool_additions', '%s ignored: repurposed_structures is not installed' % aid)
                continue
            p = pools.get(rec.get('target'))
            if p is None:
                notes.add('rs_pool_additions', '%s (%s) targets pool %s which no pack ships'
                          % (aid, pk['id'], rec.get('target')))
                continue
            p['_added'].update(rec.get('elements', []))
            p['_feats'].update(rec.get('features', []))
            for k, v in (rec.get('procs') or {}).items():
                p['_procs'][k].update(v)
            p['_inline'].extend(rec.get('inline_loot', []))
            p.setdefault('added_by', []).append('pool_additions ' + aid)
            if rec.get('conditions'):
                notes.add('rs_pool_additions', '%s -> %s: element condition(s) %s not evaluated (assumed true)'
                          % (aid, rec.get('target'), rec['conditions']), cap=40)

    # ------------------------------------------------------------------ processor lists
    pl_src = gather('processor_lists')
    proc_lists = {}
    for pid in pl_src:
        srcs = sorted(pl_src[pid], key=lambda s: (s[0], s[1]))
        win, wnote, cands = choose(pid, srcs)
        proc_lists[pid] = {'pack': win[1], 'loot': win[2].get('loot', []), 'strings': win[2].get('strings', [])}

    # ------------------------------------------------------------------ biome tags / biomes / dimensions
    btag_defs = merge_tags(live, 'biome_tags', notes)
    bresolve = make_tag_resolver(btag_defs)
    vanilla_only = [(pk, u) for pk, u in live if pk['kind'] == 'vanilla']
    vresolve = make_tag_resolver(merge_tags(vanilla_only, 'biome_tags', Notes()))
    known_biomes = {}
    biome_features = {}
    for pk, u in live:
        for b, feats in u.get('biomes', {}).items():
            known_biomes[b] = pk['id']
            biome_features[b] = feats
    dim_defs = {}
    for pk, u in live:
        for wid, dims in u.get('world_presets', {}).items():
            if wid == 'minecraft:normal':
                for did, rec in dims.items():
                    dim_defs.setdefault(did, (pk['id'] + ' world_preset/normal', rec))
    for pk, u in live:
        for did, rec in u.get('dimensions', {}).items():
            dim_defs[did] = (pk['id'], rec)
    biome_dim_ev = defaultdict(lambda: defaultdict(set))
    dimensions = {}
    for did in sorted(dim_defs):
        src_pack, rec = dim_defs[did]
        bs = rec.get('bs_type')
        got = set()
        if rec.get('preset') in ('minecraft:overworld', 'minecraft:nether'):
            tag = 'minecraft:is_overworld' if rec['preset'] == 'minecraft:overworld' else 'minecraft:is_nether'
            r = vresolve(tag)
            for b in (r[0] if r else ()):
                biome_dim_ev[b][did].add('dimension_json:preset(%s => vanilla #%s)' % (rec['preset'], tag))
                got.add(b)
        elif rec.get('preset'):
            notes.add('dimension', '%s uses unknown multi_noise preset %s' % (did, rec.get('preset')))
        kind = {'minecraft:fixed': 'fixed', 'minecraft:multi_noise': 'multi_noise',
                'minecraft:checkerboard': 'checkerboard', 'minecraft:the_end': 'the_end', 'flat': 'flat'}.get(bs)
        for b in rec.get('biomes', []):
            biome_dim_ev[b][did].add('dimension_json:' + (kind or 'biome_source(%s)' % bs))
            got.add(b)
        for tg in rec.get('tags', []):
            r = bresolve(tg)
            for b in (r[0] if r else ()):
                biome_dim_ev[b][did].add('dimension_json:tag(#%s)' % tg)
                got.add(b)
        if kind is None:
            for s in rec.get('strings', []):
                if s.startswith('#'):
                    r = bresolve(s[1:])
                    for b in (r[0] if r else ()):
                        biome_dim_ev[b][did].add('dimension_json:strings(tag #%s, biome_source %s)' % (s[1:], bs))
                        got.add(b)
                elif s in known_biomes:
                    biome_dim_ev[s][did].add('dimension_json:strings(biome_source %s)' % bs)
                    got.add(s)
        dimensions[did] = {'pack': src_pack, 'dimension_type': rec.get('type'), 'generator': rec.get('gen_type'),
                           'biome_source': bs, 'biomes': len(got)}
        if rec.get('preset'):
            dimensions[did]['preset'] = rec['preset']
    for tag, did in (('minecraft:is_overworld', 'minecraft:overworld'), ('minecraft:is_nether', 'minecraft:the_nether'),
                     ('minecraft:is_end', 'minecraft:the_end')):
        r = bresolve(tag)
        for b in (r[0] if r else ()):
            biome_dim_ev[b][did].add('tag:#' + tag)
    inferred = defaultdict(lambda: defaultdict(set))
    for did in dimensions:
        if did in VANILLA_DIMS:
            continue
        ns, _, p = did.partition(':')
        base = p[4:] if p.startswith('the_') else p
        for tag in sorted(set([ns + ':' + p, ns + ':is_' + p, ns + ':in_' + p, ns + ':' + base, ns + ':is_' + base,
                               ns + ':in_' + base])):
            r = bresolve(tag)
            for b in (r[0] if r else ()):
                if b not in biome_dim_ev:
                    inferred[b][did].add('inferred:biome_tag_named_like_dimension(#%s)' % tag)
    for b, dd in inferred.items():
        for did, ev in dd.items():
            biome_dim_ev[b][did].update(ev)
    biome_dims = {}
    for b in sorted(biome_dim_ev):
        biome_dims[b] = sorted(biome_dim_ev[b])
    biome_unknown = sorted(b for b in known_biomes if b not in biome_dims)

    used_btags = set(['minecraft:is_overworld', 'minecraft:is_nether', 'minecraft:is_end'])
    missing_btags = set()

    def resolve_biomes(reflist):
        """Holder set (ids, #tags, forge:any/and/or/not, structure_gel:filter)
        -> (biomes set, 'any' flag, missing tags, unresolved flag)"""
        state = {'any': False, 'unres': False}
        miss = []

        def one(s, depth=0):
            if depth > 12:
                return set()
            if isinstance(s, str):
                if not s:
                    return set()
                if s[0] == '#':
                    tag = nid(s[1:])
                    used_btags.add(tag)
                    r = bresolve(tag)
                    if r is None:
                        miss.append('#' + tag)
                        missing_btags.add(tag)
                        return set()
                    return set(r[0])
                return set([nid(s)])
            if isinstance(s, list):
                out = set()
                for x in s:
                    out |= one(x, depth + 1)
                return out
            if isinstance(s, dict):
                t = str(s.get('type', ''))
                if t == 'forge:any':
                    state['any'] = True
                    return set(known_biomes)
                if t == 'forge:or':
                    return one(as_list(s.get('values')), depth + 1)
                if t == 'forge:and':
                    vals = [one(x, depth + 1) for x in as_list(s.get('values'))]
                    return set.intersection(*vals) if vals else set()
                if t == 'forge:not':
                    return set(known_biomes) - one(s.get('value'), depth + 1)
                if t == 'structure_gel:filter':
                    return one(s.get('whitelist'), depth + 1) - one(s.get('blacklist'), depth + 1)
                state['unres'] = True
            return set()

        out = one(reflist or [])
        return out, state['any'], miss, state['unres']

    def dims_of(biomes):
        d = set()
        unk = 0
        for b in biomes:
            x = biome_dims.get(b)
            if x:
                d.update(x)
            else:
                unk += 1
        return d, unk

    # ------------------------------------------------------------------ worldgen structures / sets
    ss_src = gather('structure_sets')
    structure_sets = {}
    in_sets = defaultdict(set)
    for sid in sorted(ss_src):
        srcs = sorted(ss_src[sid], key=lambda s: (s[0], s[1]))
        win, wnote, cands = choose(sid, srcs)
        rec = win[2]
        sts = [{'structure': a, 'weight': w} for a, w in rec.get('structures', [])]
        for st, w, mid in litho_sets.get(sid, []):
            sts.append({'structure': st, 'weight': w, 'added_by': mid})
        out = {'pack': win[1], 'structures': sts, 'placement': rec.get('placement')}
        if rec.get('error'):
            out['error'] = rec['error']
        if len(srcs) > 1:
            out['sources'] = [{'pack': s[1], 'sha1': s[2].get('sha1')} for s in srcs]
        if wnote:
            out['winner_note'] = wnote
        structure_sets[sid] = out
        for e in sts:
            in_sets[e['structure']].add(sid)
    for sid in litho_sets:
        if sid not in structure_sets:
            notes.add('litho_missing_structure_set', sid)

    ws_src = gather('wg_structures')
    wg = {}
    wg_raw = {}
    for sid in sorted(ws_src):
        srcs = sorted(ws_src[sid], key=lambda s: (s[0], s[1]))
        win, wnote, cands = choose(sid, srcs)
        rec = win[2]
        wg_raw[sid] = rec
        strings = set(rec.get('strings', []))
        sp = rec.get('start_pool')
        biomes, anyb, miss, unres = resolve_biomes(rec.get('biomes'))
        dims, unk = dims_of(biomes)
        out = {'pack': win[1], 'type': rec.get('type'), 'start_pool': sp, 'size': rec.get('size'),
               'biomes_raw': rec.get('biomes'), 'biomes': sorted(biomes), 'dimensions': sorted(dims),
               'in_structure_sets': sorted(in_sets.get(sid, ())), 'step': rec.get('step'),
               'referenced_templates': sorted(s for s in strings if s in templates and s not in pools),
               'referenced_pools': sorted(s for s in strings if s in pools and s != sp)}
        if unk:
            out['biomes_without_dimension'] = unk
        if miss:
            out['biome_tags_missing'] = miss
        if unres:
            out['biomes_unresolved'] = True
        elif not biomes and not anyb:
            out['biomes_empty'] = True
        if 'forge_conditions' in rec:
            out['forge_conditions'] = rec['forge_conditions']
            out['forge_conditions_result'] = eval_forge_conditions(rec['forge_conditions'], modids)
        if rec.get('inline_pool'):
            out['start_pool'] = sid + '#inline_start_pool'
            ip = rec['inline_pool']
            pools[out['start_pool']] = {'pack': win[1], 'fallback': ip.get('fallback'),
                                        '_els': set(ip.get('elements', [])), '_feats': set(ip.get('features', [])),
                                        '_procs': defaultdict(set), '_inline': list(ip.get('inline_loot', [])),
                                        '_added': set(), 'inline': True}
        if rec.get('error'):
            out['error'] = rec['error']
        if len(srcs) > 1:
            out['sources'] = [{'pack': s[1], 'sha1': s[2].get('sha1')} for s in srcs]
        if wnote:
            out['winner_note'] = wnote
        if sp and sp not in pools:
            out['start_pool_missing'] = True
        wg[sid] = out
    for st in in_sets:
        if st not in wg:
            notes.add('structure_set_references_missing_structure', '%s (sets: %s)' % (st, sorted(in_sets[st])))

    # ------------------------------------------------------------------ class-constant indexes
    cfeat = {}
    pfeat = {}
    for pk, u in live:
        for k, v in u.get('cfeatures', {}).items():
            cfeat[k] = v
        for k, v in u.get('pfeatures', {}).items():
            pfeat[k] = v

    # ------------------------------------------------------------------ jigsaw reachability
    jig_pools = {}
    for tid, s in structures.items():
        ps = set(j['pool'] for j in s['jigsaws'] if j.get('pool') and j['pool'] != 'minecraft:empty')
        if ps:
            jig_pools[tid] = ps

    def pool_elems(p):
        d = pools.get(p)
        if d is None:
            return ()
        return d['_els'] | d['_added']

    def bfs(start_pools, maxd):
        """-> {template: min depth}, visited pools.  Mirrors JigsawPlacement depth rules."""
        best = {}
        seen_pools = set()
        q = deque()

        def place(t, d):
            cur = best.get(t)
            if cur is not None and cur <= d:
                return
            best[t] = d
            q.append((t, d))

        for sp in start_pools:
            seen_pools.add(sp)
            for t in pool_elems(sp):
                place(t, 0)
        if maxd == 0:
            return best, seen_pools
        while q:
            t, d = q.popleft()
            if best.get(t) != d:
                continue
            if maxd is not None and d > maxd:
                continue
            for p in jig_pools.get(t, ()):
                pd = pools.get(p)
                if pd is None:
                    continue
                els = pd['_els'] | pd['_added']
                if not els and not pd['_feats']:
                    continue
                if maxd is None or d < maxd:
                    seen_pools.add(p)
                    for x in els:
                        place(x, d + 1)
                fb = pd.get('fallback')
                if fb and fb != 'minecraft:empty' and fb in pools:
                    seen_pools.add(fb)
                    for x in pool_elems(fb):
                        place(x, d + 1)
        return best, seen_pools

    reach = {}
    for tid in structures:
        reach[tid] = {'via': [], 'dims': set(), 'unplaced': [], 'hints': set()}

    def add_via(tid, kind, detail, dims=None, extra=None):
        r = reach.get(tid)
        if r is None:
            return
        e = {'kind': kind, 'detail': detail}
        if extra:
            e.update(extra)
        for x in r['via']:
            if x['kind'] == kind and x['detail'] == detail:
                return
        r['via'].append(e)
        if dims:
            r['dims'].update(dims)

    pool_reach = defaultdict(set)       # pool -> structures reaching it
    for sid, s in wg.items():
        sp = s.get('start_pool')
        placed = bool(s['in_structure_sets'])
        dims = set(s['dimensions'])
        if sp and sp in pools:
            best, seenp = bfs([sp], s.get('size') if isinstance(s.get('size'), int) else None)
            if placed:
                for p in seenp:
                    pool_reach[p].add(sid)
            for t in best:
                if t not in reach:
                    continue
                if placed:
                    add_via(t, 'jigsaw', sid, dims)
                elif sid not in reach[t]['unplaced']:
                    reach[t]['unplaced'].append(sid)
            s['templates_reached'] = len([t for t in best if t in reach])
        # other pools / templates named anywhere in the structure JSON
        extra_pools = [p for p in s['referenced_pools'] if p in pools]
        if extra_pools:
            best, seenp = bfs(extra_pools, None)
            for t in best:
                if t in reach:
                    if placed:
                        add_via(t, 'structure_json', sid, dims, {'note': 'via a pool named in the structure JSON'})
                    elif sid not in reach[t]['unplaced']:
                        reach[t]['unplaced'].append(sid)
        for t in s['referenced_templates']:
            if placed:
                add_via(t, 'structure_json', sid, dims)
            elif sid not in reach[t]['unplaced']:
                reach[t]['unplaced'].append(sid)
        # vanilla code-placed piece families
        pref = VANILLA_CODE_TEMPLATES.get(s.get('type') or '')
        if pref and placed:
            for t in templates:
                if t.startswith('minecraft:' + pref):
                    add_via(t, 'vanilla_code', sid, dims, {'note': 'structure type %s places %s* from code'
                                                           % (s['type'], pref)})

    # ---- configured / placed feature chain
    pf_of_cf = defaultdict(set)
    for pid, rec in pfeat.items():
        f = rec.get('feature')
        if f:
            pf_of_cf[f].add(pid)
        else:
            for s in rec.get('strings', []):
                if s in cfeat:
                    pf_of_cf[s].add(pid)
    cf_of_pf = defaultdict(set)
    for cid, rec in cfeat.items():
        for r in rec.get('pf_refs', []):
            cf_of_pf[r].add(cid)
    pf_biomes = defaultdict(set)
    pf_any = set()
    for b, feats in biome_features.items():
        for f in feats:
            pf_biomes[f].add(b)
    for pk, u in live:
        for mid, rec in u.get('biome_mods', {}).items():
            biomes, anyb, miss, unres = resolve_biomes(rec.get('biomes'))
            for f in rec.get('features', []):
                if isinstance(f, str):
                    if f.startswith('#'):
                        notes.add('biome_modifier_feature_tag', '%s adds placed-feature tag %s (not resolved)' % (mid, f))
                        continue
                    pf_biomes[f].update(biomes)
                    if anyb:
                        pf_any.add(f)
    pool_pf = defaultdict(set)
    for pid, pd in pools.items():
        for f in pd['_feats']:
            pool_pf[f].add(pid)

    def cf_placement(cid):
        """-> (biomes, any_biome, placed feature ids, pools that place it)"""
        seen_cf = set([cid])
        seen_pf = set()
        st = [cid]
        biomes = set()
        anyb = False
        via_pools = set()
        while st:
            c = st.pop()
            for p in pf_of_cf.get(c, ()):
                if p in seen_pf:
                    continue
                seen_pf.add(p)
                biomes |= pf_biomes.get(p, set())
                if p in pf_any:
                    anyb = True
                via_pools |= pool_pf.get(p, set())
                for c2 in cf_of_pf.get(p, ()):
                    if c2 not in seen_cf:
                        seen_cf.add(c2)
                        st.append(c2)
        return biomes, anyb, seen_pf, via_pools

    all_dims = sorted(dimensions)
    for cid, rec in cfeat.items():
        hits = [s for s in rec.get('strings', []) if s in templates]
        if not hits:
            continue
        biomes, anyb, pfs, via_pools = cf_placement(cid)
        dims, unk = dims_of(biomes)
        if anyb:
            dims = set(all_dims)
        placed = bool(biomes) or anyb
        via_structs = set()
        for p in via_pools:
            via_structs |= pool_reach.get(p, set())
        for t in hits:
            if placed:
                ex = {'placed_features': sorted(pfs)[:6], 'biomes': len(biomes)}
                if rec.get('type') == t:
                    ex['note'] = ('the feature TYPE id equals the template id (MCreator-style code feature that '
                                  'places a same-named template) -- inferred link')
                add_via(t, 'feature_json', cid, dims, ex)
            elif via_structs:
                sd = set()
                for sid in via_structs:
                    sd.update(wg[sid]['dimensions'])
                add_via(t, 'feature_json', cid, sd, {'note': 'placed by a feature_pool_element',
                                                     'structures': sorted(via_structs)[:6]})
            else:
                add_via(t, 'feature_json_unplaced', cid, None,
                        {'note': 'configured feature names the template but no biome / biome_modifier / pool '
                                 'places it (placed_features: %s)' % (sorted(pfs)[:4] or 'none')})
    for pid, rec in pfeat.items():
        if rec.get('feature'):
            continue
        for s in rec.get('strings', []):
            if s in templates:
                biomes = pf_biomes.get(pid, set())
                dims, unk = dims_of(biomes)
                add_via(s, 'feature_json' if biomes else 'feature_json_unplaced', pid, dims,
                        {'note': 'inline feature in placed_feature'})
    for pid, rec in proc_lists.items():
        for s in rec.get('strings', []):
            if s in templates:
                add_via(s, 'processor_json', pid)

    # ---- class constants
    table_refs_extra = defaultdict(list)          # filled below for table_roots
    known_pf = set(pfeat)
    cls_tmpl = Counter()
    fam_units = defaultdict(list)
    for pk, u in units:
        fam_units[fam_of_pack.get(pk['id'], pk['id'])].append((pk, u))
    class_pool_seeds = defaultdict(list)
    for pk, u in units:
        names = u.get('class_names') or []
        crl = u.get('class_rl') or {}
        cdims = u.get('class_dims') or {}
        if not crl and not u.get('class_path'):
            continue
        for const, e in crl.items():
            if const in templates:
                hints = set()
                for ci in e[1:]:
                    hints.update(cdims.get(str(ci), ()))
                add_via(const, 'class_const', pk['id'] + ' ' + names[e[1]], None,
                        {'classes': e[0], 'dim_hints': sorted(hints)} if hints else {'classes': e[0]})
                reach[const]['hints'].update(hints)
            if const in pools:
                class_pool_seeds[const].append(pk['id'] + ' ' + names[e[1]])
        fam = fam_of_pack.get(pk['id'], pk['id'])
        cpath = u.get('class_path') or {}
        cpns = u.get('class_path_ns') or {}
        for const, e in cpath.items():
            for ns in set(u.get('fam_ns', [])) | set(['minecraft']):
                tid = ns + ':' + const
                if tid in templates and fam in tmpl_packs.get(tid, ()):
                    hints = set()
                    for ci in e[1:]:
                        hints.update(cdims.get(str(ci), ()))
                    ex = {'classes': e[0], 'ns_const_in_same_class': ns in cpns.get(const, ())}
                    if hints:
                        ex['dim_hints'] = sorted(hints)
                    add_via(tid, 'class_const_path', pk['id'] + ' ' + names[e[1]], None, ex)
                    reach[tid]['hints'].update(hints)
    for p in sorted(class_pool_seeds):
        dets = sorted(class_pool_seeds[p])
        if pool_reach.get(p):
            continue
        best, seenp = bfs([p], None)
        for t in best:
            add_via(t, 'class_const_pool', p, None, {'classes_in': dets[:3]})
    # weakest: constant PREFIX (string concatenation) in the family that ships the template
    fam_prefix = {}
    for fam, lst in fam_units.items():
        full = set()
        bare = set()
        for pk, u in lst:
            for p in u.get('class_prefix', []):
                if ':' in p:
                    full.add(p)
                elif len(p) >= 4:
                    bare.add(p)
        if full or bare:
            fam_prefix[fam] = (sorted(full), sorted(bare))
    for tid, r in reach.items():
        if any(not v['kind'].endswith('_unplaced') for v in r['via']):
            continue
        path = tid.partition(':')[2]
        for fam in tmpl_packs.get(tid, ()):
            fp = fam_prefix.get(fam)
            if not fp:
                continue
            hit = None
            for p in fp[0]:
                if tid.startswith(p) and len(p) > tid.index(':') + 3:
                    hit = p
                    break
            if hit is None:
                for p in fp[1]:
                    if path.startswith(p):
                        hit = p
                        break
            if hit:
                add_via(tid, 'class_const_prefix', fam, None, {'prefix': hit})
                break

    tleaf = defaultdict(list)
    for tid, r in reach.items():
        if any(not v['kind'].endswith('_unplaced') for v in r['via']):
            continue
        pth = tid.partition(':')[2]
        if '/' in pth:
            tleaf[pth.rpartition('/')[2]].append(tid)
    for pk, u in units:
        cl = u.get('class_leaf') or {}
        if not cl:
            continue
        fam = fam_of_pack.get(pk['id'], pk['id'])
        names = u.get('class_names') or []
        for const, e in cl.items():
            for tid in tleaf.get(const, ()):
                if fam in tmpl_packs.get(tid, ()):
                    add_via(tid, 'class_const_leaf', pk['id'] + ' ' + names[e[1]], None,
                            {'classes': e[0], 'leaf': const})
    conf_rank = ['jigsaw', 'vanilla_code', 'structure_json', 'feature_json', 'class_const', 'class_const_pool',
                 'processor_json', 'class_const_path', 'class_const_prefix', 'class_const_leaf']
    template_reach = {}
    reach_stats = Counter()
    for tid in sorted(reach):
        r = reach[tid]
        good = [v for v in r['via'] if not v['kind'].endswith('_unplaced')]
        kinds = set(v['kind'] for v in good)
        conf = 'none'
        for k in conf_rank:
            if k in kinds:
                conf = k
                break
        via = sorted(r['via'], key=lambda v: (conf_rank.index(v['kind']) if v['kind'] in conf_rank else 99,
                                              v['kind'], str(v['detail'])))
        out = {'reachable': bool(good), 'confidence': conf, 'dimensions': sorted(r['dims'])}
        if len(via) > 24:
            out['via_truncated'] = len(via)
            via = via[:24]
        out['via'] = via
        if r['hints']:
            out['dim_hints'] = sorted(r['hints'])
        if r['unplaced']:
            out['unplaced_structures'] = sorted(r['unplaced'])[:12]
        template_reach[tid] = out
        reach_stats[conf] += 1

    # ------------------------------------------------------------------ template pools output + processor loot
    template_pools = {}
    proc_templates = defaultdict(set)
    processor_loot = []
    for pid in sorted(pools):
        pd = pools[pid]
        out = {'pack': pd['pack'], 'fallback': pd.get('fallback'), 'elements': sorted(pd['_els']),
               'features': sorted(pd['_feats'])}
        if pd['_added']:
            out['added_elements'] = sorted(pd['_added'])
            out['added_by'] = sorted(set(pd.get('added_by', [])))
        for k in ('sources', 'winner_note', 'error', 'inline'):
            if k in pd:
                out[k] = pd[k]
        miss = sorted(t for t in (pd['_els'] | pd['_added']) if t not in templates)
        if miss:
            out['missing_templates'] = miss
        rs = pool_reach.get(pid)
        if rs:
            out['reached_by'] = sorted(rs)[:12]
        template_pools[pid] = out
        for proc, ts in pd['_procs'].items():
            proc_templates[proc].update(ts)
        for tb, pt, tmpl in pd['_inline']:
            e = {'processor_list': None, 'inline_in': 'template_pool ' + pid, 'loot_table': tb,
                 'processor_type': pt, 'templates': [tmpl] if tmpl else []}
            processor_loot.append(e)
    for pid in sorted(proc_lists):
        for tb, pt in proc_lists[pid]['loot']:
            processor_loot.append({'processor_list': pid, 'pack': proc_lists[pid]['pack'], 'loot_table': tb,
                                   'processor_type': pt, 'templates': sorted(proc_templates.get(pid, ()))})
    for sid, rec in wg_raw.items():
        for tb, pt in rec.get('loot', []) or []:
            processor_loot.append({'processor_list': None, 'inline_in': 'worldgen/structure ' + sid,
                                   'loot_table': tb, 'processor_type': pt, 'templates': []})
    for e in processor_loot:
        dims = set()
        rch = False
        for t in e['templates']:
            tr = template_reach.get(t)
            if tr:
                dims.update(tr['dimensions'])
                rch = rch or tr['reachable']
        if e.get('inline_in', '').startswith('worldgen/structure '):
            sid = e['inline_in'].split(' ', 1)[1]
            dims.update(wg[sid]['dimensions'])
            rch = bool(wg[sid]['in_structure_sets'])
        e['template_count'] = len(e['templates'])
        e['templates'] = e['templates'][:40]
        e['any_template_reachable'] = rch
        e['dimensions'] = sorted(dims)

    # ------------------------------------------------------------------ entities / items
    entities = defaultdict(set)
    items = defaultdict(set)
    for pk, u in units:
        for e in u.get('lang_entity', []):
            if RX_RL.match(e):
                entities[e].add('lang')
        for m in u.get('item_models', []):
            if RX_RL.match(m):
                items[m].add('model')
                if m.endswith('_spawn_egg'):
                    entities[m[:-10]].add('spawn_egg')
        for i in u.get('lang_item', []):
            if RX_RL.match(i):
                items[i].add('lang')
        for i in u.get('lang_block', []):
            if RX_RL.match(i):
                items[i].add('lang_block')
    for tid in shipped:
        ns, _, p = tid.partition(':')
        if p.startswith('entities/') and '/' not in p[9:]:
            entities[ns + ':' + p[9:]].add('loot_table')
    tsv = os.path.join(repo, 'TesterLogs', 'Item Audit', 'all_items.tsv')
    tsv_n = 0
    try:
        with open(tsv, 'r', encoding='utf-8', errors='replace') as f:
            first = True
            for line in f:
                if first:
                    first = False
                    if line.startswith('namespace'):
                        continue
                c = line.rstrip('\n').split('\t')
                if len(c) >= 2 and c[0] and c[1]:
                    items[c[0] + ':' + c[1]].add('tsv')
                    tsv_n += 1
    except OSError as e:
        notes.add('items', 'item TSV not readable: %s' % e)
    for i in kubejs_registered_items(repo, notes):
        items[i].add('kubejs')

    # ------------------------------------------------------------------ item tags
    itag_defs = merge_tags(live, 'item_tags', notes)
    iresolve = make_tag_resolver(itag_defs)
    item_tags = {}
    item_tag_members = {}
    item_tags_broken = {}
    item_tags_unknown_members = {}
    for tag in sorted(itag_defs):
        members, missing = iresolve(tag)
        item_tags[tag] = len(members)
        # every tag in full: the harness evaluates '#tag' loot filters against real membership, and the
        # big tags (minecraft:logs, planks, ...) are exactly the ones loot rules strip by
        item_tag_members[tag] = sorted(members)
        if missing:
            item_tags_broken[tag] = sorted(missing)
        req_direct = [v for v, req, _ in itag_defs[tag]['entries'] if req and v and v[0] != '#' and v not in items]
        if req_direct:
            item_tags_unknown_members[tag] = sorted(set(req_direct))[:40]

    # ------------------------------------------------------------------ global loot modifiers (Forge GLMs)
    glm_active = []
    for pk, u in live:
        gl = u.get('glm_list')
        if gl:
            if gl.get('replace'):
                glm_active = []
            glm_active.extend(gl.get('entries', []))
    glm_active_set = set(glm_active)
    glm_src = gather('glms')
    loot_modifiers = {}
    for gid in sorted(glm_src):
        srcs = sorted(glm_src[gid], key=lambda x: (x[0], x[1]))
        win, wnote, cands = choose(gid, srcs)
        rec = win[2]
        out = {'pack': win[1], 'type': rec.get('type'), 'active': gid in glm_active_set,
               'loot_table_ids': rec.get('loot_table_ids', []), 'condition_types': rec.get('condition_types', []),
               'table_keys': rec.get('table_keys', []), 'strings': rec.get('strings', [])}
        if 'forge_conditions' in rec:
            out['forge_conditions'] = rec['forge_conditions']
            out['forge_conditions_result'] = eval_forge_conditions(rec['forge_conditions'], modids)
        if rec.get('error'):
            out['error'] = rec['error']
        if len(srcs) > 1:
            out['sources'] = [{'pack': x[1], 'sha1': x[2].get('sha1')} for x in srcs]
        if wnote:
            out['winner_note'] = wnote
        loot_modifiers[gid] = out
    for gid in sorted(glm_active_set):
        if gid not in loot_modifiers:
            notes.add('glm_listed_without_file', gid)

    # ------------------------------------------------------------------ table roots
    roots = defaultdict(list)
    nbt_ref = defaultdict(Counter)           # table -> template -> count
    for tid, s in structures.items():
        for c in s['containers']:
            lt = c.get('loot_table')
            if lt:
                nbt_ref[lt][tid] += 1
        for e in s['entity_loot']:
            lt = e.get('loot_table') or e.get('death_loot_table')
            if lt:
                roots[lt].append({'kind': 'structure_entity', 'detail': tid, 'entity': e.get('entity'),
                                  'field': 'LootTable' if e.get('loot_table') else 'DeathLootTable',
                                  'template_reachable': template_reach[tid]['reachable'],
                                  'confidence': template_reach[tid]['confidence'],
                                  'dimensions': template_reach[tid]['dimensions']})
    for lt, c in nbt_ref.items():
        for tid, n in sorted(c.items()):
            tr = template_reach[tid]
            e = {'kind': 'structure_nbt', 'detail': tid, 'count': n, 'template_reachable': tr['reachable'],
                 'confidence': tr['confidence'], 'dimensions': tr['dimensions']}
            if tr.get('dim_hints'):
                e['dim_hints'] = tr['dim_hints']
            roots[lt].append(e)
    for e in processor_loot:
        roots[e['loot_table']].append({'kind': 'processor', 'detail': e.get('processor_list') or e.get('inline_in'),
                                       'templates': e['template_count'],
                                       'any_template_reachable': e['any_template_reachable'],
                                       'dimensions': e['dimensions']})
    for tid, t in loot_tables.items():
        for r in t.get('table_refs', []):
            roots[r].append({'kind': 'nested_in', 'detail': tid})
        for r in t.get('set_loot_table', []):
            roots[r].append({'kind': 'set_loot_table', 'detail': tid})
    for pk, u in live:
        for aid, lts in u.get('adv_loot', {}).items():
            for lt in lts:
                roots[lt].append({'kind': 'advancement_reward', 'detail': aid, 'pack': pk['id']})
        for fid, lts in u.get('fn_loot', {}).items():
            for lt in lts:
                roots[lt].append({'kind': 'function', 'detail': fid, 'pack': pk['id']})
    for gid, g in loot_modifiers.items():
        for tb in g.get('table_keys', []):
            if tb not in g.get('loot_table_ids', ()):
                roots[tb].append({'kind': 'glm_reference', 'detail': gid, 'glm_type': g.get('type'),
                                  'active': g['active'], 'key': True})
    known_tables = set(shipped) | set(roots)
    known_tables.discard(None)
    for gid, g in loot_modifiers.items():
        conds = set(g.get('loot_table_ids', ()))
        tk = set(g.get('table_keys', ()))
        for tb in g.get('strings', []):
            if tb in conds:
                roots[tb].append({'kind': 'glm_condition', 'detail': gid, 'glm_type': g.get('type'),
                                  'active': g['active']})
            elif tb in known_tables and tb not in tk:
                roots[tb].append({'kind': 'glm_reference', 'detail': gid, 'glm_type': g.get('type'),
                                  'active': g['active']})
    # class constants / other json
    oj_seen = Counter()
    for pk, u in units:
        names = u.get('class_names') or []
        for const, e in (u.get('class_rl') or {}).items():
            if const in known_tables or (const.partition(':')[2].startswith('chests/') and pk['kind'] != 'vanilla'
                                         and const[-1] not in '/_.-'):
                roots[const].append({'kind': 'class_const', 'detail': pk['id'] + ' ' + names[e[1]], 'count': e[0]})
        cpns = u.get('class_path_ns') or {}
        own = set(u.get('fam_ns', []))
        for const, e in (u.get('class_path') or {}).items():
            if const.startswith('blocks/'):
                continue
            for ns in own | set(['minecraft']):
                tid = ns + ':' + const
                if tid in known_tables:
                    if ns == 'minecraft' and pk['kind'] == 'vanilla':
                        continue
                    roots[tid].append({'kind': 'class_const_path', 'detail': pk['id'] + ' ' + names[e[1]],
                                       'count': e[0], 'ns_const_in_same_class': ns in cpns.get(const, ())})
    known_tables = set(shipped) | set(k for k in roots if k)
    for pk, u in live:
        files = u.get('other_files') or []
        for s, e in (u.get('other_rl') or {}).items():
            if s in known_tables:
                for fi in e[1:]:
                    f = files[fi]
                    if oj_seen[s] >= 25:
                        break
                    if '/worldgen/processor_list/' in f and any(
                            r['kind'] == 'processor' for r in roots.get(s, ())):
                        continue
                    if '/loot_modifiers/' in f:
                        continue
                    oj_seen[s] += 1
                    roots[s].append({'kind': 'other_json', 'detail': pk['id'] + ':' + f, 'files': e[0]})
    # weakest class evidence: the table's LEAF name is a string constant in the jar family that ships it
    leaf_index = defaultdict(list)
    for tid in known_tables:
        ns, _, pth = tid.partition(':')
        if '/' in pth and not pth.startswith('blocks/') and not pth.startswith('entities/'):
            leaf_index[(ns, pth.rpartition('/')[2])].append(tid)
    for pk, u in units:
        cl = u.get('class_leaf') or {}
        if not cl or pk['kind'] == 'vanilla':
            continue
        names = u.get('class_names') or []
        for const, e in cl.items():
            for ns in u.get('fam_ns', []):
                for tid in leaf_index.get((ns, const), ()):
                    if any(r['kind'] in ('class_const', 'class_const_path') for r in roots.get(tid, ())):
                        continue
                    roots[tid].append({'kind': 'class_const_leaf', 'detail': pk['id'] + ' ' + names[e[1]],
                                       'count': e[0], 'leaf': const})
    vanilla_tables = set()
    for pk, u in live:
        if pk['kind'] == 'vanilla':
            vanilla_tables.update(u.get('loot_tables', {}))
    table_roots = {}
    root_stats = Counter()
    for tid in sorted(known_tables):
        rb = list(roots.get(tid, []))
        ns, _, p = tid.partition(':')
        nested_only_vanilla = False
        if tid in vanilla_tables:
            vb = {'kind': 'vanilla_builtin', 'detail': p.split('/')[0]}
            if tid in VANILLA_NESTED_ONLY:
                nested_only_vanilla = True
                vb['nested_only'] = True
                vb['note'] = ('vanilla code never rolls this table directly, it is only a child of '
                              'minecraft:gameplay/fishing (hard-coded vanilla knowledge, not derived from files)')
            rb.append(vb)
        if p.startswith('entities/'):
            eid = ns + ':' + p[9:]
            if eid in entities and '/' not in p[9:]:
                rb.append({'kind': 'entity_default', 'detail': eid, 'entity_evidence': sorted(entities[eid])})
        if p.startswith('blocks/'):
            rb.append({'kind': 'block_default', 'detail': ns + ':' + p[7:]})
        kinds = set(r['kind'] for r in rb)
        e = {'exists': tid in shipped, 'rolled_by': rb}
        eff = kinds - set(['glm_condition'])
        if nested_only_vanilla:
            eff = eff - set(['vanilla_builtin'])
        if 'nested_in' in kinds and eff <= set(['nested_in']):
            e['only_nested'] = True
            root_stats['only_nested'] += 1
        if not (kinds - set(['glm_condition'])):
            e['no_roll_evidence'] = True
            root_stats['no_evidence'] += 1
        if not e['exists']:
            root_stats['referenced_but_not_shipped'] += 1
        table_roots[tid] = e

    # ------------------------------------------------------------------ biome tags output
    biome_tags = {}
    for tag in sorted(used_btags):
        r = bresolve(tag)
        if r is not None:
            biome_tags[tag] = sorted(r[0])
    for tag in sorted(btag_defs):
        ns, _, p = tag.partition(':')
        if tag not in biome_tags and ns in ('forge', 'c') and (p.startswith('is_') or p.startswith('in_')):
            biome_tags[tag] = sorted(bresolve(tag)[0])

    # ------------------------------------------------------------------ stats
    lt_templates = [t for t, s in structures.items() if any(c.get('loot_table') for c in s['containers'])]
    missing_nbt = []
    for lt, c in nbt_ref.items():
        if lt not in shipped:
            tot = sum(c.values())
            bym = Counter()
            for tid, n in c.items():
                bym[structures[tid]['pack']] += n
            missing_nbt.append({'table': lt, 'count': tot, 'templates': len(c),
                                'reachable_templates': sum(1 for t in c if template_reach[t]['reachable']),
                                'referenced_by': [k for k, _ in bym.most_common(4)]})
    missing_nbt.sort(key=lambda x: (-x['count'], x['table']))
    nested_units = sum(1 for pk in packs if pk.get('nested'))
    stats = {
        'archives': {'vanilla': sum(1 for p in packs if p['kind'] == 'vanilla'),
                     'forge': sum(1 for p in packs if p['kind'] == 'forge'),
                     'mod_jars_top_level': sum(1 for p in packs if p['kind'] == 'mod' and not p.get('nested')),
                     'mod_jars_nested': nested_units,
                     'mod_jars_repo_copy': sum(1 for p in packs if p.get('repo_copy')),
                     'mod_jars_repo_copy_differs_from_instance': sum(
                         1 for p in packs if p.get('sha256_differs_from_instance')),
                     'paxi_zips': sum(1 for p in packs if p['kind'] == 'paxi'),
                     'classes_scanned': sum(u.get('class_n', 0) for _, u in units),
                     'cache_hits': cache_hits, 'scanned_now': len(tasks) - cache_hits},
        'mods': len(mods),
        'loot_tables': dict(total=len(loot_tables), **lt_stats),
        'loot_table_content_differs_by_pack_kind_pair': dict(sorted(diff_pairs.items())),
        'loot_tables_overridden_by_paxi_or_kubejs': overridden,
        'structures': {'templates': len(structures),
                       'with_loot_table_container': len(lt_templates),
                       'with_any_container': sum(1 for s in structures.values() if s['containers']),
                       'containers': sum(len(s['containers']) for s in structures.values()),
                       'containers_with_loot_table': sum(1 for s in structures.values() for c in s['containers']
                                                         if c.get('loot_table')),
                       'parse_errors': sum(1 for s in structures.values() if s.get('error')),
                       'reach_confidence': dict(reach_stats)},
        'nbt_tables_not_shipped': {'distinct': len(missing_nbt), 'top': missing_nbt[:60]},
        'forge_loot_modifiers': {'files': len(loot_modifiers),
                                 'active': sum(1 for v in loot_modifiers.values() if v['active']),
                                 'overridden_by_paxi_or_kubejs': sorted(
                                     k for k, v in loot_modifiers.items()
                                     if v.get('sources') and pack_by_id[v['pack']]['kind'] in ('paxi', 'kubejs_data'))},
        'template_pools': len(template_pools), 'worldgen_structures': len(wg),
        'worldgen_structures_in_no_set': sum(1 for s in wg.values() if not s['in_structure_sets']),
        'structure_sets': len(structure_sets), 'processor_loot': len(processor_loot),
        'table_roots': dict(total=len(table_roots), **root_stats),
        'biomes_known': len(known_biomes), 'biomes_with_dimension': len(biome_dims),
        'biomes_unknown_dimension': len(biome_unknown),
        'entities': len(entities), 'items': len(items), 'items_in_tsv': tsv_n, 'item_tags': len(item_tags),
    }

    truth = {
        'meta': {'scanner_version': SCANNER_VERSION, 'generated': time.strftime('%Y-%m-%dT%H:%M:%S'),
                 'mods_dir': args.mods, 'repo': repo, 'vanilla_jar': args.vanilla, 'forge_jar': args.forge,
                 'pack_order': 'vanilla(0) < forge(1) < all mod jars(2, no relative order) < paxi zips '
                               '(3.., unlisted zips first, then datapack_load_order.json order) < kubejs_data'},
        'stats': stats,
        'packs': packs,
        'mods': mods,
        'loot_tables': loot_tables,
        'structures': structures,
        'template_pools': template_pools,
        'processor_loot': processor_loot,
        'worldgen_structures': wg,
        'structure_sets': structure_sets,
        'dimensions': dimensions,
        'biome_tags': biome_tags,
        'biome_tags_missing': sorted(missing_btags),
        'biome_dimensions': biome_dims,
        'biome_dimension_evidence': {b: {d: sorted(ev) for d, ev in sorted(biome_dim_ev[b].items())}
                                     for b in sorted(biome_dim_ev)},
        'biome_dimensions_unknown': biome_unknown,
        'template_reach': template_reach,
        'table_roots': table_roots,
        'forge_loot_modifiers': loot_modifiers,
        'entities': {k: sorted(entities[k]) for k in sorted(entities)},
        'items': {k: sorted(items[k]) for k in sorted(items)},
        'item_tags': item_tags,
        'item_tag_members': item_tag_members,
        'item_tags_broken': item_tags_broken,
        'item_tags_unknown_required_members': item_tags_unknown_members,
        'paxi_drift': paxi_drift(repo, notes),
    }
    if biome_unknown:
        notes.add('biome_dimensions', '%d biome(s) have a worldgen/biome JSON but no dimension evidence (not in a '
                  'dimension JSON biome source nor in #minecraft:is_overworld/is_nether/is_end). Mod overworld / '
                  'nether biomes are normally injected in code (TerraBlender regions, BiomeManager), which this '
                  'scanner cannot see.' % len(biome_unknown))
    truth['notes'] = notes.dump()
    return truth


def scan_dir_unit(root, uid, prefix):
    u = new_unit(uid)
    if os.path.isdir(root):
        src = DirSrc(root, prefix)
        scan_unit_data(u, src)
    else:
        u['notes'].append('folder missing: ' + root)
    return u


def main():
    appdata = os.environ.get('APPDATA') or os.path.expanduser('~\\AppData\\Roaming')
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description='Loot-audit ground-truth scanner (jars, datapacks, kubejs/data).')
    ap.add_argument('--mods', default=os.path.join(appdata, 'PrismLauncher', 'instances', 'IridescentCraft',
                                                   '.minecraft', 'mods'))
    ap.add_argument('--repo', default=os.path.dirname(os.path.dirname(here)))
    ap.add_argument('--out', default=None)
    ap.add_argument('--no-cache', action='store_true', help='ignore (and rewrite) the per-archive cache')
    ap.add_argument('--vanilla', default=None, help='vanilla 1.20.1 client jar (auto-detected)')
    ap.add_argument('--forge', default=None, help='Forge universal jar (auto-detected from mmc-pack.json)')
    ap.add_argument('--libraries', default=os.path.join(appdata, 'PrismLauncher', 'libraries'))
    ap.add_argument('--jobs', type=int, default=0)
    ap.add_argument('--pretty', action='store_true', help='indent the output JSON')
    args = ap.parse_args()
    t0 = time.time()
    args.repo = os.path.abspath(args.repo)
    args.mods = os.path.abspath(args.mods)
    cache_dir = os.path.join(args.repo, 'dev', 'loot_audit', '.cache')
    if not args.out:
        args.out = os.path.join(cache_dir, 'truth.json')
    notes = Notes()
    if not args.vanilla:
        args.vanilla = find_vanilla_jar(args.libraries)
    if not args.forge:
        args.forge = find_forge_jar(args.libraries, args.repo)

    tasks = []
    if args.vanilla and os.path.isfile(args.vanilla):
        tasks.append({'kind': 'vanilla', 'id': 'vanilla', 'path': args.vanilla, 'classes': True, 'order': 0})
    else:
        notes.add('missing_inputs', 'vanilla 1.20.1 jar not found (searched %s)' % args.libraries)
    if args.forge and os.path.isfile(args.forge):
        tasks.append({'kind': 'forge', 'id': 'forge:' + os.path.basename(args.forge), 'path': args.forge,
                      'classes': True, 'order': 1})
    else:
        notes.add('missing_inputs', 'Forge universal jar not found: forge:* tags and Forge\'s vanilla loot-table '
                                    'overrides are missing from the result')
    repo_mods = os.path.join(args.repo, 'mods')
    repo_jars = set(f for f in os.listdir(repo_mods) if f.endswith('.jar')) if os.path.isdir(repo_mods) else set()
    inst_jars = set(f for f in os.listdir(args.mods) if f.endswith('.jar')) if os.path.isdir(args.mods) else set()
    if not inst_jars:
        notes.add('missing_inputs', 'no jars found in --mods %s' % args.mods)
    for f in sorted(inst_jars | repo_jars):
        t = {'kind': 'mod', 'id': 'mod:' + f, 'classes': True, 'order': 2}
        if f in repo_jars:
            t['path'] = os.path.join(repo_mods, f)
            t['repo_copy'] = True
            t['instance_sha256'] = file_sha256(os.path.join(args.mods, f)) if f in inst_jars else None
        else:
            t['path'] = os.path.join(args.mods, f)
        tasks.append(t)
    pdir = os.path.join(args.repo, 'config', 'paxi', 'datapacks')
    zips = sorted(f for f in os.listdir(pdir) if f.lower().endswith('.zip')) if os.path.isdir(pdir) else []
    order = []
    try:
        with open(os.path.join(args.repo, 'config', 'paxi', 'datapack_load_order.json'), 'r', encoding='utf-8') as f:
            lo = json.load(f).get('loadOrder', [])
        for z in lo:
            if z in zips and z not in order:
                order.append(z)
            elif z not in zips:
                notes.add('paxi', 'datapack_load_order.json lists %s but the zip does not exist' % z)
    except (OSError, ValueError) as e:
        notes.add('paxi', 'datapack_load_order.json not readable: %s' % e)
    # Unlisted zips load BELOW the listed ones (see the module docstring). Their order among
    # themselves is the world's saved pack order; pack-id order is the best offline guess.
    unlisted = sorted(z for z in zips if z not in order)
    if len(unlisted) > 1:
        notes.add('paxi', 'unlisted zips (below every listed zip; order among themselves assumed by id): %s'
                  % ', '.join(unlisted))
    order = unlisted + order
    if os.path.isdir(pdir):
        for d in sorted(os.listdir(pdir)):
            if os.path.isdir(os.path.join(pdir, d)):
                notes.add('paxi', 'folder datapack %s under config/paxi/datapacks is NOT scanned' % d)
    for i, z in enumerate(order):
        tasks.append({'kind': 'paxi', 'id': 'paxi:' + z, 'path': os.path.join(pdir, z), 'classes': False,
                      'order': 3 + i})
    kj_order = 3 + len(order)

    fams = {}
    todo = []
    hits = 0
    for t in tasks:
        rec = None if args.no_cache else cache_load(cache_dir, t)
        if rec is not None:
            fams[t['id']] = rec
            hits += 1
        else:
            t2 = dict(t)
            t2['cache_dir'] = cache_dir
            todo.append(t2)
    todo.sort(key=lambda t: -os.path.getsize(t['path']))
    jobs = args.jobs or max(1, min(16, (os.cpu_count() or 4) - 2))
    if todo:
        if jobs > 1 and len(todo) > 2:
            with multiprocessing.Pool(min(jobs, len(todo))) as pool:
                for rec in pool.imap_unordered(scan_family_cached, todo, chunksize=1):
                    fams[rec['task_id']] = rec
        else:
            for t in todo:
                rec = scan_family_cached(t)
                fams[rec['task_id']] = rec
    t_scan = time.time() - t0

    kj = []
    ku = scan_dir_unit(os.path.join(args.repo, 'kubejs', 'data'), 'kubejs_data', 'data/')
    kj.append(({'id': 'kubejs_data', 'kind': 'kubejs_data', 'order': kj_order,
                'path': os.path.join(args.repo, 'kubejs', 'data'), 'loads_data': True,
                'counts': {k: len(ku[k]) for k in ('loot_tables', 'structures', 'pools', 'item_tags') if ku.get(k)}},
               ku))
    ka = scan_dir_unit(os.path.join(args.repo, 'kubejs', 'assets'), 'kubejs_assets', 'assets/')
    kj.append(({'id': 'kubejs_assets', 'kind': 'kubejs_assets', 'order': kj_order + 1,
                'path': os.path.join(args.repo, 'kubejs', 'assets'), 'loads_data': False, 'counts': {}}, ka))

    truth = build_truth(args, fams, tasks, kj, t_scan, hits, notes)
    truth['meta']['elapsed_scan_s'] = round(t_scan, 1)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    tmp = args.out + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        if args.pretty:
            json.dump(truth, f, indent=1)
        else:
            json.dump(truth, f, separators=(',', ':'))
    os.replace(tmp, args.out)
    el = time.time() - t0
    s = truth['stats']
    a = s['archives']
    print('truth.py v%d -> %s (%.1f MB)' % (SCANNER_VERSION, args.out, os.path.getsize(args.out) / 1e6))
    print('archives: vanilla=%d forge=%d mod jars=%d (+%d nested, %d repo copies, %d differ from instance) '
          'paxi=%d | cache hits %d, scanned %d | classes %d'
          % (a['vanilla'], a['forge'], a['mod_jars_top_level'], a['mod_jars_nested'], a['mod_jars_repo_copy'],
             a['mod_jars_repo_copy_differs_from_instance'], a['paxi_zips'], a['cache_hits'], a['scanned_now'],
             a['classes_scanned']))
    print('mods=%d loot_tables=%d (invalid %d, lenient-only %d, empty %d) table_roots=%d (not shipped %d, '
          'only-nested %d, no evidence %d)'
          % (s['mods'], s['loot_tables']['total'], s['loot_tables'].get('invalid', 0),
             s['loot_tables'].get('lenient_only', 0), s['loot_tables'].get('empty', 0), s['table_roots']['total'],
             s['table_roots'].get('referenced_but_not_shipped', 0), s['table_roots'].get('only_nested', 0),
             s['table_roots'].get('no_evidence', 0)))
    st = s['structures']
    print('structures=%d (with LootTable container %d; containers %d, %d with LootTable; parse errors %d) '
          'reach=%s' % (st['templates'], st['with_loot_table_container'], st['containers'],
                        st['containers_with_loot_table'], st['parse_errors'],
                        json.dumps(st['reach_confidence'], sort_keys=True)))
    print('template_pools=%d worldgen_structures=%d (in no set: %d) structure_sets=%d processor_loot=%d '
          'nbt tables not shipped=%d' % (s['template_pools'], s['worldgen_structures'],
                                         s['worldgen_structures_in_no_set'], s['structure_sets'],
                                         s['processor_loot'], s['nbt_tables_not_shipped']['distinct']))
    print('biomes: known=%d with dimension=%d unknown=%d | entities=%d items=%d (tsv %d) item_tags=%d'
          % (s['biomes_known'], s['biomes_with_dimension'], s['biomes_unknown_dimension'], s['entities'],
             s['items'], s['items_in_tsv'], s['item_tags']))
    print('notes: %s' % ', '.join('%s=%d' % (k, v['count']) for k, v in truth['notes'].items()))
    print('elapsed: %.1fs (archive scan %.1fs, merge+write %.1fs)' % (el, t_scan, el - t_scan))
    return 0


if __name__ == '__main__':
    multiprocessing.freeze_support()
    sys.exit(main())
