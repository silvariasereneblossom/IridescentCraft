#!/usr/bin/env python3
"""Generate the bespoke 16x16 item textures for the Iridescent Relics roster.

Pure-stdlib (zlib + struct) PNG writer -- no Pillow dependency. Each relic is
authored as a 16-row character grid + a per-relic palette; the silhouette is
drawn from the grid and a 1px dark outline is added automatically around the
shape (any transparent pixel 8-adjacent to a filled pixel becomes the outline
colour). Output: assets/iridescent_relics/textures/item/<relic>.png plus a
scaled checker-backed montage (tools/_preview.png) for visual review.

Run from anywhere:  python tools/gen_relic_textures.py
"""
import os
import struct
import zlib
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
MOD_ROOT = os.path.dirname(HERE)
TEX_DIR = os.path.join(MOD_ROOT, "src", "main", "resources", "assets",
                       "iridescent_relics", "textures", "item")

SIZE = 16


# --------------------------------------------------------------------------- #
# minimal RGBA PNG writer
# --------------------------------------------------------------------------- #
def write_png(path, pixels):
    """pixels: SIZE rows of SIZE (r,g,b,a) tuples."""
    h = len(pixels)
    w = len(pixels[0])
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filter type 0 (none)
        for (r, g, b, a) in row:
            raw += bytes((r, g, b, a))

    def chunk(typ, data):
        body = typ + data
        return (struct.pack(">I", len(data)) + body +
                struct.pack(">I", zlib.crc32(body) & 0xffffffff))

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        f.write(chunk(b"IEND", b""))


# --------------------------------------------------------------------------- #
# sprite rendering (grid -> pixels, with auto outline)
# --------------------------------------------------------------------------- #
TRANSPARENT = (0, 0, 0, 0)


def render(grid, palette):
    assert len(grid) <= SIZE, "too many rows"
    g = [row.ljust(SIZE, ".")[:SIZE] for row in grid]
    while len(g) < SIZE:
        g.append("." * SIZE)
    px = [[TRANSPARENT for _ in range(SIZE)] for _ in range(SIZE)]
    filled = [[False] * SIZE for _ in range(SIZE)]
    for y in range(SIZE):
        for x in range(SIZE):
            ch = g[y][x]
            if ch in (".", " "):
                continue
            col = palette[ch]
            px[y][x] = col
            filled[y][x] = True
    # exterior flood fill (4-conn from the border, through non-filled cells) so
    # fully-enclosed holes stay transparent and are never outlined.
    outside = [[False] * SIZE for _ in range(SIZE)]
    dq = deque()
    for y in range(SIZE):
        for x in range(SIZE):
            if (x in (0, SIZE - 1) or y in (0, SIZE - 1)) and not filled[y][x] \
                    and not outside[y][x]:
                outside[y][x] = True
                dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < SIZE and 0 <= nx < SIZE and not filled[ny][nx] \
                    and not outside[ny][nx]:
                outside[ny][nx] = True
                dq.append((ny, nx))
    # auto outline: an EXTERIOR transparent pixel 8-adjacent to fill -> outline
    outline = palette["O"]
    for y in range(SIZE):
        for x in range(SIZE):
            if filled[y][x] or not outside[y][x]:
                continue
            touch = False
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dy == 0 and dx == 0:
                        continue
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < SIZE and 0 <= nx < SIZE and filled[ny][nx]:
                        touch = True
                        break
                if touch:
                    break
            if touch:
                px[y][x] = outline
    return px


# --------------------------------------------------------------------------- #
# the roster -- grids + palettes
# chars: O outline, B base, D dark shade, L light, G glow-bright, g glow-dim,
#        K extra (pupil etc).  '.' / ' ' = transparent.
# --------------------------------------------------------------------------- #
RELICS = {}

# 1. Relic of the Remnant -- sandstone heart, warm amber core
RELICS["remnant_relic"] = (
    [
        "................",
        "................",
        "...LL....LL.....",
        "..LBBL..LBBL....",
        ".LBBBBLLBBBBD...",
        ".LBBBBBBBBBBD...",
        ".LBBBgGgBBBBD...",
        ".DBBBgGGgBBBD...",
        "..DBBBgGgBBD....",
        "..DBBBBgBBBD....",
        "...DBBBBBBD.....",
        "....DBBBBD......",
        ".....DBBD.......",
        "......DD........",
        "................",
        "................",
    ],
    {
        "O": (58, 36, 16, 255),
        "B": (216, 198, 144, 255),
        "D": (170, 150, 92, 255),
        "L": (240, 228, 188, 255),
        "g": (240, 168, 70, 255),
        "G": (255, 226, 140, 255),
    },
)

