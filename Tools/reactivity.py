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

Per voice (plan 26.11.2026, I1; see the comment above VOICES): the screening music with one voice muted or panned,
against the full mix -- what each voice does in the picture.

    python Tools/reactivity.py --voices --set controls --tag base      # null pair, the engine's floor, known answers
    python Tools/reactivity.py --voices --set labs --tag base          # the labs; --set top60: the most shown scenes
    python Tools/reactivity.py --voices --set labs --tag roles --expr voiceP=1   # the same with the voices' roles
    python Tools/reactivity.py --voices --set top60 --chunk 1          # one chunk only (one lock hold)
    python Tools/reactivity.py --voices --report --tag base            # Tools/scene_voices.tsv + contact sheets

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


# ---------------------------------------------------------------------------------------------- per voice ----
# Plan 26.11.2026, I1: what each voice of the screening music does in the picture.  The music is rebuilt from its
# stems (Tools/make_structure_wav.py, put together exactly as screen.write_wav() does: chord bed and lead in both
# halves of the 8-s cycle, bass and drums in the loud half) and written in variants that differ in one voice only:
# the full mix, one voice muted (kick, snare, hat, lead, bass), and the lead panned hard left.  Every variant renders
# the same chunk of scenes with the same seed and the same photo; the export is deterministic (a null pair -- the full
# mix twice -- reads exactly zero), so whatever differs between the full run and a muted run, that voice did.
VOICES = ("kick", "snare", "hat", "lead", "bass")
VKINDS = ("full",) + tuple("no_" + v for v in VOICES) + ("pan_lead",)
VHOLD, VFPS = 12.0, 30          # 12-s windows at 30 fps: 290 frames per scene for the correlations (8 s at 15: 85)
VLAGS = 6                       # the picture answers 0..200 ms after the hit (envelope rise, slew limit)
VCHUNK = 24
VWORK = os.path.join(WORK, "voices")
VOUT = os.path.join(ROOT, "Tools", "scene_voices.tsv")
VSHEETS = os.path.join(os.path.dirname(ROOT), "sheets", "voices")
QT_BIN = os.environ.get("QTDIR", r"C:\Qt\6.11.1\msvc2022_64") + r"\bin"
# Where the voice should show and what it is measured against: kick, snare and hat answer their hits (sync), the
# lead its line (struct: where things are), the bass both; the panned lead the balance of left against right (lr).
VOICE_CONTROLS = ["ProfileStill", "CyberGridCity", "HyperWarpTunnel", "TaikoSilhouettes", "LightningStorm",
                  "DrumLaneMipLayers", "StereoSearchlights", "StereoSpectrum", "CounterpointBraids"]
# The labs (the 20 of 23.10. with their own walk, the four chain labs).
LAB_SET = ["AtlasLab", "BandLab", "DefectLab", "DiffractionLab", "EngravingLab", "ExposureLab", "FlowPaintLab",
           "FoldLab", "GlassLab", "LayerCutLab", "MeterLab", "MicroscopeLab", "MirrorBilliardLab", "PartitionLab",
           "PerceptionLab", "SeparationLab", "SequenceLab", "StripLab", "TimeChainLab", "TwinPhotoLab",
           "ChainLab2D", "ChainLab3D", "ChainLabTunnel", "ChainSlice3D"]
GENRES = ("Ambient", "Downtempo", "SpaceAmbient", "Cinematic", "Club", "Electronic", "Psytrance", "Psychedelic",
          "Noir", "Allround")
# "Reads zero": no more than the engine's own answer.  The floor is ProfileStill's reading in the controls of the
# same run (the photo as a scene: what exposure, hue drift and the house finish do with the voice).  A hit voice
# (kick, snare, hat, bass) reads zero when its sync stays under ZERO_SYNC or its hit-locked change under ZERO_K times
# the floor's (amp says nothing there: a scene that drifts reads high in every voice); the lead when amp and struct
# stay under ZERO_K times the floor's; the pan when |lr| stays under ZERO_LR.
ZERO_K, ZERO_SYNC, ZERO_LR = 2.0, 0.15, 0.10


