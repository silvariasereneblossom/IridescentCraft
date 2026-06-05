#!/usr/bin/env python3
"""Generate the bespoke 16x16 Grand Compass item texture (pure stdlib, no Pillow).

Char-grid authored sprite (same approach as the relics roster's
gen_relic_textures.py): a beveled GOLD ring, a dark bronze face with an
upper-left sheen, a red(N)/white(S) diamond needle and a bright gold pivot. A
1px dark outline is added automatically around the silhouette. RGBA PNG written
via zlib+struct.

Run from anywhere:  python3 tools/gen_texture.py
"""
import os
import struct
import zlib
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
MOD_ROOT = os.path.dirname(HERE)
TEX = os.path.join(MOD_ROOT, "src", "main", "resources", "assets",
                   "iridescent_grand_compass", "textures", "item",
                   "grand_compass.png")

SIZE = 16
TRANSPARENT = (0, 0, 0, 0)


# --------------------------------------------------------------------------- #
# minimal RGBA PNG writer
# --------------------------------------------------------------------------- #
def write_png(path, pixels):
    """pixels: rows of (r,g,b,a) tuples (any rectangular size)."""
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

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        f.write(chunk(b"IEND", b""))


# --------------------------------------------------------------------------- #
# sprite rendering (grid -> pixels, with auto exterior outline)
# --------------------------------------------------------------------------- #
def render(grid, palette):
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
            px[y][x] = palette[ch]
            filled[y][x] = True
    # exterior flood fill (4-conn from the border) so enclosed holes stay clean
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
            touch = any(
                0 <= y + dy < SIZE and 0 <= x + dx < SIZE and filled[y + dy][x + dx]
                for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy or dx))
            if touch:
                px[y][x] = outline
    return px


# --------------------------------------------------------------------------- #
# the Grand Compass -- ornate gold dial, red/white diamond needle
# chars: O outline, L gold-light, B gold-mid, D gold-dark, F face, f face-sheen,
#        R red needle (N), W white needle (S), P bright pivot
# --------------------------------------------------------------------------- #
GRID = [
    "......LLLL......",
    "....LLLLBBDD....",
    "...LLLBBBBDDD...",
    "..LLBBFRRFBBDD..",
    "..LLBfFRRFFBDD..",
    ".LLBfFRRRRFFBDD.",
    ".LBffFRRRRFFFBD.",
    ".LBfFFRPPRFFFBD.",
    ".LBFFFWPPWFFFBD.",
    ".LBFFFWWWWFFFBD.",
    ".LLBFFWWWWFFBDD.",
    "..LBFFFWWFFBDD..",
    "..LLBBFWWFBBDD..",
    "...BBBBBDDDDD...",
    "....BBDDDDDD....",
    "......DDDD......",
]

PALETTE = {
    "O": (54, 34, 14, 255),     # dark brown outline
    "L": (255, 236, 150, 255),  # gold highlight
    "B": (228, 176, 66, 255),   # gold mid
    "D": (158, 116, 40, 255),   # gold shadow
    "F": (44, 34, 22, 255),     # bronze face
    "f": (70, 56, 34, 255),     # face sheen (upper-left)
    "R": (210, 54, 46, 255),    # north needle (red)
    "W": (240, 240, 234, 255),  # south needle (white)
    "P": (255, 244, 176, 255),  # pivot
}


def preview(px, scale=16):
    """Write a scaled, checker-backed PNG to TEMP for visual review."""
    import tempfile
    ck1, ck2 = (90, 92, 98, 255), (120, 122, 128, 255)
    out = [[None] * (SIZE * scale) for _ in range(SIZE * scale)]
    for yy in range(SIZE * scale):
        for xx in range(SIZE * scale):
            r, g, b, a = px[yy // scale][xx // scale]
            if a > 0:
                out[yy][xx] = (r, g, b, 255)
            else:
                out[yy][xx] = ck1 if ((xx // scale) + (yy // scale)) % 2 == 0 else ck2
    p = os.path.join(tempfile.gettempdir(), "grand_compass_preview.png")
    write_png(p, out)
    return p


def main():
    px = render(GRID, PALETTE)
    write_png(TEX, px)
    print("wrote", TEX)
    print("preview", preview(px))


if __name__ == "__main__":
    main()
