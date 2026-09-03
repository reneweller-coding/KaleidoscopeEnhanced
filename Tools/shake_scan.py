# -*- coding: utf-8 -*-
"""
shake_scan.py -- statischer Katalog-Scan gegen Erschuetterungen (V7d), Spruenge
(V7c) und Riesenpixel (V8e).  Liest Shader-Quelltext und die Rig-Formeln in
Komplett.xml, kein Rendern.

Kategorien:
  FRAME   Bildrahmen (p/uv/Kamera/Zoom/Radius/Drehwinkel) auf schneller Huellkurve
  SHAKE   explizite shake/jitter/wobble/punch-Terme (nicht in Kommentaren)
  HULL    Vertex-Stage: world/pos/vp mit Kick/Beat/Onset/Bass/Level (Objekt hopst)
  RIG     Rig-Formeln in Komplett.xml mit schnellen Signalen
  STEP    floor()/step() auf Audio in Bewegungstermen (V7c)
  PIXEL   step(., hash(floor(...))) -- ganze Gitterzelle leuchtet (V8e)

Aufruf: python Tools/shake_scan.py [--files a.frag b.vert ...] [--summary]
Exit 0 immer; die Liste ist zum Lesen, nicht zum blinden Reparieren.
"""
import io, os, re, sys, glob, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAST = r"audio(Kick|Beat|Onset|Snare|Hat|Bass|SubBass|Level|StereoL|StereoR|Stereo|Drop|BarPhase|BeatPhase|High|Flux|Mid|LowMid|UpperMid|Spectrum|Wave|Centroid|MelodyPitch|HarmChange)\b"
FRAME_VAR = r"^\s*(vec[234]\s+|float\s+)?(p|uv|q|ro|rd|cam\w*|eye\w*|vp|zoom\w*|scale\w*|radius\w*|rad|r|rr|rot\w*|ang\w*|a|off\w*|cen\w*|shift\w*|sway\w*|roll\w*|yaw\w*|pitch\w*|fov\w*|tilt\w*)\s*(=|\+=|-=|\*=)"
LIGHT_WORDS = r"\b(col|color|colour|light|glow|bright|lum|alpha|fog|tint|emis|halo|seam|lamp|flash|spark|ring\s*\*=|intensity|expos)\w*"
COMMENT = re.compile(r"^\s*(//|\*|/\*)")

def strip_comment(line):
    i = line.find("//")
    return line if i < 0 else line[:i]

def scan_shader(path):
    hits = collections.defaultdict(list)
    try:
        lines = io.open(path, encoding="utf-8", errors="replace").read().split("\n")
    except OSError:
        return hits
    is_vert = path.endswith(".vert") or path.endswith(".comp") or path.endswith(".tese")
    for n, raw in enumerate(lines, 1):
        if COMMENT.match(raw):
            continue
        line = strip_comment(raw)
        if "uniform " in line or not line.strip():
            continue
        fast = re.search(FAST, line) is not None
        light = re.search(LIGHT_WORDS, line) is not None
        # FRAME: a coordinate-like variable written with a fast signal, not a light line
        if fast and not light and re.search(FRAME_VAR, line):
            hits["FRAME"].append((n, line.strip()))
        # SHAKE: explicit identifiers
        if re.search(r"\b(shake|jitter|wobble|judder|punch|quake)\w*\s*(=|\*|\+)", line, re.I) and not light:
            hits["SHAKE"].append((n, line.strip()))
        # HULL: vertex-stage object position on a fast signal
        if is_vert and fast and re.search(r"\b(world|pos|vp|p|local|slot|centre|center)\.?[xyz]?\s*(\+=|-=|=)", line) and not light:
            hits["HULL"].append((n, line.strip()))
        # STEP: floor/step on audio in a non-light line
        if re.search(r"floor\(\s*audio|step\(\s*[0-9.]+\s*,\s*audio|round\(\s*audio", line) and not light:
            hits["STEP"].append((n, line.strip()))
        # PIXEL: whole-cell particles
        if re.search(r"step\(\s*[0-9.]+\s*,\s*hash\w*\(\s*floor|smoothstep\(\s*[0-9.]+\s*,\s*[0-9.]+\s*,\s*hash\w*\(\s*floor", line):
            hits["PIXEL"].append((n, line.strip()))
    return hits

def scan_rigs():
    """Rig formulas in Komplett.xml with fast signals (slow ones: swell, advance, phase, seed)."""
    p = os.path.join(ROOT, "Configurations", "Komplett.xml")
    out = []
    try:
        s = io.open(p, encoding="utf-8", errors="replace").read()
    except OSError:
        return out
    cur = None
    for line in s.split("\n"):
        m = re.search(r'<TextureShader file="([^"]+)"', line)
        if m:
            cur = os.path.basename(m.group(1).replace("\\", "/"))
        m = re.search(r'<expr name="(rig\w+)" formula="([^"]+)"', line)
        if m and re.search(r"\b(kick|beat|onset|drop|bass|subbass|level|snare|hat|high|flux)\b", m.group(2), re.I):
            out.append((cur, m.group(1), m.group(2)))
    # rigs.xml presets
    p2 = os.path.join(ROOT, "Configurations", "rigs.xml")
    try:
        s2 = io.open(p2, encoding="utf-8", errors="replace").read()
        for m in re.finditer(r'<rig name="([^"]+)">(.*?)</rig>', s2, re.S):
            for e in re.finditer(r'<expr name="(rig\w+)" formula="([^"]+)"', m.group(2)):
                if re.search(r"\b(kick|beat|onset|drop|bass|subbass|level|snare|hat|high|flux)\b", e.group(2), re.I):
                    out.append(("rigs.xml:" + m.group(1), e.group(1), e.group(2)))
    except OSError:
        pass
    return out

def main():
    args = sys.argv[1:]
    summary = "--summary" in args
    files = []
    if "--files" in args:
        files = [a for a in args[args.index("--files") + 1:] if not a.startswith("--")]
    if not files:
        for d in ("Scene2D", "Scene3D"):
            for ext in ("frag", "vert", "comp", "tese", "geom"):
                files += glob.glob(os.path.join(ROOT, d, "*." + ext))
    totals = collections.Counter()
    per_file = {}
    for f in sorted(files):
        h = scan_shader(f)
        if h:
            per_file[os.path.relpath(f, ROOT)] = h
            for k, v in h.items():
                totals[k] += len(v)
    rigs = scan_rigs()
    if not summary:
        for f, h in per_file.items():
            print("== " + f)
            for k in ("FRAME", "SHAKE", "HULL", "STEP", "PIXEL"):
                for n, l in h.get(k, []):
                    print("  %-5s %4d: %s" % (k, n, l[:150]))
        if rigs:
            print("== RIG (Komplett.xml / rigs.xml)")
            for scene, name, formula in rigs:
                print("  RIG   %s: %s = %s" % (scene, name, formula))
    print("---- Zusammenfassung ----")
    print("Dateien mit Treffern: %d von %d" % (len(per_file), len(files)))
    for k in ("FRAME", "SHAKE", "HULL", "STEP", "PIXEL"):
        nf = sum(1 for h in per_file.values() if h.get(k))
        print("  %-5s %4d Zeilen in %3d Dateien" % (k, totals[k], nf))
    print("  RIG   %4d Formeln" % len(rigs))

if __name__ == "__main__":
    main()
