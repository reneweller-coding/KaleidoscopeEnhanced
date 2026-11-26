# -*- coding: utf-8 -*-
r"""light_stats.py -- where a scene's light sits at the upper limit, and where it would rise above it.

Every intermediate picture of the engine is 8 bit (RGBA8): what a scene writes above 1 is cut off there, and the
bloom (Engine/BloomBlur.frag, max( c - 0.70, 0 ) * 1.6) cannot tell a white wall from a lamp.  Most scenes cut it off
themselves before that (`fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 )`).  Wider targets therefore only pay where a
scene's light really goes above 1.  This measures it, per scene, over the screening music (Tools/screen.py: the
video export on the frame clock, the catalogue walked by KALEIDO_SCENE_SWEEP, one fixed photo, fixed rolls):

  --plain   the scenes as they are; the frame the present pass takes (after the scene, the overlay and the trails,
            before the bloom) is read back each frame (KALEIDO_LIGHT_STATS=1): the share of pixels at the limit.
  default   the same over MEASUREMENT COPIES of the scenes (.screen/light/src): each copy writes a quarter of its
            colour, and its final clamp keeps only the lower bound -- so an 8-bit target holds 0..4, and the hook
            decodes with 4 (KALEIDO_LIGHT_STATS=4).  What lies above 1 now is light the scene computes and cuts off.
            Additive 3D geometry (GL_ONE, GL_ONE) sums a quarter as well.  The scene's own state pass (//@state) is
            left unscaled; a scene that samples the previous frame (texPrevFrame) has those samples scaled back up.
            Chain labs run as their uber shader (KALEIDO_NO_CHAINPASS: the pass files are not copied).

Per frame the engine prints `[light] f=.. clip=.. over=..` (Source/PresentPass.cpp, logLightStats); the frames of
each scene's window (its first 2.2 s and last 0.3 s dropped, only while [shown] names it) are aggregated:

  clip_med   median share of pixels whose brightest channel reaches 0.995 (at the limit)
  over_med/max  share reaching 1.05 (above the limit); over2_max: reaching 2
  white_med  share whose DARKEST channel reaches 0.995 (white, not just one saturated channel)
  exc        mean luma above 1 per pixel (light that is cut off)
  b8, bh     the bloom's bright pass as luma, as it is (colour clamped to 1) and with the light kept
  glow_gain  bh / b8: how much more glow the same frame would give if its light were kept
  vmax       the brightest channel seen (decoded; a copy cannot show more than 4)

    python Tools/light_stats.py --scenes A,B,C        # these scenes (a pick, resumable by chunk)
    python Tools/light_stats.py --chunks 0:6          # chunks 0..5 of the whole catalogue (50 scenes each)
    python Tools/light_stats.py --plain --scenes A,B  # the scenes unmodified (control)
    python Tools/light_stats.py --report              # .screen/light/light_stats.tsv from what was measured

Work files land in .screen/light (gitignored).  One export at a time, below normal priority; run it through the
machine's heavy-job lock.  Nothing is sent anywhere.
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
WORK = os.path.join(ROOT, ".screen", "light")
SRC = os.path.join(WORK, "src")
OUT = os.path.join(WORK, "light_stats.tsv")
HOLD = 8.0
FPS = 15
SIZE = "960x540"
CHUNK = 50
SEED = 7
SCALE = 4.0                      # the copies write colour / SCALE
GUARD_IN, GUARD_OUT = 2.2, 0.3   # screen.py's guards plus its export offset of 0.2 s
PHOTO = "kristallhoehle-indigo-fuchsia-2.jpg"   # the snapshot baseline's photo (Tools/reactivity.py)
screen.EXPORT_SIZE = SIZE
screen.EXPORT_FPS = FPS

DECL = re.compile(r"^([ \t]*(?:layout\s*\([^)]*\)\s*)?)out\s+vec4\s+fragColor\s*;", re.M)
MAIN = re.compile(r"\bvoid\s+main\s*\(\s*(?:void)?\s*\)")
FINAL = re.compile(r"\bfragColor\s*=\s*(?:vec4\s*\(\s*)?clamp\s*\(")
PREV = re.compile(r"\b(texture|textureLod|texelFetch|textureGrad|textureOffset)\s*\(\s*texPrevFrame\s*,")
LOW = ("0.0", "0.", "0")
HIGH = ("1.0", "1.", "1")


def close_paren(s, i):
    """Index of the parenthesis that closes the one opened at s[i]."""
    depth = 0
    for j in range(i, len(s)):
        if s[j] == "(":
            depth += 1
        elif s[j] == ")":
            depth -= 1
            if depth == 0:
                return j
    return -1


def split_args(s):
    """Top-level comma split of an argument list."""
    out, depth, cur = [], 0, []
    for ch in s:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == "," and depth == 0:
            out.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    out.append("".join(cur))
    return out


def rewrite(src):
    """The measurement copy of a scene's fragment shader.

    @return
      (text, unclamped, prev) -- text None if the shader has no plain `out vec4 fragColor` and one main();
      unclamped: how many final clamps lost their upper bound; prev: how many texPrevFrame samples were scaled back.
    """
    if len(DECL.findall(src)) != 1 or len(MAIN.findall(src)) != 1:
        return None, 0, 0
    # The final clamps first (positions shift with every edit: walk from the end).
    unclamped = 0
    for m in reversed(list(FINAL.finditer(src))):
        open_i = m.end() - 1
        close_i = close_paren(src, open_i)
        if close_i < 0:
            continue
        args = split_args(src[open_i + 1:close_i])
        if len(args) == 3 and args[1].strip() in LOW and args[2].strip() in HIGH:
            ci = src.rindex("clamp", m.start(), m.end())
            src = src[:ci] + "max(" + args[0] + ", 0.0 )" + src[close_i + 1:]
            unclamped += 1
    prev = 0
    for m in reversed(list(PREV.finditer(src))):
        open_i = src.index("(", m.start())
        close_i = close_paren(src, open_i)
        if close_i < 0:
            continue
        src = src[:m.start()] + "( vec4( %.1f, %.1f, %.1f, 1.0 ) * " % (SCALE, SCALE, SCALE) + src[m.start():close_i + 1] \
            + " )" + src[close_i + 1:]
        prev += 1
    src = DECL.sub(lambda d: d.group(1) + "out vec4 fragColorLight_;\nvec4 fragColor;", src, count=1)
    src = MAIN.sub("void lightMain_()", src, count=1)
    state = "if ( statePass != 1 ) " if re.search(r"\buniform\s+int\s+statePass\b", src) else ""
    src += ("\n// Tools/light_stats.py: a measurement copy -- a quarter of the colour, no upper bound in the final"
            " clamp.\nvoid main()\n{\n    lightMain_();\n    fragColorLight_ = fragColor;\n    %s"
            "fragColorLight_.rgb = fragColor.rgb * %s;\n}\n" % (state, repr(1.0 / SCALE)))
    return src, unclamped, prev


def scene_file(block):
    """(folder, stem) of a TextureShader block's fragment file."""
    m = re.search(r'file="[^"]*?[\\/]+(Scene2D|Scene3D)[\\/]+(\w+)\.frag"', block)
    return (m.group(1), m.group(2)) if m else (None, None)


