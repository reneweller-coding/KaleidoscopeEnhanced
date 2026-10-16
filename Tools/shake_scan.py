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
# A line continues the statement above if that one ends in an open parenthesis, a comma or an operator, or if
# it starts with an operator itself (the code breaks before operators: "    * jitter * spread;").
CONT_END = re.compile(r"(\(|,|\+|-|\*|/|%|&&|\|\||\?|=|<|>|&|\||\^)\s*$")
CONT_START = re.compile(r"^\s*(\)|\*|/|%|\+|-|&&|\|\||\?|:|==|!=|<=|>=|<|>|&|\||\^|\.)")
CASE_LABEL = re.compile(r"^\s*(case\b.*|default\s*):\s*$")


def strip_comments(text):
    """Removes // and /* */ comments, keeping every newline so that line numbers stay right."""
    out, i, n = [], 0, len(text)
    while i < n:
        if text.startswith("//", i):
            j = text.find("\n", i)
            i = n if j < 0 else j
        elif text.startswith("/*", i):
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append("\n" * text.count("\n", i, j))
            i = j
        else:
            out.append(text[i])
            i += 1
    return "".join(out)


def logical_lines(text):
    """(first line number, code) per statement-like unit: comment-free lines with their continuations joined.

    Line-based rules then see a statement whole however it is wrapped -- a frame variable and its audio factor
    on different lines of one statement count the same as on one line.
    """
    units = []
    for n, line in enumerate(strip_comments(text).split("\n"), 1):
        if not line.strip():
            continue
        prev = units[-1][1] if units else ""
        joins = (units and not line.lstrip().startswith("#") and not prev.lstrip().startswith("#")
                 and not CASE_LABEL.match(prev)
                 and (CONT_END.search(prev) or CONT_START.match(line)))
        if joins:
            units[-1] = (units[-1][0], prev.rstrip() + " " + line.strip())
        else:
            units.append((n, line))
    return units


def scan_shader(path):
    hits = collections.defaultdict(list)
    try:
        text = io.open(path, encoding="utf-8", errors="replace").read().replace("\r", "")
    except OSError:
        return hits
    is_vert = path.endswith(".vert") or path.endswith(".comp") or path.endswith(".tese")
    for n, line in logical_lines(text):
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
    p = os.path.join(ROOT, "Presets", "Komplett.xml")
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
    p2 = os.path.join(ROOT, "Presets", "rigs.xml")
    try:
        s2 = io.open(p2, encoding="utf-8", errors="replace").read()
        for m in re.finditer(r'<rig name="([^"]+)">(.*?)</rig>', s2, re.S):
            for e in re.finditer(r'<expr name="(rig\w+)" formula="([^"]+)"', m.group(2)):
                if re.search(r"\b(kick|beat|onset|drop|bass|subbass|level|snare|hat|high|flux)\b", e.group(2), re.I):
                    out.append(("rigs.xml:" + m.group(1), e.group(1), e.group(2)))
    except OSError:
        pass
    return out

def baseline_key(f, k, line):
    """A hit's identity for the baseline: the category, the file and the line's text (not its number, which moves)."""
    return "%s\t%s\t%s" % (k, f.replace("\\", "/"), " ".join(line.split()))


def main():
    args = sys.argv[1:]
    summary = "--summary" in args
    # --baseline FILE: exit 1 only for SHAKE, FRAME and STEP hits not in the file (the known ones were looked at);
    # --write-baseline FILE: record today's hits as known.
    base_in = args[args.index("--baseline") + 1] if "--baseline" in args else None
    base_out = args[args.index("--write-baseline") + 1] if "--write-baseline" in args else None
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
    gated = [baseline_key(f, k, l) for f, h in per_file.items() for k in ("SHAKE", "FRAME", "STEP")
             for _, l in h.get(k, [])]
    if base_out:
        io.open(base_out, "w", encoding="utf-8", newline="\n").write("\n".join(sorted(set(gated))) + "\n")
        print("baseline written: %d known SHAKE/FRAME/STEP hit(s) -> %s" % (len(set(gated)), base_out))
    if base_in:
        known = set(l for l in io.open(base_in, encoding="utf-8").read().splitlines() if l.strip())
        new = sorted(set(gated) - known)
        for n in new:
            print("  NEW   " + n.replace("\t", "  "))
        print("shake baseline: %d new SHAKE/FRAME/STEP hit(s), %d known" % (len(new), len(set(gated) & known)))
        sys.exit(1 if new else 0)

if __name__ == "__main__":
    main()
