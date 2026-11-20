# -*- coding: utf-8 -*-
r"""reactivity.py -- how much each scene answers the music: the same scene rendered with music and with silence.

The screening's measures cannot say it: the brightness ratio loud/quiet reads 1.0 for a scene that answers with its
geometry, and motion is motion whether the music or the clock makes it (docs/engine-internals.md (66)).  Here every
scene is rendered twice by the video export on the frame clock, with the same seed, the same photos and the same
parameter rolls -- once over Tools/screen.py's screening music (chord bed, lead, bass and drums at 128 BPM, loud and
quiet halves of an 8-s cycle) and once over silence of the same length.  Whatever differs, the music did.

  react_struct  how different the pictures are, frame for frame, after each frame is normalised to zero mean and
                unit spread -- a scene that only brightens with the music reads near 0, one whose forms answer reads
                high (0 = the same picture, about 1.1 = unrelated pictures)
  react_sync    how well the change the music adds from frame to frame follows its onsets (Pearson correlation of
                the music run's frame difference minus the silent run's with the audio onset envelope, best of lags
                0..3 frames; 0 when negative)
  react         0..1: the scene's rank on the mean of both ranks, among all scenes measured

    python Tools/reactivity.py --controls          # the controls first: reactive scenes against null pairs
    python Tools/reactivity.py                     # every catalogue scene (resumable: finished chunks are kept)
    python Tools/reactivity.py --scenes A,B,C      # these only
    python Tools/reactivity.py --report            # write Tools/scene_reactivity.tsv from what was measured

Controls: no scene of the catalogue is free of audio (every scene reacts, by the house rules), so the "still" side
is made: the photo itself (Engine/ProfileStill.frag as a scene) and null pairs -- reactive scenes rendered silence
against silence, which must read zero.  Work files land in .screen/reactivity (gitignored): per chunk a json and,
per scene, a music and a silence thumbnail from the middle of its window (for contact sheets).  Runs below normal
priority, one export at a time.
"""
import argparse
import glob
import io
import json
import os
import re
import sys
import time
import wave

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import screen  # noqa: E402

ROOT = screen.ROOT
WORK = os.path.join(ROOT, ".screen", "reactivity")
OUT = os.path.join(ROOT, "Tools", "scene_reactivity.tsv")
HOLD = 8.0
FPS = 15
W, H = 160, 90
GUARD_IN, GUARD_OUT = 2.0, 0.3
CHUNK = 50
SEED = 7
# One photo in every slot (KALEIDO_FIXED_PHOTO), the snapshot baseline's: photo changes fall on the music's phrases,
# so with free photos the music run and the silent run showed different pictures -- the static photo itself read
# 1.06 (the first control run, 20.11.2026).
PHOTO = "kristallhoehle-indigo-fuchsia-2.jpg"
screen.EXPORT_SIZE = "480x270"          # the measurement looks at 160 x 90; the screening's 1080p only costs time
screen.EXPORT_FPS = FPS

STILL_BLOCK = ('  <TextureShader file="..\\\\Engine\\\\ProfileStill.frag" type="normal" probability="1.0" complexity="1" '
               'minTimeSolo="20" maxTimeSolo="90" minTimeInterpolation="15" maxTimeInterpolation="50">\n'
               '  </TextureShader>\n')
REACTIVE_CONTROLS = ["AbacusBeadCount", "StepSequencerGrid", "KineticTileMosaicMatrix", "FerrofluidHexMatrix",
                     "CyberGridCity", "ChromaAcidTrip", "GlitchMatrixHypercube", "HyperWarpTunnel",
                     "QuantumChromaField", "BallLightningPlasmoid"]


def silence_like(wav, path):
    """A silent WAV with the same format and length."""
    if os.path.exists(path):
        return path
    w = wave.open(wav)
    p, n = w.getparams(), w.getnframes()
    w.close()
    o = wave.open(path, "wb")
    o.setparams(p)
    o.writeframes(b"\0" * (n * p.sampwidth * p.nchannels))
    o.close()
    return path


def onset_envelope(wav):
    """The audio onset envelope at the video's frame rate: the rise of the log energy per frame."""
    w = wave.open(wav)
    sr, n, ch = w.getframerate(), w.getnframes(), w.getnchannels()
    x = np.frombuffer(w.readframes(n), "<i2").astype(np.float32) / 32768.0
    w.close()
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    hop = sr // FPS
    m = len(x) // hop
    e = np.log(1e-6 + (x[:m * hop].reshape(m, hop) ** 2).mean(axis=1))
    return np.maximum(0.0, np.diff(e, prepend=e[0]))


