# -*- coding: utf-8 -*-
r"""Depth maps for the photos: one 8-bit map per photo and a table of relief and subject measures.

Plan of 26.11.2026, packages T0 (depth maps, two models compared) and M1 (subject centre and subject depth).
The app reads the maps from <photo folder>\.depth\ (the photo walk skips that folder: QFileInfo::baseName() of
".depth" is empty, RenderPipeline::traverse) or from KALEIDO_DEPTH_DIR (the same files, flat).

Output, per photo of --images (the long side of the map is 512, the photo's aspect is kept):
  <out>\<photo name without extension>.png   8-bit grey, 255 = near, 0 = far, stretched per photo between the 2nd
                                             and the 98th percentile of the model's inverse depth (disparity)
  <out>\photo_info.tsv                        one row per photo, header `file relief slope flat fx fy thr conf model`;
                                             rows of earlier runs are kept and merged (sorted by file name)
Columns: relief = spread of the depth once the large-scale tilt or bowl of the picture is removed, relative to the
distance (relief_measures(); 0 = a surface without relief, flat photos read below 0.1, photos with things in them
0.3 and more); slope = share of the area with a real gradient (edges of things, slopes; a tilt alone does not
count); flat = 1 when relief is low, or lowish without slope, and no clear subject (FLAT_*; patterns, textures,
sky -- the app then gives the photo no depth); mask = how well `map >= thr` reproduces the subject region (0..1);
fx, fy = subject centre in image coordinates (x right, y DOWN, 0..1); thr = map value 0..1 that separates the
subject from the background (subject is map >= thr); conf = 0..1, how clearly that subject stands out (subject();
the app falls back to the picture centre when it is low; 0 for flat photos).  "-" where not measured.

Models (the licence lines and the comparison: docs/engine-internals-69-maps.md):
  dav2s  Depth Anything V2 Small (Hugging Face depth-anything/Depth-Anything-V2-Small-hf, Apache-2.0), disparity
  da3ml  Depth Anything 3 Mono Large (Hugging Face depth-anything/DA3MONO-LARGE, Apache-2.0), depth; the code from
         github.com/ByteDance-Seed/Depth-Anything-3 (Apache-2.0), installed without its export dependencies

Environment: its own venv (see Tools/depth_maps_requirements.txt), HF_HOME pointing at a cache outside the profile
and the repository.  torch is imported only when a model runs, so --help, --measure and --sheet need no GPU.

  python Tools/depth_maps.py --images Images --out <dir> --model dav2s [--files a.jpg b.jpg | --list photos.txt]
         [--limit N] [--force] [--raw <dir>]
      Computes the maps that are missing or older than their photo (resumable: kill it and start it again), one model
      on the GPU, at below-normal priority.  --raw keeps the model's own output (float16 .npy, map size) for
      re-measuring without the model.
  python Tools/depth_maps.py --measure --images Images --out <dir> [--raw <dir>] [--files ... | --list ...]
      Recomputes relief/slope/flat and fx/fy/thr/conf from the maps (and the raw output where kept), no model.
  python Tools/depth_maps.py --sheet compare --images Images --maps <dirA> <dirB> --sheets <dir> --list photos.txt
      Per photo: photo | map A | map B, and a parallax strip per map (the photo resampled with the map, +-2/4 %).
  python Tools/depth_maps.py --sheet subject --images Images --out <dir> --sheets <dir> --list photos.txt
      The subject centre as a cross, the subject outline (map >= thr, the chosen region), conf, per photo.
  python Tools/depth_maps.py --sheet flat --images Images --out <dir> --sheets <dir>
      The photos the flat rule calls flat and the borderline ones, photo next to map, sorted by relief.
"""
import argparse
import os
import sys
import time

COLUMNS = ["file", "relief", "slope", "flat", "fx", "fy", "thr", "conf", "model", "mask"]
EXTS = (".jpg", ".jpeg", ".png")
MAP_SIDE = 512                     # the long side of a map

# Model registry: Hugging Face repository, pinned revision (the one compared on 26.11.2026), what the model predicts.
MODELS = {
    "dav2s": {"repo": "depth-anything/Depth-Anything-V2-Small-hf",
              "rev": "5426e4f0f36572d16453bbda7a8389317b1bef99", "kind": "disparity"},
    "da3ml": {"repo": "depth-anything/DA3MONO-LARGE",
              "rev": "f465978e618db8cc79c83b8bbf24964857db1875", "kind": "depth"},
}

# ---- relief and the flat rule (calibrated on sheets, see docs/engine-internals-69-maps.md) ------------------------
MEASURE_SIDE = 128                 # the measures run on the map shrunk to this long side
SLOPE_RANGE = 1.0                  # a "real" gradient: the map's whole range within one image width (after detrend)
FLAT_RELIEF = 0.10                 # flat when relief < this,
FLAT_RELIEF_SOFT = 0.25            # ... or when relief < this and
FLAT_SLOPE = 0.15                  # ... slope < this (a receding surface without things on it)
SUBJECT_RESCUE = 0.5               # ... unless the subject measure finds a clear subject (judge())

np = None                          # numpy, imported in main() (so that --help runs anywhere)


def lazy_imports():
    """numpy and scipy are needed by every mode except --help."""
    global np
    import numpy
    np = numpy


def below_normal():
    """Below-normal priority on Windows (the machine stays usable while maps are computed)."""
    if os.name == "nt":
        import ctypes
        k = ctypes.windll.kernel32
        k.SetPriorityClass(k.GetCurrentProcess(), 0x4000)


# ---- files -------------------------------------------------------------------------------------------------------