def prepare(name, block, info):
    """The scene's measurement copy (its .frag rewritten, the siblings copied) and its block pointing there.

    @return
      The block for the chunk preset, or None if the scene cannot be measured this way (info says why).
    """
    folder, stem = scene_file(block)
    if not folder:
        info[name] = {"skip": "not a Scene2D/Scene3D file"}
        return None
    src_dir = os.path.join(ROOT, folder)
    dst_dir = os.path.join(SRC, folder)
    os.makedirs(dst_dir, exist_ok=True)
    text = io.open(os.path.join(src_dir, stem + ".frag"), encoding="utf-8", errors="replace").read()
    new, unclamped, prev = rewrite(text)
    if new is None:
        info[name] = {"skip": "no single out vec4 fragColor / main()"}
        return None
    for f in glob.glob(os.path.join(src_dir, stem + ".*")):
        ext = os.path.splitext(f)[1]
        if ext == ".frag":
            continue
        dst = os.path.join(dst_dir, os.path.basename(f))
        with open(f, "rb") as a, open(dst, "wb") as b:
            b.write(a.read())
    with io.open(os.path.join(dst_dir, stem + ".frag"), "w", encoding="utf-8", newline="") as fh:
        fh.write(new)
    info[name] = {"unclamped": unclamped, "prev": prev}
    return re.sub(r'file="[^"]*?[\\/]+(Scene2D|Scene3D)[\\/]+(\w+)\.frag"',
                  lambda m: 'file="..\\.screen\\light\\src\\%s\\%s.frag"' % (m.group(1), m.group(2)), block, count=1)


LIGHT = re.compile(r"^\[light\] f=(\d+) n=(\d+) clip=([\d.]+) over=([\d.]+) over2=([\d.]+) lover=([\d.]+) "
                   r"white=([\d.]+) exc=([\d.]+) b8=([\d.]+) bh=([\d.]+) mean=([\d.]+) p999=([\d.]+) max=([\d.]+)")
