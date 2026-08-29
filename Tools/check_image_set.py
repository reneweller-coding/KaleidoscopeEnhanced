#!/usr/bin/env python3
"""Score a photo folder against docs/photo-set-spec.md.

The spec is only worth as much as the ability to check it, so every numeric
requirement in that document has a test here and prints target vs. measured.
Run it on a generated batch before shipping it as a pack:

    python Tools/check_image_set.py Images
    python Tools/check_image_set.py out\\batch --json report.json --list-rejects

CANONICAL SCALE: every metric except the format check is computed on the image
resampled to 512x512. Contrast and detail figures depend on the scale they are
measured at -- a set measured at 256 looks flatter than the same set measured
at 1024 -- so the scale is fixed here and the spec's thresholds refer to it.

Exit code 0 if every criterion passes, 1 otherwise.
"""
import argparse
import glob
import json
import os
import re
import sys

import numpy as np
from PIL import Image

S = 512                      # canonical measurement scale
LUMA = np.array([0.299, 0.587, 0.114], np.float32)


# --------------------------------------------------------------------------- #
# per-image measurement
# --------------------------------------------------------------------------- #
def measure(path):
    """Every per-image number the spec refers to, or None if unreadable."""
    try:
        im = Image.open(path)
        w, h = im.size
        im = im.convert("RGB")
    except Exception as exc:                       # noqa: BLE001 - report, don't crash
        return {"name": os.path.basename(path), "error": str(exc)}

    a512 = np.asarray(im.resize((S, S), Image.BILINEAR), np.float32) / 255.0
    L = a512 @ LUMA

    mx, mn = a512.max(2), a512.min(2)
    sat = np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0.0)

    p1, p99 = float(np.percentile(L, 1)), float(np.percentile(L, 99))

    # Structure at 1/8 scale, against structure at full scale: a texture whose
    # energy is all in fine grain turns to mush the moment a scene magnifies it.
    small = np.asarray(Image.fromarray((L * 255).astype(np.uint8)).resize(
        (S // 8, S // 8), Image.BILINEAR), np.float32) / 255.0

    # A single dominant direction survives GL_MIRRORED_REPEAT as an obvious
    # butterfly seam, so it is measured and capped rather than left to taste.
    gx = float(np.abs(np.diff(L, axis=1)).mean())
    gy = float(np.abs(np.diff(L, axis=0)).mean())

    # Centre vs. border: a subject in the middle competes with the kaleidoscope's
    # own centre; a frame or vignette shows up as a border that does not match.
    q = S // 4
    centre = float(L[q:S - q, q:S - q].mean())
    ring = np.concatenate([L[:16].ravel(), L[-16:].ravel(),
                           L[:, :16].ravel(), L[:, -16:].ravel()])
    border = float(ring.mean())

    # Radial/spiral compositions: fine in small numbers, wrong as a habit.
    Ln = (L - L.mean()) / max(float(L.std()), 1e-6)
    radial = float((Ln * np.rot90(Ln)).mean())

    # 32x32 normalised luma signature, for the near-duplicate pass.
    sig = np.asarray(Image.fromarray((L * 255).astype(np.uint8)).resize(
        (32, 32), Image.BILINEAR), np.float32).ravel()
    sig = (sig - sig.mean()) / max(float(sig.std()), 1e-6)

    return {
        "name": os.path.basename(path),
        "w": w, "h": h,
        "luma": float(L.mean()),
        "contrast": float(L.std()),
        "range": p99 - p1,
        "p1": p1, "p99": p99,
        "sat": float(sat.mean()),
        "detail": (gx + gy) / 2.0,
        "direction": abs(gx - gy) / max(gx + gy, 1e-6),
        "retention": float(small.std()) / max(float(L.std()), 1e-6),
        "cmb": centre - border,
        "radial": radial,
        "_sig": sig,
        "_hue": hue_weights(a512, sat, mx),
    }


def hue_weights(a, sat, val):
    """Colourfulness-weighted mass in 12 hue bins (red .. pink)."""
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    mx = val
    mn = a.min(2)
    d = mx - mn + 1e-9
    h = np.where(mx == r, ((g - b) / d) % 6,
        np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6.0
    w = sat * val
    idx = np.clip((h * 12).astype(int), 0, 11)
    return np.array([w[idx == k].sum() for k in range(12)], np.float64)


# --------------------------------------------------------------------------- #
# the spec
# --------------------------------------------------------------------------- #
HUE_NAMES = ["red", "orange", "yellow", "yellow-green", "green", "spring",
             "cyan", "azure", "blue", "violet", "magenta", "pink"]


def frac(rows, pred):
    return sum(1 for r in rows if pred(r)) / max(len(rows), 1)


def median(rows, key):
    v = sorted(r[key] for r in rows)
    return v[len(v) // 2] if v else 0.0


def check(rows, hue, dup_frac):
    """Return [(section, criterion, target, measured, ok)]."""
    out = []

    def add(sec, name, target, measured, ok):
        out.append((sec, name, target, measured, bool(ok)))

    # --- format ---
    sq = frac(rows, lambda r: r["w"] == 1024 and r["h"] == 1024)
    add("Format", "exactly 1024x1024", "100 %", "%.1f %%" % (100 * sq), sq >= 0.999)

    # --- tone ---
    low = frac(rows, lambda r: 0.12 <= r["luma"] <= 0.30)
    mid = frac(rows, lambda r: 0.35 <= r["luma"] <= 0.60)
    high = frac(rows, lambda r: 0.65 <= r["luma"] <= 0.85)
    add("Tone", "low-key   (mean 0.12..0.30)", "20..30 %", "%.1f %%" % (100 * low), 0.20 <= low <= 0.32)
    add("Tone", "mid       (mean 0.35..0.60)", "45..55 %", "%.1f %%" % (100 * mid), 0.43 <= mid <= 0.57)
    add("Tone", "high-key  (mean 0.65..0.85)", "20..30 %", "%.1f %%" % (100 * high), 0.20 <= high <= 0.32)

    # A dark image is not the same thing as a low-key image: the point is a dark
    # ground WITH a highlight in it. Same, mirrored, at the bright end.
    lk = [r for r in rows if r["luma"] <= 0.30]
    hk = [r for r in rows if r["luma"] >= 0.65]
    lk_ok = frac(lk, lambda r: r["p99"] >= 0.75) if lk else 0.0
    hk_ok = frac(hk, lambda r: r["p1"] <= 0.25) if hk else 0.0
    add("Tone", "low-key with a real highlight (p99>=0.75)", ">= 70 %", "%.1f %%" % (100 * lk_ok), lk_ok >= 0.70)
    add("Tone", "high-key with a real shadow  (p1<=0.25)", ">= 70 %", "%.1f %%" % (100 * hk_ok), hk_ok >= 0.70)

    # --- contrast ---
    cm = median(rows, "contrast")
    flat = frac(rows, lambda r: r["contrast"] < 0.12)
    punch = frac(rows, lambda r: r["contrast"] >= 0.20)
    rng = frac(rows, lambda r: r["range"] >= 0.55)
    add("Contrast", "median luma std", ">= 0.22", "%.3f" % cm, cm >= 0.22)
    add("Contrast", "flat images (std < 0.12)", "<= 10 %", "%.1f %%" % (100 * flat), flat <= 0.10)
    add("Contrast", "with punch (std >= 0.20)", ">= 40 %", "%.1f %%" % (100 * punch), punch >= 0.40)
    add("Contrast", "dynamic range p1..p99 >= 0.55", ">= 60 %", "%.1f %%" % (100 * rng), rng >= 0.60)

    # --- colour ---
    slo = frac(rows, lambda r: r["sat"] < 0.25)
    smid = frac(rows, lambda r: 0.25 <= r["sat"] <= 0.55)
    shi = frac(rows, lambda r: r["sat"] > 0.55)
    add("Colour", "quiet  (mean sat < 0.25)", "25..35 %", "%.1f %%" % (100 * slo), 0.25 <= slo <= 0.37)
    add("Colour", "medium (0.25..0.55)", "40..50 %", "%.1f %%" % (100 * smid), 0.38 <= smid <= 0.52)
    add("Colour", "loud   (> 0.55)", "20..30 %", "%.1f %%" % (100 * shi), 0.18 <= shi <= 0.32)
    worst_hue = float(hue.min())
    add("Colour", "thinnest hue bin (%s)" % HUE_NAMES[int(hue.argmin())],
        ">= 3 %", "%.1f %%" % (100 * worst_hue), worst_hue >= 0.03)

    # --- composition ---
    cen = frac(rows, lambda r: abs(r["cmb"]) <= 0.10)
    dirn = frac(rows, lambda r: r["direction"] <= 0.25)
    rad = frac(rows, lambda r: r["radial"] > 0.5)
    add("Composition", "no centre subject (|centre-border| <= 0.10)", ">= 90 %", "%.1f %%" % (100 * cen), cen >= 0.90)
    add("Composition", "not directional (<= 0.25)", ">= 95 %", "%.1f %%" % (100 * dirn), dirn >= 0.95)
    add("Composition", "radial/spiral compositions", "<= 8 %", "%.1f %%" % (100 * rad), rad <= 0.08)

    # --- structure ---
    ret = median(rows, "retention")
    det = median(rows, "detail")
    add("Structure", "median contrast kept at 1/8 scale", ">= 0.55", "%.2f" % ret, ret >= 0.55)
    add("Structure", "median fine detail", ">= 0.020", "%.3f" % det, det >= 0.020)

    # --- diversity ---
    add("Diversity", "near-duplicate pairs (corr > 0.60)", "<= 1 %", "%.2f %%" % (100 * dup_frac), dup_frac <= 0.01)

    # Motif spread, from the "motif-colour-colour[-n].jpg" naming convention.
    # Counting near-duplicates alone would miss a library that is diverse
    # pixel-wise but keeps circling the same handful of subjects.
    stems = {}
    for r in rows:
        s = re.sub(r"-\d+$", "", os.path.splitext(r["name"])[0])
        stems[s] = stems.get(s, 0) + 1
    want = max(400 * len(rows) // 1000, 20)          # scales with the batch size
    add("Diversity", "distinct motifs", ">= %d" % want, "%d" % len(stems), len(stems) >= want)
    worst = max(stems.values()) if stems else 0
    add("Diversity", "variants of any one motif", "<= 4", "%d" % worst, worst <= 4)
    return out


def main():
    ap = argparse.ArgumentParser(description="Score a photo folder against docs/photo-set-spec.md")
    ap.add_argument("folder")
    ap.add_argument("--json", help="write the raw per-image measurements here")
    ap.add_argument("--list-rejects", action="store_true",
                    help="also print the individual images that fail a hard limit")
    args = ap.parse_args()

    files = []
    for ext in ("jpg", "jpeg", "png", "JPG", "JPEG", "PNG"):
        files += glob.glob(os.path.join(args.folder, "*." + ext))
    files = sorted(set(files))
    if not files:
        print("no images in %s" % args.folder)
        return 1

    rows, bad = [], []
    for i, p in enumerate(files):
        r = measure(p)
        if "error" in r:
            bad.append(r)
            continue
        rows.append(r)
        if (i + 1) % 200 == 0:
            print("  ... %d/%d" % (i + 1, len(files)), file=sys.stderr)

    hue = np.sum([r.pop("_hue") for r in rows], axis=0)
    hue = hue / max(hue.sum(), 1e-9)

    # Near-duplicates: one matrix product over 32x32 signatures beats half a
    # million image comparisons.
    sig = np.stack([r.pop("_sig") for r in rows])
    n = len(rows)
    corr = (sig @ sig.T) / sig.shape[1]
    iu = np.triu_indices(n, k=1)
    dup = corr[iu]
    dup_frac = float((dup > 0.60).sum()) / max(len(dup), 1)

    print("\n  %d image(s) in %s   (metrics measured at %dx%d)" % (n, args.folder, S, S))
    if bad:
        print("  %d unreadable: %s" % (len(bad), ", ".join(b["name"] for b in bad[:5])))

    results = check(rows, hue, dup_frac)
    sec = None
    npass = 0
    for s, name, target, measured, ok in results:
        if s != sec:
            print("\n  %s" % s)
            sec = s
        npass += ok
        print("    [%s] %-42s target %-10s measured %s"
              % ("ok" if ok else "XX", name, target, measured))
    print("\n  %d/%d criteria met\n" % (npass, len(results)))

    if args.list_rejects:
        hard = [(r["name"], "not 1024x1024 (%dx%d)" % (r["w"], r["h"])) for r in rows
                if r["w"] != 1024 or r["h"] != 1024]
        hard += [(r["name"], "flat (std %.3f)" % r["contrast"]) for r in rows if r["contrast"] < 0.10]
        hard += [(r["name"], "directional (%.2f)" % r["direction"]) for r in rows if r["direction"] > 0.35]
        hard += [(r["name"], "centre subject (%.2f)" % r["cmb"]) for r in rows if abs(r["cmb"]) > 0.15]
        if hard:
            print("  individual rejects (%d):" % len(hard))
            for nm, why in hard[:60]:
                print("    %-46s %s" % (nm, why))
            if len(hard) > 60:
                print("    ... and %d more" % (len(hard) - 60))

    if args.json:
        json.dump(rows, open(args.json, "w"), indent=1)
        print("  raw measurements -> %s" % args.json)

    return 0 if npass == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