def photo_names(images, files=None, list_file=None, limit=None):
    """The photos to work on: --files, the names in --list (one per line, '#' starts a comment) or the folder."""
    if files:
        names = list(files)
    elif list_file:
        names = []
        with open(list_file, encoding="utf-8") as f:
            for line in f:
                line = line.split("#")[0].strip()
                if line:
                    names.append(line)
    else:
        names = sorted(n for n in os.listdir(images)
                       if n.lower().endswith(EXTS) and os.path.isfile(os.path.join(images, n)))
    if limit:
        names = names[:limit]
    return names


def stem(name):
    return os.path.splitext(name)[0]


def map_path(out, name):
    return os.path.join(out, stem(name) + ".png")


def raw_path(raw, name):
    return os.path.join(raw, stem(name) + ".npy") if raw else None


def read_info(out):
    """photo_info.tsv of a map folder as {file: {column: text}} (missing file: empty)."""
    rows = {}
    p = os.path.join(out, "photo_info.tsv")
    if not os.path.isfile(p):
        return rows
    with open(p, encoding="utf-8") as f:
        head = f.readline().rstrip("\r\n").split("\t")
        for line in f:
            cells = line.rstrip("\r\n").split("\t")
            if not cells or not cells[0]:
                continue
            rows[cells[0]] = {c: (cells[i] if i < len(cells) else "") for i, c in enumerate(head)}
    return rows


def write_info(out, rows):
    """Writes photo_info.tsv atomically (a temporary file, then a rename), rows sorted by file name."""
    p = os.path.join(out, "photo_info.tsv")
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write("\t".join(COLUMNS) + "\n")
        for name in sorted(rows):
            r = rows[name]
            f.write("\t".join(str(r.get(c, "-") if r.get(c, "") != "" else "-") for c in COLUMNS) + "\n")
    os.replace(tmp, p)


def fmt(v, digits=3):
    return ("%%.%df" % digits) % v


def load_photo(path, side=None):
    """The photo as float32 RGB 0..1 (optionally resized so that its long side is `side`)."""
    from PIL import Image
    with Image.open(path) as im:
        im = im.convert("RGB")
        if side:
            w, h = im.size
            s = side / float(max(w, h))
            im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.BICUBIC)
        return np.asarray(im, dtype=np.float32) / 255.0


def load_map(path):
    """A map PNG as float32 0..1 (1 = near)."""
    from PIL import Image
    with Image.open(path) as im:
        return np.asarray(im.convert("L"), dtype=np.float32) / 255.0


def resize_float(a, h, w):
    """Bilinear resize of a 2D float array (PIL mode F)."""
    from PIL import Image
    return np.asarray(Image.fromarray(a.astype(np.float32), "F").resize((w, h), Image.BILINEAR), dtype=np.float32)


def shrink(a, side):
    """Area-averaged shrink of a 2D array so that its long side is `side` (PIL BOX filter)."""
    from PIL import Image
    h, w = a.shape
    s = side / float(max(h, w))
    return np.asarray(Image.fromarray(a.astype(np.float32), "F").resize(
        (max(1, round(w * s)), max(1, round(h * s))), Image.BOX), dtype=np.float32)


# ---- from the model's output to the map --------------------------------------------------------------------------

def disparity(raw, kind):
    """The model's output as inverse depth (near = large): Depth Anything V2 predicts disparity, DA3 depth."""
    if kind == "depth":
        return 1.0 / np.maximum(raw, 1e-6)
    return raw


def stretch(disp):
    """The map 0..1 (1 = near): disparity stretched between its 2nd and 98th percentile, clipped."""
    p2, p98 = np.percentile(disp, [2.0, 98.0])
    if p98 - p2 < 1e-9:
        return np.full(disp.shape, 0.5, dtype=np.float32)
    return np.clip((disp - p2) / (p98 - p2), 0.0, 1.0).astype(np.float32)


def to_u8(n):
    return np.clip(np.round(n * 255.0), 0, 255).astype(np.uint8)


# ---- measures ----------------------------------------------------------------------------------------------------

def detrend(a):
    """a minus its least-squares quadratic surface over the picture (1, x, y, x^2, y^2, xy).

    A plane seen in perspective is linear in the image coordinates in disparity, a gentle bowl or vignette (what the
    models make of a flat pattern) nearly quadratic; what is left is relief."""
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]
    x = ((xx + 0.5) / w - 0.5).ravel()
    y = ((yy + 0.5) / h - 0.5).ravel()
    q = np.stack([np.ones_like(x), x, y, x * x, y * y, x * y], 1)
    c, *_ = np.linalg.lstsq(q, a.ravel().astype(np.float64), rcond=None)
    return (a.ravel() - q @ c).reshape(h, w).astype(np.float32)


