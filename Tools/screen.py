# -*- coding: utf-8 -*-
r"""Screen the whole scene catalogue by MEASURING it instead of watching it.

Watching 831 scenes is hopeless -- the scheduler picks at random, so seeing
them all by chance takes several times the catalogue's length and still leaves
gaps.  This walks the catalogue deterministically, records it, and reduces
every scene's window to a handful of numbers.  What comes out is a ranked list
of scenes that show nothing, hold still, or strobe.

    python Tools/screen.py                       # the whole catalogue
    python Tools/screen.py --preset SpaceAmbient # only that preset's scenes
    python Tools/screen.py --scenes A,B,C        # only these, one chunk
    python Tools/screen.py --report              # re-rank what was measured
    python Tools/screen.py --resume              # continue an interrupted run

Everything lands in `.screen/` (gitignored): the chunk configs, the render
logs, `metrics_NN.json` per chunk and `metrics.json` for the whole run.

WHY IT LOOKS LIKE THIS -- every rule below cost a wasted run to find:

* The recorder writes its MP4 only AFTER the app exits, with its own ffmpeg.
  Waiting for the file's size to settle measures a file that does not exist
  yet, so we wait for it to APPEAR first.  And a chunk that measured nothing
  keeps its recording: "0 windows" is a symptom, not a licence to delete.
* Without KALEIDO_SEED the scenes re-roll their parameters every run and the
  same shader measures 0.015 or 0.036 depending on the throw.  Pinned here,
  because a screening that cannot be repeated cannot be compared.
* The screening WAV's loud/quiet edge is a frame difference of its own and
  reports every audio-reactive scene as a strobe.  The edge is ramped AND the
  frames around it are dropped from the strobe statistic.
* `luma_med` is the median over PIXELS.  For a starfield that is legitimately
  0.0, so darkness alone is useless as a criterion -- what matters is whether
  there is any STRUCTURE (spatial_std) and any MOTION.
"""
import argparse, io, json, math, os, re, struct, subprocess, sys, time, wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, ".screen")
RELEASE = os.path.join(ROOT, "Release")
KOMPLETT = os.path.join(ROOT, "Configurations", "Komplett.xml")

# Analysis raster.  160x90 is small on purpose: it is a structure measure, not
# a screenshot, and one ffmpeg decode per chunk beats thousands of PNG files.
FPS, W, H = 5.0, 160, 90
GUARD_IN, GUARD_OUT = 2.0, 0.3        # skip the fade in/out of each window

# Thresholds.  The first set flagged 92 of 185 scenes and was useless; these
# flag about one in twelve, and roughly two thirds of those are real.
LEER_LUMA, LEER_STD = 0.030, 0.038    # both, or a dark space scene trips it
STARR_MOTION = 0.0025
BLITZ_STROBE = 12.0


# ---------------------------------------------------------------- config ----
BLOCK = re.compile(r"[ \t]*<(TextureShader|CombineShader|TransitionShader)\b[^>]*>.*?</\1>[ \t]*\n", re.S)
NAME  = re.compile(r'file="[^"]*[\\/](\w+)\.frag"')


def read_master():
    """Scene blocks from Komplett.xml, plus the two neutral overlays.

    A review harness must not paint anything over the scene being judged, so
    FxPlain is the only overlay and Crossfade the only transition.
    """
    src = io.open(KOMPLETT, encoding="utf-8").read()
    scenes, plain, cross = [], None, None
    for m in BLOCK.finditer(src):
        tag, blk = m.group(1), m.group(0)
        nm = NAME.search(blk.split(">", 1)[0])
        nm = nm.group(1) if nm else "?"
        if tag == "TextureShader":
            scenes.append((nm, blk))
        elif nm == "FxPlain":
            plain = blk
        elif nm == "Crossfade":
            cross = blk
    if not plain or not cross:
        sys.exit("FxPlain/Crossfade nicht in Komplett.xml gefunden")
    return scenes, plain, cross


def preset_names(preset):
    """Scene stems a generated preset contains (so --preset mirrors the show)."""
    p = os.path.join(ROOT, "Configurations", preset + ".xml")
    if not os.path.exists(p):
        sys.exit("Preset nicht gefunden: " + p)
    src = io.open(p, encoding="utf-8", errors="replace").read()
    return {m.group(1) for m in NAME.finditer(src)}


