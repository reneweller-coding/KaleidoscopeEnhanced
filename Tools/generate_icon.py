# generate_icon.py — regenerates icon.png / icon.ico from scratch.
#
# The mark is built the same way the app itself builds a kaleidoscope image:
# draw one wedge motif, then mirror/rotate it radially around a centre. Two
# concentric rings of cut-glass facets (10-fold, cool cyan/violet inner ring
# + warm pink/orange outer ring, offset by half a facet) rather than smooth
# petals, since sharp triangular cells read as "kaleidoscope" at a glance
# where a soft flower shape reads as a generic mandala/flower icon instead.
#
# The 16px ICO frame uses a SEPARATE, simpler single-ring rendering (same
# 4-colour family) rather than a naive downsample of the two-ring design —
# two thin concentric rings blur into a smudge at 16px; one ring of facets
# stays legible. This is the standard "hand-tune the smallest icon frame"
# practice, not a shortcut.
#
# Usage:  python Tools\generate_icon.py
# Requires: Pillow (already used elsewhere in this repo's Python tooling).
import math
import struct
import io
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SIZE = 1024
CX = CY = SIZE / 2


def hx(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def facet_ring(n_fold, inner_r, outer_r, palette):
    """One ring of n_fold triangular facets (a trapezoid cell each) between
    inner_r and outer_r, cycling through `palette`, every other facet
    lightened -- like cut glass catching light differently cell to cell."""
    layer = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    step = 360.0 / n_fold
    for i in range(n_fold):
        a0, a1 = math.radians(step * i), math.radians(step * (i + 1))
        p0 = (CX + inner_r * math.cos(a0), CY + inner_r * math.sin(a0))
        p1 = (CX + outer_r * math.cos(a0), CY + outer_r * math.sin(a0))
        p2 = (CX + outer_r * math.cos(a1), CY + outer_r * math.sin(a1))
        p3 = (CX + inner_r * math.cos(a1), CY + inner_r * math.sin(a1))
        base = palette[i % len(palette)]
        light = tuple(min(255, int(c + (255 - c) * 0.28)) for c in base)
        col = base if i % 2 == 0 else light
        d.polygon([p0, p1, p2, p3], fill=col + (255,),
                  outline=(10, 6, 20, 140), width=2)
    return layer


def build(n_fold, palettes, rings, bg, glow, rot_per_ring=0.0):
    canvas = Image.alpha_composite(
        Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0)),
        Image.new('RGBA', (SIZE, SIZE), bg))
    g = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    gr = SIZE * 0.30
    ImageDraw.Draw(g).ellipse([CX - gr, CY - gr, CX + gr, CY + gr], fill=glow)
    canvas = Image.alpha_composite(canvas, g.filter(ImageFilter.GaussianBlur(SIZE * 0.09)))

    for ridx, (inner_frac, outer_frac) in enumerate(rings):
        ring = facet_ring(n_fold, SIZE * inner_frac, SIZE * outer_frac,
                           palettes[ridx % len(palettes)])
        if rot_per_ring:
            ring = ring.rotate(rot_per_ring * ridx, resample=Image.BICUBIC, center=(CX, CY))
        canvas = Image.alpha_composite(canvas, ring)

    rim = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    rr = SIZE * rings[-1][1] * 1.005
    ImageDraw.Draw(rim).ellipse([CX - rr, CY - rr, CX + rr, CY + rr],
                                 outline=(255, 255, 255, 90), width=int(SIZE * 0.008))
    canvas = Image.alpha_composite(canvas, rim)

    hub = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    hr = SIZE * rings[0][0] * 0.92
    ImageDraw.Draw(hub).ellipse([CX - hr, CY - hr, CX + hr, CY + hr], fill=(255, 255, 255, 255))
    return Image.alpha_composite(canvas, hub)


def write_ico(path, frames_and_sizes):
    """frames_and_sizes: list of (PIL.Image RGBA, size). PNG-compressed ICO
    entries (supported since Vista) so hand-picked art per frame is kept
    exactly instead of Pillow's single-source auto-downsample."""
    entries, datas = [], []
    offset = 6 + 16 * len(frames_and_sizes)
    for im, sz in frames_and_sizes:
        im2 = im.resize((sz, sz), Image.LANCZOS) if im.size != (sz, sz) else im
        buf = io.BytesIO()
        im2.save(buf, format='PNG')
        data = buf.getvalue()
        wh = sz if sz < 256 else 0   # 0 means 256 in the ICO directory format
        entries.append((wh, wh, 0, 0, 1, 32, len(data), offset))
        datas.append(data)
        offset += len(data)
    with open(path, 'wb') as f:
        f.write(struct.pack('<HHH', 0, 1, len(frames_and_sizes)))
        for e in entries:
            f.write(struct.pack('<BBBBHHII', *e))
        for d in datas:
            f.write(d)


if __name__ == '__main__':
    inner_pal = [hx('#22D3EE'), hx('#7A2CFF')]      # cyan / violet
    outer_pal = [hx('#FF3D7A'), hx('#FFB020')]      # pink / amber
    bg = (8, 6, 16, 255)
    glow = (160, 40, 120, 60)

    master = build(n_fold=10, palettes=[inner_pal, outer_pal],
                    rings=[(0.10, 0.26), (0.28, 0.47)],
                    bg=bg, glow=glow, rot_per_ring=18.0)

    small = build(n_fold=8, palettes=[inner_pal + outer_pal],
                   rings=[(0.12, 0.47)], bg=bg, glow=glow)

    master.resize((512, 512), Image.LANCZOS).save(ROOT / 'icon.png')
    write_ico(ROOT / 'icon.ico', [
        (small, 16), (master, 32), (master, 48),
        (master, 64), (master, 128), (master, 256),
    ])
    print(f"wrote {ROOT / 'icon.png'} and {ROOT / 'icon.ico'}")
