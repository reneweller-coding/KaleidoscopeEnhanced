"""
scene_metrics.py -- quantitative "Langweiler-Scan" for recorded scene probes.

Reads a Tools/verify.ps1 recording folder (a few dozen JPEG frames of one
scene) and reduces it to the handful of numbers that actually predict the
complaints we keep making by eye:

  luma        mean brightness 0..1          -- too dark / too bright
  contrast    stddev of luma                -- flat, washed-out picture
  clipHi      fraction of pixels >= 0.97    -- blown out to white
  clipLo      fraction of pixels <= 0.03    -- crushed to black
  motion      mean |frame - prevFrame|      -- static, "boring" scene
  cover       fraction of pixels differing  -- how much of the picture carries
              from the frame's modal colour    content at all
  occ         fraction of 12x8 tiles that    -- not screen-filling: a small motif
              carry content                     stranded on a large dead field
              (sparse-but-everywhere scenes such as snowfall score high here
               while scoring low on `cover`, which is the point)
  sat         mean HSV saturation           -- garish rainbow vs photo palette
  satHi       fraction of pixels sat > 0.8  -- hard, candy-coloured pixels

Usage:
    python Tools/scene_metrics.py <recordings-root> [--json out.json]

<recordings-root> holds one sub-folder per scene (the folder name is taken as
the scene name).  Frames are sampled evenly, so a long recording costs no more
than a short one.
"""
import os, sys, json, glob
import numpy as np
from PIL import Image

SAMPLES = 10          # frames sampled per scene
LONG_EDGE = 320       # downscale for speed; enough for global statistics


def frame_stats(paths):
    lumas, sats, prev, motion = [], [], None, []
    covers, clipHi, clipLo, satHi, occ = [], [], [], [], []

    for p in paths:
        # The recorder is killed mid-write at the end of a probe, so the last
        # frame on disk is routinely a few bytes short. Skip those rather than
        # aborting the whole scan.
        try:
            im = Image.open(p).convert("RGB")
        except OSError:
            continue
        im.thumbnail((LONG_EDGE, LONG_EDGE))
        a = np.asarray(im, dtype=np.float32) / 255.0

        luma = a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        lumas.append(luma)

        mx, mn = a.max(axis=2), a.min(axis=2)
        sat = np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
        sats.append(sat)
        satHi.append(float((sat > 0.8).mean()))

        clipHi.append(float((luma >= 0.97).mean()))
        clipLo.append(float((luma <= 0.03).mean()))

        # "coverage": how much of the frame differs from its own modal colour.
        # A scene that fills the screen scores high; a small motif on a large
        # flat field scores low -- regardless of what that field's colour is.
        q = np.round(luma * 16).astype(np.int32)
        modal = np.bincount(q.ravel(), minlength=17).argmax()
        interesting = np.abs(q - modal) > 1
        covers.append(float(interesting.mean()))

        # "occupancy": of a 12x8 grid of tiles, how many contain ANY meaningful
        # content. Raw pixel coverage alone punishes legitimately sparse scenes
        # (a firefly swarm or snowfall on black is mostly background pixels yet
        # visually fills the screen) while missing the real complaint, which is
        # a small motif stranded on a large dead field. Tiles separate the two.
        th, tw = max(1, interesting.shape[0] // 8), max(1, interesting.shape[1] // 12)
        tiles = interesting[:th * 8, :tw * 12].reshape(8, th, 12, tw)
        occ.append(float((tiles.mean(axis=(1, 3)) > 0.02).mean()))

        if prev is not None:
            motion.append(float(np.abs(luma - prev).mean()))
        prev = luma

    if not lumas:
        return None
    L = np.stack(lumas)
    return {
        "frames":   len(lumas),
        "luma":     round(float(L.mean()), 4),
        "contrast": round(float(L.std()), 4),
        "clipHi":   round(float(np.mean(clipHi)), 4),
        "clipLo":   round(float(np.mean(clipLo)), 4),
        "motion":   round(float(np.mean(motion)) if motion else 0.0, 5),
        "cover":    round(float(np.mean(covers)), 4),
        "occ":      round(float(np.mean(occ)), 4),
        "sat":      round(float(np.stack(sats).mean()), 4),
        "satHi":    round(float(np.mean(satHi)), 4),
    }


def verdicts(m):
    """Human-readable flags. Thresholds tuned against scenes we already judged
    by eye during the exposure-fix pass."""
    v = []
    # Particle-on-black scenes are legitimately dark, so only call it too
    # dark when the frame is also poorly occupied.
    if m["luma"] < 0.10 and m["occ"] < 0.75:  v.append("TOO_DARK")
    if m["luma"] > 0.72:                      v.append("TOO_BRIGHT")
    if m["clipHi"] > 0.25:                    v.append("BLOWN_OUT")
    if m["clipLo"] > 0.60 and m["occ"] < 0.75: v.append("MOSTLY_BLACK")
    if m["contrast"] < 0.06:                  v.append("FLAT")
    if m["motion"] < 0.004:                   v.append("STATIC")
    # Judge "not screen-filling" on tile occupancy rather than raw pixel
    # coverage: a snowfall or firefly swarm is mostly background pixels yet
    # visually fills the frame, while a lone motif on a dead field does not.
    if m["occ"] < 0.55:                       v.append("NOT_FILLING")
    if m["satHi"] > 0.35 and m["sat"] > 0.45: v.append("GARISH")
    return v


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    root = sys.argv[1]
    out = {}
    for d in sorted(os.listdir(root)):
        full = os.path.join(root, d)
        if not os.path.isdir(full):
            continue
        jpgs = sorted(glob.glob(os.path.join(full, "*.jpg")))
        if len(jpgs) < 3:
            continue
        # skip the first few frames: shader compile / fade-in is not the scene
        jpgs = jpgs[max(2, len(jpgs) // 6):]
        idx = np.linspace(0, len(jpgs) - 1, min(SAMPLES, len(jpgs))).astype(int)
        m = frame_stats([jpgs[i] for i in idx])
        if m is None:
            print(f"  ({d}: no readable frames)")
            continue
        m["flags"] = verdicts(m)
        out[d] = m

    flagged = {k: v for k, v in out.items() if v["flags"]}
    print(f"scene_metrics: {len(out)} scene(s), {len(flagged)} flagged\n")
    hdr = f"{'scene':<44}{'luma':>7}{'cntr':>7}{'clipHi':>8}{'motion':>8}{'cover':>7}{'occ':>6}{'satHi':>7}  flags"
    print(hdr)
    print("-" * len(hdr))
    for k in sorted(out, key=lambda k: (-len(out[k]["flags"]), k)):
        m = out[k]
        print(f"{k[:43]:<44}{m['luma']:>7.3f}{m['contrast']:>7.3f}{m['clipHi']:>8.3f}"
              f"{m['motion']:>8.4f}{m['cover']:>7.3f}{m['occ']:>6.2f}{m['satHi']:>7.3f}  {','.join(m['flags'])}")

    if "--json" in sys.argv:
        p = sys.argv[sys.argv.index("--json") + 1]
        json.dump(out, open(p, "w"), indent=1)
        print(f"\nwrote {p}")


if __name__ == "__main__":
    main()