FX_REF = "TunnelPlain"          # the catalogue's 2D reference scene


def write_fx_config(scenes, cross):
    """One config: a single fixed scene, every overlay, walked by KALEIDO_FX_SWEEP.

    Measuring an overlay needs the CONTENT underneath held still, otherwise a
    scene cut is indistinguishable from the overlay doing something.  Hence one
    reference scene for all of them -- the same one the catalogue images use, so
    the numbers and the pictures talk about the same thing.
    """
    src = io.open(KOMPLETT, encoding="utf-8").read()
    ref, fx = None, []
    for m in BLOCK.finditer(src):
        tag, blk = m.group(1), m.group(0)
        nm = NAME.search(blk.split(">", 1)[0])
        nm = nm.group(1) if nm else "?"
        if tag == "TextureShader" and nm == FX_REF and ref is None:
            ref = blk
        elif tag == "CombineShader":
            fx.append(blk)
    if ref is None:
        sys.exit("Referenzszene %s nicht in Komplett.xml" % FX_REF)
    xml = ('<?xml version="1.0" encoding="utf-8" ?>\n'
           '<configuration ImageDirectory="..\\\\Images" '
           'ConfigurationName="TestZZScreenFx" hidden="true" >\n\n'
           + ref + "\n" + "".join(fx) + cross + "</configuration>\n")
    io.open(os.path.join(ROOT, "Configurations", "ZZScreenFx.xml"), "w",
            encoding="utf-8").write(xml)
    return [("ZZScreenFx", len(fx))]


def review_order(part):
    """The order the ENGINE will walk these in (review mode).

    Not the config order: SceneScheduler sorts the flat scenes first and the
    3D ones after, alphabetically inside each block, so a reviewer compares
    like with like.  Knowing the order is what lets the sacrificial entries
    below land where they are needed.
    """
    def key(item):
        name, blk = item
        head = blk.split(">", 1)[0]
        block = 1 if "Scene3D" in head or "scene3d" in head else 0
        return (block, name.lower())
    return sorted(part, key=key)


def write_chunks(scenes, plain, cross, per_chunk):
    """One review config per chunk.  The "Test" name prefix is what flips the
    engine into review mode, so the prefix is not cosmetic.

    Each chunk gets its first and last scene entered TWICE.  measure() drops
    the first and last window of every recording -- the first catches the app
    still coming up, the last runs past the end of the sweep where the
    scheduler takes back over -- and without the duplicates that would silently
    cost two real scenes per chunk.  With them, the sacrificial windows are
    copies and every scene still gets measured.
    """
    names = []
    for i in range(0, len(scenes), per_chunk):
        part = scenes[i:i + per_chunk]
        order = review_order(part)
        entries = [order[0][1]] + [b for _, b in part] + [order[-1][1]] \
                  if len(order) >= 2 else [b for _, b in part]
        n = i // per_chunk + 1
        cfg = "ZZScreen%02d" % n
        xml = ('<?xml version="1.0" encoding="utf-8" ?>\n'
               '<configuration ImageDirectory="..\\\\Images" '
               'ConfigurationName="Test%s" hidden="true" >\n\n' % cfg
               + "".join(entries) + "\n" + plain + cross
               + "</configuration>\n")
        io.open(os.path.join(ROOT, "Configurations", cfg + ".xml"), "w",
                encoding="utf-8").write(xml)
        names.append((cfg, len(entries)))
    return names


