# -*- coding: utf-8 -*-
"""Build iridescent_codex_data.jar from the Codex source, the same bytes on every machine.

The jar = META-INF/mods.toml + a fixed MANIFEST.MF + pack.mcmeta + the compiled @Mod class (committed:
datapack_sources/iridescent_codex/classes/, made from src/ by build_codex.sh when the Java changes) + the book:
data/icraft/patchouli_books/iridescent_codex/book.json and the content tree twice, under data/ and assets/
(Patchouli 1.20.1-85 reads book.json from data/ and the content only from assets/; validate_codex.py checks that
the two copies match byte for byte). Every content file is rendered (codex_render: placeholders filled, generated
pages written), styled (style_codex.py: page titles in italics) and written as JSON in one fixed form.

Deterministic on purpose: entries sorted, a fixed date, stored (not deflated: no zlib version can change a byte),
no extra fields. So "the committed jar is current" is one hash compare, and a release changes the jar's hash only
when the book changed.
"""
import os
import struct
import sys
import zlib
from collections import OrderedDict

import codex_render

SOURCE = 'datapack_sources/iridescent_codex'
BOOK = 'data/icraft/patchouli_books/iridescent_codex'
ASSETS = 'assets/icraft/patchouli_books/iridescent_codex'
CLASS = 'classes/com/iridescentcraft/codex/IridescentCodex.class'
JAR_NAME = 'iridescent_codex_data.jar'
DISTROS = ('mods', 'server_distribution/mods', 'distribution/client/mods')
MANIFESTS = ('custom_jars_manifest.json', 'server_distribution/custom_jars_manifest.json',
             'distribution/client/custom_jars_manifest.json')
MARKER = 'iridescent-codex.pw.toml'
MANIFEST_MF = b'Manifest-Version: 1.0\r\nCreated-By: IridescentCraft dev/codex/codex_jar.py\r\n\r\n'
DOS_DATE = (2000 - 1980) << 9 | 1 << 5 | 1          # 2000-01-01
DOS_TIME = 0


class BuildError(Exception):
    pass


def _style():
    """style_codex lives beside the book source; import it without leaving a __pycache__ there."""
    sys.dont_write_bytecode = True
    here = os.path.dirname(os.path.abspath(__file__))
    src = os.path.join(os.path.dirname(os.path.dirname(here)), SOURCE)
    if src not in sys.path:
        sys.path.insert(0, src)
    import style_codex
    return style_codex


def _read(path):
    with open(path, 'rb') as fh:
        return fh.read()


def _json(path, rel):
    import json
    try:
        return json.loads(_read(path).decode('utf-8-sig'), object_pairs_hook=OrderedDict)
    except (UnicodeDecodeError, ValueError) as e:
        raise BuildError('%s: not valid JSON (%s)' % (rel, e))


def book_files(mc, facts):
    """{path inside the jar: bytes} for the book: rendered, styled, in one JSON form. Raises RenderError/BuildError."""
    style = _style()
    src = os.path.join(mc, SOURCE, BOOK)
    if not os.path.isdir(src):
        raise BuildError('%s/%s: the Codex source is missing' % (SOURCE, BOOK))
    out = OrderedDict()
    book_json = os.path.join(src, 'book.json')
    rel = '%s/%s/book.json' % (SOURCE, BOOK)
    out[BOOK + '/book.json'] = _dump(style, codex_render.render_entry(facts, _json(book_json, rel), rel))
    for root, dirs, files in os.walk(src):
        dirs.sort()
        for fn in sorted(files):
            path = os.path.join(root, fn)
            inner = os.path.relpath(path, src).replace(os.sep, '/')
            if inner == 'book.json':
                continue
            rel = '%s/%s/%s' % (SOURCE, BOOK, inner)
            if not fn.endswith('.json'):
                out[BOOK + '/' + inner] = _read(path)       # validate_codex.py names a non-JSON file
                continue
            data = codex_render.render_entry(facts, _json(path, rel), entry_label(inner))
            if '/entries/' in '/' + inner:
                style.style_entry(data)
            out[BOOK + '/' + inner] = _dump(style, data)
    for path in list(out):
        if path != BOOK + '/book.json':
            out[ASSETS + path[len(BOOK):]] = out[path]
    return out


def entry_label(inner):
    """en_us/entries/bosses/t1_bosses.json -> icraft:bosses/t1_bosses (what Patchouli and the messages call it)"""
    parts = inner.split('/')
    if len(parts) >= 3 and parts[1] in ('entries', 'categories', 'templates'):
        name = '/'.join(parts[2:])[:-5] if inner.endswith('.json') else '/'.join(parts[2:])
        return ('icraft:%s' % name) if parts[1] == 'entries' else ('%s icraft:%s' % (parts[1][:-1], name))
    return inner


def _dump(style, data):
    return codex_render.dump(data).replace(style.SECTION, '\\u00a7').encode('utf-8')


def jar_files(mc, facts):
    """{path: bytes} of the whole jar, without directory entries."""
    base = os.path.join(mc, SOURCE)
    for need in ('META-INF/mods.toml', 'pack.mcmeta', CLASS):
        if not os.path.isfile(os.path.join(base, need)):
            raise BuildError('%s/%s is missing' % (SOURCE, need))
    files = OrderedDict()
    files['META-INF/MANIFEST.MF'] = MANIFEST_MF
    files['META-INF/mods.toml'] = _read(os.path.join(base, 'META-INF/mods.toml'))
    files['pack.mcmeta'] = _read(os.path.join(base, 'pack.mcmeta'))
    files['com/iridescentcraft/codex/IridescentCodex.class'] = _read(os.path.join(base, CLASS))
    files.update(book_files(mc, facts))
    return files


def zip_bytes(files):
    """A stored zip of {path: bytes}, with a directory entry for every folder, sorted, fixed date, no extras."""
    names = set(files)
    for p in files:
        parts = p.split('/')[:-1]
        for i in range(1, len(parts) + 1):
            names.add('/'.join(parts[:i]) + '/')
    order = sorted(names, key=lambda n: (n != 'META-INF/', n != 'META-INF/MANIFEST.MF', n))
    body, central = bytearray(), bytearray()
    for n in order:
        data = b'' if n.endswith('/') else files[n]
        name = n.encode('utf-8')
        crc = zlib.crc32(data) & 0xffffffff
        offset = len(body)
        body += struct.pack('<IHHHHHIIIHH', 0x04034b50, 10, 0, 0, DOS_TIME, DOS_DATE, crc, len(data), len(data),
                            len(name), 0)
        body += name + data
        attr = 0x10 if n.endswith('/') else 0
        central += struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 10, 10, 0, 0, DOS_TIME, DOS_DATE, crc, len(data),
                               len(data), len(name), 0, 0, 0, 0, attr, offset)
        central += name
    end = struct.pack('<IHHHHIIH', 0x06054b50, 0, 0, len(order), len(order), len(central), len(body), 0)
    return bytes(body + central + end)


def build(mc, facts):
    return zip_bytes(jar_files(mc, facts))
