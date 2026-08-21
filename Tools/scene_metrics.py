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
import os, sys, json, glob, subprocess, re, io
import numpy as np
from PIL import Image

SAMPLES = 10          # frames sampled per scene for the SPATIAL metrics
LONG_EDGE = 320       # downscale for speed; enough for global statistics
SECONDS = float(os.environ.get("SCENE_METRICS_SECONDS", "7"))  # probe length,
                      # needed to turn a frame index into a real frequency


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
        #
        # KNOW THIS BEFORE "FIXING" A LOW occ: the comparison is against the
        # FRAME'S OWN modal bucket, so adding a smooth haze or gradient scores
        # ZERO -- it just becomes the mode, and can even HURT, because content
        # then has to clear two buckets instead of one. Filler has to have
        # STRUCTURE, with a luma delta of roughly >= 0.10 at a feature scale of
        # about one tile or smaller. And since frames are downscaled to
        # LONG_EDGE before measuring (~6x from 1080p), any stroke thinner than
        # ~6 px at 1080p averages away entirely -- which is usually a real
        # visibility problem, not just a measurement artefact.
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


def temporal_stats(paths, seconds):
    """Continuity and hecticness, measured over EVERY frame (cheaply, at 64px).

    Two complaints this answers:

      jumps    -- a shader should be continuous. A single frame whose change is
                  far larger than the scene's own typical change is a jump
                  (a phase remap, a palette snap, a camera teleport). Measured
                  as the ratio of the largest frame-to-frame delta to the
                  median one, so a fast-but-smooth scene does not trigger it.

      flicker  -- with the test WAV at 120 BPM (2 Hz), motion or colour cycling
                  far above the beat reads as hectic strobing. We FFT the mean
                  luma and mean hue series and report how much energy sits
                  above 8 Hz (4x the beat).

    Note the sampling limit: the recorder caps at ~30 fps and heavy scenes
    render slower, so the measured rate is returned as `fps` and the highest
    trustworthy frequency is fps/2. Above that, flicker aliases DOWN and can
    masquerade as slow motion -- so a low `fps` means "cannot tell", never
    "clean". `flickBand` reports the band actually covered.
    """
    L, H = [], []
    for p in paths:
        try:
            im = Image.open(p).convert("RGB")
        except OSError:
            continue
        im.thumbnail((64, 64))
        a = np.asarray(im, dtype=np.float32) / 255.0
        L.append(float((a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)).mean()))
        mx, mn = a.max(axis=2), a.min(axis=2)
        # cheap hue proxy: the red-vs-cyan and green-vs-magenta opponent axes
        H.append((float((a[:, :, 0] - a[:, :, 2]).mean()),
                  float((a[:, :, 1] - a[:, :, 2]).mean())))
    n = len(L)
    if n < 8:
        return {}
    fps = n / max(0.001, seconds)

    L = np.asarray(L, dtype=np.float64)
    Hx = np.asarray([h[0] for h in H]); Hy = np.asarray([h[1] for h in H])

    dL = np.abs(np.diff(L))
    dH = np.hypot(np.diff(Hx), np.diff(Hy))
    med = float(np.median(dL)) if np.median(dL) > 1e-6 else 1e-6
    medH = float(np.median(dH)) if np.median(dH) > 1e-6 else 1e-6

    def band_energy(sig):
        s = sig - sig.mean()
        if np.allclose(s, 0):
            return 0.0, 0.0
        w = np.hanning(len(s))
        mag = np.abs(np.rfft(s * w)) if hasattr(np, "rfft") else np.abs(np.fft.rfft(s * w))
        freq = np.fft.rfftfreq(len(s), d=1.0 / fps)
        tot = float((mag ** 2).sum())
        if tot <= 0:
            return 0.0, 0.0
        hi = float((mag[freq > 8.0] ** 2).sum()) / tot
        dom = float(freq[int(np.argmax(mag))])
        return hi, dom

    hiL, domL = band_energy(L)
    hiH, _ = band_energy(Hx + Hy)

    return {
        "fps":       round(fps, 1),
        "flickBand": round(fps / 2.0, 1),
        "jump":      round(float(dL.max() / med), 1),
        "hueJump":   round(float(dH.max() / medH), 1),
        "flickHi":   round(hiL, 4),
        "hueFlickHi": round(hiH, 4),
        "domHz":     round(domL, 2),
    }