# 2. Frostmaw's Frozen Heart -- icy crystal shard
RELICS["frostmaw_heart"] = (
    [
        "................",
        ".......G........",
        "......LBD.......",
        ".....LBGBD......",
        "....LBBGBBD.....",
        "...LBBBGBBBD....",
        "..LBBBGGGBBBD...",
        "..DBBBBGBBBBD...",
        "...DBBBGBBBD....",
        "....DBBGBBD.....",
        ".....DBGBD......",
        "......DBD.......",
        ".......D........",
        "................",
        "................",
        "................",
    ],
    {
        "O": (28, 58, 92, 255),
        "B": (126, 196, 232, 255),
        "D": (74, 140, 192, 255),
        "L": (206, 240, 255, 255),
        "G": (236, 252, 255, 255),
    },
)

# 3. Ironheart Cog -- iron gear with furnace-glow core
RELICS["ironheart_cog"] = (
    [
        "................",
        "....L..LL..L....",
        "....LBBBBBBL....",
        ".L..LBBBBBBL..L.",
        ".LBBBBDDDDBBBBL.",
        ".LBBBDGGGGDBBBL.",
        "..BBDGGGGGGDBB..",
        "LBBBDGGKKGGDBBBL",
        "LBBBDGGKKGGDBBBL",
        "..BBDGGGGGGDBB..",
        ".LBBBDGGGGDBBBL.",
        ".LBBBBDDDDBBBBL.",
        ".L..LBBBBBBL..L.",
        "....LBBBBBBL....",
        "....L..LL..L....",
        "................",
    ],
    {
        "O": (38, 38, 44, 255),
        "B": (150, 150, 158, 255),
        "D": (92, 92, 100, 255),
        "L": (200, 200, 208, 255),
        "G": (240, 150, 60, 255),
        "K": (255, 206, 120, 255),
    },
)

# 4. Sunfeather Charm -- golden plume: tapered vane + midrib + bare quill
RELICS["sunfeather_charm"] = (
    [
        "........G.......",
        ".......GLG......",
        "......GLKLG.....",
        "......LBKBD.....",
        ".....LBBKBD.....",
        ".....LBKKBD.....",
        "....LBBKBBD.....",
        "....LBKKKBD.....",
        "....LBBKBBD.....",
        ".....LBKBBD.....",
        ".....LBKBD......",
        "......LKBD......",
        "......LKD.......",
        "......LK........",
        ".....LK.........",
        "....LK..........",
    ],
    {
        "O": (120, 80, 16, 255),
        "B": (255, 208, 72, 255),
        "D": (206, 156, 38, 255),
        "L": (255, 242, 168, 255),
        "K": (236, 184, 60, 255),
        "G": (255, 250, 210, 255),
    },
)

# 5. Lich's Phylactery Shard -- twilight purple shard, green soul glow
RELICS["phylactery_shard"] = (
    [
        ".........LD.....",
        "........LBBD....",
        ".......LBGBD....",
        "......LBGGBD....",
        ".....LBGGGBD....",
        "....LBGGGgBD....",
        "...LBGGGgBD.....",
        "...DBGGgBD......",
        "..DBGGgBD.......",
        "..DBGgBD........",
        ".DBGgBD.........",
        ".DBgBD..........",
        "DBgBD...........",
        "DBBD............",
        "DD..............",
        "................",
    ],
    {
        "O": (40, 24, 56, 255),
        "B": (126, 86, 170, 255),
        "D": (84, 52, 120, 255),
        "L": (182, 150, 216, 255),
        "G": (150, 244, 158, 255),
        "g": (92, 198, 120, 255),
    },
)

# 6. Leviathan's Pearl -- deep teal pearl with sheen
RELICS["leviathans_pearl"] = (
    [
        "................",
        "....BBBBBB......",
        "..BBBBBBBBBB....",
        ".BBBBBBBBBBBB...",
        ".BBLLBBBBBBDB...",
        "BBLLLBBBBBBDDB..",
        "BBLLBBBBBBBDDB..",
        "BBBBBBBBBBBDDB..",
        "BBBBBBBBBBDDDB..",
        "BBBBBBBBBBDDDB..",
        ".BBBBBBBBDDDB...",
        ".BBBBBBBDDDDB...",
        "..BBBBDDDDDB....",
        "....BBDDDD......",
        "................",
        "................",
    ],
    {
        "O": (16, 48, 56, 255),
        "B": (74, 156, 162, 255),
        "D": (40, 104, 116, 255),
        "L": (216, 248, 248, 255),
    },
)