SWEEP = re.compile(r"^\[sweep\]\s+\d+/\d+\s+t=([\d.]+)s\s+(\S+)")
SHOWN = re.compile(r"^\[shown\] t=[\d.]+s\s+-?\d+\s+(\S+)")
COLS = ["clip", "over", "over2", "lover", "white", "exc", "b8", "bh", "mean", "p999", "max"]


def windows(log):
    """Per sweep window (name, frames as rows of COLS), in order; frames only while [shown] names the window."""
    out, cur, shown = [], None, None
    for line in io.open(log, encoding="utf-8", errors="replace"):
        m = SWEEP.match(line)
        if m:
            cur = (m.group(2), [])
            out.append(cur)
            continue
        m = SHOWN.match(line)
        if m:
            shown = m.group(1)
            continue
        m = LIGHT.match(line)
        if m and cur is not None:
            cur[1].append([float(x) for x in m.groups()[2:]] + [1.0 if shown == cur[0] else 0.0])
    return out


def measure(log, info):
    """Rows {name: stats} of one chunk's log (its first and last window are the sacrificial copies)."""
    ev = windows(log)
    rows = {}
    a, b = int(round(GUARD_IN * FPS)), int(round(GUARD_OUT * FPS))
    for k, (name, fr) in enumerate(ev):
        if k == 0 or k == len(ev) - 1 or name in rows:
            continue
        x = np.array(fr[a:len(fr) - b] if len(fr) > a + b else [], dtype=np.float64)
        if len(x):
            x = x[x[:, -1] > 0.5]
        if len(x) < 20:
            rows[name] = dict(info.get(name, {}), frames=int(len(x)), fail="too few frames")
            continue
        c = {n: x[:, i] for i, n in enumerate(COLS)}
        r = dict(info.get(name, {}))
        r.update(frames=int(len(x)),
                 clip_med=float(np.median(c["clip"])), clip_max=float(c["clip"].max()),
                 white_med=float(np.median(c["white"])),
                 over_med=float(np.median(c["over"])), over_max=float(c["over"].max()),
                 over2_max=float(c["over2"].max()), lover_max=float(c["lover"].max()),
                 exc=float(c["exc"].mean()), b8=float(c["b8"].mean()), bh=float(c["bh"].mean()),
                 mean=float(c["mean"].mean()), p999=float(c["p999"].max()), vmax=float(c["max"].max()))
        r["glow_gain"] = r["bh"] / max(r["b8"], 1e-5) if r["bh"] > 1e-5 else 1.0
        rows[name] = r
    return rows


def audio(n_entries):
    """The screening music for a chunk of n entries (screen.py's, cached in .screen)."""
    need = int((n_entries + 2) * HOLD + 30)
    wav = os.path.join(screen.WORK, "screen%d_%d.wav" % (screen.WAV_VERSION, need))
    if not os.path.exists(wav):
        screen.write_wav(wav, need)
    return wav


def run_chunk(tag, part, scenes, plain_fx, cross, plain):
    """Renders one chunk once and measures it; returns its rows (also written to <tag>.json)."""
    jpath = os.path.join(WORK, tag + ".json")
    if os.path.exists(jpath):
        return json.load(io.open(jpath, encoding="utf-8"))
    first = {}
    for n, blk in scenes:
        first.setdefault(n, blk)
    info, entries = {}, []
    for n in part:
        blk = first[n] if plain else prepare(n, first[n], info)
        if blk is not None:
            entries.append(blk)
    if not entries:
        return {}
    # The sacrificial first and last windows (measure() drops them) are copies of the scenes the sweep walks first
    # and last -- in the engine's order, 2D before 3D (screen.review_order), not in this list's.
    order = screen.review_order([(screen.NAME.search(b).group(1), b) for b in entries])
    cfg = "ZZLight" + tag
    xml = ('<?xml version="1.0" encoding="utf-8" ?>\n<configuration ImageDirectory="..\\\\Images" '
           'ConfigurationName="Test%s" hidden="true" >\n\n' % cfg
           + "".join([order[0][1]] + entries + [order[-1][1]]) + "\n" + plain_fx + cross + "</configuration>\n")
    preset = os.path.join(ROOT, "Presets", cfg + ".xml")
    io.open(preset, "w", encoding="utf-8").write(xml)
    log = os.path.join(WORK, tag + ".log")
    try:
        env = {"KALEIDO_FIXED_PHOTO": PHOTO, "KALEIDO_LIGHT_STATS": "1" if plain else repr(SCALE),
               "KALEIDO_NO_CHAINPASS": "1"}
        vid = screen.render(cfg, audio(len(entries)), log, HOLD, SEED, "scene", 0, env, cost=False,
                            tag="light_" + tag)
        if vid and os.path.exists(vid):
            os.remove(vid)
    finally:
        if os.path.exists(preset):
            os.remove(preset)
    rows = measure(log, info)
    for n, v in info.items():
        if "skip" in v:
            rows[n] = v
    errs = [l.strip() for l in io.open(log, encoding="utf-8", errors="replace")
            if any(e in l for e in ("FAILED", "OpenGL ERROR", "Expr ["))]
    if errs:
        rows["_errors"] = errs[:40]
    io.open(jpath, "w", encoding="utf-8").write(json.dumps(rows, indent=0))
    return rows


