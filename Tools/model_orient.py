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
  * threads: many generated models carry hair-thin vertical threads (strings of tiny triangles) hanging from the hull
    to the model's full height.  They set the bounding box -- the "longest axis" became the vertical, and the craft
    flew upright, shrunk by the false size -- and on screen they read as black rain;
  * ties: a hull as long as it is tall (masts) picked whichever axis came first.
This tool measures each craft without the threads (thread_mask, two rules below): the direction of the hull is the
main axis of its surface in the horizontal plane (area-weighted), the nose is chosen by hand from aligned views (NOSE
below, with the reason) where the taper rule -- the narrower end leads -- would be wrong, and the size is taken from the
0.5 .. 99.5 % range of the surface (by area).

Scene3DShader hands a listed model's frame to the shaders that ask for it (meshOrient, meshOrientExtent,
meshOrientCenter, meshOriented), and removes the threads of a model whose share is 1 % or more when it loads it
(removeThreads, the same two rules).  A model not listed is left as it is.

Columns: model, r00 r01 r02 r10 r11 r12 r20 r21 r22 (the rotation, rows), ex ey ez (half-extents after it),
cx cy cz (centre after it), threads (share of the surface in generator threads, %).
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
    # Two engine tubes at one end, the sloped cockpit at the other.
    "SchwererBegleitjaeger.glb": (-1, None),
    # From the textured end views (Tools/model_orient.py --views and the ship sheets, 18.10.2026): the engines lead.
    # A cluster of eight protruding tubes at the end the taper rule chose -- the sister ship UnionCruiserNorway
    # carries the same tubes at its stern, its bow a raked stem.
    "UnionDestroyer.glb": (-1, None),
    # A round nozzle between glowing fins at the chosen end; the long spike at the other is the nose.
    "RouKillingTime.glb": (-1, None),
    # A bulbous bow and a narrowing hull at one end, the bridge and a square stern at the other.
    "SuperlifterBringerOfThings.glb": (-1, None),
    # The pointed end trails, the end plate with the engine pods leads.
    "CommsRelayShip.glb": (-1, None),
    # An exhaust pipe at the chosen end, the radiator grille at the other.
    "OrbitalTugboat.glb": (-1, None),
    # Concentric nozzle rings in a tapering shroud at the chosen end.
    "SystemShuttleCutter.glb": (-1, None),
}