def relief_measures(n, disp=None):
    """relief, slope and flat of one map.

    n: the map 0..1 (1 = near) at any size; disp: the model's disparity at map size, or None (then relief cannot be
    measured and is None).
    relief: the spread of the disparity once its large-scale trend is removed (5..95 % range of the residual after
    a quadratic fit, at MEASURE_SIDE), relative to the median disparity -- for a disparity known up to scale, about
    the depth of the relief over its distance.  A tilted or curved surface without relief reads near 0 however steep
    the model thinks it recedes; on the 20 test photos the flat ones read 0.01..0.09, the ones with relief 0.32..3.7.
    slope: share of the area where the smoothed, detrended map changes by more than SLOPE_RANGE map ranges per image
    width (edges of things and real slopes; a tilt alone does not count).
    flat: relief < FLAT_RELIEF, or relief < FLAT_RELIEF_SOFT and slope < FLAT_SLOPE (calibrated on sheets of the
    whole folder, docs/engine-internals-69-maps.md; judge() rescues flat photos with a clear subject).
    """
    from scipy import ndimage
    m = shrink(n, MEASURE_SIDE)
    m = detrend(ndimage.gaussian_filter(m, 1.0, mode="reflect"))
    gy, gx = np.gradient(m)
    g = np.hypot(gx, gy) * max(m.shape)          # map ranges per image width
    slope = float(np.mean(g > SLOPE_RANGE))
    relief = flat = None
    if disp is not None:
        d = shrink(disp, MEASURE_SIDE)
        q5, q95 = np.percentile(detrend(d), [5.0, 95.0])
        med = float(np.median(d))
        relief = float(np.clip((q95 - q5) / med, 0.0, 9.99)) if med > 1e-9 else 0.0
        flat = 1 if relief < FLAT_RELIEF or (relief < FLAT_RELIEF_SOFT and slope < FLAT_SLOPE) else 0
    return relief, slope, flat


def otsu(values, bins=128):
    """Otsu's threshold of values in 0..1 and the between-class share of the variance (eta, 0..1)."""
    h, edges = np.histogram(values, bins=bins, range=(0.0, 1.0))
    p = h.astype(np.float64) / max(1, h.sum())
    c = 0.5 * (edges[:-1] + edges[1:])
    w0 = np.cumsum(p)
    m0 = np.cumsum(p * c)
    mt = m0[-1]
    w1 = 1.0 - w0
    with np.errstate(divide="ignore", invalid="ignore"):
        sb = (mt * w0 - m0) ** 2 / (w0 * w1)
    sb[~np.isfinite(sb)] = 0.0
    k = int(np.argmax(sb))
    var = float(np.sum(p * (c - mt) ** 2))
    return float(edges[k + 1]), (float(sb[k]) / var if var > 1e-12 else 0.0)


def background_plane(m, iters=4, keep=60.0, quad=None):
    """The surface the far part of the map lies on: a least-squares plane (or quadratic surface, SUBJECT_BG),
    refitted on the pixels at or below the `keep` percentile of the residual (robust against the subject that
    rises above it)."""
    quad = SUBJECT_BG == "quad" if quad is None else quad
    h, w = m.shape
    yy, xx = np.mgrid[0:h, 0:w]
    x = ((xx + 0.5) / w - 0.5).ravel()
    y = ((yy + 0.5) / h - 0.5).ravel()
    terms = [np.ones_like(x), x, y] + ([x * x, y * y, x * y] if quad else [])
    q = np.stack(terms, 1)
    v = m.ravel().astype(np.float64)
    sel = np.ones(v.shape, bool)
    for _ in range(iters):
        c, *_ = np.linalg.lstsq(q[sel], v[sel], rcond=None)
        r = v - q @ c
        sel = r <= np.percentile(r, keep)
    return (q @ c).reshape(h, w).astype(np.float32)


def morph(mask, op, it=1):
    """Binary opening/closing with the picture's edge continued outward (ndimage pads with 0 otherwise, which
    peels every region off the border)."""
    from scipy import ndimage
    p = it + 1
    big = np.pad(mask, p, mode="edge")
    big = (ndimage.binary_opening if op == "open" else ndimage.binary_closing)(big, iterations=it)
    return big[p:-p, p:-p]


SUBJECT_BG = "quad"                # the background the subject rises above: "plane" or "quad"
SUBJECT_TOUCH = (0.10, 0.20)       # border factor: 1 up to 10 % of the region's outline on the frame, 0 from 30 %
SUBJECT_FACTORS = ("edge", "area", "dom", "border", "fill")


