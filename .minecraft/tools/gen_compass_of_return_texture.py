#!/usr/bin/env python3
"""Generate the bespoke 16x16 Compass of Return item texture (pure stdlib).

The Compass of Return is a KubeJS item (kubejs:compass_of_return -- a magic
mirror that teleports you to your last bed). Its texture is a KubeJS *asset*,
NOT a jar resource, and KubeJS assets are committed per-distro and are NOT
mirrored by sync-distros.ps1 -- so this writes the PNG into all THREE distro
kubejs/assets roots.

Art: a cool SILVER ring + deep-navy face + glowing azure compass-rose with a
white-hot gem at the pivot -- deliberately distinct from the warm GOLD,
red/white-needle Grand Compass (iridescent_grand_compass). Char-grid authored
with an automatic 1px dark outline, same approach as the relics roster's
gen_relic_textures.py. RGBA PNG written via zlib+struct.

Run from the repo root (or anywhere):  python3 .minecraft/tools/gen_compass_of_return_texture.py
"""
import os
import struct
import zlib
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
MC_ROOT = os.path.dirname(HERE)                      # .../.minecraft
REL = os.path.join("kubejs", "assets", "kubejs", "textures", "item",
                   "compass_of_return.png")
# all three committed distro roots
OUT_PATHS = [
    os.path.join(MC_ROOT, REL),                                  # client (PrismLauncher)
    os.path.join(MC_ROOT, "server_distribution", REL),           # dedicated server
    os.path.join(MC_ROOT, "distribution", "client", REL),        # packaged client
]

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
# the Compass of Return -- silver dial, azure compass-rose, glowing gem pivot
# chars: O outline, L silver-light, B silver-mid, D silver-dark, F navy face,
#        f face-sheen, C cyan rose (N + E/W), W white rose (S),
#        G gem glow, K gem core
# --------------------------------------------------------------------------- #
GRID = [
    "......LLLL......",
    "....LLLLBBDD....",
    "...LLLBBBBDDD...",
    "..LLBBFCCFBBDD..",
    "..LLBfFCCFFBDD..",
    ".LLBfFFCCFFFBDD.",
    ".LBfFFGGGGFFFBD.",
    ".LBFCCGKKGCCFBD.",
    ".LBFCCGKKGCCFBD.",
    ".LBfFFGGGGFFFBD.",
    ".LLBFFFWWFFFBDD.",
    "..LBFFFWWFFBDD..",
    "..LLBBFWWFBBDD..",
    "...BBBBBDDDDD...",
    "....BBDDDDDD....",
    "......DDDD......",
]

PALETTE = {
    "O": (16, 20, 40, 255),     # dark navy outline
    "L": (224, 230, 238, 255),  # silver highlight
    "B": (150, 162, 180, 255),  # silver mid
    "D": (92, 102, 120, 255),   # silver shadow
    "F": (24, 32, 58, 255),     # navy face
    "f": (40, 52, 88, 255),     # face sheen (upper-left)
    "C": (96, 214, 240, 255),   # azure rose (N + E/W arms)
    "W": (220, 234, 244, 255),  # south arm (white)
    "G": (150, 226, 250, 255),  # gem glow
    "K": (236, 250, 255, 255),  # gem core
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
    p = os.path.join(tempfile.gettempdir(), "compass_of_return_preview.png")
    write_png(p, out)
    return p


def main():
    px = render(GRID, PALETTE)
    for p in OUT_PATHS:
        write_png(p, px)
        print("wrote", p)
    print("preview", preview(px))


if __name__ == "__main__":
    main()