def write_wav(path, secs, cycle=8.0):
    """Loud/quiet cycle so every scene is seen in BOTH conditions.

    The edges are raised cosines: a hard switch is itself a frame difference
    and made every audio-reactive scene look like a strobe.
    """
    sr = 44100
    w = wave.open(path, "wb")
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    buf = bytearray()
    half, ramp = cycle / 2.0, 0.35
    for i in range(int(sr * secs)):
        t = i / sr
        ph = t % cycle
        if ph < half:
            loud = 1.0
            if ph < ramp:        loud = 0.5 * (1 - math.cos(math.pi * ph / ramp))
            elif ph > half-ramp: loud = 0.5 * (1 + math.cos(math.pi * (ph-half+ramp) / ramp))
        else:
            loud = 0.0
        drone = 0.18*math.sin(2*math.pi*55*t) + 0.10*math.sin(2*math.pi*82.5*t)
        beat  = math.exp(-((t % 0.5) * 14.0)) * math.sin(2*math.pi*60*t) * 0.55
        hat   = math.exp(-((t % 0.25) * 90.0)) * math.sin(2*math.pi*7000*t) * 0.12
        s = drone * (0.35 + 0.65*loud) + (beat + hat) * loud
        buf += struct.pack("<h", max(-32767, min(32767, int(s * 22000))))
    w.writeframes(bytes(buf)); w.close()


# ---------------------------------------------------------------- render ----
def newest_recording():
    d = os.path.join(RELEASE, "recordings")
    if not os.path.isdir(d):
        return None
    subs = sorted(x for x in os.listdir(d) if x.startswith("rec_"))
    return os.path.join(d, subs[-1]) if subs else None


def wait_for_video(folder, timeout=1500):
    """Wait for the MP4 to APPEAR, then for its size to settle.

    The recorder hands off to a separate ffmpeg after the app exits.  Checking
    only for a stable size measures a file that is not there yet -- two chunks
    once returned 0 windows that way, and the driver then deleted them.
    """
    last, stable, t0 = -1, 0, time.time()
    while time.time() - t0 < timeout:
        vid = None
        for cand in ("kaleidoscope.mp4", "video.mp4"):
            p = os.path.join(folder, cand)
            if os.path.exists(p):
                vid = p
                break
        if vid:
            n = os.path.getsize(vid)
            if n > 1_000_000 and n == last:
                stable += 1
                # A stable size is NOT enough.  `video.mp4` is the raw
                # intermediate the app writes while it runs; if the run was
                # interrupted it never gets its moov atom and ffmpeg cannot
                # read a single frame -- which then looks like "0 windows",
                # i.e. like a scene fault instead of a truncated file.
                if stable >= 2 and decodable(vid):
                    return vid
            else:
                stable = 0
            last = n
        time.sleep(5)
    return None


def decodable(vid):
    """True if ffmpeg can read at least one frame out of `vid`."""
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", vid, "-frames:v", "1",
                        "-f", "rawvideo", "-"], capture_output=True)
    return len(p.stdout) > 0


def render(cfg, wav, log_path, hold, seed, kind="scene"):
    # Die Engine liest KALEIDO_SCENE_SWEEP mit qEnvironmentVariableIntValue:
    # "12.0" ergibt dort 0 und der Sweep laeuft schlicht nicht an -- die
    # Aufnahme sieht dann wie ein normaler Lauf aus und liefert null Fenster.
    var = "KALEIDO_FX_SWEEP" if kind == "fx" else "KALEIDO_SCENE_SWEEP"
    env = dict(os.environ, KALEIDO_SEED=str(seed), KALEIDO_COST_LOG="1")
    env[var] = str(int(round(hold)))
    with io.open(log_path, "w", encoding="utf-8", errors="replace") as fh:
        subprocess.run([os.path.join(RELEASE, "Kaleidoscope.exe"),
                        "-c", "Test" + cfg, "-x", wav],
                       cwd=RELEASE, env=env, stdout=fh, stderr=subprocess.STDOUT)


# --------------------------------------------------------------- measure ----
SWEEP = re.compile(r"^\[(?:sweep|fxsweep)\]\s+\d+/\d+\s+t=([\d.]+)s\s+(\S+)", re.M)


def windows_from_log(log_path):
    txt = io.open(log_path, encoding="utf-8", errors="ignore").read()
    ev = [(float(m.group(1)), m.group(2)) for m in SWEEP.finditer(txt)]
    # Sweep retries repeat a name within a few seconds; a catalogue entry that
    # merely uses the same shader again is a window of its own.
    out = []
    for t0, n in ev:
        if out and out[-1][1] == n and (t0 - out[-1][0]) < 4.0:
            continue
        out.append((t0, n))
    return out