def voice_stems(secs, cycle=8.0):
    """The screening music's stems, each already in its half of the loud/quiet cycle (as screen.write_wav() mixes).

    @return
      {stem: float32 samples}, the sample rate.
    """
    import make_structure_wav as M
    sr = M.SR
    n = int(sr * secs)
    size = n + int(sr * M.BAR) + 1
    st = {k: np.zeros(size, np.float32) for k in ("bed", "lead", "bass", "kick", "snare", "hat")}
    for b in range(int(secs / M.BAR) + 1):
        bt = b * M.BAR
        M.add(st["bed"], M.chord_bed(b, M.BAR, 0.16), bt)
        M.add(st["lead"], M.lead(b, M.BAR, 0.20), bt)
        M.add(st["bass"], M.bass_line(b, M.BAR, 1.0), bt)
        for q in range(4):
            M.add(st["kick"], M.kick(), bt + q * M.SPB, 0.9)
            if q in (1, 3):
                M.add(st["snare"], M.snare(), bt + q * M.SPB, 0.55)
        for h in range(8):
            M.add(st["hat"], M.hat(), bt + h * M.SPB / 2, 0.18)
    t = np.arange(n) / sr
    ph = np.mod(t, cycle)
    half, ramp = cycle / 2.0, 0.35
    loud = np.where(ph < half, 1.0, 0.0)
    rise = ph < ramp
    loud[rise] = 0.5 * (1 - np.cos(np.pi * ph[rise] / ramp))
    fall = (ph > half - ramp) & (ph < half)
    loud[fall] = 0.5 * (1 + np.cos(np.pi * (ph[fall] - half + ramp) / ramp))
    soft_g, full_g = (0.25 + 0.75 * loud).astype(np.float32), loud.astype(np.float32)
    for k in st:
        st[k] = st[k][:n] * (soft_g if k in ("bed", "lead") else full_g)
    return st, sr


def voice_audio(n_entries):
    """The variants' WAVs for a chunk of n entries (stereo, 16 bit, cached) and each voice's onset envelope.

    The full mix is centred (left = right); a muted variant leaves one stem out; pan_lead puts the lead into the left
    channel at twice its amplitude and takes it out of the right, so the mono sum the analysis hears is the full
    mix's and only the stereo features move.  One gain for all variants (the full mix's peak at 0.85, lowered if a
    variant would clip), so the other voices are the same samples in every file.

    @return
      {kind: wav path}, {voice: onset envelope at VFPS}.
    """
    need = int((n_entries + 2) * VHOLD + 30)
    d = os.path.join(VWORK, "audio")
    os.makedirs(d, exist_ok=True)
    paths = {k: os.path.join(d, "%s_%d.wav" % (k, need)) for k in VKINDS}
    envp = os.path.join(d, "onsets_%d_%d.npz" % (need, VFPS))
    if all(os.path.exists(p) for p in paths.values()) and os.path.exists(envp):
        z = np.load(envp)
        return paths, {v: z[v] for v in VOICES}
    st, sr = voice_stems(need)
    full = sum(st.values())
    gain = 0.85 / (np.max(np.abs(full)) + 1e-9)
    gain = min(gain, 0.97 / (np.max(np.abs(full + st["lead"])) + 1e-9))
    for k, p in paths.items():
        if k == "pan_lead":
            left, right = full + st["lead"], full - st["lead"]
        else:
            mono = full - st[k[3:]] if k.startswith("no_") else full
            left = right = mono
        x = np.stack([left, right], axis=1) * gain
        w = wave.open(p, "wb")
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
        w.close()
    hop = sr // VFPS
    env = {}
    for v in VOICES:
        x = st[v]
        m = len(x) // hop
        e = np.log(1e-7 + (x[:m * hop].reshape(m, hop).astype(np.float64) ** 2).mean(axis=1))
        env[v] = np.maximum(0.0, np.diff(e, prepend=e[0]))
    np.savez(envp, **env)
    return paths, env


def decode_gray(vid):
    """The video as grey frames, 160 x 90, uint8."""
    import subprocess
    p = subprocess.run(["ffmpeg", "-v", "error", "-threads", "2", "-i", vid, "-vf", "scale=%d:%d" % (W, H),
                        "-pix_fmt", "gray", "-f", "rawvideo", "-"], capture_output=True,
                       creationflags=0x00004000 if os.name == "nt" else 0)
    b = np.frombuffer(p.stdout, np.uint8)
    n = b.size // (W * H)
    return b[:n * W * H].reshape(n, H, W)