def subject(n, debug=None):
    """Subject centre and subject depth of one map (M1): the most prominent connected region that rises above the
    background plane.

    The map is smoothed at MEASURE_SIDE; a robust plane through its far part is removed (a ground or wall that
    recedes is no subject); Otsu's threshold on the rest splits near from far; after a small opening and closing the
    connected region with the largest raised volume is the subject.  fx/fy is its centroid weighted by the height
    above the threshold.  thr is the value of the PLAIN map (the shader has no plane) whose mask `map >= thr` agrees
    best with the region (intersection over union).  conf is the product of factors 0..1:
      edge   the region against a ring around it, in units of the map's 5..95 % spread
      area   its size (from 1 % rising, full from 4 % to 40 %, 0 at 65 % of the picture)
      dom    its share of all near volume (one subject, not one pebble of many)
      border how little of the picture's edge it covers (a foreground band at the bottom is no subject)
      fill   area / area with its holes filled (a mesh or a web is no subject)
    conf is about the CENTRE.  How well the plain threshold reproduces the region is a separate number, mask (the
    intersection over union of `map >= thr` and the region, 0..1): on a photo that recedes, the near foreground
    passes the threshold too, and a mask drawn from it would be wrong even when the centre is right.
    Returns a dict fx, fy, thr, conf, mask, region (the region at MEASURE_SIDE, for sheets); debug, a dict,
    receives the factors.
    """
    from scipy import ndimage
    m = ndimage.gaussian_filter(shrink(n, MEASURE_SIDE), 1.0, mode="reflect")
    h, w = m.shape
    r = m - background_plane(m)
    lo, hi = np.percentile(r, [1.0, 99.0])
    rn = np.clip((r - lo) / max(1e-6, hi - lo), 0.0, 1.0)
    t, _ = otsu(rn.ravel())
    near = morph(morph(rn >= t, "open"), "close")
    lab, k = ndimage.label(near, structure=np.ones((3, 3), bool))
    if k == 0:
        return {"fx": 0.5, "fy": 0.5, "thr": 0.5, "conf": 0.0, "mask": 0.0, "region": np.zeros_like(near)}
    height = np.clip(rn - t, 0.0, None) + 0.02
    mass = ndimage.sum(height, lab, index=np.arange(1, k + 1))
    best = int(np.argmax(mass)) + 1
    mask = lab == best
    wgt = np.where(mask, height, 0.0)
    yy, xx = np.mgrid[0:h, 0:w]
    sw = float(wgt.sum())
    fx = float((wgt * (xx + 0.5)).sum() / sw / w)
    fy = float((wgt * (yy + 0.5)).sum() / sw / h)

    # the plain-map threshold that reproduces the region best
    best_iou, thr = 0.0, 0.5
    for p in np.linspace(5, 70, 14):
        tv = float(np.percentile(m[mask], p))
        sm = m >= tv
        iou = float((sm & mask).sum()) / max(1.0, float((sm | mask).sum()))
        if iou > best_iou:
            best_iou, thr = iou, tv

    area = float(mask.mean())
    dom = float(mass[best - 1]) / max(1e-6, float(mass.sum()))
    frame = np.zeros_like(mask)
    frame[0, :] = frame[-1, :] = True
    frame[:, 0] = frame[:, -1] = True
    rim = mask & ~ndimage.binary_erosion(mask)          # the region's outline; at the frame the region ends too
    touch = float((mask & frame).sum()) / max(1.0, float(rim.sum()))
    ring = ndimage.binary_dilation(mask, iterations=max(2, MEASURE_SIDE // 24)) & ~mask
    inside = float(np.median(rn[mask]))
    around = float(np.median(rn[ring])) if ring.any() else inside
    edge = inside - around
    filled = ndimage.binary_fill_holes(mask)
    fill = float(mask.sum()) / max(1.0, float(filled.sum()))

    f = {"edge": float(np.clip((edge - 0.1) / 0.3, 0.0, 1.0)),
         "area": float(np.clip((area - 0.01) / 0.03, 0.0, 1.0) * np.clip((0.65 - area) / 0.25, 0.0, 1.0)),
         "dom": float(np.clip((dom - 0.35) / 0.35, 0.0, 1.0)),
         "border": float(np.clip(1.0 - (touch - SUBJECT_TOUCH[0]) / SUBJECT_TOUCH[1], 0.0, 1.0)),
         "fill": float(np.clip((fill - 0.6) / 0.25, 0.0, 1.0))}
    conf = 1.0
    for v in f.values():
        conf *= v
    if debug is not None:
        debug.update(f)
        debug.update(raw_edge=edge, raw_area=area, raw_dom=dom, raw_touch=touch, raw_fill=fill)
    return {"fx": fx, "fy": fy, "thr": thr, "conf": float(np.clip(conf, 0.0, 1.0)), "mask": best_iou,
            "region": mask}


def judge(n, disp):
    """relief, slope, flat and the subject of one map, with the flat rule's rescue: a photo whose relief reads flat
    but which holds a clear subject (conf >= SUBJECT_RESCUE, e.g. one lump on a plain surface -- too small for the
    5..95 % spread of relief) keeps its depth.  Flat photos get conf 0."""
    relief, slope, flat = relief_measures(n, disp)
    sub = subject(n)
    if flat == 1 and sub["conf"] >= SUBJECT_RESCUE:
        flat = 0
    if flat == 1:
        sub["conf"] = 0.0
    return relief, slope, flat, sub


def measure_row(name, n, disp, model):
    relief, slope, flat, sub = judge(n, disp)
    return {"file": name, "relief": fmt(relief) if relief is not None else "-", "slope": fmt(slope),
            "flat": str(flat) if flat is not None else "-", "fx": fmt(sub["fx"]), "fy": fmt(sub["fy"]),
            "thr": fmt(sub["thr"]), "conf": fmt(sub["conf"]), "model": model, "mask": fmt(sub["mask"])}


# ---- the models (torch is imported here and nowhere else) --------------------------------------------------------

class Dav2Small:
    """Depth Anything V2 Small through transformers; predicts relative disparity at 518 px (the processor's size)."""

    def __init__(self, device):
        import torch
        from transformers import AutoImageProcessor, AutoModelForDepthEstimation
        spec = MODELS["dav2s"]
        self.torch = torch
        self.device = device
        self.proc = AutoImageProcessor.from_pretrained(spec["repo"], revision=spec["rev"])
        self.model = AutoModelForDepthEstimation.from_pretrained(spec["repo"], revision=spec["rev"],
                                                                 use_safetensors=True).to(device).eval()

    def __call__(self, pil):
        torch = self.torch
        with torch.inference_mode():
            x = self.proc(images=pil, return_tensors="pt")["pixel_values"].to(self.device)
            y = self.model(pixel_values=x).predicted_depth          # (1, h, w)
            return y[0].float().cpu().numpy()


class Da3MonoLarge:
    """Depth Anything 3 Mono Large through the authors' API; predicts relative depth at 504 px (their default).

    The API module imports its exporters (moviepy, trimesh, open3d ...) and a pose aligner (evo) at the top; neither
    is used for one image without camera poses, so both modules are replaced by empty stand-ins before the import.
    """

    def __init__(self, device, sky=True):
        import types
        for name, attrs in (("depth_anything_3.utils.export", {"export": None}),
                            ("depth_anything_3.utils.pose_align", {"align_poses_umeyama": None})):
            if name not in sys.modules:
                mod = types.ModuleType(name)
                mod.__dict__.update(attrs)
                sys.modules[name] = mod
        os.environ.setdefault("DA3_LOG_LEVEL", "WARN")
        import torch
        from depth_anything_3.api import DepthAnything3
        if not sky:
            # The net sets what its sky head calls sky (p >= 0.3) to the 99th percentile of the other depths.  On
            # dark backgrounds (a web on black) that cuts holes into the map; without it the depth head's own
            # values stay.
            from depth_anything_3.model.da3 import DepthAnything3Net
            DepthAnything3Net._process_mono_sky_estimation = lambda self, output: output
        spec = MODELS["da3ml"]
        self.torch = torch
        self.model = DepthAnything3.from_pretrained(spec["repo"], revision=spec["rev"]).to(device=device).eval()

    def __call__(self, pil):
        pred = self.model.inference([pil], process_res=504)
        return np.asarray(pred.depth[0], dtype=np.float32)


def load_model(name, device, sky=True):
    if name == "da3ml":
        return Da3MonoLarge(device, sky)
    return Dav2Small(device)


# ---- compute -----------------------------------------------------------------------------------------------------

def fresh(mp, photo):
    return os.path.isfile(mp) and os.path.getmtime(mp) >= os.path.getmtime(photo)


def compute(a):
    from PIL import Image
    below_normal()
    os.makedirs(a.out, exist_ok=True)
    if a.raw:
        os.makedirs(a.raw, exist_ok=True)
    kind = MODELS[a.model]["kind"]
    tag = a.model + ("-nosky" if a.model == "da3ml" and a.da3_sky == "off" else "")   # the model column
    names = photo_names(a.images, a.files, a.list, a.limit)
    rows = read_info(a.out)
    seen = {}
    todo, remeasure = [], []
    for nm in names:
        src = os.path.join(a.images, nm)
        if not os.path.isfile(src):
            print("missing photo:", nm)
            continue
        st = stem(nm).lower()
        if st in seen:
            print("skipped %s: same name as %s (the maps would collide)" % (nm, seen[st]))
            continue
        seen[st] = nm
        row = rows.get(nm)
        if not a.force and fresh(map_path(a.out, nm), src) and row and row.get("model") == tag:
            continue
        if not a.force and fresh(map_path(a.out, nm), src) and (row is None or row.get("relief", "-") == "-"):
            remeasure.append(nm)                     # the map exists, its row not (an interrupted run)
            continue
        todo.append(nm)
    print("%s: %d photos, %d to compute, %d to re-measure, %d up to date"
          % (a.model, len(names), len(todo), len(remeasure), len(names) - len(todo) - len(remeasure)), flush=True)
    for nm in remeasure:
        rp = raw_path(a.raw, nm)
        disp = disparity(np.load(rp).astype(np.float32), kind) if rp and os.path.isfile(rp) else None
        rows[nm] = measure_row(nm, load_map(map_path(a.out, nm)), disp, tag)
    if not todo:
        write_info(a.out, rows)
        return 0

    import torch
    torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))
    device = a.device or ("cuda" if torch.cuda.is_available() else "cpu")
    if device == "cuda":
        free, total = torch.cuda.mem_get_info()
        print("GPU %s, %.1f of %.1f GB free" % (torch.cuda.get_device_name(0), free / 2**30, total / 2**30))
        if free < 3 * 2**30:
            print("less than 3 GB of GPU memory free -- not starting (another model or app holds it)")
            return 2
    t0 = time.time()
    model = load_model(a.model, device, sky=(a.da3_sky == "on"))
    t_load = time.time() - t0
    print("model loaded in %.1f s" % t_load, flush=True)
    times = []
    last_write = time.time()
    try:
        for i, nm in enumerate(todo):
            t1 = time.time()
            src = os.path.join(a.images, nm)
            with Image.open(src) as im:
                pil = im.convert("RGB")
            W, H = pil.size
            s = MAP_SIDE / float(max(W, H))
            mw, mh = max(1, round(W * s)), max(1, round(H * s))
            t2 = time.time()
            raw = model(pil)
            if device == "cuda":
                torch.cuda.synchronize()
            t3 = time.time()
            raw = resize_float(raw, mh, mw)
            disp = disparity(raw, kind)
            n = stretch(disp)
            mp = map_path(a.out, nm)
            tmp = mp + ".tmp.png"
            Image.fromarray(to_u8(n), "L").save(tmp)
            os.replace(tmp, mp)
            if a.raw:
                rp = raw_path(a.raw, nm)
                np.save(rp + ".tmp.npy", raw.astype(np.float16))
                os.replace(rp + ".tmp.npy", rp)
            rows[nm] = measure_row(nm, n, disp, tag)
            t4 = time.time()
            times.append((t2 - t1, t3 - t2, t4 - t3))
            if a.verbose or i < 3 or (i + 1) % 50 == 0:
                print("%4d/%d %-44s read %4.0f ms  model %5.0f ms  write+measure %4.0f ms"
                      % (i + 1, len(todo), nm, 1000 * (t2 - t1), 1000 * (t3 - t2), 1000 * (t4 - t3)), flush=True)
            if time.time() - last_write > 30:
                write_info(a.out, rows)
                last_write = time.time()
            if a.pause > 0:
                time.sleep(a.pause)                  # keeps the GPU load moderate while the user works
    finally:
        write_info(a.out, rows)
    warm = times[2:] if len(times) > 4 else times
    if warm:
        r, m, w = (1000.0 * sum(t[j] for t in warm) / len(warm) for j in range(3))
        line = ("%s  %s  %d photos  load %.1f s  warm per photo: read %.0f ms, model %.0f ms, write+measure %.0f ms, "
                "total %.0f ms  (%s)" % (time.strftime("%Y-%m-%d %H:%M"), tag, len(times), t_load, r, m, w,
                                         r + m + w, device))
        print(line)
        with open(os.path.join(a.out, "runs.log"), "a", encoding="utf-8", newline="\n") as f:
            f.write(line + "\n")
    return 0