# Turns in the craft frame after the measurement, where the hull is not a plain length: rows of a rotation.
POSE = {
    # An arch, its legs down, lying along the course: turned a quarter about the beam so the legs point ahead --
    # a crescent flying horns first, like its sister LsvZealot (asked for 18.10.2026).
    "LsvPureIntent.glb": ((1.0, 0.0, 0.0), (0.0, 0.0, 1.0), (0.0, -1.0, 0.0)),
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


# ---- generator threads -------------------------------------------------------------------------------------------
# Many generated models carry hair-thin vertical threads (strings of tiny triangles, 0.002 .. 0.008 wide) that hang
# from the hull up and down to the model's box; on screen they read as black rain.  Two rules find them; the loader
# (Scene3DShader::removeThreads) applies the same two to a model whose `threads` column is 1 % or more.  All lengths
# are fractions of the model's longest side S.
CELL = 0.006     # column width
NY = 100         # height bins over the model's height
THIN = 0.008     # a thread triangle is narrower than this horizontally
MIN_RUN = 0.05   # an isolated thin column is a thread from this length on
SLIVER_W = 0.006  # a sliver: narrower than this ...
SLIVER_R = 2.5   # ... and this many times taller than wide
CHAIN = 0.06     # a chain of slivers in one column is a thread from this length on
CHAIN_GAP = 0.012  # slivers whose height ranges are closer than this are one chain


def isolated_columns(T, S):
    """Rule 1: thin geometry in a column whose eight neighbour columns are (nearly) empty at that height, over a run
    of at least MIN_RUN -- a thread standing free.  A hull wall always has neighbours along the wall."""
    P = T.reshape(-1, 3)
    lo, hi = P.min(0), P.max(0)
    cell = CELL * S
    nx = int((hi[0] - lo[0]) / cell) + 3
    nz = int((hi[2] - lo[2]) / cell) + 3
    hy = max(hi[1] - lo[1], 1e-6) / NY
    hxz = np.sqrt((T[..., 0].max(1) - T[..., 0].min(1)) ** 2 + (T[..., 2].max(1) - T[..., 2].min(1)) ** 2)
    thin = hxz < THIN * S
    C = T.mean(1)
    cx = ((C[:, 0] - lo[0]) / cell).astype(np.int64) + 1
    cz = ((C[:, 2] - lo[2]) / cell).astype(np.int64) + 1
    y0 = np.clip(((T[..., 1].min(1) - lo[1]) / hy).astype(np.int64), 0, NY - 1)
    y1 = np.clip(((T[..., 1].max(1) - lo[1]) / hy).astype(np.int64), 0, NY - 1)
    occ = np.zeros((nx, nz, NY), bool)
    thinocc = np.zeros((nx, nz, NY), bool)
    span = y1 - y0
    for d in range(0, int(span.max()) + 1):
        sel = span >= d
        occ[cx[sel], cz[sel], y0[sel] + d] = True
        s2 = sel & thin
        thinocc[cx[s2], cz[s2], y0[s2] + d] = True
    nb = np.zeros((nx, nz, NY), np.int8)
    for dx in (-1, 0, 1):
        for dz in (-1, 0, 1):
            if dx or dz:
                nb += np.roll(np.roll(occ, dx, 0), dz, 1)
    iso = thinocc & (nb <= 1)
    run = np.zeros((nx, nz, NY), np.int32)
    run[..., 0] = iso[..., 0]
    for y in range(1, NY):
        run[..., y] = np.where(iso[..., y], run[..., y - 1] + 1, 0)
    full = run.copy()
    for y in range(NY - 2, -1, -1):
        full[..., y] = np.where(iso[..., y] & iso[..., y + 1], full[..., y + 1], full[..., y])
    need = max(2, int(np.ceil(MIN_RUN * S / hy)))
    thread_bins = iso & (full >= need)
    yc = np.clip(((C[:, 1] - lo[1]) / hy).astype(np.int64), 0, NY - 1)
    return thin & thread_bins[cx, cz, yc]


def sliver_chains(T, S):
    """Rule 2: tall, narrow triangles (slivers) chained up one column over at least CHAIN -- a thread inside a dense
    curtain of threads, where rule 1 sees neighbours."""
    hx = T[..., 0].max(1) - T[..., 0].min(1)
    hz = T[..., 2].max(1) - T[..., 2].min(1)
    h = np.sqrt(hx * hx + hz * hz)
    y0 = T[..., 1].min(1)
    y1 = T[..., 1].max(1)
    sliver = (h < SLIVER_W * S) & ((y1 - y0) > SLIVER_R * h)
    C = T.mean(1)
    # The body: every triangle that is not a sliver, dilated by one column.  A chain of slivers inside or against it is
    # a hull edge or a cylinder wall, not a thread (removing those tore holes into clean hulls).
    P = T.reshape(-1, 3)
    lo = P.min(0)
    cell = CELL * S
    hy = max(P[:, 1].max() - lo[1], 1e-6) / NY
    gx = np.floor((C[:, 0] - lo[0]) / cell).astype(np.int64) + 2
    gz = np.floor((C[:, 2] - lo[2]) / cell).astype(np.int64) + 2
    nx, nz = gx.max() + 3, gz.max() + 3
    b0 = np.clip(((y0 - lo[1]) / hy).astype(np.int64), 0, NY - 1)
    b1 = np.clip(((y1 - lo[1]) / hy).astype(np.int64), 0, NY - 1)
    body = np.zeros((nx, nz, NY), bool)
    nb_ = ~sliver
    span = b1 - b0
    for d in range(0, int(span[nb_].max()) + 1 if nb_.any() else 0):
        sel = nb_ & (span >= d)
        body[gx[sel], gz[sel], b0[sel] + d] = True
    near = np.zeros_like(body)
    for dx in (-1, 0, 1):
        for dz in (-1, 0, 1):
            near |= np.roll(np.roll(body, dx, 0), dz, 1)
    yc = np.clip(((C[:, 1] - lo[1]) / hy).astype(np.int64), 0, NY - 1)
    free = ~near[gx, gz, yc]
    sliver &= free
    key = np.floor(C[:, [0, 2]] / (CELL * S)).astype(np.int64)
    k = key[:, 0] * 1000003 + key[:, 1]
    m = np.zeros(len(T), bool)
    idx = np.where(sliver)[0]
    if len(idx) == 0:
        return m
    order = idx[np.lexsort((y0[idx], k[idx]))]
    ks = k[order]
    starts = np.r_[0, np.where(np.diff(ks) != 0)[0] + 1, len(ks)]
    tol, need = CHAIN_GAP * S, CHAIN * S
    for a, b in zip(starts[:-1], starts[1:]):
        tri = order[a:b]
        lo_, hi_ = y0[tri], y1[tri]
        cur0, cur1, members = lo_[0], hi_[0], [tri[0]]
        for t, s0, e0 in zip(tri[1:], lo_[1:], hi_[1:]):
            if s0 <= cur1 + tol:
                cur1 = max(cur1, e0)
                members.append(t)
            else:
                if cur1 - cur0 >= need:
                    m[members] = True
                cur0, cur1, members = s0, e0, [t]
        if cur1 - cur0 >= need:
            m[members] = True
    return m


def thread_mask(T):
    """The generator threads of a model (both rules), as a mask over its triangles."""
    P = T.reshape(-1, 3)
    S = float((P.max(0) - P.min(0)).max())
    return isolated_columns(T, S) | sliver_chains(T, S)


def measure(path):
    """Rotation into the craft frame (nose +Z, up +Y), half-extents and centre in it, and the share of the surface
    in generator threads (%)."""
    T = load_triangles(path)
    e1, e2 = T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]
    area = 0.5 * np.linalg.norm(np.cross(e1, e2), axis=1)
    thread = thread_mask(T)
    keep = ~thread & (area > 0)
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

    def wpct(x, q):
        # area-weighted percentile: thousands of tiny thread triangles left in a model count by their area
        o = np.argsort(x)
        cw = np.cumsum(W[o])
        return float(np.interp(q / 100.0, cw / cw[-1], x[o]))

    # The main axis of the spread is not always the long one: side pods carry much surface and pull it across
    # (AsteroidTugboat flew sideways).  Where the extent across is clearly the larger, the hull turns a quarter.
    if not fixed:
        ex_ = wpct(Q[:, 0], 99.5) - wpct(Q[:, 0], 0.5)
        ez_ = wpct(Q[:, 2], 99.5) - wpct(Q[:, 2], 0.5)
        if ex_ > 1.08 * ez_:
            theta += np.pi / 2
            R = rot_y(-theta)
            Q = (C - mu) @ R.T
            z = Q[:, 2]
            lo, hi = np.percentile(z, 8), np.percentile(z, 92)
    sign = 1.0 if (fixed or spread(z > hi) <= spread(z < lo)) else -1.0
    if name in NOSE:
        sign *= NOSE[name][0]
    if sign < 0:
        R = rot_y(np.pi) @ R
    if name in POSE:
        R = np.array(POSE[name]) @ R
    Q = (C - mu) @ R.T
    plo = np.array([wpct(Q[:, k], 0.5) for k in range(3)])
    phi = np.array([wpct(Q[:, k], 99.5) for k in range(3)])
    share = float(100.0 * area[thread].sum() / area.sum())
    if share >= 1.0:
        # The hull's own height, for a model with threads: what the rules miss of a dense curtain still hangs above
        # or below it, sparse -- in 40 layers, the layers whose footprint (occupied 0.012 cells) is at least an
        # eighth of the fullest, walked outward from the fullest until two in a row fall short.  ShipFlyby cuts at it.
        Cq = (T[keep].mean(1) - mu) @ R.T
        yl, yh = Cq[:, 1].min(), Cq[:, 1].max()
        edges = np.linspace(yl, yh, 41)
        cov = np.zeros(40)
        for i in range(40):
            sel = (Cq[:, 1] >= edges[i]) & (Cq[:, 1] < edges[i + 1] + (1e-9 if i == 39 else 0.0))
            cov[i] = len(np.unique(np.floor(Cq[sel][:, [0, 2]] / 0.012).astype(np.int64), axis=0))
        ok = cov >= cov.max() / 8.0
        top = bot = int(np.argmax(cov))
        while top + 1 < 40 and (ok[top + 1] or (top + 2 < 40 and ok[top + 2])):
            top += 1
        while bot > 0 and (ok[bot - 1] or (bot - 2 >= 0 and ok[bot - 2])):
            bot -= 1
        plo[1], phi[1] = max(plo[1], edges[bot]), min(phi[1], edges[top + 1])
    ext = 0.5 * (phi - plo)
    cen = R @ mu + 0.5 * (phi + plo)  # the centre in the rotated frame
    return R, ext, cen, share, float(np.degrees(theta))


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
        ImageDraw.Draw(tile).text((6, 230), "%s  yaw %.0f  threads %.1f %%" % (name, th, nd), fill=(255, 255, 160))
        tiles.append(tile)
    for k in range(0, len(tiles), 12):
        part = tiles[k:k + 12]
        sheet = Image.new("RGB", (452 * 3, 250 * ((len(part) + 2) // 3)), (40, 40, 40))
        for i, t in enumerate(part):
            sheet.paste(t, ((i % 3) * 452, (i // 3) * 250))
        sheet.save("%s_%d.jpg" % (out, k // 12), quality=85)


def main():
    rows = []
    lines = ["# model\tr00\tr01\tr02\tr10\tr11\tr12\tr20\tr21\tr22\tex\tey\tez\tcx\tcy\tcz\tthreads"]
    for name in ship_models():
        path = os.path.join(ROOT, "Models", name)
        if not os.path.exists(path):
            print("?? missing", name)
            continue
        R, ext, cen, nd, th = measure(path)
        rows.append((name, R, ext, cen, nd, th))
        lines.append("\t".join([name] + ["%.6f" % x for x in R.ravel()] + ["%.5f" % x for x in ext]
                               + ["%.5f" % x for x in cen] + ["%.2f" % nd]))
        print("%-36s yaw %6.1f  ext %.2f %.2f %.2f  threads %5.2f %%" % (name, th, *ext, nd))
    io.open(os.path.join(ROOT, "Engine", "model_orient.tsv"), "w", encoding="utf-8", newline="\n").write(
        "\n".join(lines) + "\n")
    if "--views" in sys.argv:
        views(rows, sys.argv[sys.argv.index("--views") + 1])


if __name__ == "__main__":
    main()