def verdicts(m):
    """Human-readable flags.

    Thresholds are calibrated against the CATALOGUE'S OWN distribution
    (measured over all 528 scenes), not against an abstract ideal. That matters:
    this catalogue is deliberately dark and cinematic -- median luma 0.189,
    median clipLo 0.177 -- so an "absolute" brightness standard would flag a
    third of it and be simply wrong. Each threshold below sits near the 5th-10th
    percentile, i.e. it fires on outliers relative to the house look:

        luma      p5 0.017  p10 0.035  p50 0.189  p90 0.533
        contrast  p5 0.041  p10 0.057  p50 0.158
        occ       p5 0.172  p10 0.260  p50 0.745
        motion    p5 0.008  p10 0.011  p50 0.045
        jump      p50 12.2  p75 22.9   p90 41.2   p95 60.0

    `jump`/`hueJump` are REPORTED BUT NEVER FLAGGED, because they were measured
    and found not to work. Two independent failures:

      * They miss real discontinuities. At ~10 fps over a 7 s probe, a defect
        whose period exceeds the probe is never sampled -- KleinianLimitSetAbyss
        scored BELOW the median despite a provable x403 cyclic-zoom snap.
      * They fire on things that are not the shader. Rendering the same scene
        twice gives wildly different values (AnomalousFloquet 66.7 then 48.2;
        SupercellMesocyclone 13.6 then 40.8), because the host picks a
        different photo per run and the slideshow crossfade dominates the
        frame-to-frame delta. Roughly 26 scenes were flagged on that noise.

    So the numbers stay in the output as a hint for a human, but nothing is
    flagged from them. Continuity is judged by Tools/temporal_budget.py and by
    reading the source -- that is what actually found the 7 cyclic-zoom snaps.

    The same photo-dependence puts roughly +-0.1 of run-to-run noise on `luma`
    (0.317 vs 0.406 for one scene across two runs), which is why the brightness
    thresholds sit far out in the tails rather than near the median, and why
    several scenes now normalise against a photoLevel() probe instead of being
    tuned to whatever image happened to be bound.

    UPDATE 2026-08-21: that noise is now largely gone -- scan_scenes.ps1 pins
    one median-brightness photo (Tools/pick_scan_image.py), which took the
    worst run-to-run luma delta from 0.43 down to 0.002 and raised flag
    agreement across two runs from 4/10 to 9/10 on a flagged sample. The
    thresholds below have NOT been retightened to match; they still sit where
    the noisy measurement put them, so they remain conservative. Retightening
    them is a deliberate decision to take with fresh percentiles, not a
    side effect.

    Note what a percentile-calibrated threshold means when reading the output:
    firing at p5-p10 of the catalogue's OWN distribution guarantees that
    roughly 5-10% of scenes are always flagged. The 2026-08-21 pinned run
    flagged 52 of 528, i.e. 9.8% -- the expected rate, not 52 defects. The
    flags mark the tail of the house look; whether a given tail scene is wrong
    is a judgement call (a scene called BlackHole is supposed to be dark).
    """
    v = []
    # Hecticness, only asserted where the sampling rate can actually see it.
    if m.get("flickBand", 0) >= 8 and m.get("flickHi", 0) > 0.12:    v.append("FLICKER")
    if m.get("flickBand", 0) >= 8 and m.get("hueFlickHi", 0) > 0.12: v.append("COLOR_FLICKER")
    # Particle-on-black night scenes are legitimately dark and are the house
    # style, so "too dark" additionally requires the frame to be poorly filled.
    if m["luma"] < 0.04 and m.get("occ", 1) < 0.75:   v.append("TOO_DARK")
    if m["luma"] > 0.72:                              v.append("TOO_BRIGHT")
    if m["clipHi"] > 0.25:                            v.append("BLOWN_OUT")
    if m["clipLo"] > 0.88 and m.get("occ", 1) < 0.50: v.append("MOSTLY_BLACK")
    if m["contrast"] < 0.055:                         v.append("FLAT")
    if m["motion"] < 0.006:                           v.append("STATIC")
    # Judge "not screen-filling" on tile occupancy rather than raw pixel
    # coverage: a snowfall or firefly swarm is mostly background pixels yet
    # visually fills the frame, while a lone motif on a dead field does not.
    if m.get("occ", 1) < 0.28:                        v.append("NOT_FILLING")
    if m["satHi"] > 0.35 and m["sat"] > 0.45:         v.append("GARISH")
    return v



