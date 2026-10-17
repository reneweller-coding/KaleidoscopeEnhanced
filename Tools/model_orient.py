#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Measure how each spacecraft model lies in its own file, and write Engine/model_orient.tsv for the loader.

    python Tools/model_orient.py                # measure the craft of the ship scenes, write Engine/model_orient.tsv
    python Tools/model_orient.py --views OUT    # plus contact sheets OUT_N.jpg of the aligned craft (nose up)

Why: the ship scenes guessed a craft's direction of travel from its longest bounding-box axis, and never knew which
end was the nose (17.10.2026).  That fails four ways on this asset set:
  * the sign: half the craft flew stern first, the engine glow on the bow;
  * hulls modelled at an angle: FuelTankerStarship, GsvNoMoreMrNiceGuy and MerchantersLuck lie some 40 degrees off
    the axes and flew crabwise;
  * needles: many generated models carry long, hair-thin triangles (antenna wires, generator debris) up to the full
    model size.  They set the bounding box -- the "longest axis" became the vertical, and the craft flew upright,
    shrunk by the false size;
  * ties: a hull as long as it is tall (masts) picked whichever axis came first.
This tool measures each craft without the needles: the direction of the hull is the main axis of its surface in the
horizontal plane (area-weighted), the nose is chosen by hand from aligned views (NOSE below, with the reason) where the
taper rule -- the narrower end leads -- would be wrong, and the size is taken from the 0.5 .. 99.5 % range of the
surface, so a stray needle does not count.

The loader (Scene3DShader) turns a listed model into this frame when it loads it: nose on +Z, up on +Y, centred,
and passes meshCenter / meshExtent from the table and meshOriented = 1.  A model not listed keeps its own frame.

