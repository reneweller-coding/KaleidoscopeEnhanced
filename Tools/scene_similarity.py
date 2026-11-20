# -*- coding: utf-8 -*-
"""Which scenes look alike: a map of the catalogue by its pictures (plan 20.11.2026, B3).

    python Tools/scene_similarity.py                   # descriptors, distances -> Tools/scene_neighbours.tsv
    python Tools/scene_similarity.py --pairs DIR [N]   # N calibration pairs along the distance scale as contact sheets
    python Tools/scene_similarity.py --band DIR LO HI [N]   # N pairs with a distance between LO and HI
    python Tools/scene_similarity.py --sheet OUT.jpg A,B,C  # the frames of these scenes, one row each
    python Tools/scene_similarity.py --clusters DIR [N]     # contact sheets of the N largest clusters
    python Tools/scene_similarity.py --dups DIR        # contact sheets of the near-duplicate groups
    python Tools/scene_similarity.py --families        # the generator families against random pairs (numbers)
    python Tools/scene_similarity.py --calibration     # the judged pairs (Tools/scene_similarity_pairs.tsv) vs. scale
    python Tools/scene_similarity.py --plans [DIR]     # look-alike changes in the scene plans of check_schedule.py
    ... --raw                                          # any of these on the distances before the hub reduction

What is compared.  A scene is its three catalogue frames (docs/Catalog/img/<Name>_A.jpg, _B.jpg, _C.jpg: 8, 16 and
21 s into the catalogue track, 320 x 200).  Only the 2D and 3D scenes have them; the FX overlays and the transitions
are no scenes of their own -- an overlay runs on top of whatever plays, a transition between two -- so they are left
out (the catalogue shows them with a 2D and a 3D frame of a different kind, and they are never picked by
SceneScheduler::pickScene).

The descriptor of a frame has three parts, each a published, plain one (no model, numpy and PIL only):

  colour   the colour layout: the mean CIE Lab colour of 8 x 5 cells -- the MPEG-7 Colour Layout descriptor
           (Kasutani & Yamada 2001) in Lab instead of its DCT of YCbCr, so a distance is a mean colour difference
           (Delta E 1976) per cell
  edges    a histogram of oriented gradients on a 4 x 4 grid, 8 unsigned orientations, magnitude-weighted and soft-
           binned (Dalal & Triggs 2005, "Histograms of Oriented Gradients for Human Detection"), as one distribution
           over cells and orientations, compared as its square root (the Hellinger distance; Arandjelovic &
           Zisserman 2012, "RootSIFT").  A small isotropic floor keeps the histogram of a flat frame from being noise.
  spectrum the frame's power spectrum averaged in 12 log-spaced rings x 4 orientations -- the radial / oriented
           spectral signature of Oliva & Torralba's spatial envelope (2001, "Modeling the Shape of the Scene"):
           how coarse or fine and how directed the texture is.  Its shape (log power minus the mean) plus the mean
           at half weight.

Each part's frame-to-frame distance is divided by its median over all frame pairs, and the three are mixed WEIGHTS
(colour, edges, spectrum) -- so a distance of 1.0 is the typical distance of two unrelated frames.  Two scenes are
compared by the modified Hausdorff distance of their frame sets (Dubuisson & Jain 1994, "A Modified Hausdorff
Distance for Object Matching"): for each frame the nearest frame of the other scene, averaged, the larger of the two
directions.  So a scene that shows its look at another moment (the B frame of one is the C frame of the other) is
still near, and one that changes through three looks is near another only if that other shows them too.

The photo.  The catalogue frames were rendered with a seeded photo sequence, so dozens of scenes show the same photo,
and many scenes leave it largely as it is: their frames are near by the photo, not by the scene (the 30 nearest pairs
are nearly all of this kind).  The scene distances are therefore taken in units of each scene's neighbourhood (local
scaling, see local_scaling()) -- a hub reduction that rates "near, while everything around is near too" lower than
"near, while everything else is far".  On the judged pairs it separates "same" from "different" better (area under
the ROC curve 0.92 against 0.85 raw).  It cannot see what the frames do not show: two scenes that both leave the photo
alone look the same only when they drew the same photo.

Outputs.  Tools/scene_neighbours.tsv: name, cluster, dup_group, neighbours, distances -- the eight nearest scenes
(nearest first) and their hub-reduced distances, 3 decimals.  `cluster`: average-linkage clustering cut at
CLUSTER_CUT (every scene has one; a scene alone is a cluster of one) -- groups whose members show the same picture.
`dup_group`: complete-linkage groups cut at DUP_CUT -- every two scenes of a group are closer than DUP_CUT -- empty
for a scene without a near-duplicate.  The numbers of both are ordered by size, then by the first name; they are not
stable across runs when the catalogue changes.

The thresholds were set by looking (docs/engine-internals-67-similarity.md): `--pairs` and `--band` write contact
sheets of pairs along the scale, the frames of both scenes side by side; the verdicts are kept in
Tools/scene_similarity_pairs.tsv.  A distance is a suspect, not a verdict: what leaves a genre preset is decided on
the sheets and written into Tools/scene_redundant.tsv (Tools/make_genre_configs.py).
"""
import hashlib
import io
import json
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "docs", "Catalog", "img")
DATA = os.path.join(ROOT, "docs", "Catalog", "catalog-data.js")
OUT = os.path.join(ROOT, "Tools", "scene_neighbours.tsv")
CACHE = os.path.join(ROOT, ".screen", "similarity")
FRAMES = ("A", "B", "C")
WEIGHTS = {"colour": 0.35, "edges": 0.40, "spectrum": 0.25}
NEIGHBOURS = 8
HUB_K = 7
DESCRIPTOR_VERSION = 2          # raise when frame_descriptor() changes: the cache in .screen/similarity is keyed by it
# Set by the contact sheets (docs/engine-internals-67-similarity.md), on the hub-reduced scale.  Of the 95 judged
# pairs, below 0.35 lie 10 "same", 4 "near" and 1 "different"; above 0.35 no group is taken as a duplicate.  The
# clusters are a step looser: their largest ones (5 scenes) were looked at, every member shows the same picture.
DUP_CUT = 0.35
CLUSTER_CUT = 0.55