def extract_frames(vid, idx, out_dir, prefix):
    """Writes the frames with these indices (480 x 270 JPGs, <prefix>_<index>.jpg); returns {index: path}."""
    import subprocess
    idx = sorted(set(int(i) for i in idx))
    if not idx:
        return {}
    os.makedirs(out_dir, exist_ok=True)
    tmp = os.path.join(out_dir, "_x_%s_%%04d.jpg" % prefix)
    sel = "+".join("eq(n\\,%d)" % i for i in idx)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-threads", "2", "-i", vid, "-vf", "select=" + sel,
                    "-vsync", "0", "-q:v", "3", tmp], capture_output=True,
                   creationflags=0x00004000 if os.name == "nt" else 0)
    out = {}
    for j, i in enumerate(idx):
        src = tmp % (j + 1)
        if os.path.exists(src):
            dst = os.path.join(out_dir, "%s_%06d.jpg" % (prefix, i))
            os.replace(src, dst)
            out[i] = dst
    return out


def limiter_counts(log_path):
    """Per window of the log: (samples, limited, hazard) from the limiter's debug lines (KALEIDO_EXPOSURE_DEBUG: every
    3rd frame "EXPO prev= scale= flashDim= flashOn="), attributed to the window whose [sweep] line came last."""
    txt = io.open(log_path, encoding="utf-8", errors="ignore").read().splitlines()
    out, cur, last = [], None, None
    for line in txt:
        m = screen.SWEEP.match(line)
        if m:
            t0, n = float(m.group(1)), m.group(2)
            if not (last and last[1] == n and t0 - last[0] < 4.0):
                cur = [0, 0, 0]
                out.append(cur)
            last = (t0, n)
            continue
        if cur is not None and line.startswith("EXPO ") and " scale=" in line:
            kv = dict(x.split("=", 1) for x in line.split()[1:] if "=" in x)
            cur[0] += 1
            cur[1] += float(kv.get("scale", 1)) < 0.995
            cur[2] += float(kv.get("flashOn", 0)) > 0.5
    return out