def decode(vid):
    """The video as RGB frames at 160 x 90 and the frame rate of the export."""
    import subprocess
    p = subprocess.run(["ffmpeg", "-v", "error", "-threads", "2", "-i", vid, "-vf", "scale=%d:%d" % (W, H),
                        "-pix_fmt", "rgb24", "-f", "rawvideo", "-"], capture_output=True,
                       creationflags=0x00004000 if os.name == "nt" else 0)
    b = np.frombuffer(p.stdout, np.uint8)
    n = b.size // (W * H * 3)
    return b[:n * W * H * 3].reshape(n, H, W, 3)


def znorm(L):
    """Each frame to zero mean and unit spread (a floor keeps flat frames from blowing up)."""
    m = L.mean(axis=(1, 2), keepdims=True)
    s = L.std(axis=(1, 2), keepdims=True)
    return (L - m) / (s + 0.02)


def measure_pair(vm, vs, log_m, log_s, onsets, null=False):
    """Rows for one chunk rendered with music (vm) and silence (vs).

    @return
      {name: {react_struct, react_sync, frames}}, and the thumbnails as {name: (music rgb, silence rgb)}.
    """
    ev_m, ev_s = screen.windows_from_log(log_m), screen.windows_from_log(log_s)
    if [n for _, n in ev_m] != [n for _, n in ev_s]:
        raise RuntimeError("the two runs walked different scenes")
    fm, fs = decode(vm), decode(vs)
    nfr = min(len(fm), len(fs))
    lm = fm[:nfr].astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32) / 255.0
    ls = fs[:nfr].astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32) / 255.0
    off = screen.EXPORT_OFFSET
    rows, thumbs = {}, {}
    for k, (t0, name) in enumerate(ev_m):
        if k == 0 or k == len(ev_m) - 1:
            continue
        t1 = ev_m[k + 1][0]
        a = max(1, int(round((t0 + off + GUARD_IN) * FPS)))
        b = min(nfr, int(round((t1 + off - GUARD_OUT) * FPS)))
        if b - a < 20:
            continue
        zm, zs = znorm(lm[a:b]), znorm(ls[a:b])
        struct = float(np.abs(zm - zs).mean())
        # the change the music adds: the music run's frame difference minus the silent run's (a periodic motion of
        # the scene's own clock correlated with the 4-s loud/quiet cycle by chance: a null pair read 0.29)
        ch = np.abs(np.diff(lm[a - 1:b], axis=0)).mean(axis=(1, 2)) - np.abs(np.diff(ls[a - 1:b], axis=0)).mean(axis=(1, 2))
        o = onsets[a:b] if b <= len(onsets) else np.zeros(b - a)
        best = 0.0
        for lag in range(0, 4):
            x, y = ch[lag:], o[:len(o) - lag]
            if len(x) > 10 and x.std() > 1e-6 and y.std() > 1e-9:
                best = max(best, float(np.corrcoef(x, y)[0, 1]))
        key = name + (" (null)" if null else "")
        rows[key] = {"react_struct": round(struct, 4), "react_sync": round(best, 4), "frames": int(b - a)}
        mid = (a + b) // 2
        thumbs[key] = (fm[mid], fs[mid])
    return rows, thumbs


def save_thumbs(thumbs):
    """Per scene a music and a silence thumbnail (for contact sheets)."""
    from PIL import Image
    d = os.path.join(WORK, "frames")
    os.makedirs(d, exist_ok=True)
    for name, (m, s) in thumbs.items():
        safe = re.sub(r"[^\w]+", "_", name)
        Image.fromarray(m).save(os.path.join(d, safe + "_m.jpg"), quality=85)
        Image.fromarray(s).save(os.path.join(d, safe + "_s.jpg"), quality=85)


def run_chunk(tag, entries, plain, cross, wav, silent, onsets, null=False):
    """Renders one chunk twice and measures it; returns its rows (also written to <tag>.json)."""
    jpath = os.path.join(WORK, tag + ".json")
    if os.path.exists(jpath):
        return json.load(io.open(jpath, encoding="utf-8"))
    cfg = "ZZReact" + tag
    first, last = entries[0], entries[-1]
    xml = ('<?xml version="1.0" encoding="utf-8" ?>\n<configuration ImageDirectory="..\\\\Images" '
           'ConfigurationName="Test%s" hidden="true" >\n\n' % cfg
           + "".join([first] + entries + [last]) + "\n" + plain + cross + "</configuration>\n")
    preset = os.path.join(ROOT, "Presets", cfg + ".xml")
    io.open(preset, "w", encoding="utf-8").write(xml)
    try:
        runs = {}
        for kind, audio in (("m", silent if null else wav), ("s", silent)):
            log = os.path.join(WORK, "%s_%s.log" % (tag, kind))
            vid = screen.render(cfg, audio, log, HOLD, SEED, "scene", 0, {"KALEIDO_FIXED_PHOTO": PHOTO}, cost=False,
                                tag="react_%s_%s" % (tag, kind))
            if not vid:
                raise RuntimeError("no video for %s (%s); see %s" % (tag, kind, log))
            runs[kind] = (vid, log)
        rows, thumbs = measure_pair(runs["m"][0], runs["s"][0], runs["m"][1], runs["s"][1], onsets, null)
        save_thumbs(thumbs)
        for vid, _ in runs.values():
            os.remove(vid)
    finally:
        if os.path.exists(preset):
            os.remove(preset)
    io.open(jpath, "w", encoding="utf-8").write(json.dumps(rows, indent=0))
    return rows