def app_fps(folder):
    """The app's own fps report for this scene, or None.

    Preferred over counting frames: the recorder writes constant-rate video
    with duplicate fill, so a slow scene still produces 30 frames per second
    and the frame count says nothing about cost. Returns (median fps, render
    scale); the scale is only meaningful paired with the fps, which is why
    scan_scenes.ps1 pins it to 1.0 for the measurement.
    """
    p = os.path.join(folder, "fps.log")
    if not os.path.isfile(p):
        return None
    vals, scales = [], []
    with io.open(p, encoding="utf-8", errors="replace") as f:
        for ln in f:
            m = re.search(r"\[fps\]\s+(\d+)\s+fps\s+renderScale\s+([0-9.]+)", ln)
            if m:
                vals.append(int(m.group(1)))
                scales.append(float(m.group(2)))
    if not vals:
        return None
    # drop the first samples: shader compile and fade-in are not the scene
    keep = vals[min(2, len(vals) - 1):]
    keep.sort()
    return keep[len(keep) // 2], (max(scales) if scales else 1.0)


def frames_from_video(folder):
    """Return frame paths for a scan folder, extracting them if needed.

    The recorder used to write one JPEG per frame; since it pipes raw frames
    into ffmpeg it writes a single video.mp4 instead. Extract at LONG_EDGE
    directly -- frame_stats() downscales to that anyway, so decoding at the
    full render resolution (2880x1620) would only waste time.
    Extracted frames land in a `_frames` subfolder and are reused on a re-run.
    """
    cache = os.path.join(folder, "_frames")
    jpgs = sorted(glob.glob(os.path.join(cache, "*.jpg")))
    if jpgs:
        return jpgs
    mp4 = os.path.join(folder, "video.mp4")
    if not os.path.isfile(mp4):
        mp4 = os.path.join(folder, "kaleidoscope.mp4")
    if not os.path.isfile(mp4):
        return []
    os.makedirs(cache, exist_ok=True)
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", mp4,
           "-vf", "scale=%d:-2" % LONG_EDGE, "-q:v", "3",
           os.path.join(cache, "frame_%06d.jpg")]
    try:
        subprocess.run(cmd, check=True)
    except Exception as e:
        print("  (%s: could not extract frames from video.mp4: %s)"
              % (os.path.basename(folder), e))
        return []
    return sorted(glob.glob(os.path.join(cache, "*.jpg")))


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
        if not jpgs:
            jpgs = frames_from_video(full)     # recorder now writes video.mp4
        if len(jpgs) < 3:
            continue
        # skip the first few frames: shader compile / fade-in is not the scene
        jpgs = jpgs[max(2, len(jpgs) // 6):]
        idx = np.linspace(0, len(jpgs) - 1, min(SAMPLES, len(jpgs))).astype(int)
        m = frame_stats([jpgs[i] for i in idx])
        if m is None:
            print(f"  ({d}: no readable frames)")
            continue
        # Continuity/flicker need EVERY frame, not the 10 spatial samples.
        m.update(temporal_stats(jpgs, SECONDS))
        af = app_fps(full)
        if af:
            m["fps"], m["renderScale"] = af      # the app's own number wins
        m["flags"] = verdicts(m)
        out[d] = m

    flagged = {k: v for k, v in out.items() if v["flags"]}
    print(f"scene_metrics: {len(out)} scene(s), {len(flagged)} flagged\n")
    hdr = (f"{'scene':<44}{'luma':>7}{'cntr':>7}{'motion':>8}{'occ':>6}{'satHi':>7}"
           f"{'jump':>7}{'hueJmp':>7}{'flkHi':>7}{'fps':>6}  flags")
    print(hdr)
    print("-" * len(hdr))
    for k in sorted(out, key=lambda k: (-len(out[k]["flags"]), k)):
        m = out[k]
        print(f"{k[:43]:<44}{m['luma']:>7.3f}{m['contrast']:>7.3f}"
              f"{m['motion']:>8.4f}{m['occ']:>6.2f}{m['satHi']:>7.3f}"
              f"{m.get('jump',0):>7.1f}{m.get('hueJump',0):>7.1f}"
              f"{m.get('flickHi',0):>7.3f}{m.get('fps',0):>6.1f}  {','.join(m['flags'])}")

    if "--json" in sys.argv:
        p = sys.argv[sys.argv.index("--json") + 1]
        json.dump(out, open(p, "w"), indent=1)
        print(f"\nwrote {p}")


if __name__ == "__main__":
    main()
