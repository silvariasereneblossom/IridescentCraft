#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Write codex_fonts.json: the glyph advances the Codex is drawn with, read out of the game's own font files.

    python .minecraft/dev/codex/gen_font_widths.py [--prism <PrismLauncher folder>]

The fit check (codex_fit.py) measures every page with these numbers, so it never guesses a width. Run this again only
when the game version changes. It reads, from the launcher's library and asset stores (the files the client loads):

  - minecraft-1.20.1-client.jar: font/uniform.json, font/default.json, font/include/space.json, font/include/default.json,
    the bitmap sheets they name (textures/font/*.png), lang/en_us.json (the key names a $(k:...) prints);
  - the asset index 5.json, and through it font/include/unifont.json and font/unifont.zip (the unihex glyphs: the
    jar's own include/unifont.json is empty, the asset store's wins);
  - forge-1.20.1-47.4.6-universal.jar: lang/en_us.json (the "ALT + %s" a modifier key prints).

The rules, read from the 1.20.1 classes (javap and Vineflower, 2026-10-18):
  - unihex glyph (UnihexProvider$Glyph): advance = (right - left + 1) // 2 + 1, where left and right are the outermost
    inked columns of the 16 rows (an empty glyph: left 0, right = the glyph's bit width); size_overrides set left and
    right for their ranges; bold adds 0.5;
  - bitmap glyph (BitmapProvider): advance = int(0.5 + inked width * height / cell height) + 1, inked width = the
    rightmost column with alpha + 1; bold adds 1;
  - space provider: the advance it lists; bold adds 1 (GlyphInfo's default);
  - a font takes each code point from its first provider that has it.

Only code points below U+3000 are written (every Latin, Greek, Cyrillic, punctuation, arrow, math, box and symbol
block); the check names any character it has no width for.
"""
import argparse
import hashlib
import io
import json
import os
import sys
import zipfile
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'codex_fonts.json')
LIMIT = 0x3000
CLIENT = 'libraries/com/mojang/minecraft/1.20.1/minecraft-1.20.1-client.jar'
FORGE = 'libraries/net/minecraftforge/forge/1.20.1-47.4.6/forge-1.20.1-47.4.6-universal.jar'
INDEX = 'assets/indexes/5.json'


def sha1(b):
    return hashlib.sha1(b).hexdigest()


def asset(prism, index, name):
    h = index['objects'][name]['hash']
    with open(os.path.join(prism, 'assets', 'objects', h[:2], h), 'rb') as fh:
        data = fh.read()
    if sha1(data) != h:
        raise SystemExit('%s: the asset store copy does not match its hash %s' % (name, h))
    return data


def unihex_glyphs(hex_zip, overrides):
    """{code point: (advance, bold offset)} from the .hex files in unifont.zip"""
    out = {}
    with zipfile.ZipFile(io.BytesIO(hex_zip)) as z:
        for n in sorted(z.namelist()):
            if not n.endswith('.hex'):
                continue
            for line in z.read(n).decode('ascii').splitlines():
                if ':' not in line:
                    continue
                cp_s, bits = line.split(':', 1)
                cp = int(cp_s, 16)
                if cp >= LIMIT:
                    continue
                bit_width = {32: 8, 64: 16, 96: 24, 128: 32}[len(bits)]
                per_row = len(bits) // 16
                mask = 0
                for r in range(16):
                    row = int(bits[r * per_row:(r + 1) * per_row], 16)
                    mask |= (row << (32 - bit_width)) & 0xFFFFFFFF   # LineData.line(): the leftmost pixel is bit 31
                left, right = None, None
                for lo, hi, l, r in overrides:
                    if lo <= cp <= hi:
                        left, right = l, r
                if left is None:
                    if mask == 0:
                        left, right = 0, bit_width
                    else:
                        left = 32 - mask.bit_length()                  # Integer.numberOfLeadingZeros
                        right = 32 - ((mask & -mask).bit_length() - 1) - 1   # 32 - numberOfTrailingZeros - 1
                out[cp] = ((right - left + 1) // 2 + 1, 0.5)
    return out


def bitmap_glyphs(jar, provider):
    from PIL import Image
    path = 'assets/minecraft/textures/' + provider['file'].split(':', 1)[-1]
    img = Image.open(io.BytesIO(jar.read(path))).convert('RGBA')
    rows = provider['chars']
    cw, ch = img.width // len(rows[0]), img.height // len(rows)
    scale = float(provider.get('height', 8)) / ch
    px = img.load()
    out = {}
    for ry, row in enumerate(rows):
        for cx, c in enumerate(row):
            cp = ord(c)
            if cp == 0 or cp >= LIMIT:
                continue
            inked = 0
            for x in range(cw - 1, -1, -1):
                if any(px[cx * cw + x, ry * ch + y][3] != 0 for y in range(ch)):
                    inked = x + 1
                    break
            out.setdefault(cp, (int(0.5 + inked * scale) + 1, 1.0))
    return out


def font_table(jar, prism, index, font):
    """the advances of one font (minecraft:<font>) in provider order"""
    providers = json.loads(jar.read('assets/minecraft/font/%s.json' % font))['providers']
    table = {}

    def walk(provs):
        for p in provs:
            if p['type'] == 'reference':
                ref = p['id'].split(':', 1)[-1]
                if ref == 'include/unifont':
                    data = json.loads(asset(prism, index, 'minecraft/font/include/unifont.json'))
                else:
                    data = json.loads(jar.read('assets/minecraft/font/%s.json' % ref))
                walk(data['providers'])
            elif p['type'] == 'space':
                for c, adv in p['advances'].items():
                    table.setdefault(ord(c), (float(adv), 1.0))
            elif p['type'] == 'bitmap':
                for cp, v in bitmap_glyphs(jar, p).items():
                    table.setdefault(cp, v)
            elif p['type'] == 'unihex':
                overrides = [(ord(o['from']), ord(o['to']), o['left'], o['right']) for o in p.get('size_overrides', [])]
                for cp, v in unihex_glyphs(asset(prism, index, 'minecraft/font/unifont.zip'), overrides).items():
                    table.setdefault(cp, v)
            else:
                raise SystemExit('font %s: provider type %s is not handled' % (font, p['type']))
    walk(providers)
    return table


DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'


def encode(table):
    """one character per code point below LIMIT, 64 to a line: the advance in base 36, '.' for none; and the bold
    offsets as runs [first, last, offset]"""
    chars, bold, cur = [], [], None
    for cp in range(LIMIT):
        if cp not in table:
            chars.append('.')
            continue
        adv, b = table[cp]
        if adv != int(adv) or not 0 <= adv < 36:
            raise SystemExit('U+%04X: advance %s does not fit one base-36 digit' % (cp, adv))
        chars.append(DIGITS[int(adv)])
        if cur and cur[1] == cp - 1 and cur[2] == b:
            cur[1] = cp
        else:
            cur = [cp, cp, b]
            bold.append(cur)
    lines = [''.join(chars[i:i + 64]) for i in range(0, LIMIT, 64)]
    return OrderedDict([('advances', lines), ('bold', bold)])


def main():
    default_prism = os.path.join(os.environ.get('APPDATA', ''), 'PrismLauncher')
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--prism', default=default_prism, help='the PrismLauncher folder (libraries/, assets/)')
    ap.add_argument('--out', default=OUT)
    args = ap.parse_args()
    with open(os.path.join(args.prism, INDEX), 'rb') as fh:
        index_raw = fh.read()
    index = json.loads(index_raw)
    with open(os.path.join(args.prism, CLIENT), 'rb') as fh:
        client_raw = fh.read()
    with open(os.path.join(args.prism, FORGE), 'rb') as fh:
        forge_raw = fh.read()
    jar = zipfile.ZipFile(io.BytesIO(client_raw))
    forge = zipfile.ZipFile(io.BytesIO(forge_raw))
    lang = {}
    for src in (json.loads(jar.read('assets/minecraft/lang/en_us.json').decode('utf-8')),
                json.loads(forge.read('assets/forge/lang/en_us.json').decode('utf-8'))):
        for k, v in src.items():
            if k.startswith(('key.keyboard.', 'key.mouse', 'forge.controlsgui.')):
                lang[k] = v
    out = OrderedDict()
    out['_about'] = ('Generated by gen_font_widths.py from the 1.20.1 client font files; read by codex_fit.py. '
                     '"advances": one base-36 digit per code point from U+0000, 64 to a line, "." = no glyph; '
                     '"bold": [first, last, offset added when bold]. Do not edit: run the generator.')
    out['sources'] = OrderedDict([
        (CLIENT, sha1(client_raw)), (FORGE, sha1(forge_raw)), (INDEX, sha1(index_raw)),
        ('minecraft/font/include/unifont.json', index['objects']['minecraft/font/include/unifont.json']['hash']),
        ('minecraft/font/unifont.zip', index['objects']['minecraft/font/unifont.zip']['hash'])])
    out['limit'] = LIMIT
    for font in ('uniform', 'default'):
        t = font_table(jar, args.prism, index, font)
        out[font] = encode(t)
        print('[fonts] minecraft:%s: %d code points (a %s, i %s, m %s, space %s)'
              % (font, len(t), t[ord('a')][0], t[ord('i')][0], t[ord('m')][0], t[32][0]))
    out['lang'] = OrderedDict(sorted(lang.items()))
    with open(args.out, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(json.dumps(out, ensure_ascii=True, indent=1) + '\n')
    print('[fonts] wrote %s' % os.path.relpath(args.out))
    return 0


if __name__ == '__main__':
    sys.exit(main())