def blocks_for(names, scenes):
    """The Komplett.xml blocks of these scene names (the first entry of each), in the given order."""
    first = {}
    for n, b in scenes:
        first.setdefault(n, b)
    return [first[n] for n in names if n in first]


def audio_files(n_entries):
    """The screening music and a silence of the same length for a chunk of n entries."""
    need = int((n_entries + 2) * HOLD + 30)
    wav = os.path.join(screen.WORK, "screen%d_%d.wav" % (screen.WAV_VERSION, need))
    if not os.path.exists(wav):
        screen.write_wav(wav, need)
    silent = silence_like(wav, os.path.join(screen.WORK, "silence_%d.wav" % need))
    return wav, silent, onset_envelope(wav)


def controls(scenes, plain, cross):
    """Reactive controls (music vs silence) against still ones (the photo; the same scenes silence vs silence)."""
    reac = blocks_for(REACTIVE_CONTROLS, scenes)
    entries = reac + [STILL_BLOCK]
    wav, silent, onsets = audio_files(len(entries))
    t = time.time()
    rows = run_chunk("controls", entries, plain, cross, wav, silent, onsets)
    secs = time.time() - t
    nulls = run_chunk("nulls", reac, plain, cross, wav, silent, onsets, null=True)
    print("controls: %d entries rendered twice in %.0f s (%.1f s per scene and run)" % (len(entries), secs,
                                                                                       secs / (2 * len(entries))))
    for k, v in sorted(list(rows.items()) + list(nulls.items()), key=lambda kv: -kv[1]["react_struct"]):
        print("  %-36s struct %.3f  sync %.3f" % (k, v["react_struct"], v["react_sync"]))
    still = [v["react_struct"] for k, v in list(rows.items()) + list(nulls.items())
             if k.endswith("(null)") or k == "ProfileStill"]
    moving = [v["react_struct"] for k, v in rows.items() if k in REACTIVE_CONTROLS]
    if still and moving:
        print("separation: still max %.3f, reactive min %.3f -> %s" % (max(still), min(moving),
              "clean" if max(still) < min(moving) else "OVERLAP"))


def report():
    """Tools/scene_reactivity.tsv from every chunk measured: name, react_struct, react_sync, react (rank)."""
    rows = {}
    for p in sorted(glob.glob(os.path.join(WORK, "chunk_*.json"))):
        for k, v in json.load(io.open(p, encoding="utf-8")).items():
            rows.setdefault(k, v)
    if not rows:
        sys.exit("nothing measured yet")
    names = sorted(rows)
    st = np.array([rows[n]["react_struct"] for n in names])
    sy = np.array([rows[n]["react_sync"] for n in names])
    rank = lambda v: np.argsort(np.argsort(v)) / max(len(v) - 1, 1)
    comb = rank((rank(st) + rank(sy)) / 2.0)
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("name\treact_struct\treact_sync\treact\n")
        for n, a, b, c in zip(names, st, sy, comb):
            f.write("%s\t%.4f\t%.4f\t%.3f\n" % (n, a, b, c))
    print("%s: %d scenes" % (OUT, len(names)))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--controls", action="store_true")
    ap.add_argument("--scenes", default="")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="only the first N chunks (timing)")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(WORK, exist_ok=True)
    if a.report:
        report()
        return 0
    scenes, plain, cross = screen.read_master()
    if a.controls:
        controls(scenes, plain, cross)
        return 0
    names = sorted({n for n, _ in scenes})
    if a.scenes:
        keep = set(a.scenes.split(","))
        names = [n for n in names if n in keep]
    chunks = [names[i:i + CHUNK] for i in range(0, len(names), CHUNK)]
    if a.limit:
        chunks = chunks[:a.limit]
    t0 = time.time()
    for i, part in enumerate(chunks):
        tag = "chunk_%03d" % i if not a.scenes else "pick_%03d" % i
        if os.path.exists(os.path.join(WORK, tag + ".json")):
            continue
        entries = blocks_for(part, scenes)
        wav, silent, onsets = audio_files(len(entries))
        t = time.time()
        rows = run_chunk(tag, entries, plain, cross, wav, silent, onsets)
        done = i + 1
        print("%s: %d scenes in %.0f s; %d of %d chunks, %.0f min so far" % (tag, len(rows), time.time() - t, done,
                                                                          len(chunks), (time.time() - t0) / 60),
              flush=True)
    if not a.scenes:
        report()
    return 0


if __name__ == "__main__":
    sys.exit(main())