Columns: model, r00 r01 r02 r10 r11 r12 r20 r21 r22 (the rotation, rows), ex ey ez (half-extents after it),
cx cy cz (centre after it), needles (triangles left out of the measurement).
"""
import io
import json
import os
import re
import struct
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAMILIES = ("Fleet.frag", "FleetJump.frag", "ShipFlyby.frag", "Spaceship.frag", "ShipShadowPlay.frag",
            "ShipDocking.frag")

# Hand decisions from the aligned views (--views), where the taper rule picks the wrong end or the craft is not a
# plain hull: (sign, yaw) -- sign -1 turns the craft round, a yaw in degrees replaces the measured direction (the
# angle of the nose from +Z toward +X in the file).  A reason for each.
NOSE = {
    # A box on legs whose camera eye looks along the file's +Z; the box is wider than it is deep.
    "FormationsAufklaerungsdrohne.glb": (1, 0.0),
    # A dagger-shaped blade: the point leads, not the broad end.
    "LsvZealot.glb": (-1, None),
    # The bridge sits at the stern of a container ship; the taper rule took the bridge end for the bow.
    "ModularContainerShip.glb": (-1, None),
    # Two engine tubes at one end, the sloped cockpit at the other.
    "SchwererBegleitjaeger.glb": (-1, None),
}

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def load_triangles(path):
    """The triangles of every triangle primitive, raw POSITION data as Source/MeshImport.cpp reads it."""
    b = open(path, "rb").read()
    off = 12
    js, binc = None, None
    while off < len(b):
        clen, ctype = struct.unpack("<II", b[off:off + 8])
        data = b[off + 8:off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(data)
        elif ctype == 0x004E4942:
            binc = data
        off += 8 + clen

    def acc(i):
        a = js["accessors"][i]
        bv = js["bufferViews"][a["bufferView"]]
        n, k = a["count"], NC[a["type"]]
        dt = np.dtype(CT[a["componentType"]])
        start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = bv.get("byteStride", 0) or dt.itemsize * k
        raw = np.frombuffer(binc, np.uint8, count=stride * (n - 1) + dt.itemsize * k, offset=start)
        out = np.lib.stride_tricks.as_strided(raw, shape=(n, dt.itemsize * k), strides=(stride, 1)).copy()
        arr = out.view(dt).reshape(n, k).astype(np.float64)
        if a.get("normalized"):
            arr /= np.iinfo(dt).max
        return arr

    tris = []
    for m in js["meshes"]:
        for p in m["primitives"]:
            if p.get("mode", 4) != 4 or "POSITION" not in p["attributes"]:
                continue
            P = acc(p["attributes"]["POSITION"])
            I = acc(p["indices"]).astype(np.int64).ravel() if "indices" in p else np.arange(len(P))
            tris.append(P[I[:len(I) // 3 * 3].reshape(-1, 3)])
    return np.concatenate(tris)


def measure(path):
    """Rotation into the craft frame (nose +Z, up +Y), half-extents and centre in it, and the needle count."""
    T = load_triangles(path)
    e1, e2 = T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]
    area = 0.5 * np.linalg.norm(np.cross(e1, e2), axis=1)
    edges = np.stack([np.linalg.norm(T[:, 1] - T[:, 0], axis=1), np.linalg.norm(T[:, 2] - T[:, 1], axis=1),
                      np.linalg.norm(T[:, 0] - T[:, 2], axis=1)], 1)
    L = edges.max(1)
    size = np.percentile(np.abs(T.reshape(-1, 3) - np.median(T.reshape(-1, 3), 0)), 99, axis=0).max()
    needle = (area < 0.004 * L * L) & (L > 0.12 * size)
    keep = ~needle & (area > 0)
    # Surface samples: each triangle's centroid and its corners, weighted by area.
    C = np.concatenate([T[keep].mean(1), T[keep][:, 0], T[keep][:, 1], T[keep][:, 2]])
    W = np.concatenate([area[keep]] * 4)
    W = W / W.sum()
    mu = (C * W[:, None]).sum(0)
    # The hull's direction in the horizontal plane: the main axis of the area-weighted XZ spread.
    X = C[:, [0, 2]] - mu[[0, 2]]
    cov = (X * W[:, None]).T @ X
    val, vec = np.linalg.eigh(cov)
    d = vec[:, 1]  # (x, z) of the main axis
    theta = np.arctan2(d[0], d[1])  # angle of the main axis from +Z toward +X
    name = os.path.basename(path)
    fixed = name in NOSE and NOSE[name][1] is not None
    if fixed:
        theta = np.radians(NOSE[name][1])

    def rot_y(a):
        c, s = np.cos(a), np.sin(a)
        return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])

    R = rot_y(-theta)
    Q = (C - mu) @ R.T
    # Taper rule: the end whose cross-section is smaller leads.
    z = Q[:, 2]
    lo, hi = np.percentile(z, 8), np.percentile(z, 92)

    def spread(mask):
        q = Q[mask]
        ww = W[mask] / max(W[mask].sum(), 1e-12)
        return float(np.sqrt((ww * (q[:, 0] ** 2 + (q[:, 1] - (ww * q[:, 1]).sum()) ** 2)).sum()))

    sign = 1.0 if (fixed or spread(z > hi) <= spread(z < lo)) else -1.0
    if name in NOSE:
        sign *= NOSE[name][0]
    if sign < 0:
        R = rot_y(np.pi) @ R
    Q = (C - mu) @ R.T
    plo = np.array([np.percentile(Q[:, k], 0.5) for k in range(3)])
    phi = np.array([np.percentile(Q[:, k], 99.5) for k in range(3)])
    ext = 0.5 * (phi - plo)
    cen = R @ mu + 0.5 * (phi + plo)  # the centre in the rotated frame
    return R, ext, cen, int(needle.sum()), float(np.degrees(theta))


def ship_models():
    s = io.open(os.path.join(ROOT, "Presets", "Komplett.xml"), encoding="utf-8").read()
    out = []
    for m in re.finditer(r'<TextureShader file="([^"]+)"([^>]*)>', s):
        f = m.group(1).split("\\")[-1]
        if f not in FAMILIES:
            continue
        key = "model2" if f == "ShipDocking.frag" else "model"
        mm = re.search(key + r'="([^"]+)"', m.group(2))
        if mm:
            out.append(mm.group(1).split("\\")[-1])
    return sorted(set(out))


def views(rows, out):
    """Aligned top and side views (nose up / nose right) for checking the nose by eye."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from PIL import Image, ImageDraw
    tiles = []
    for name, R, ext, cen, nd, th in rows:
        T = load_triangles(os.path.join(ROOT, "Models", name)) @ R.T - cen
        tile = Image.new("RGB", (452, 250), (40, 40, 40))
        for i, (a, b, lab) in enumerate([(0, 2, "top: nose up"), (2, 1, "side: nose right")]):
            img = Image.new("RGB", (220, 220), (28, 28, 34))
            dr = ImageDraw.Draw(img)
            h, v = T[..., a], T[..., b]
            lim = max(ext) * 1.15
            s = 105 / lim
            depth = T[..., 3 - a - b].mean(1) * (1 if i == 0 else -1)
            for t in np.argsort(depth)[::max(1, len(depth) // 40000)]:
                pts = [(110 + h[t, k] * s, 110 - v[t, k] * s) for k in range(3)]
                dr.polygon(pts, fill=(200, 190, 170), outline=(120, 115, 105))
            tile.paste(img, (4 + i * 224, 4))
            ImageDraw.Draw(tile).text((8 + i * 224, 6), lab, fill=(150, 200, 255))
        ImageDraw.Draw(tile).text((6, 230), "%s  yaw %.0f  needles %d" % (name, th, nd), fill=(255, 255, 160))
        tiles.append(tile)
    for k in range(0, len(tiles), 12):
        part = tiles[k:k + 12]
        sheet = Image.new("RGB", (452 * 3, 250 * ((len(part) + 2) // 3)), (40, 40, 40))
        for i, t in enumerate(part):
            sheet.paste(t, ((i % 3) * 452, (i // 3) * 250))
        sheet.save("%s_%d.jpg" % (out, k // 12), quality=85)


def main():
    rows = []
    lines = ["# model\tr00\tr01\tr02\tr10\tr11\tr12\tr20\tr21\tr22\tex\tey\tez\tcx\tcy\tcz\tneedles"]
    for name in ship_models():
        path = os.path.join(ROOT, "Models", name)
        if not os.path.exists(path):
            print("?? missing", name)
            continue
        R, ext, cen, nd, th = measure(path)
        rows.append((name, R, ext, cen, nd, th))
        lines.append("\t".join([name] + ["%.6f" % x for x in R.ravel()] + ["%.5f" % x for x in ext]
                               + ["%.5f" % x for x in cen] + [str(nd)]))
        print("%-36s yaw %6.1f  ext %.2f %.2f %.2f  needles %d" % (name, th, *ext, nd))
    io.open(os.path.join(ROOT, "Engine", "model_orient.tsv"), "w", encoding="utf-8", newline="\n").write(
        "\n".join(lines) + "\n")
    if "--views" in sys.argv:
        views(rows, sys.argv[sys.argv.index("--views") + 1])


if __name__ == "__main__":
    main()