# 7. Cursed Sigil of Pride -- dark brand disc, crimson glyph
RELICS["cursed_sigil_pride"] = (
    [
        "................",
        ".....LLLL.......",
        "...LLBBBBLL.....",
        "..LBBBgBBBBL....",
        ".LBBBgGgBBBBL...",
        ".LBBgGgGgBBBL...",
        ".LBgGgBgGgBBL...",
        "LBBgGGGGGgBBBL..",
        "LBBgGgBgGgBBBL..",
        ".LBBgGgGgBBBL...",
        ".LBBBgGgBBBBL...",
        ".LBBBBgBBBBL....",
        "..LBBBBBBBL.....",
        "...LLBBBBLL.....",
        ".....LLLL.......",
        "................",
    ],
    {
        "O": (18, 10, 12, 255),
        "B": (58, 50, 54, 255),
        "L": (96, 86, 92, 255),
        "g": (168, 30, 36, 255),
        "G": (242, 76, 60, 255),
    },
)

# 8. Dragon's Eye -- ender almond eye, magenta iris, vertical slit pupil
RELICS["dragons_eye"] = (
    [
        "................",
        "................",
        "......DDDD......",
        "....DDBBBBDD....",
        "..DDBBgGGgBBDD..",
        ".DBBgGGKKGGgBBD.",
        "DBBgGGGKKGGGgBBD",
        "DBBgGGGKKGGGgBBD",
        ".DBBgGGKKGGgBBD.",
        "..DDBBgGGgBBDD..",
        "....DDBBBBDD....",
        "......DDDD......",
        "................",
        "................",
        "................",
        "................",
    ],
    {
        "O": (24, 12, 32, 255),
        "B": (62, 42, 82, 255),
        "D": (40, 26, 56, 255),
        "g": (150, 52, 150, 255),
        "G": (216, 74, 204, 255),
        "K": (14, 8, 18, 255),
    },
)


# fixed display order for the montage / reporting
ORDER = [
    "remnant_relic", "frostmaw_heart", "ironheart_cog", "sunfeather_charm",
    "phylactery_shard", "leviathans_pearl", "cursed_sigil_pride", "dragons_eye",
]


def build_all():
    os.makedirs(TEX_DIR, exist_ok=True)
    rendered = {}
    for name, (grid, pal) in RELICS.items():
        px = render(grid, pal)
        rendered[name] = px
        write_png(os.path.join(TEX_DIR, name + ".png"), px)
    return rendered


def montage(rendered, scale=14, cols=4, pad=12):
    rows = (len(ORDER) + cols - 1) // cols
    cell = SIZE * scale
    W = cols * cell + (cols + 1) * pad
    H = rows * cell + (rows + 1) * pad
    bg = (44, 46, 52, 255)
    ck1 = (96, 98, 104, 255)
    ck2 = (120, 122, 128, 255)
    canvas = [[bg for _ in range(W)] for _ in range(H)]
    for i, name in enumerate(ORDER):
        cx = pad + (i % cols) * (cell + pad)
        cy = pad + (i // cols) * (cell + pad)
        sp = rendered[name]
        for yy in range(cell):
            for xx in range(cell):
                sx, sy = xx // scale, yy // scale
                r, g, b, a = sp[sy][sx]
                px = (cx + xx, cy + yy)
                if a > 0:
                    canvas[px[1]][px[0]] = (r, g, b, 255)
                else:
                    checker = ck1 if ((xx // scale) + (yy // scale)) % 2 == 0 else ck2
                    canvas[px[1]][px[0]] = checker
    out = os.path.join(HERE, "_preview.png")
    # write arbitrary-size png (reuse writer with generic dims)
    h = len(canvas)
    w = len(canvas[0])
    raw = bytearray()
    for row in canvas:
        raw.append(0)
        for (r, g, b, a) in row:
            raw += bytes((r, g, b, a))

    def chunk(typ, data):
        body = typ + data
        return (struct.pack(">I", len(data)) + body +
                struct.pack(">I", zlib.crc32(body) & 0xffffffff))

    with open(out, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        f.write(chunk(b"IEND", b""))
    return out


if __name__ == "__main__":
    r = build_all()
    p = montage(r)
    print("wrote %d textures to %s" % (len(r), TEX_DIR))
    print("montage: %s  (order: %s)" % (p, ", ".join(ORDER)))
