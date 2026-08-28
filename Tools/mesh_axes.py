# -*- coding: utf-8 -*-
"""Measure each model's rotational symmetry axis and its principal extents.

Why this exists: several mesh families bake an AXIS into the catalogue --
notably spinAxisP, which tells a station family which axis its hull may turn
about. A rotationally symmetric station (a wheel, a ring, a torus) reads as
physically wrong the moment it turns about anything else, and the axis is a
property of the ASSET, not of the family. Regenerate the assets and every one
of those numbers is a guess again.

Reads the glb exactly the way Source/MeshImport.cpp does: it walks
data->meshes directly and applies NO node transform, so the coordinates here
are the ones the vertex shader will actually see. Measuring in any other frame
would produce answers that are right about the file and wrong about the render.

Method: voxelise the centred point cloud, rotate it about the candidate axis by
several angles that share no common divisor, and take the mean intersection
over union against the unrotated set. A body of revolution maps onto itself at
every angle, so its score stays near 1; anything else falls away sharply.

    python Tools/mesh_axes.py                 # every model in Models/
    python Tools/mesh_axes.py Ring Wheel      # only names containing these
"""
import glob, json, os, struct, sys, math

try:
    import numpy as np
except ImportError:
    sys.exit("needs numpy")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

COMP = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2),
        5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_glb(path):
    d = open(path, "rb").read()
    if d[:4] != b"glTF":
        raise ValueError("not a glb")
    off, js, bin_ = 12, None, b""
    while off < len(d):
        ln, ty = struct.unpack_from("<II", d, off)
        chunk = d[off + 8: off + 8 + ln]
        if ty == 0x4E4F534A:
            js = json.loads(chunk.decode("utf-8"))
        elif ty == 0x004E4942:
            bin_ = chunk
        off += 8 + ln
    return js, bin_


def accessor(js, bin_, idx):
    acc = js["accessors"][idx]
    n = NCOMP[acc["type"]]
    fmt, size = COMP[acc["componentType"]]
    bv = js["bufferViews"][acc["bufferView"]]
    base = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = bv.get("byteStride") or (n * size)
    count = acc["count"]
    out = np.empty((count, n), dtype=np.float32)
    for i in range(count):
        o = base + i * stride
        out[i] = struct.unpack_from("<" + fmt * n, bin_, o)
    return out


def positions(path, cap=40000):
    js, bin_ = read_glb(path)
    chunks = []
    # meshes, not nodes: MeshImport.cpp walks data->meshes and never applies a
    # node transform, so this has to ignore the scene graph too.
    for mesh in js.get("meshes", []):
        for prim in mesh.get("primitives", []):
            pi = prim.get("attributes", {}).get("POSITION")
            if pi is not None:
                chunks.append(accessor(js, bin_, pi))
    if not chunks:
        return None
    p = np.concatenate(chunks, axis=0)
    if len(p) > cap:
        step = len(p) // cap + 1
        p = p[::step]
    return p


def voxels(p, res):
    q = np.clip(((p + 1.0) * 0.5 * res).astype(np.int32), 0, res - 1)
    return set(map(tuple, q))


def symmetry(p, axis, res=44):
    """Mean IoU of the cloud against itself, rotated about `axis`."""
    a = (axis + 1) % 3
    b = (axis + 2) % 3
    base = voxels(p, res)
    scores = []
    # Angles chosen not to be multiples of one another: a four-fold shape would
    # otherwise score as a body of revolution on 90 alone.
    for deg in (23.0, 47.0, 90.0, 137.0):
        t = math.radians(deg)
        c, s = math.cos(t), math.sin(t)
        q = p.copy()
        q[:, a] = p[:, a] * c - p[:, b] * s
        q[:, b] = p[:, a] * s + p[:, b] * c
        v = voxels(q, res)
        inter = len(base & v)
        union = len(base | v)
        scores.append(inter / union if union else 0.0)
    return sum(scores) / len(scores)


def analyse(path):
    p = positions(path)
    if p is None or len(p) < 32:
        return None
    centre = (p.max(axis=0) + p.min(axis=0)) * 0.5
    p = p - centre
    scale = float(np.abs(p).max())
    if scale <= 0:
        return None
    p = p / scale
    ext = (p.max(axis=0) - p.min(axis=0)) * 0.5
    sc = [symmetry(p, ax) for ax in range(3)]

    # Roundness: a body of revolution about `a` has EQUAL extents in the two
    # perpendicular directions. This is what separates a wheel from a long
    # hull, which the IoU alone does not: rotating a long thin box about its
    # own length leaves most of it in place and scores deceptively well (0.63
    # on a synthetic hull, against 0.91 for a true torus).
    round_ = []
    for a in range(3):
        q = [ext[(a + 1) % 3], ext[(a + 2) % 3]]
        round_.append(min(q) / max(max(q), 1e-6))

    # Rank on the two together. Neither alone is enough: roundness accepts any
    # square-ish cross-section, the IoU accepts any elongation.
    comb = [sc[a] * round_[a] for a in range(3)]
    best = int(np.argmax(comb))
    margin = comb[best] - sorted(comb)[1]

    # Calibrated against synthetic shapes (see the repo history): a true torus
    # or cylinder lands near 0.90 IoU, a six-spoked wheel near 0.74, a cube at
    # 0.22 with no preferred axis, a long hull at 0.63 on its length but with
    # low roundness. Real station hulls carry modules and masts and sit lower
    # than the ideal, so the bar is on the COMBINED figure and on there being a
    # clear winner, not on the IoU alone.
    symmetric = comb[best] >= 0.34 and margin >= 0.15

    return {"extent": ext.tolist(), "scores": sc, "round": round_,
            "combined": comb, "axis": best, "score": sc[best],
            "roundness": round_[best], "symmetric": symmetric,
            "margin": margin}


if __name__ == "__main__":
    pats = [a for a in sys.argv[1:] if not a.startswith("-")]
    files = sorted(glob.glob(os.path.join(ROOT, "Models", "*.glb")))
    if pats:
        files = [f for f in files if any(x.lower() in os.path.basename(f).lower() for x in pats)]
    print("%-30s %5s %5s %5s  %-4s %5s %5s %5s  %s"
          % ("model", "symX", "symY", "symZ", "axis", "IoU", "rund", "marg", "verdict"))
    out = {}
    for f in files:
        name = os.path.splitext(os.path.basename(f))[0]
        try:
            r = analyse(f)
        except Exception as e:
            print("%-32s FEHLER %s" % (name, e))
            continue
        if not r:
            continue
        out[name] = r
        print("%-30s %5.2f %5.2f %5.2f  %-4s %5.2f %5.2f %5.2f  %s"
              % (name, r["scores"][0], r["scores"][1], r["scores"][2],
                 "XYZ"[r["axis"]], r["score"], r["roundness"], r["margin"],
                 "rotationssymmetrisch" if r["symmetric"] else "-"))
    # numpy scalars are not JSON-serialisable; the measurements are plain
    # numbers by the time they are written.
    json.dump(out, open(os.path.join(ROOT, "Tools", "mesh_axes.json"), "w"),
              indent=1, default=float)
    print("\n%d Modelle, %d rotationssymmetrisch -> Tools/mesh_axes.json"
          % (len(out), sum(1 for v in out.values() if v["symmetric"])))