def measure(a):
    """Recomputes the measures from the maps (and the raw output where kept); keeps the model column."""
    rows = read_info(a.out)
    names = photo_names(a.images, a.files, a.list, a.limit)
    done = 0
    for nm in names:
        mp = map_path(a.out, nm)
        if not os.path.isfile(mp):
            continue
        model = rows.get(nm, {}).get("model", "-")
        kind = MODELS.get(model.split("-")[0], {}).get("kind", "disparity")
        rp = raw_path(a.raw, nm)
        disp = disparity(np.load(rp).astype(np.float32), kind) if rp and os.path.isfile(rp) else None
        if disp is None and nm in rows and rows[nm].get("relief", "-") != "-":
            # relief needs the raw output: keep the measured one, recompute the rest from the map
            relief = float(rows[nm]["relief"])
            n = load_map(mp)
            _, slope, _ = relief_measures(n, None)
            flat = 1 if relief < FLAT_RELIEF or (relief < FLAT_RELIEF_SOFT and slope < FLAT_SLOPE) else 0
            sub = subject(n)
            if flat == 1 and sub["conf"] >= SUBJECT_RESCUE:
                flat = 0
            rows[nm].update(slope=fmt(slope), flat=str(flat), fx=fmt(sub["fx"]), fy=fmt(sub["fy"]),
                            thr=fmt(sub["thr"]), conf=fmt(sub["conf"] if flat == 0 else 0.0), mask=fmt(sub["mask"]))
        else:
            rows[nm] = measure_row(nm, load_map(mp), disp, model)
        done += 1
    write_info(a.out, rows)
    print("re-measured %d maps in %s" % (done, a.out))
    return 0