def decode(vid):
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", vid, "-vf",
                        "fps=%g,scale=%d:%d" % (FPS, W, H), "-pix_fmt", "rgb24",
                        "-f", "rawvideo", "-"], capture_output=True)
    b = np.frombuffer(p.stdout, np.uint8)
    n = b.size // (W * H * 3)
    if n == 0:
        return None, 0
    fr = b[:n*W*H*3].reshape(n, H, W, 3).astype(np.float32) / 255.0
    return fr @ np.array([0.299, 0.587, 0.114], np.float32), n


def time_offset(luma, ev, nfr):
    """Video and app clocks drift; scene cuts are motion spikes, so the offset
    that lands the cuts on the spikes is the offset."""
    d = np.abs(np.diff(luma, axis=0)).mean(axis=(1, 2))
    best, score = 0.0, -1.0
    for off in np.arange(-3.0, 3.01, 0.2):
        idx = [int(round((t + off) * FPS)) for t, _ in ev[1:]]
        idx = [i for i in idx if 1 <= i < len(d)]
        s = float(np.mean(d[idx])) if idx else -1.0
        if s > score:
            score, best = s, off
    return best


def measure(vid, log_path, hold, cycle=8.0):
    ev = windows_from_log(log_path)
    if not ev:
        return []
    luma, nfr = decode(vid)
    if luma is None:
        return []
    off = time_offset(luma, ev, nfr)
    rows = []
    for k, (t0, name) in enumerate(ev):
        # The FIRST window catches the app still coming up (the fade in from
        # black, the first shader compiles), and the LAST one runs past the end
        # of the sweep -- after the last forced scene the scheduler takes over
        # again and shows whatever it likes.  Both measure something other than
        # the scene they are labelled with.  With 110 scenes per chunk that is
        # 2 % of the windows; with four it was half of them, which is how the
        # effect was found.
        if k == 0 or k == len(ev) - 1:
            continue
        t1 = ev[k+1][0]
        a = max(0, int(round((t0 + off + GUARD_IN) * FPS)))
        b = min(nfr, int(round((t1 + off - GUARD_OUT) * FPS)))
        if b - a < 4:
            continue
        L = luma[a:b]
        dif = np.abs(np.diff(L, axis=0)).mean(axis=(1, 2))
        # Drop the frames straddling the audio edge: that step is a frame
        # difference of its own and would report every reactive scene as BLITZ.
        tm = ((np.arange(a, b-1) + 0.5) / FPS) - off
        edge = np.abs(np.mod(tm, cycle/2.0) - cycle/4.0) > (cycle/4.0 - 0.6)
        safe = dif[~edge] if (~edge).any() else dif
        tt = (np.arange(a, b) / FPS) - off
        hot = np.mod(tt, cycle) < (cycle / 2.0)
        hq = (float(L[hot].mean()) / max(float(L[~hot].mean()), 1e-4)) \
             if hot.any() and (~hot).any() else 1.0
        rows.append(dict(
            name=name, t0=float(t0),
            luma_med=float(np.median(L)),
            luma_min=float(L.mean(axis=(1, 2)).min()),
            luma_max=float(L.mean(axis=(1, 2)).max()),
            motion_med=float(np.median(safe)),
            strobe=float(safe.max() / max(np.median(safe), 1e-4)),
            spatial_std=float(np.median(L.std(axis=(1, 2)))),
            clip_hi=float((L > 0.97).mean()),
            hot_vs_quiet=float(hq),
            frames=int(b - a)))
    return rows


# ---------------------------------------------------------------- report ----
def flags(rows):
    out = []
    leer = [r for r in rows if r["luma_med"] < LEER_LUMA and r["spatial_std"] < LEER_STD]
    if leer:
        out.append("LEER %.3f (%d/%d)" % (min(r["spatial_std"] for r in leer),
                                          len(leer), len(rows)))
    mo = min(r["motion_med"] for r in rows)
    st = max(r["strobe"] for r in rows)
    if mo < STARR_MOTION: out.append("STARR %.4f" % mo)
    if st > BLITZ_STROBE: out.append("BLITZ %.1f" % st)
    return out


