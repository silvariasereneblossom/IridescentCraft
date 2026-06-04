#!/usr/bin/env python3
"""Generate the 16x16 gold Grand Compass item texture (pure stdlib, no Pillow).

A gold beveled ring, a dark bronze face, and a red(N)/white(S) needle. Writes
RGBA PNG via zlib+struct. Run: python3 gen_texture.py
"""
import zlib, struct, math, os

W = H = 16
CX = CY = 7.5

# palette (R,G,B,A)
CLEAR   = (0, 0, 0, 0)
GOLD_HI = (255, 224, 130, 255)
GOLD    = (224, 170, 60, 255)
GOLD_LO = (150, 110, 35, 255)
FACE    = (58, 46, 26, 255)
FACE_HI = (78, 62, 36, 255)
RED     = (200, 50, 45, 255)
WHITE   = (235, 235, 230, 255)
PIVOT   = (255, 224, 130, 255)


def px(x, y):
    dx, dy = x - CX, y - CY
    d = math.hypot(dx, dy)
    if d > 7.6:
        return CLEAR
    # outer ring (beveled: hi top-left, lo bottom-right)
    if d >= 5.8:
        if d >= 7.0:
            return GOLD_LO if (dx + dy) > 0 else GOLD
        return GOLD_HI if (dx + dy) < 0 else GOLD
    # needle: 2px-wide vertical bar through the centre, tapering
    if x in (7, 8) and 2.5 <= y <= 12.5:
        return RED if y < 7.5 else WHITE
    # a thin flanking diamond near the centre for a needle look
    if x in (6, 9) and 5.5 <= y <= 9.5:
        return RED if y < 7.5 else WHITE
    # pivot
    if d < 1.3:
        return PIVOT
    # face
    return FACE_HI if (dx + dy) < 0 else FACE


def main():
    raw = bytearray()
    for y in range(H):
        raw.append(0)  # filter type 0
        for x in range(W):
            raw.extend(px(x, y))

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))

    out = os.path.join(os.path.dirname(__file__), "..",
                       "src", "main", "resources", "assets",
                       "iridescent_grand_compass", "textures", "item", "grand_compass.png")
    out = os.path.abspath(out)
    with open(out, "wb") as f:
        f.write(png)
    print("wrote", out, "(" + str(len(png)) + " bytes)")


if __name__ == "__main__":
    main()
