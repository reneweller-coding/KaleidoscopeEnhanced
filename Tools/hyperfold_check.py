# -*- coding: utf-8 -*-
"""HyperbolicKaleidoscope's {p,q} fold, old against new: a point and its mirror image in the edge circle must fold
to the same point of the fundamental domain (the fold is a map onto the quotient)."""
import numpy as np

def fold(z, pp, qq, new):
    re = np.arccosh(np.cos(np.pi / qq) / np.sin(np.pi / pp))
    u = np.tanh(re * 0.5)
    cx = (1 + u * u) / (2 * u)
    R = (1 - u * u) / (2 * u)
    sector = 2 * np.pi / pp
    z = z.copy()
    for _ in range(18):
        a = np.arctan2(z.imag, z.real)
        a = np.mod(a, sector)
        a = (sector * 0.5 - np.abs(a - sector * 0.5)) if new else np.abs(a - sector * 0.5)
        z = np.abs(z) * np.exp(1j * a)
        d = z - cx
        dd = np.abs(d) ** 2
        inside = dd < R * R
        z = np.where(inside, cx + d * (R * R / np.maximum(dd, 1e-12)), z)
        if not inside.any():
            break
    return z

rng = np.random.default_rng(1)
for pp, qq in ((4, 5), (4, 6), (6, 4), (6, 5), (8, 3), (8, 4)):
    re = np.arccosh(np.cos(np.pi / qq) / np.sin(np.pi / pp))
    u = np.tanh(re * 0.5)
    cx = (1 + u * u) / (2 * u)
    R = (1 - u * u) / (2 * u)
    r = np.sqrt(rng.uniform(0, 0.97 ** 2, 20000))
    th = rng.uniform(0, 2 * np.pi, 20000)
    z = r * np.exp(1j * th)
    d = z - cx
    zi = cx + d * (R * R / np.abs(d) ** 2)                      # mirror image in the edge circle
    keep = np.abs(zi) < 0.97
    z, zi = z[keep], zi[keep]
    out = []
    for new in (False, True):
        a, b = fold(z, pp, qq, new), fold(zi, pp, qq, new)
        out.append(np.mean(np.abs(a - b) > 1e-4) * 100)
    # and a rotation by one sector must fold to the same point too
    rot = []
    for new in (False, True):
        a, b = fold(z, pp, qq, new), fold(z * np.exp(1j * 2 * np.pi / pp), pp, qq, new)
        rot.append(np.mean(np.abs(a - b) > 1e-4) * 100)
    print("{%d,%d}: edge-mirror pairs folding apart: old %5.1f %%  new %5.1f %%   sector-rotated pairs: old %5.1f %%  new %5.1f %%"
          % (pp, qq, out[0], out[1], rot[0], rot[1]))