# ---- sheets ------------------------------------------------------------------------------------------------------

def parallax(photo, n, shift):
    """The photo resampled with the map: a point at map value v moves by shift * width * (v - 0.5) to the right
    (a backward warp with the map at the target, as a shader does it; mirrored edges)."""
    from scipy import ndimage
    h, w = n.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    sx = xx - shift * w * (n - 0.5)
    out = np.empty_like(photo)
    for c in range(3):
        out[..., c] = ndimage.map_coordinates(photo[..., c], [yy, sx], order=1, mode="mirror")
    return out


def to_img(a):
    from PIL import Image
    if a.ndim == 2:
        return Image.fromarray(to_u8(a), "L").convert("RGB")
    return Image.fromarray(to_u8(a), "RGB")


def font(size=14):
    from PIL import ImageFont
    for f in ("arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


def edge_window(maps, side):
    """The square window (fraction `side` of the picture) with the most depth edges of the given maps: (x0, y0)."""
    from scipy import ndimage
    acc = None
    for mp in maps:
        if mp is None:
            continue
        m = shrink(mp, 128)
        gy, gx = np.gradient(ndimage.gaussian_filter(m, 1.0))
        g = np.hypot(gx, gy)
        acc = g if acc is None else acc + g
    if acc is None:
        return 0.5 - side / 2, 0.5 - side / 2
    k = max(1, int(round(side * acc.shape[0])))
    box = ndimage.uniform_filter(acc, size=k, mode="constant")
    h = k // 2
    inner = box[h:acc.shape[0] - h, h:acc.shape[1] - h]
    iy, ix = np.unravel_index(int(np.argmax(inner)), inner.shape)
    return ix / float(acc.shape[1]), iy / float(acc.shape[0])


def label(dr, xy, text, fnt, fill=(235, 235, 235)):
    """Text on a dark box (readable on light maps)."""
    x, y = xy
    bb = dr.textbbox((x, y), text, font=fnt)
    dr.rectangle((bb[0] - 3, bb[1] - 2, bb[2] + 3, bb[3] + 2), fill=(0, 0, 0))
    dr.text((x, y), text, fill=fill, font=fnt)


def sheet_compare(a):
    """One sheet per photo: photo | map A | map B, and per map a parallax strip -- the photo at full size resampled
    with the map (shifts -4, -2, +2, +4 % of the width), shown in the window of the most depth edges at 1:1, where
    seams and haloes appear."""
    from PIL import Image, ImageDraw
    os.makedirs(a.sheets, exist_ok=True)
    names = photo_names(a.images, a.files, a.list, a.limit)
    T, S = 400, 300
    shifts = (-0.04, -0.02, 0.02, 0.04)
    fnt, small = font(16), font(13)
    labels = [os.path.basename(os.path.normpath(d)) for d in a.maps]
    infos = [read_info(d) for d in a.maps]
    overview = []
    for nm in names:
        photo = load_photo(os.path.join(a.images, nm), T)
        maps = []
        for d in a.maps:
            mp = map_path(d, nm)
            maps.append(load_map(mp) if os.path.isfile(mp) else None)
        lab_h = 22
        W = 3 * T
        Hs = lab_h + T + len(a.maps) * (lab_h + S)
        sheet = Image.new("RGB", (W, Hs), (24, 24, 24))
        dr = ImageDraw.Draw(sheet)
        full = load_photo(os.path.join(a.images, nm))
        fh, fw = full.shape[:2]
        side = min(1.0, S / float(max(fh, fw)))
        wx, wy = edge_window(maps, side)
        x0, y0 = int(round(wx * fw)), int(round(wy * fh))
        dr.text((6, 3), "%s   (strips: the window at x %d..%d, y %d..%d of %dx%d, 1:1)" % (
            nm, x0, x0 + S, y0, y0 + S, fw, fh), fill=(235, 235, 235), font=fnt)
        sheet.paste(to_img(photo), (0, lab_h))
        sx0, sy0 = x0 * photo.shape[1] / float(fw), y0 * photo.shape[0] / float(fh)
        dr.rectangle((sx0, lab_h + sy0, sx0 + S * photo.shape[1] / float(fw), lab_h + sy0 + S * photo.shape[0]
                      / float(fh)), outline=(255, 255, 0))
        for j, mp in enumerate(maps):
            if mp is not None:
                sheet.paste(to_img(resize_float(mp, photo.shape[0], photo.shape[1])), ((j + 1) * T, lab_h))
                r = infos[j].get(nm, {})
                label(dr, ((j + 1) * T + 6, lab_h + 4), "%s  relief %s  slope %s  flat %s" % (
                    labels[j], r.get("relief", "-"), r.get("slope", "-"), r.get("flat", "-")), small)
        for j, mp in enumerate(maps):
            y = lab_h + T + j * (lab_h + S)
            dr.text((6, y + 3), "%s parallax: shift %s of the width" % (
                labels[j], ", ".join("%+d %%" % round(100 * s) for s in shifts)), fill=(235, 235, 235), font=small)
            if mp is None:
                continue
            m = resize_float(mp, fh, fw)
            for k, s in enumerate(shifts):
                warped = parallax(full, m, s)[y0:y0 + S, x0:x0 + S]
                sheet.paste(to_img(warped), (k * S, y + lab_h))
        sheet.save(os.path.join(a.sheets, "cmp_%s.jpg" % stem(nm)), quality=88)
        overview.append((nm, photo, maps))
    # an overview: photo | map A | map B, four photos per row
    t = 200
    cols = 4
    rows_n = (len(overview) + cols - 1) // cols
    ov = Image.new("RGB", (cols * (1 + len(a.maps)) * t + (cols - 1) * 8, rows_n * (t + 18)), (24, 24, 24))
    dr = ImageDraw.Draw(ov)
    for i, (nm, photo, maps) in enumerate(overview):
        x0 = (i % cols) * ((1 + len(a.maps)) * t + 8)
        y0 = (i // cols) * (t + 18)
        ov.paste(to_img(photo).resize((t, t)), (x0, y0))
        for j, mp in enumerate(maps):
            if mp is not None:
                ov.paste(to_img(mp).resize((t, t)), (x0 + (j + 1) * t, y0))
        dr.text((x0 + 2, y0 + t + 2), "%s   (%s)" % (nm[:34], " | ".join(labels)), fill=(230, 230, 230), font=small)
    ov.save(os.path.join(a.sheets, "cmp_overview.jpg"), quality=88)
    print("%d comparison sheets in %s" % (len(overview), a.sheets))
    return 0


def outline(mask):
    from scipy import ndimage
    return mask & ~ndimage.binary_erosion(mask, iterations=1)


def sheet_subject(a):
    """The subject per photo: centre as a cross, the chosen region's outline, conf; 20 photos per sheet."""
    from PIL import Image, ImageDraw
    from scipy import ndimage
    os.makedirs(a.sheets, exist_ok=True)
    names = photo_names(a.images, a.files, a.list, a.limit)
    rows = read_info(a.out)
    T, cols, per, LH = 320, 5, 20, 50
    small = font(13)
    label = os.path.basename(os.path.normpath(a.out))
    tag = ("_" + a.tag) if a.tag else ""
    for s0 in range(0, len(names), per):
        chunk = names[s0:s0 + per]
        nrow = (len(chunk) + cols - 1) // cols
        sh = Image.new("RGB", (cols * T, nrow * (T + LH)), (24, 24, 24))
        dr = ImageDraw.Draw(sh)
        for i, nm in enumerate(chunk):
            x0, y0 = (i % cols) * T, (i // cols) * (T + LH)
            mp = map_path(a.out, nm)
            if not os.path.isfile(mp):
                continue
            n = load_map(mp)
            r = rows.get(nm, {})
            dbg = {}
            sub = subject(n, dbg)
            fx, fy, thr, mask = sub["fx"], sub["fy"], sub["thr"], sub["region"]
            conf = sub["conf"] if r.get("flat", "0") != "1" else 0.0
            ph = load_photo(os.path.join(a.images, nm), T)
            arr = np.asarray(to_img(ph)).copy()
            # the plain-map mask the shader will see (thin cyan), the region (thick, coloured by conf)
            sm = resize_float(n, ph.shape[0], ph.shape[1]) >= thr
            arr[outline(sm)] = (0, 230, 255)
            big = np.asarray(Image.fromarray(mask.astype(np.uint8) * 255, "L").resize(
                (ph.shape[1], ph.shape[0]), Image.NEAREST)) > 127
            ol = ndimage.binary_dilation(outline(big), iterations=1)
            col = (255, 40, 40) if conf >= 0.5 else (255, 200, 0) if conf >= 0.2 else (150, 150, 150)
            arr[ol] = col
            img = Image.fromarray(arr)
            d2 = ImageDraw.Draw(img)
            cx, cy = fx * ph.shape[1], fy * ph.shape[0]
            for dd, cc in ((5, (0, 0, 0)), (2, (255, 255, 255))):
                d2.line([(cx - 16, cy), (cx + 16, cy)], fill=cc, width=dd)
                d2.line([(cx, cy - 16), (cx, cy + 16)], fill=cc, width=dd)
            sh.paste(img, (x0, y0))
            dr.text((x0 + 3, y0 + T + 2), nm[:44], fill=(230, 230, 230), font=small)
            dr.text((x0 + 3, y0 + T + 17), "%s conf %.2f mask %.2f thr %.2f relief %s%s" % (
                label, conf, sub["mask"], thr, r.get("relief", "-"), " FLAT" if r.get("flat") == "1" else ""),
                fill=col, font=small)
            dr.text((x0 + 3, y0 + T + 32), " ".join("%s%.1f" % (k[:3], dbg.get(k, 0)) for k in SUBJECT_FACTORS),
                    fill=(170, 170, 170), font=small)
        sh.save(os.path.join(a.sheets, "subject_%s%s_%02d.jpg" % (label, tag, s0 // per)), quality=88)
    print("subject sheets for %d photos in %s" % (len(names), a.sheets))
    return 0


def sheet_flat(a):
    """The calibration sheets of the flat rule (photo | map, relief r and slope s under each):
    flat_<maps>_top     the 30 flat photos with the highest relief (just below FLAT_RELIEF)
    flat_<maps>_sample  30 flat photos at random (fixed seed)
    flat_<maps>_border  the 30 photos with relief with the lowest relief (just above FLAT_RELIEF)"""
    import random
    from PIL import Image, ImageDraw
    os.makedirs(a.sheets, exist_ok=True)
    rows = read_info(a.out)
    label = os.path.basename(os.path.normpath(a.out))
    names = photo_names(a.images, a.files, a.list, a.limit)
    items = []
    for nm in names:
        r = rows.get(nm)
        if not r or r.get("relief", "-") in ("-", ""):
            continue
        items.append((float(r["relief"]), float(r["slope"]), int(r["flat"]), nm))
    items.sort()
    flat = [it for it in items if it[2] == 1]
    relief = [it for it in items if it[2] == 0]
    sample = sorted(random.Random(26).sample(flat, min(30, len(flat))))
    T, cols = 180, 5
    small = font(12)
    for tag, chunk in (("top", flat[-30:]), ("sample", sample), ("border", relief[:30])):
        nrow = (len(chunk) + cols - 1) // cols
        sh = Image.new("RGB", (cols * 2 * T, nrow * (T + 16)), (24, 24, 24))
        dr = ImageDraw.Draw(sh)
        for i, (rel, slo, fl, nm) in enumerate(chunk):
            x0, y0 = (i % cols) * 2 * T, (i // cols) * (T + 16)
            sh.paste(to_img(load_photo(os.path.join(a.images, nm), T)).resize((T, T)), (x0, y0))
            sh.paste(to_img(load_map(map_path(a.out, nm))).resize((T, T)), (x0 + T, y0))
            dr.text((x0 + 2, y0 + T + 1), "%s r%.3f s%.2f" % (nm[:26], rel, slo), fill=(230, 230, 230), font=small)
        sh.save(os.path.join(a.sheets, "flat_%s_%s.jpg" % (label, tag)), quality=86)
    print("%s: %d flat, %d with relief, of %d measured" % (label, len(flat), len(relief), len(items)))
    return 0


# ---- main --------------------------------------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--images", required=True, help="the photo folder")
    ap.add_argument("--out", help="the map folder (maps + photo_info.tsv); required except for --sheet compare")
    ap.add_argument("--model", choices=sorted(MODELS), help="the depth model (compute mode)")
    ap.add_argument("--files", nargs="+", help="these photos (names in --images)")
    ap.add_argument("--list", help="a text file with one photo name per line")
    ap.add_argument("--limit", type=int, help="only the first N photos")
    ap.add_argument("--force", action="store_true", help="recompute maps that are up to date")
    ap.add_argument("--raw", help="keep (and read) the model's own output here, float16 .npy at map size")
    ap.add_argument("--device", choices=["cuda", "cpu"], help="default: cuda when available")
    ap.add_argument("--verbose", action="store_true", help="a line per photo")
    ap.add_argument("--pause", type=float, default=0.0, help="seconds of rest after each photo (GPU load)")
    ap.add_argument("--da3-sky", choices=["on", "off"], default="on",
                    help="da3ml: the authors' sky replacement (sky -> far); off keeps the depth head's values")
    ap.add_argument("--measure", action="store_true", help="recompute the measures from the maps, no model")
    ap.add_argument("--sheet", choices=["compare", "subject", "flat"], help="make contact sheets (JPG)")
    ap.add_argument("--maps", nargs="+", help="--sheet compare: the map folders to compare")
    ap.add_argument("--sheets", help="--sheet: where the JPGs go")
    ap.add_argument("--tag", help="--sheet subject/flat: a word in the sheet's file name")
    a = ap.parse_args()
    lazy_imports()
    if a.sheet:
        below_normal()
        if not a.sheets:
            ap.error("--sheet needs --sheets")
        if a.sheet == "compare":
            if not a.maps:
                ap.error("--sheet compare needs --maps")
            return sheet_compare(a)
        if not a.out:
            ap.error("--sheet %s needs --out" % a.sheet)
        return sheet_subject(a) if a.sheet == "subject" else sheet_flat(a)
    if not a.out:
        ap.error("--out is required")
    if a.measure:
        below_normal()
        return measure(a)
    if not a.model:
        ap.error("--model is required to compute maps")
    return compute(a)


if __name__ == "__main__":
    sys.exit(main())