def _hp(x, k=31):
    """x minus its moving average over k frames (about a second): the slow drift out, the hits in."""
    if len(x) < k + 2:
        return x - x.mean()
    ker = np.ones(k) / k
    return x - np.convolve(np.pad(x, (k // 2, k // 2), mode="edge"), ker, mode="valid")[:len(x)]


def _corr_lag(x, o, lags=VLAGS):
    """The best Pearson correlation of x with o delayed by 0..lags frames (0 when none is positive)."""
    best = 0.0
    for lag in range(0, lags + 1):
        a, b = x[lag:], o[:len(o) - lag]
        if len(a) > 20 and a.std() > 1e-7 and b.std() > 1e-9:
            best = max(best, float(np.corrcoef(a, b)[0, 1]))
    return best


def measure_voice_pair(F, V, onset, lr=False):
    """The numbers of one window: the full run's frames F against a variant's V (float 0..1, frames x H x W).

    amp     the mean absolute difference, in percent of full scale (everything the voice changes, drift included)
    struct  the same after each frame is normalised to zero mean and unit spread (forms, not light)
    sync    how well the change the voice adds from frame to frame (|dF| - |dV|, the drift out) follows its own hits
    lr      (pan) how much brighter the left half got against the right, in percent
    @return
      (dict of numbers, the frame index in the window where the voice shows most)
    """
    d = np.abs(F - V).mean(axis=(1, 2))
    r = {"amp": round(float(d.mean()) * 100.0, 4),
         "struct": round(float(np.abs(znorm(F) - znorm(V)).mean()), 4)}
    ch = np.abs(np.diff(F, axis=0)).mean(axis=(1, 2)) - np.abs(np.diff(V, axis=0)).mean(axis=(1, 2))
    o = onset[1:len(ch) + 1] if onset is not None else None
    if o is not None and len(o) == len(ch):
        hc = _hp(ch)
        r["sync"] = round(_corr_lag(hc, _hp(o)), 4)
        # the hit-locked part of the frame change, in % of full scale per frame: sync is a correlation and says
        # nothing about size -- the photo alone (ProfileStill) follows the snare at 0.37, with a change too small to
        # see; this is what the floor is measured in
        r["hit"] = round(r["sync"] * float(hc.std()) * 100.0, 5)
        # the same against the hits moved by half a beat -- kept for reference only: the voices repeat on the 8th
        # grid, inside the lag search, so for most of them this is no null (the floor is ProfileStill's row)
        sh = int(round(0.5 * 60.0 / 128.0 * VFPS))
        r["sync0"] = round(_corr_lag(_hp(ch), _hp(np.roll(o, sh))), 4)
    if lr:
        half = F.shape[2] // 2
        bf = F[:, :, :half].mean(axis=(1, 2)) - F[:, :, half:].mean(axis=(1, 2))
        bv = V[:, :, :half].mean(axis=(1, 2)) - V[:, :, half:].mean(axis=(1, 2))
        r["lr"] = round(float((bv - bf).mean()) * 100.0, 4)
    show = int(np.argmax(ch)) + 1 if not lr and o is not None else int(np.argmax(d))
    return r, show


def self_sync(F, onset):
    """How well a run's own frame-to-frame change follows these hits (for the controls: the kick's answer in the full
    run, and what is left of it with the kick muted)."""
    ch = np.abs(np.diff(F, axis=0)).mean(axis=(1, 2))
    o = onset[1:len(ch) + 1]
    return round(_corr_lag(_hp(ch), _hp(o)), 4) if len(o) == len(ch) else 0.0


def run_voice_chunk(tag, label, entries, names, plain, cross, null=False):
    """Renders one chunk once per variant (and the full mix a second time for the null pair) and measures it.

    @return
      {scene: {variant: {numbers}}, ...}, written to <tag>/<label>.json; the thumbnails land in <tag>/frames.
    """
    wdir = os.path.join(VWORK, tag)
    os.makedirs(wdir, exist_ok=True)
    jpath = os.path.join(wdir, label + ".json")
    if os.path.exists(jpath):
        return json.load(io.open(jpath, encoding="utf-8"))
    cfg = "ZZVoice" + re.sub(r"\W", "", tag + label)
    order = screen.review_order(list(zip(names, entries)))
    first, last = order[0][1], order[-1][1]
    xml = ('<?xml version="1.0" encoding="utf-8" ?>\n<configuration ImageDirectory="..\\\\Images" '
           'ConfigurationName="Test%s" hidden="true" >\n\n' % cfg
           + "".join([first] + entries + [last]) + "\n" + plain + cross + "</configuration>\n")
    preset = os.path.join(ROOT, "Presets", cfg + ".xml")
    io.open(preset, "w", encoding="utf-8").write(xml)
    wavs, env = voice_audio(len(entries))
    kinds = list(VKINDS) + (["full2"] if null else [])
    extra = {"KALEIDO_FIXED_PHOTO": PHOTO, "KALEIDO_EXPOSURE_DEBUG": "1",
             "PATH": QT_BIN + os.pathsep + os.environ.get("PATH", "")}
    runs = {}
    t0 = time.time()
    try:
        for kind in kinds:
            log = os.path.join(wdir, "%s_%s.log" % (label, kind))
            wav = wavs["full" if kind == "full2" else kind]
            vid = screen.render(cfg, wav, log, VHOLD, SEED, "scene", 0, extra, cost=False,
                                tag="voice_%s_%s_%s" % (tag, label, kind))
            if not vid:
                raise RuntimeError("no video for %s %s (%s); see %s" % (tag, label, kind, log))
            runs[kind] = (vid, log)
            print("  %s %s: %.0f s" % (label, kind, time.time() - t0), flush=True)
    finally:
        if os.path.exists(preset):
            os.remove(preset)
    ev = screen.windows_from_log(runs["full"][1])
    for kind, (_, log) in runs.items():
        if [n for _, n in screen.windows_from_log(log)] != [n for _, n in ev]:
            raise RuntimeError("%s walked other scenes than the full run" % kind)
    lim = {k: limiter_counts(log) for k, (_, log) in runs.items()}
    full = decode_gray(runs["full"][0])
    rows, shows = {}, {}
    off = screen.EXPORT_OFFSET
    wins = []
    for k, (t0w, name) in enumerate(ev):
        if k == 0 or k == len(ev) - 1:
            continue
        t1 = ev[k + 1][0]
        a = max(1, int(round((t0w + off + GUARD_IN) * VFPS)))
        b = min(len(full), int(round((t1 + off - GUARD_OUT) * VFPS)))
        if b - a < 40:
            continue
        wins.append((k, name, a, b))
        rows[name] = {"frames": int(b - a)}
        lf = lim["full"][k] if k < len(lim["full"]) else [0, 0, 0]
        rows[name]["lim_full"] = lf
    for kind in kinds:
        if kind == "full":
            continue
        V = decode_gray(runs[kind][0])
        for k, name, a, b in wins:
            n = min(b, len(V))
            Fw = full[a - 1:n].astype(np.float32) / 255.0
            Vw = V[a - 1:n].astype(np.float32) / 255.0
            voice = kind[3:] if kind.startswith("no_") else ("lead" if kind == "pan_lead" else None)
            on = env[voice][a - 1:n] if voice else None
            r, show = measure_voice_pair(Fw, Vw, on, lr=(kind == "pan_lead"))
            if kind.startswith("no_"):
                r["self_full"] = self_sync(Fw, on)
                r["self_var"] = self_sync(Vw, on)
            r["lim"] = lim[kind][k] if k < len(lim[kind]) else [0, 0, 0]
            rows[name][kind] = r
            shows.setdefault(kind, {})[name] = a - 1 + show
        del V
    # the thumbnails: each variant's frame where the voice shows most, and the full run's frame at the same moment
    fdir = os.path.join(wdir, "frames")
    want_full = set()
    for kind, sh in shows.items():
        got = extract_frames(runs[kind][0], sh.values(), fdir, "%s_%s" % (label, kind))
        want_full |= set(sh.values())
        for name, i in sh.items():
            if i in got:
                rows[name][kind]["thumb"] = os.path.basename(got[i])
    gotf = extract_frames(runs["full"][0], want_full, fdir, "%s_full" % label)
    for kind, sh in shows.items():
        for name, i in sh.items():
            if i in gotf:
                rows[name][kind]["thumb_full"] = os.path.basename(gotf[i])
    # the videos stay (KALEIDO_VOICES_KEEP=1, about 40 MB a run): a new measure can then be computed without rendering
    keep = os.environ.get("KALEIDO_VOICES_KEEP") == "1"
    for kind, (vid, _) in runs.items():
        if os.path.exists(vid):
            if keep:
                vdir = os.path.join(wdir, "videos")
                os.makedirs(vdir, exist_ok=True)
                os.replace(vid, os.path.join(vdir, "%s_%s.mp4" % (label, kind)))
            else:
                os.remove(vid)
    io.open(jpath, "w", encoding="utf-8").write(json.dumps(rows, indent=0))
    print("%s/%s: %d scenes, %d variants, %.1f min" % (tag, label, len(rows), len(kinds), (time.time() - t0) / 60),
          flush=True)
    return rows


def most_shown(n, sched_dir):
    """The n scenes (labs left out) with the most screen time over the genre presets' scene plans
    (Tools/check_schedule.py's runs: 12 h of silence and 6 h of the structure track each, in .screen/schedule)."""
    import collections
    tot = collections.Counter()
    for g in GENRES:
        for kind in ("structure128", "silence"):
            p = os.path.join(sched_dir, "%s_%s.tsv" % (g, kind))
            if not os.path.exists(p):
                sys.exit("no scene plan %s -- run Tools/check_schedule.py first" % p)
            cols = None
            for line in io.open(p, encoding="utf-8"):
                v = line.rstrip("\n").split("\t")
                if v[0] == "kind":
                    cols = v
                elif cols and v[0] == "scene":
                    r = dict(zip(cols, v))
                    try:
                        tot[r["scene"].replace(".frag", "")] += float(r["solo"])
                    except ValueError:
                        pass
    return [s for s, _ in tot.most_common() if s not in LAB_SET][:n]


def with_exprs(block, exprs):
    """An entry with <expr> lines added (a constant formula draws no random number: the rolls stay the same)."""
    if not exprs:
        return block
    add = "".join('    <expr name="%s" formula="%s"/>\n' % kv for kv in exprs)
    i = block.rfind("</TextureShader>")
    return block[:i] + add + "  " + block[i:] if i >= 0 else block


def voice_set(a, scenes):
    """The scene names of the set asked for."""
    if a.scenes:
        return [n for n in a.scenes.split(",") if n]
    if a.set == "controls":
        return list(VOICE_CONTROLS)
    if a.set == "labs":
        return list(LAB_SET)
    if a.set.startswith("top"):
        return most_shown(int(a.set[3:] or 60), os.environ.get("KALEIDO_SCHEDULE_DIR",
                                                               os.path.join(ROOT, ".screen", "schedule")))
    sys.exit("--voices needs --set controls|labs|topN or --scenes")


def voices_main(a):
    """--voices: render and measure a set per voice (resumable by chunk), or --report."""
    if os.environ.get("KALEIDO_SETTINGS_SRC"):
        import private_settings
        private_settings.INI = os.environ["KALEIDO_SETTINGS_SRC"]
    screen.EXPORT_FPS = VFPS
    os.makedirs(VWORK, exist_ok=True)
    if a.report:
        return voices_report(a)
    scenes, plain, cross = screen.read_master()
    names = voice_set(a, scenes)
    blocks = {}
    for n, b in scenes:
        blocks.setdefault(n, b)
    if "ProfileStill" in names:
        blocks["ProfileStill"] = STILL_BLOCK
    missing = [n for n in names if n not in blocks]
    if missing:
        print("not in Komplett.xml (left out):", ", ".join(missing))
    names = [n for n in names if n in blocks]
    exprs = [tuple(x.split("=", 1)) for x in a.expr.split(",") if "=" in x]
    setname = a.set or "pick"
    chunks = [names[i:i + VCHUNK] for i in range(0, len(names), VCHUNK)]
    if a.plan:
        for i, c in enumerate(chunks):
            done = os.path.exists(os.path.join(VWORK, a.tag, "%s_%02d.json" % (setname, i)))
            print("%s_%02d%s: %s" % (setname, i, " (done)" if done else "", ", ".join(c)))
        return 0
    for i, part in enumerate(chunks):
        if a.chunk >= 0 and i != a.chunk:
            continue
        entries = [with_exprs(blocks[n], exprs) for n in part]
        run_voice_chunk(a.tag, "%s_%02d" % (setname, i), entries, part, plain, cross, null=(a.set == "controls"))
    if a.set == "controls":
        controls_voices(a.tag)
    return 0


def controls_voices(tag):
    """The controls of a run: the null pair must read zero, the engine's own answer (ProfileStill) is the floor, and
    the scenes that answer a voice must lose that answer when it is muted."""
    rows = load_voice_rows(tag, "controls")
    print("controls of run %s:" % tag)
    for name, r in rows.items():
        nul = r.get("full2", {})
        print("  %-24s null amp %.4f struct %.4f | " % (name, nul.get("amp", -1), nul.get("struct", -1))
              + "  ".join("%s %.2f/%.2f/%.2f(%.2f)" % (v, r["no_" + v]["amp"], r["no_" + v]["struct"],
                                                    r["no_" + v].get("sync", 0), r["no_" + v].get("sync0", 0))
                          for v in VOICES)
              + "  pan lr %+.3f" % r["pan_lead"].get("lr", 0))
        print("  %-24s self-sync full -> muted: " % "" + "  ".join(
            "%s %.2f->%.2f" % (v, r["no_" + v].get("self_full", 0), r["no_" + v].get("self_var", 0)) for v in VOICES))


def load_voice_rows(tag, setname=None):
    """Every scene measured in a run (or in one set of it): {name: {variant: numbers}}."""
    rows = {}
    pat = "%s_*.json" % setname if setname else "*.json"
    for p in sorted(glob.glob(os.path.join(VWORK, tag, pat))):
        for k, v in json.load(io.open(p, encoding="utf-8")).items():
            rows.setdefault(k, v)
    return rows


def voice_score(rows, v):
    """Per scene: how strongly voice v shows, 0..1, the rank among the scenes of the table (kick, snare, hat, bass:
    the rank of hit -- amp is mostly drift --, of the mean rank of amp and sync where hit was not measured; lead: the
    mean rank of amp and struct; pan: |lr|)."""
    names = sorted(rows)
    rank = lambda x: np.argsort(np.argsort(x)) / max(len(x) - 1, 1)
    if v == "pan":
        s = rank(np.array([abs(rows[n]["pan_lead"].get("lr", 0)) for n in names]))
    elif v != "lead" and all("hit" in rows[n]["no_" + v] for n in names):
        s = rank(np.array([rows[n]["no_" + v]["hit"] for n in names]))
    else:
        k = "no_" + v
        amp = np.array([rows[n][k]["amp"] for n in names])
        other = np.array([rows[n][k]["struct"] if v == "lead" else rows[n][k].get("sync", 0) for n in names])
        s = (rank(amp) + rank(other)) / 2.0
    return dict(zip(names, s))


def zero_voices(r, floor):
    """The voices a scene shows no more of than the engine's own answer (floor: ProfileStill's row)."""
    out = []
    for v in VOICES:
        x, f = r["no_" + v], floor["no_" + v]
        if v == "lead":
            # the melody is a slow line, not hits: amp and struct -- which a scene that drifts away once the music
            # differs (a lab's walk on sceneAdvance) reads high for every voice, so a drifting scene never reads
            # zero here
            z = x["amp"] < ZERO_K * f["amp"] and x["struct"] < ZERO_K * f["struct"]
        else:
            # the hits: sync alone, against the floor's own sync (the engine answers some hits itself, the photo
            # alone reads 0.37 on the snare).  amp is no help here: in the labs every voice reads 7-11 % from the
            # drift alone.  sync0 is no null either -- the voices repeat on the 8th grid, inside the lag search
            if "hit" in x and "hit" in f:
                # not locked to the hits, or locked but no larger than the engine's own answer
                z = x["sync"] < ZERO_SYNC or x["hit"] < ZERO_K * f["hit"]
            else:
                z = x.get("sync", 0) < max(ZERO_SYNC, f.get("sync", 0) + 0.10)
        if z:
            out.append(v)
    if abs(r["pan_lead"].get("lr", 0)) < max(ZERO_LR, ZERO_K * abs(floor["pan_lead"].get("lr", 0))):
        out.append("pan")
    return out


def voices_report(a):
    """Tools/scene_voices.tsv from a run (every set measured in it) and the contact sheets: per voice the ten
    strongest and the ten weakest scenes (full run | voice muted | difference x4)."""
    rows = load_voice_rows(a.tag)
    if not rows:
        sys.exit("nothing measured in run %s" % a.tag)
    ctl = load_voice_rows(a.tag, "controls")
    floor = ctl.get("ProfileStill") or load_voice_rows("base", "controls").get("ProfileStill")
    sets = {}
    for p in glob.glob(os.path.join(VWORK, a.tag, "*.json")):
        s = os.path.basename(p).rsplit("_", 1)[0]
        for k in json.load(io.open(p, encoding="utf-8")):
            sets.setdefault(k, s)
    table = {n: r for n, r in rows.items() if all(k in r for k in VKINDS[1:])}
    scores = {v: voice_score(table, v) for v in VOICES + ("pan",)}
    # one file for every run measured: the rows of other runs stay
    keep = []
    if os.path.exists(VOUT):
        for line in io.open(VOUT, encoding="utf-8"):
            if line.startswith("run\t") or line.startswith("#"):
                continue
            if line.split("\t", 1)[0] != a.tag:
                keep.append(line)
    cols = ["run", "set", "name"]
    for v in VOICES:
        cols += ["amp_" + v, "struct_" + v, "sync_" + v, "hit_" + v]
    cols += ["amp_pan", "lr_pan", "lim_full", "lim_max_var", "zero_n", "zero"]
    with io.open(VOUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("# Tools/reactivity.py --voices (plan 26.11.2026, I1): per voice of the screening music, the full run "
                "against the run with that voice muted (pan: the lead hard left).  amp = mean |difference| in %% of "
                "full scale, struct = after per-frame normalisation, sync = the change the voice adds against its own "
                "hits (0..1), hit = the hit-locked part of the frame change in %% per frame, lr = left half brighter "
                "than right in %%, lim = limiter samples dimmed (of %d s), zero = the voices read no more than "
                "ProfileStill's floor (kick, snare, hat, bass: sync < %.2f or hit < %.1f x floor; lead: amp and struct "
                "< %.1f x floor; pan: |lr| < %.2f).\n" % (int(VHOLD), ZERO_SYNC, ZERO_K, ZERO_K, ZERO_LR))
        f.write("\t".join(cols) + "\n")
        for line in keep:
            f.write(line)
        for n in sorted(table):
            r = table[n]
            z = zero_voices(r, floor) if floor else []
            vals = [a.tag, sets.get(n, "-"), n]
            for v in VOICES:
                x = r["no_" + v]
                vals += ["%.3f" % x["amp"], "%.3f" % x["struct"], "%.3f" % x.get("sync", 0),
                         "%.4f" % x["hit"] if "hit" in x else "-"]
            lim_var = max(r[k]["lim"][1] for k in VKINDS[1:])
            vals += ["%.3f" % r["pan_lead"]["amp"], "%+.3f" % r["pan_lead"].get("lr", 0),
                     "%d" % r.get("lim_full", [0, 0, 0])[1], "%d" % lim_var, "%d" % len(z), ",".join(z) or "-"]
            f.write("\t".join(vals) + "\n")
    print("%s: run %s, %d scenes" % (VOUT, a.tag, len(table)))
    sheet_dir = os.path.join(a.sheets, a.tag)
    os.makedirs(sheet_dir, exist_ok=True)
    for v in VOICES + ("pan",):
        kind = "pan_lead" if v == "pan" else "no_" + v
        order = sorted(table, key=lambda n: -scores[v][n])
        for which, pick in (("strong", order[:10]), ("weak", order[-10:][::-1])):
            voice_sheet(os.path.join(sheet_dir, "%s_%s.jpg" % (v, which)), a.tag, table, pick, kind,
                        "%s -- %s (%s)" % (v, "the ten strongest" if which == "strong" else "the ten weakest", a.tag))
    print("sheets in", sheet_dir)
    return 0


def voice_sheet(path, tag, table, names, kind, title):
    """One contact sheet: per scene its name and numbers, the full run, the variant, their difference x4."""
    from PIL import Image, ImageDraw, ImageChops
    tw, th, lw = 320, 180, 260
    img = Image.new("RGB", (lw + 3 * tw, 28 + len(names) * (th + 4)), (16, 16, 16))
    dr = ImageDraw.Draw(img)
    dr.text((8, 8), title + "   |   full | %s | difference x4" % kind, fill=(230, 230, 230))
    fdir = os.path.join(VWORK, tag, "frames")
    for i, n in enumerate(names):
        y = 28 + i * (th + 4)
        r = table[n][kind]
        txt = "%s\namp %.2f  struct %.3f\nsync %.2f  hit %.3f" % (n, r["amp"], r["struct"], r.get("sync", 0),
                                                                r.get("hit", 0))
        if "lr" in r:
            txt += "\nlr %+.2f" % r["lr"]
        dr.text((8, y + 8), txt, fill=(230, 230, 230))
        try:
            fa = Image.open(os.path.join(fdir, r["thumb_full"])).convert("RGB").resize((tw, th))
            fb = Image.open(os.path.join(fdir, r["thumb"])).convert("RGB").resize((tw, th))
        except (KeyError, OSError):
            continue
        df = ImageChops.difference(fa, fb).point(lambda p: min(255, p * 4))
        img.paste(fa, (lw, y))
        img.paste(fb, (lw + tw, y))
        img.paste(df, (lw + 2 * tw, y))
    img.save(path, quality=88)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--controls", action="store_true")
    ap.add_argument("--scenes", default="")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="only the first N chunks (timing)")
    ap.add_argument("--voices", action="store_true", help="per voice instead of music against silence (see voices())")
    ap.add_argument("--set", default="", help="--voices: controls | labs | top60 (or --scenes)")
    ap.add_argument("--tag", default="base", help="--voices: the name of the run (base, roles, ...)")
    ap.add_argument("--chunk", type=int, default=-1, help="--voices: only this chunk of the set (resumable runs)")
    ap.add_argument("--expr", default="", help="--voices: NAME=FORMULA,... added to every entry as <expr> (draws "
                                               "no random number, so the rolls stay those of the run without)")
    ap.add_argument("--plan", action="store_true", help="--voices: print the set's chunks and stop")
    ap.add_argument("--sheets", default=VSHEETS, help="--voices --report: the folder for the contact sheets")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(WORK, exist_ok=True)
    if a.voices:
        return voices_main(a)
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