def report(rows):
    per = {}
    for r in rows:
        per.setdefault(r["name"], []).append(r)
    if not rows:
        print("\nKeine Fenster gemessen -- siehe die Logs unter .screen/.")
        return []
    sds = sorted(r["spatial_std"] for r in rows)
    q10 = sds[len(sds)//10]
    marked = [(n, flags(v)) for n, v in per.items()]
    marked = sorted(((n, f) for n, f in marked if f), key=lambda x: x[0].lower())
    print("\n%d Szenen gemessen (%d Fenster), %d auffaellig"
          % (len(per), len(rows), len(marked)))
    print("Katalog: spatial_std Median %.4f, 10-%%-Quantil %.4f"
          % (sds[len(sds)//2], q10))
    print("  (luma_med ist der Median ueber die PIXEL -- bei Sternenfeldern zu"
          " Recht 0, deshalb zaehlt Struktur, nicht Dunkelheit)\n")
    for n, f in marked:
        print("  %-38s %s" % (n, " | ".join(f)))
    return marked


# -------------------------------------------------------------- baseline ----
# A versioned snapshot of what every scene measured when it was known good, so
# a shader edit that quietly guts a scene is caught at the next screening
# instead of months later on a catalogue image.  Two of the four real defects
# in the 31.08. round were earlier fixes of mine that had treated a symptom and
# left the cause; both would have shown up here as a collapse in structure.
BASELINE = os.path.join(ROOT, "docs", "scene-baseline.json")

# What counts as a regression.  This number was wrong once already, and the
# correction is worth keeping: the first estimate (2.0) came from comparing two
# short runs of a handful of scenes.  Re-measured properly -- a full 110-scene
# chunk re-rendered with the same seed and compared against the baseline it had
# produced -- 97 of 108 scenes landed within a factor of two, ELEVEN did not,
# and the worst was 5.4x.  A threshold of 2.0 would therefore have reported
# about a tenth of the catalogue as "collapsed" on every clean run.
#
# 3.0 keeps the false alarms rare while still catching what matters: the real
# defects this tool was built for were 20x to 70x, not 2x.
REGRESS_FACTOR = 3.0


def aggregate(rows):
    """One row per scene: the worst case over its windows, which is what a
    reviewer cares about ("does this scene EVER show something?")."""
    per = {}
    for r in rows:
        per.setdefault(r["name"], []).append(r)
    out = {}
    for n, v in per.items():
        out[n] = dict(
            std=round(max(x["spatial_std"] for x in v), 5),
            motion=round(max(x["motion_med"] for x in v), 5),
            strobe=round(max(x["strobe"] for x in v), 2),
            luma=round(max(x["luma_max"] for x in v), 4),
            n=len(v))
    return out


def save_baseline(rows):
    agg = aggregate(rows)
    os.makedirs(os.path.dirname(BASELINE), exist_ok=True)
    json.dump(dict(scenes=agg, note=(
        "Bestwert je Szene ueber ihre Fenster, aus Tools/screen.py. "
        "Aktualisieren mit: python Tools/screen.py --save-baseline"),
    ), io.open(BASELINE, "w", encoding="utf-8"), indent=1, sort_keys=True)
    print("Basislinie: %d Szenen -> %s" % (len(agg), BASELINE))


def check_baseline(rows):
    if not os.path.exists(BASELINE):
        print("Keine Basislinie -- erst  python Tools/screen.py --save-baseline")
        return 0
    base = json.load(io.open(BASELINE, encoding="utf-8"))["scenes"]
    now = aggregate(rows)
    worse, neu, gone = [], [], []
    for n, cur in sorted(now.items()):
        if n not in base:
            neu.append(n)
            continue
        b = base[n]
        for key, label in (("std", "Struktur"), ("motion", "Bewegung")):
            if b[key] > 1e-5 and cur[key] * REGRESS_FACTOR < b[key]:
                worse.append((n, label, b[key], cur[key]))
    gone = sorted(set(base) - set(now))
    print("\nGegen die Basislinie: %d Szenen geprueft" % len(now))
    if worse:
        print("  EINGEBROCHEN (Faktor > %.0f):" % REGRESS_FACTOR)
        for n, label, a, b_ in worse:
            print("    %-38s %-9s %.5f -> %.5f" % (n, label, a, b_))
    if neu:
        print("  neu, noch nicht in der Basislinie: %s" % ", ".join(neu[:8])
              + (" ..." if len(neu) > 8 else ""))
    if gone:
        print("  diesmal nicht gemessen: %d Szenen" % len(gone))
    if not worse:
        print("  keine Einbrueche.")
    return 1 if worse else 0


def report_fx(rows):
    """An overlay is judged against the pass-through, not against a threshold.

    Two questions, and neither is answered by the scene report: does this FX
    CHANGE anything (a silent overlay measures like FxPlain -- 43 silent FX and
    transitions were once found in one pass), and does it leave anything TO
    see (an FX that flattens the frame is as bad as one that does nothing).
    """
    per = {r["name"]: r for r in rows}
    base = per.get("FxPlain")
    if base is None:
        print("\nFxPlain fehlt in der Messung -- ohne Referenz kein FX-Urteil.")
        return []
    sds = sorted(r["spatial_std"] for r in rows)
    med = sds[len(sds)//2]
    quiet, flat = [], []
    for n, r in sorted(per.items()):
        if n == "FxPlain":
            continue
        d = (abs(r["luma_med"] - base["luma_med"]) / max(base["luma_med"], 1e-4)
             + abs(r["spatial_std"] - base["spatial_std"]) / max(base["spatial_std"], 1e-4))
        if d < 0.06:
            quiet.append((n, d))
        if r["spatial_std"] < 0.25 * med:
            # CAVEAT: the analysis raster is 160x90.  An overlay that tiles the
            # frame into many small copies (FxSphere at nrCopies=8) averages
            # away at that size and measures flat while looking fine at full
            # resolution -- its catalogue image scores sd 41.  Treat this as a
            # candidate to LOOK at, never as a verdict.
            flat.append((n, r["spatial_std"]))
    print("\n%d Overlays gegen FxPlain (luma %.3f, sd %.4f), Median sd %.4f"
          % (len(per) - 1, base["luma_med"], base["spatial_std"], med))
    if quiet:
        print("  STUMM (kaum vom Durchreicher zu unterscheiden):")
        for n, d in quiet:
            print("    %-28s Abstand %.3f" % (n, d))
    else:
        print("  keine stummen Overlays.")
    if flat:
        print("  PLATT (unter einem Viertel des Medians) -- ANSEHEN, kein Urteil:")
        print("    (hochfrequente Kachel-Overlays mitteln sich im 160x90-Raster weg)")
        for n, v in flat:
            print("    %-28s sd %.4f" % (n, v))
    return quiet + flat


# ------------------------------------------------------------------ main ----
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", choices=("scene", "fx"), default="scene",
                    help="Szenen messen oder die Overlays ueber einer festen Szene")
    ap.add_argument("--preset", help="nur die Szenen dieses Presets")
    ap.add_argument("--scenes", help="Komma-Liste von Szenennamen")
    ap.add_argument("--chunk", type=int, default=110, help="Szenen je Aufnahme")
    ap.add_argument("--hold", type=int, default=8, help="Sekunden je Szene (ganzzahlig)")
    ap.add_argument("--seed", type=int, default=1, help="KALEIDO_SEED")
    ap.add_argument("--report", action="store_true", help="nur neu auswerten")
    ap.add_argument("--resume", action="store_true", help="fertige Chunks ueberspringen")
    ap.add_argument("--save-baseline", action="store_true",
                    help="die letzte Messung als docs/scene-baseline.json festschreiben")
    ap.add_argument("--check", action="store_true",
                    help="letzte Messung gegen die Basislinie pruefen (Exit 1 bei Einbruch)")
    a = ap.parse_args()

    os.makedirs(WORK, exist_ok=True)
    merged = os.path.join(WORK, "metrics.json")

    if a.report or a.save_baseline or a.check:
        if not os.path.exists(merged):
            sys.exit("Noch nichts gemessen -- erst ohne diese Flags laufen lassen.")
        rows = json.load(io.open(merged, encoding="utf-8"))
        if a.report:        (report_fx if a.kind == "fx" else report)(rows)
        if a.save_baseline: save_baseline(rows)
        if a.check:         return check_baseline(rows)
        return 0

    scenes, plain, cross = read_master()
    if a.preset:
        keep = preset_names(a.preset)
        scenes = [s for s in scenes if s[0] in keep]
    if a.scenes:
        keep = {x.strip() for x in a.scenes.split(",") if x.strip()}
        scenes = [s for s in scenes if s[0] in keep]
        missing = keep - {s[0] for s in scenes}
        if missing:
            print("nicht im Katalog:", ", ".join(sorted(missing)))
    if not scenes:
        sys.exit("Keine Szenen ausgewaehlt.")

    if a.kind == "fx":
        chunks = write_fx_config(scenes, cross)
        per = chunks[0][1]
    else:
        per = len(scenes) if a.scenes else a.chunk
        chunks = write_chunks(scenes, plain, cross, per)
    print("%d Szenen -> %d Aufnahme(n) a %d, %.0f s Haltezeit, Seed %d"
          % (len(scenes), len(chunks), per, a.hold, a.seed))

    wav = os.path.join(WORK, "screen.wav")
    need = max(c[1] for c in chunks) * a.hold + 30
    if not os.path.exists(wav) or os.path.getsize(wav) < need * 44100 * 2 * 0.9:
        print("Screening-WAV bauen (%.0f s) ..." % need)
        write_wav(wav, need)

    allrows, costs = [], {}
    for cfg, count in chunks:
        mpath = os.path.join(WORK, "metrics_%s.json" % cfg[-2:])
        if a.resume and os.path.exists(mpath):
            allrows += json.load(io.open(mpath, encoding="utf-8"))
            print("  %s: uebersprungen (schon gemessen)" % cfg)
            continue
        log = os.path.join(WORK, "%s.log" % cfg)
        print("  %s: rendern (%d Szenen, ~%.0f min) ..."
              % (cfg, count, (count * a.hold + 40) / 60.0))
        render(cfg, wav, log, a.hold, a.seed, a.kind)
        folder = newest_recording()
        vid = wait_for_video(folder) if folder else None
        if not vid:
            print("  %s: KEIN Video -- uebersprungen" % cfg)
            continue
        # The app writes scene-cost.json into its working directory and
        # overwrites it per chunk, so fold it into a running total before the
        # next render clobbers it.  Measured cost is the honest replacement for
        # the hand-set `complexity` the scheduler budgets with.
        cp = os.path.join(RELEASE, "scene-cost.json")
        if os.path.exists(cp):
            try:
                part = json.load(io.open(cp, encoding="utf-8"))
                costs.update(part)
            except ValueError:
                pass
            os.remove(cp)
        rows = measure(vid, log, a.hold)
        if rows:
            json.dump(rows, io.open(mpath, "w", encoding="utf-8"), indent=1)
            # Only now is the recording expendable.
            subprocess.run(["cmd", "/c", "rmdir", "/s", "/q", folder], check=False)
            print("  %s: %d Fenster" % (cfg, len(rows)))
        else:
            print("  %s: 0 Fenster -- Aufnahme BLEIBT unter %s" % (cfg, folder))
        allrows += rows

    for cfg, _ in chunks:
        p = os.path.join(ROOT, "Configurations", cfg + ".xml")
        if os.path.exists(p):
            os.remove(p)

    if costs:
        cf = os.path.join(WORK, "scene-cost.json")
        json.dump(costs, io.open(cf, "w", encoding="utf-8"), indent=1, sort_keys=True)
        print("Kosten: %d Szenen -> %s" % (len(costs), cf))
    json.dump(allrows, io.open(merged, "w", encoding="utf-8"), indent=1)
    (report_fx if a.kind == "fx" else report)(allrows)
    print("\nMesswerte: %s" % merged)
    # A full run is exactly when a regression would show, so check by default.
    # A partial run (--scenes/--preset) only compares what it measured.
    rc = check_baseline(allrows) if os.path.exists(BASELINE) else 0
    return rc


if __name__ == "__main__":
    sys.exit(main())