# ---- descriptors --------------------------------------------------------------------------------------------------

def srgb_to_lab(rgb):
    """CIE Lab (D65) of sRGB values in 0..1, shape (..., 3)."""
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124564, 0.3575761, 0.1804375],
                  [0.2126729, 0.7151522, 0.0721750],
                  [0.0193339, 0.1191920, 0.9503041]])
    xyz = lin @ m.T / np.array([0.95047, 1.0, 1.08883])
    d = 6.0 / 29.0
    f = np.where(xyz > d ** 3, np.cbrt(xyz), xyz / (3 * d * d) + 4.0 / 29.0)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], axis=-1)


def cells(a, rows, cols):
    """The mean of a (H, W, ...) array over a rows x cols grid of equal cells (H, W divisible), shape (rows, cols, ...)."""
    h, w = a.shape[:2]
    return a.reshape(rows, h // rows, cols, w // cols, *a.shape[2:]).mean(axis=(1, 3))


_SPEC = {}


def spectrum_bins(h, w):
    """Ring x orientation bin index of every FFT coefficient (12 log rings from 1.5 to 100 cycles per frame height,
    4 orientations), -1 outside; and the 2D Hann window."""
    key = (h, w)
    if key not in _SPEC:
        fy = np.fft.fftfreq(h)[:, None] * h            # cycles per frame height
        fx = np.fft.fftfreq(w)[None, :] * h            # the same unit across
        r = np.hypot(fy, fx)
        edges = np.geomspace(1.5, 100.0, 13)
        ring = np.digitize(r, edges) - 1
        ang = np.mod(np.arctan2(fy, fx), np.pi)
        ori = np.mod(np.floor((ang + np.pi / 8) / (np.pi / 4)), 4).astype(int)
        idx = np.where((ring >= 0) & (ring < 12), ring * 4 + ori, -1)
        win = np.outer(np.hanning(h), np.hanning(w))
        _SPEC[key] = (idx.ravel(), win)
    return _SPEC[key]


def frame_descriptor(path):
    """(colour, edges, spectrum) vectors of one catalogue frame."""
    im = Image.open(path).convert("RGB")
    # The bottom 12 rows go: 83 % of the C frames (and a few others) end in a black strip of about eight rows, a mark
    # of the render, not of the scene, which made the C frames of unrelated scenes alike.
    w, h = im.size
    im = im.crop((0, 0, w, h - round(12 * h / 200.0))).resize((320, 200), Image.BILINEAR)
    rgb = np.asarray(im, dtype=np.float64) / 255.0
    lab = srgb_to_lab(rgb)
    colour = (cells(lab, 5, 8) / 100.0).ravel()

    # edges on the lightness at half size (the frames are dithered and JPEG'd)
    lum = cells(lab[..., 0], 100, 160)
    gy, gx = np.gradient(lum)
    mag = np.hypot(gx, gy)
    ang = np.mod(np.arctan2(gy, gx), np.pi) / (np.pi / 8) - 0.5     # 8 bins, soft
    b0 = np.floor(ang).astype(int)
    frac = ang - b0
    hist = np.zeros((4, 4, 8))
    rows = np.repeat(np.arange(4), 25)[:, None].repeat(160, 1)
    cols = np.repeat(np.arange(4), 40)[None, :].repeat(100, 0)
    for off, wgt in ((0, 1 - frac), (1, frac)):
        np.add.at(hist, (rows, cols, np.mod(b0 + off, 8)), mag * wgt)
    hist += 1000.0 * 0.3 / 8.0                  # an isotropic floor: 0.3 Lab units of gradient per pixel
    edges = np.sqrt(hist.ravel() / hist.sum())

    # spectrum of the lightness, windowed
    g = lab[..., 0] - lab[..., 0].mean()
    idx, win = spectrum_bins(*g.shape)
    p = np.abs(np.fft.fft2(g * win)) ** 2
    ok = idx >= 0
    s = np.bincount(idx[ok], weights=p.ravel()[ok], minlength=48) / np.maximum(np.bincount(idx[ok], minlength=48), 1)
    ls = np.log10(s + 1e-3)
    spectrum = np.concatenate([ls - ls.mean(), [0.5 * ls.mean()]])
    return colour, edges, spectrum


def scenes():
    """The scene names with their three frames, in the catalogue's order, and their kind (2D / 3D)."""
    text = io.open(DATA, encoding="utf-8").read()
    data = json.loads(text[text.index("{"):text.rstrip().rstrip(";").rindex("}") + 1])
    out = []
    for e in data["entries"]:
        if e["k"] in ("2D", "3D") and all(os.path.exists(os.path.join(IMG, "%s_%s.jpg" % (e["n"], f)))
                                          for f in FRAMES):
            out.append((e["n"], e["k"]))
    return out


def descriptors(names):
    """{part: (len(names) * 3, D) array}, cached in .screen/similarity by the frames' sizes and times."""
    os.makedirs(CACHE, exist_ok=True)
    cache = os.path.join(CACHE, "frames.npz")
    stamp = [DESCRIPTOR_VERSION] + [(n, f, os.path.getsize(os.path.join(IMG, "%s_%s.jpg" % (n, f))),
              int(os.path.getmtime(os.path.join(IMG, "%s_%s.jpg" % (n, f))))) for n in names for f in FRAMES]
    key = hashlib.sha1(repr(stamp).encode("utf-8")).hexdigest()
    if os.path.exists(cache):
        z = np.load(cache, allow_pickle=False)
        if str(z["key"]) == key and list(z["names"]) == names:
            return {k: z[k] for k in WEIGHTS}
    parts = {k: [] for k in WEIGHTS}
    for i, n in enumerate(names):
        for f in FRAMES:
            c, e, s = frame_descriptor(os.path.join(IMG, "%s_%s.jpg" % (n, f)))
            parts["colour"].append(c)
            parts["edges"].append(e)
            parts["spectrum"].append(s)
        if i % 250 == 0:
            print("  descriptors %d / %d" % (i, len(names)), flush=True)
    out = {k: np.array(v, dtype=np.float32) for k, v in parts.items()}
    np.savez(cache, key=key, names=np.array(names), **out)
    return out


def pair_dist(x):
    """Euclidean distances of all rows of x, (N, N) float32."""
    x = x.astype(np.float32)
    sq = (x * x).sum(axis=1)
    d = x @ x.T
    d *= -2.0
    d += sq[:, None]
    d += sq[None, :]
    np.maximum(d, 0, out=d)
    return np.sqrt(d, out=d)


def scene_distances(parts, n):
    """The modified Hausdorff distance of the scenes' frame sets, (n, n), and the per-part medians."""
    total = None
    medians = {}
    for k, w in WEIGHTS.items():
        d = pair_dist(parts[k])
        iu = np.triu_indices(d.shape[0], 1)
        rng = np.random.default_rng(1)
        pick = rng.choice(len(iu[0]), size=min(400000, len(iu[0])), replace=False)
        medians[k] = float(np.median(d[iu[0][pick], iu[1][pick]]))
        d *= w / medians[k]
        if total is None:
            total = d
        else:
            total += d
        del d
    t = total.reshape(n, 3, n, 3)
    directed = t.min(axis=3).mean(axis=1)                       # scene a's frames to their nearest of scene b
    out = np.maximum(directed, directed.T).astype(np.float64)
    np.fill_diagonal(out, 0.0)
    return out, medians


# ---- clustering --------------------------------------------------------------------------------------------------

def agglomerate(dist, cut, linkage):
    """Agglomerative clustering ("average" or "complete" linkage, Lance-Williams update) of a distance matrix,
    merging while the closest pair of clusters is below cut.  Returns a label per row (0..k-1)."""
    n = dist.shape[0]
    d = dist.copy()
    np.fill_diagonal(d, np.inf)
    size = np.ones(n)
    alive = np.ones(n, bool)
    label = np.arange(n)
    rowmin = d.min(axis=1)
    rowarg = d.argmin(axis=1)
    while True:
        i = int(np.argmin(rowmin))
        if not rowmin[i] < cut:
            break
        j = int(rowarg[i])
        if linkage == "average":
            new = (size[i] * d[i] + size[j] * d[j]) / (size[i] + size[j])
        else:
            new = np.maximum(d[i], d[j])
        new[~alive] = np.inf
        new[i] = new[j] = np.inf
        d[i, :] = new
        d[:, i] = new
        d[j, :] = np.inf
        d[:, j] = np.inf
        size[i] += size[j]
        alive[j] = False
        label[label == j] = i
        rowmin[j] = np.inf
        stale = np.where(alive & ((rowarg == i) | (rowarg == j)))[0]
        better = alive & (new < rowmin)
        rowmin[better] = new[better]
        rowarg[better] = i
        for k in set(stale.tolist()) | {i}:
            rowmin[k] = d[k].min()
            rowarg[k] = int(d[k].argmin())
    _, out = np.unique(label, return_inverse=True)
    return out


def numbered(labels, names, singles):
    """Cluster labels renumbered by size (largest first, then the first name), from 1; with singles=False a group of
    one gets 0 (no group)."""
    groups = {}
    for i, l in enumerate(labels):
        groups.setdefault(l, []).append(i)
    order = sorted(groups.values(), key=lambda g: (-len(g), names[g[0]].lower()))
    out = [0] * len(names)
    k = 0
    for g in order:
        if len(g) == 1 and not singles:
            continue
        k += 1
        for i in g:
            out[i] = k
    return out


def local_scaling(dist, k=HUB_K):
    """The distances in units of the two scenes' neighbourhoods: d(a, b) / sqrt(s_a s_b), s = the distance to the
    k-th nearest scene -- local scaling (Zelnik-Manor & Perona 2004, "Self-Tuning Spectral Clustering"), the hub
    reduction of Schnitzer, Flexer, Schedl & Widmer (2012, "Local and Global Scaling Reduce Hubs in Space").

    The hubs here are the catalogue's photos: the frames were rendered with a seeded photo sequence, so dozens of
    scenes show the same photo, and where a scene leaves the photo largely as it is, the frames of all of them are
    close -- by the photo, not by the scene.  Inside such a crowd every scene's k-th neighbour is near, which scales
    their distances up; two scenes that are alike by their own look keep a small ratio.  The result is multiplied by
    the median s, so its numbers stay on the old scale."""
    d = dist.copy()
    np.fill_diagonal(d, np.inf)
    s = np.sort(d, axis=1)[:, k - 1]
    out = dist / np.sqrt(np.outer(s, s)) * float(np.median(s))
    np.fill_diagonal(out, 0.0)
    return out


# ---- the map ----------------------------------------------------------------------------------------------------

def build():
    """Descriptors and distances: (names, kinds, distances after local scaling, raw distances, part medians)."""
    sc = scenes()
    names = [s[0] for s in sc]
    parts = descriptors(names)
    raw, medians = scene_distances(parts, len(names))
    return names, [s[1] for s in sc], local_scaling(raw), raw, medians


def labels(names, dist):
    """(cluster, dup_group) per scene: average linkage cut at CLUSTER_CUT, complete linkage cut at DUP_CUT."""
    return (numbered(agglomerate(dist, CLUSTER_CUT, "average"), names, True),
            numbered(agglomerate(dist, DUP_CUT, "complete"), names, False))


def write_map(names, dist):
    """Tools/scene_neighbours.tsv."""
    cl, dg = labels(names, dist)
    lines = ["name\tcluster\tdup_group\tneighbours\tdistances"]
    order = sorted(range(len(names)), key=lambda i: names[i].lower())
    for i in order:
        d = dist[i].copy()
        d[i] = np.inf
        nb = np.argsort(d, kind="stable")[:NEIGHBOURS]
        lines.append("%s\t%d\t%s\t%s\t%s" % (names[i], cl[i], str(dg[i]) if dg[i] else "",
                                             ",".join(names[k] for k in nb), ",".join("%.3f" % d[k] for k in nb)))
    io.open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    sizes = np.bincount(cl)[1:]
    gsz = np.bincount(dg)[1:] if max(dg) else np.array([])
    print("%d scenes: %d clusters (%d alone, largest %d, median size of the rest %d); %d near-duplicate groups with "
          "%d scenes (largest %d) -> %s" % (len(names), len(sizes), int((sizes == 1).sum()), int(sizes.max()),
                                             int(np.median(sizes[sizes > 1])) if (sizes > 1).any() else 0,
                                             len(gsz), int(gsz.sum()), int(gsz.max()) if len(gsz) else 0,
                                             os.path.relpath(OUT, ROOT)))
    return cl, dg


# ---- contact sheets ---------------------------------------------------------------------------------------------

def _font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def sheet(rows, out, fw=240, fh=150):
    """A contact sheet: each row is (label, [scene names]) -- the three frames of each scene side by side."""
    font = _font(15)
    wmax = max(len(r[1]) for r in rows)
    gap = 14
    W = wmax * (3 * fw + gap)
    H = len(rows) * (fh + 22)
    im = Image.new("RGB", (W, H), (24, 24, 24))
    dr = ImageDraw.Draw(im)
    for r, (label, group) in enumerate(rows):
        y = r * (fh + 22)
        dr.text((4, y + 2), label, fill=(235, 235, 150), font=font)
        for s, name in enumerate(group):
            x0 = s * (3 * fw + gap)
            for f, fr in enumerate(FRAMES):
                p = os.path.join(IMG, "%s_%s.jpg" % (name, fr))
                if os.path.exists(p):
                    im.paste(Image.open(p).convert("RGB").resize((fw, fh), Image.BILINEAR), (x0 + f * fw, y + 20))
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    im.save(out, quality=88)
    return out


def pair_rows(names, dist, pairs):
    return [("%2d  %.3f   %s  |  %s" % (k + 1, dist[a, b], names[a], names[b]), [names[a], names[b]])
            for k, (a, b) in enumerate(pairs)]


def calibration_pairs(dist, count, lo=None, hi=None, seed=7):
    """count pairs spread along the scale: by log rank of all pairs (dense where duplicates live) up to the median,
    or uniformly in distance within lo..hi."""
    n = dist.shape[0]
    iu = np.triu_indices(n, 1)
    d = dist[iu]
    rnd = random.Random(seed)
    out = []
    if lo is None:
        order = np.argsort(d, kind="stable")
        ranks = np.unique(np.round(np.geomspace(1, len(d) // 2, count * 3)).astype(int) - 1)
        ranks = ranks[np.round(np.linspace(0, len(ranks) - 1, count)).astype(int)]
        seen = set()
        for r in ranks:
            r = min(len(order) - 1, r + rnd.randrange(0, max(1, r // 4 + 1)))
            while r in seen:
                r += 1
            seen.add(r)
            out.append((int(iu[0][order[r]]), int(iu[1][order[r]])))
    else:
        sel = np.where((d >= lo) & (d < hi))[0]
        targets = np.linspace(lo, hi, count + 2)[1:-1]
        ds = d[sel].copy()
        for t in targets:
            j = int(np.argmin(np.abs(ds - t)))
            if not np.isfinite(ds[j]):
                break
            ds[j] = np.inf                                     # each pair once
            k = sel[j]
            out.append((int(iu[0][k]), int(iu[1][k])))
    out.sort(key=lambda p: dist[p])
    return out


def write_sheets(rows, outdir, tag, per=8):
    paths = []
    for s in range(0, len(rows), per):
        paths.append(sheet(rows[s:s + per], os.path.join(outdir, "%s_%02d.jpg" % (tag, s // per + 1))))
    print("\n".join(paths))


# ---- generator families -----------------------------------------------------------------------------------------

FAMILY_CALLS = {"fractal (FRAC_LIB)": ("fracTrap(",), "flow (LIC_LIB)": ("licSmear(",),
                "long exposure (EXPO_LIB)": ("expAccum(",),
                "rhythm carpet (RHY_LIB)": ("rhyBeat(", "rhyBar(", "rhyPhrase(", "rhySec")}


def families(names):
    """{family: [scene index]} for the scenes generated from one template library (Tools/scenegen/gen.py)."""
    src = os.path.join(ROOT, "Tools", "scenegen", "src")
    idx = {n: i for i, n in enumerate(names)}
    out = {f: [] for f in FAMILY_CALLS}
    for fn in sorted(os.listdir(src)):
        n = fn[:-5]
        if not fn.endswith(".glsl") or n not in idx:
            continue
        body = io.open(os.path.join(src, fn), encoding="utf-8", errors="replace").read()
        for fam, calls in FAMILY_CALLS.items():
            if any(c in body for c in calls):
                out[fam].append(idx[n])
    return out


def family_report(names, dist):
    """Distances within each generator family against random pairs: median, and the rank of each member's nearest
    family member among all its neighbours."""
    n = len(names)
    iu = np.triu_indices(n, 1)
    alld = dist[iu]
    print("all pairs: median %.3f, 1 %% %.3f, 0.1 %% %.3f" % (np.median(alld), np.percentile(alld, 1),
                                                             np.percentile(alld, 0.1)))
    fams = families(names)
    for f, ids in fams.items():
        if len(ids) < 2:
            continue
        sub = dist[np.ix_(ids, ids)]
        within = sub[np.triu_indices(len(ids), 1)]
        # each member: the rank (among all n-1 others) of its nearest family member, and how many of its 8
        # neighbours are of the family
        ranks, in8 = [], []
        for i in ids:
            d = dist[i].copy()
            d[i] = np.inf
            order = np.argsort(d, kind="stable")
            pos = {k: r for r, k in enumerate(order)}
            ranks.append(min(pos[k] for k in ids if k != i) + 1)
            in8.append(sum(1 for k in order[:NEIGHBOURS] if k in ids))
        # chance: the family's share of the others
        print("%-26s %3d scenes  within median %.3f (all pairs %.3f; %.0f %% below the all-pairs 10th percentile %.3f)"
              "  nearest family member at rank %d (median; chance %d)  %.1f of 8 neighbours of the family (chance %.2f)"
              % (f, len(ids), np.median(within), np.median(alld), 100 * np.mean(within < np.percentile(alld, 10)),
                 np.percentile(alld, 10), int(np.median(ranks)), (n - 1) // len(ids), np.mean(in8),
                 8.0 * (len(ids) - 1) / (n - 1)))
    # across families: pairs of members of two different families
    keys = [f for f in fams if len(fams[f]) >= 2]
    across = [dist[a, b] for x in range(len(keys)) for y in range(x + 1, len(keys))
              for a in fams[keys[x]] for b in fams[keys[y]]]
    print("%-26s %3s          median %.3f" % ("across families", "", np.median(across)))


PLANS = os.path.join(ROOT, ".screen", "schedule")
LOOSE_CUT = 0.70


def read_plan_changes(path):
    """(preset, audio, [(scene, next)]) from a scene plan of Kaleidoscope.exe --schedule (Tools/check_schedule.py)."""
    head, cols, out = {}, None, []
    for line in io.open(path, encoding="utf-8"):
        v = line.rstrip("\n").split("\t")
        if v[0] == "# schedule":
            head = dict(x.split("=", 1) for x in v[1:])
        elif v[0] == "kind":
            cols = v
        elif cols and v[0] == "scene":
            r = dict(zip(cols, v))
            out.append((r["scene"].rsplit(".frag", 1)[0], r["next"].rsplit(".frag", 1)[0]))
    return head.get("preset", "?"), head.get("audio", "?"), out


def plan_report(names, dist, paths):
    """Plan 20.11.2026 B4: in the real scheduler's plans, how many changes go to a scene of the same cluster, the same
    near-duplicate group, or one of the eight nearest -- against what a blind pick from the preset would give -- and
    the longest run of scenes that stay in one cluster."""
    idx = {n: i for i, n in enumerate(names)}
    cl, dg = labels(names, dist)
    loose = numbered(agglomerate(dist, LOOSE_CUT, "average"), names, True)
    d = dist.copy()
    np.fill_diagonal(d, np.inf)
    nn = np.argsort(d, axis=1)[:, :NEIGHBOURS]
    sz = np.bincount(loose)[1:]
    print("clusters: %d (largest %d); loose clusters (average linkage at %.2f): %d (largest %d, %d scenes in groups)"
          % (max(cl), int(np.bincount(cl).max()), LOOSE_CUT, len(sz), int(sz.max()), int(sz[sz > 1].sum())))
    print("%-12s %-17s %6s %13s %9s %13s %13s %6s %6s" % ("preset", "audio", "changes", "same cluster", "dup grp",
                                                        "loose", "8 nearest", "chain", "loose"))
    for path in paths:
        preset, audio, ch = read_plan_changes(path)
        ch = [(a, b) for a, b in ch if a in idx and b in idx and a != b]
        if not ch:
            continue
        pool = sorted(set(a for a, _ in ch) | set(b for _, b in ch))     # the scenes the plan shows
        pidx = [idx[p] for p in pool]
        same = sum(1 for a, b in ch if cl[idx[a]] == cl[idx[b]])
        dup = sum(1 for a, b in ch if dg[idx[a]] and dg[idx[a]] == dg[idx[b]])
        lo = sum(1 for a, b in ch if loose[idx[a]] == loose[idx[b]])
        near = sum(1 for a, b in ch if idx[b] in nn[idx[a]])
        # a blind pick among the scenes the plan shows: the chance of each relation, averaged over the changes
        pset = set(pidx)
        def chance(rel):
            return np.mean([sum(1 for k in pidx if k != idx[a] and rel(idx[a], k)) / (len(pidx) - 1) for a, _ in ch])
        c_cl = chance(lambda i, k: cl[i] == cl[k])
        c_lo = chance(lambda i, k: loose[i] == loose[k])
        c_nn = np.mean([sum(1 for k in nn[idx[a]] if k in pset) / (len(pidx) - 1) for a, _ in ch])

        def longest(lab):
            best = run = 1
            for a, b in ch:
                run = run + 1 if lab[idx[a]] == lab[idx[b]] else 1
                best = max(best, run)
            return best
        n = len(ch)
        print("%-12s %-17s %6d %5d %5.2f%% %4d %5.2f%% %5d %5.2f%% %4d %5.2f%% %6d %6d   chance: cluster %.2f%%, "
              "loose %.2f%%, 8 nearest %.2f%%"
              % (preset, audio[:17], n, same, 100.0 * same / n, dup, 100.0 * dup / n, lo, 100.0 * lo / n, near,
                 100.0 * near / n, longest(cl), longest(loose), 100 * c_cl, 100 * c_lo, 100 * c_nn))


PAIRS = os.path.join(ROOT, "Tools", "scene_similarity_pairs.tsv")


def calibration_report(names, dist, raw):
    """The pairs judged on the contact sheets (Tools/scene_similarity_pairs.tsv: same / near / different) against
    both distances: how well each separates "same" from "different" (the area under the ROC curve), and what lies
    below each threshold."""
    idx = {n: i for i, n in enumerate(names)}
    rows = [ln.rstrip("\n").split("\t") for ln in io.open(PAIRS, encoding="utf-8")][1:]
    rows = [r for r in rows if len(r) >= 3 and r[0] in idx and r[1] in idx]
    print("%d judged pairs: %s" % (len(rows), ", ".join("%s %d" % (v, sum(1 for r in rows if r[2] == v))
                                                         for v in ("same", "near", "different"))))
    for label, m in (("raw", raw), ("hub-reduced", dist)):
        d = {v: [m[idx[r[0]], idx[r[1]]] for r in rows if r[2] == v] for v in ("same", "near", "different")}
        auc = np.mean([1.0 if s < x else 0.5 if s == x else 0.0 for s in d["same"] for x in d["different"]])
        print("%-12s AUC same vs different %.3f; same %.3f..%.3f, near %.3f..%.3f, different from %.3f" % (
            label, auc, min(d["same"]), max(d["same"]), min(d["near"]), max(d["near"]), min(d["different"])))
        for t in np.arange(0.20, 0.50, 0.025):
            print("   below %.3f: same %2d  near %2d  different %2d" % (
                t, sum(x < t for x in d["same"]), sum(x < t for x in d["near"]), sum(x < t for x in d["different"])))


# ---- main -------------------------------------------------------------------------------------------------------

def below_normal():
    """Run at below-normal priority on Windows (a few minutes of numpy on all cores; the machine stays usable)."""
    if os.name == "nt":
        import ctypes
        k = ctypes.windll.kernel32
        k.SetPriorityClass(k.GetCurrentProcess(), 0x4000)


def main():
    args = [a for a in sys.argv[1:] if a != "--raw"]
    below_normal()
    names, kinds, dist, raw, medians = build()
    if "--raw" in sys.argv:                          # the distances before the hub reduction (for comparison)
        dist = raw
    print("frame medians: " + ", ".join("%s %.4f" % kv for kv in medians.items()))
    if not args:
        write_map(names, dist)
        return 0
    cmd = args[0]
    if cmd == "--pairs":
        count = int(args[2]) if len(args) > 2 else 50
        write_sheets(pair_rows(names, dist, calibration_pairs(dist, count)), args[1], "pairs")
    elif cmd == "--band":
        count = int(args[4]) if len(args) > 4 else 24
        lo, hi = float(args[2]), float(args[3])
        write_sheets(pair_rows(names, dist, calibration_pairs(dist, count, lo, hi)), args[1],
                     "band_%.2f_%.2f" % (lo, hi))
    elif cmd == "--sheet":
        idx = {n: i for i, n in enumerate(names)}
        group = args[2].split(",")
        rows = [("%s  (%.3f to the first)" % (g, dist[idx[group[0]], idx[g]]), [g]) for g in group]
        print(sheet(rows, args[1]))
    elif cmd == "--clusters":
        cl, _ = write_map(names, dist)
        count = int(args[2]) if len(args) > 2 else 12
        for c in range(1, count + 1):
            ids = [i for i in range(len(names)) if cl[i] == c]
            rnd = random.Random(c)
            show = ids if len(ids) <= 16 else rnd.sample(ids, 16)
            rows = [("cluster %d (%d)  %s" % (c, len(ids), names[i]), [names[i]]) for i in show]
            # two columns of scenes per row
            rows2 = [("%s   ||   %s" % (rows[k][0], rows[k + 1][0] if k + 1 < len(rows) else ""),
                      rows[k][1] + (rows[k + 1][1] if k + 1 < len(rows) else [])) for k in range(0, len(rows), 2)]
            print(sheet(rows2, os.path.join(args[1], "cluster_%03d.jpg" % c), fw=200, fh=125))
    elif cmd == "--dups":
        _, dg = write_map(names, dist)
        rows = []
        for g in range(1, max(dg) + 1):
            ids = [i for i in range(len(names)) if dg[i] == g]
            sub = max(dist[a, b] for a in ids for b in ids)
            rows.append(("group %d  (%d, widest %.3f)  %s" % (g, len(ids), sub, ", ".join(names[i] for i in ids)),
                         [names[i] for i in ids[:3]]))
        write_sheets(rows, args[1], "dups")
    elif cmd == "--families":
        family_report(names, dist)
    elif cmd == "--calibration":
        calibration_report(names, dist, raw)
    elif cmd == "--plans":
        folder = args[1] if len(args) > 1 else PLANS
        paths = sorted(os.path.join(folder, f) for f in os.listdir(folder) if f.endswith(".tsv"))
        plan_report(names, dist, paths)
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