FIELDS = ["frames", "unclamped", "prev", "clip_med", "clip_max", "white_med", "over_med", "over_max", "over2_max",
          "lover_max", "exc", "b8", "bh", "glow_gain", "mean", "p999", "vmax"]


def report(mode):
    """The TSV of every chunk measured in this mode, and a short summary."""
    rows = {}
    for p in sorted(glob.glob(os.path.join(WORK, "%s_*.json" % mode))):
        for k, v in json.load(io.open(p, encoding="utf-8")).items():
            if not k.startswith("_"):
                rows.setdefault(k, v)
    if not rows:
        sys.exit("nothing measured yet (%s)" % mode)
    out = OUT if mode == "copy" else OUT.replace(".tsv", "_plain.tsv")
    with io.open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write("name\tnote\t" + "\t".join(FIELDS) + "\n")
        for n in sorted(rows):
            v = rows[n]
            note = v.get("skip") or v.get("fail") or ""
            f.write(n + "\t" + note + "\t" + "\t".join(
                ("%.5f" % v[c] if isinstance(v.get(c), float) else str(v.get(c, ""))) for c in FIELDS) + "\n")
    ok = [v for v in rows.values() if "clip_med" in v]
    print("%s: %d scenes (%d measured)" % (out, len(rows), len(ok)))
    if ok:
        for lab, key, thr in (("clip_med >= 1 %", "clip_med", 0.01), ("over_med >= 1 %", "over_med", 0.01),
                              ("over_max >= 1 %", "over_max", 0.01), ("over_med >= 0.1 %", "over_med", 0.001),
                              ("glow_gain >= 1.5", "glow_gain", 1.5), ("glow_gain >= 2", "glow_gain", 2.0)):
            print("  %-20s %5d" % (lab, sum(1 for v in ok if v.get(key, 0) >= thr)))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--plain", action="store_true", help="the scenes unmodified (KALEIDO_LIGHT_STATS=1)")
    ap.add_argument("--scenes", default="", help="comma-separated names, or @file with one name per line (a pick)")
    ap.add_argument("--chunks", default="", help="a:b -- chunks a..b-1 (of the catalogue, or of the pick)")
    ap.add_argument("--minutes", type=float, default=0.0, help="start no further chunk after this many minutes")
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(WORK, exist_ok=True)
    mode = "plain" if a.plain else "copy"
    if a.report:
        report(mode)
        return 0
    scenes, plain_fx, cross = screen.read_master()
    names = sorted({n for n, _ in scenes})
    if a.scenes:
        if a.scenes.startswith("@"):
            keep = [l.strip() for l in io.open(a.scenes[1:], encoding="utf-8") if l.strip()]
        else:
            keep = [s for s in a.scenes.split(",") if s]
        known = set(names)
        names = [n for n in keep if n in known]
        chunks = [("%s_pick_%s" % (mode, re.sub(r"\W+", "", "_".join(names))[:40] + "_%03d" % i),
                   names[i:i + CHUNK]) for i in range(0, len(names), CHUNK)]
    else:
        chunks = [("%s_chunk_%03d" % (mode, i // CHUNK), names[i:i + CHUNK]) for i in range(0, len(names), CHUNK)]
    if a.chunks:
        lo, hi = (int(x) if x else None for x in a.chunks.split(":"))
        chunks = chunks[lo:hi]
    t0 = time.time()
    for k, (tag, part) in enumerate(chunks):
        if os.path.exists(os.path.join(WORK, tag + ".json")):
            continue
        if a.minutes and time.time() - t0 > a.minutes * 60:
            print("time budget of %.0f min used: stopping before %s" % (a.minutes, tag), flush=True)
            break
        t = time.time()
        rows = run_chunk(tag, part, scenes, plain_fx, cross, a.plain)
        print("%s: %d scenes in %.0f s (%.1f s per scene); %d of %d chunks, %.1f min so far"
              % (tag, len(part), time.time() - t, (time.time() - t) / max(1, len(part)), k + 1, len(chunks),
                 (time.time() - t0) / 60), flush=True)
        if "_errors" in rows:
            print("  errors in the log: %d (first: %s)" % (len(rows["_errors"]), rows["_errors"][0]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
