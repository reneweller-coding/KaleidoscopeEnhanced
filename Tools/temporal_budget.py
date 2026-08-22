"""
temporal_budget.py -- how FAST is each scene allowed to change, and does it comply?

WHY STATIC ANALYSIS AND NOT MEASUREMENT
The probe recorder captures at roughly 10-15 fps (GPU readback + JPEG encode per
frame), so measured flicker is only trustworthy below ~5-7 Hz -- and anything
faster ALIASES DOWN and masquerades as slow, calm motion. A rendered scan can
therefore never prove a scene is free of fast flicker. Reading the coefficients
straight out of the GLSL is exact, alias-free, and covers every scene.

THE BUDGET
Reference tempo: 120 BPM = 2 Hz. What counts as "too hectic" depends on WHAT is
changing, so the ceilings differ per class:

  class                              ceiling   rationale
  ---------------------------------- --------- --------------------------------
  full-field brightness flashing      3 Hz     photosensitivity guidance caps
                                               general flashing at 3 flashes/s;
                                               the 15-25 Hz band is the worst.
  global hue / palette cycling        2 Hz     = one beat. Colour is supposed to
                                               track harmony (audioChromaHue),
                                               not strobe past it.
  camera / whole-image geometry       4 Hz     2x the beat: fast, still trackable
                                               by the eye without smearing.
  local detail / texture ripple       8 Hz     4x the beat. Small, low-contrast,
                                               spatially-dense features tolerate
                                               more than the whole frame does.

Distinguishing those four statically is unreliable, so the checker enforces the
most permissive ceiling (8 Hz) as an ERROR -- nothing in the catalog should ever
exceed it -- and reports 4 Hz as a WARNING for human review of what the term
actually drives.

TURNING A COEFFICIENT INTO Hz
A term sin(D * K) oscillates at K * rate(D) / 2pi, where rate(D) is how fast the
driver D advances per second:

  time          1.0    s/s      (the raw wall-clock uniform)
  audioPhase    ~1.2   rad/s    accumulated rotation phase; AudioConditioner.cpp
                               integrates 0.06*motion + 1.20*rotEnergy +
                               0.10*motion*beatBreath, so ~1.2 at full energy
  audioAdvance  ~0.25  units/s  0.015 + 0.08*flux + 0.02*motion +
                               0.10*harmChange + 0.03*swell, at its maximum
  audioBarPhase 1/(4 beats)     one bar; musical by construction
  audioBeatPhase 1 per beat     ~2 Hz at 120 BPM; musical by construction

Those audio rates are the WORST CASE at full musical energy and reactivity 1.0.
The user's `reactivity` setting scales them (clamped 0..2.5 in RenderPipeline),
so a scene sitting exactly on a limit here can still exceed it at reactivity 2.5
-- which is why the ceilings above are deliberately conservative.

    python Tools/temporal_budget.py                 # check, exit 1 on ERROR
    python Tools/temporal_budget.py --report FILE   # also write the full per-shader table
"""
import re, os, sys, glob, math

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
STAGES = (".frag", ".vert", ".geom", ".comp", ".tesc", ".tese")

# driver -> advance per second (see docstring)
RATE = {
    "time":          1.00,
    "audioPhase":    1.20,
    "audioAdvance":  0.25,
}

ERR_HZ  = 8.0    # nothing may exceed this
WARN_HZ = 4.0    # above the camera/geometry ceiling -> human review

TRIG = re.compile(r'\b(?:sin|cos|tan)\s*\(')


def strip_comments(s):
    s = re.sub(r'/\*.*?\*/', ' ', s, flags=re.S)
    return re.sub(r'//[^\n]*', ' ', s)


def enclosing_trig(code, pos):
    """True if `pos` sits inside the argument list of a sin/cos/tan call.

    Only oscillating uses matter: `time * 40.0` fed to a monotonic translation
    is a fast pan, not a 6 Hz strobe, and is judged elsewhere.
    """
    depth, i = 0, pos
    while i > 0 and pos - i < 400:
        ch = code[i]
        if ch == ')':
            depth += 1
        elif ch == '(':
            if depth == 0:
                head = code[max(0, i - 5):i + 1]
                return bool(TRIG.search(head))
            depth -= 1
        i -= 1
    return False


QUANT = re.compile(r'\b(?:floor|round)\s*\(\s*time\s*\*\s*([0-9]+(?:\.[0-9]+)?)')


def scan_file(path):
    code = strip_comments(open(path, encoding="utf-8", errors="replace").read())
    hits = []
    for drv, rate in RATE.items():
        pat = re.compile(rf'\b{drv}\s*\*\s*([0-9]+(?:\.[0-9]+)?)'
                         rf'|([0-9]+(?:\.[0-9]+)?)\s*\*\s*\b{drv}\b')
        for m in pat.finditer(code):
            k = float(m.group(1) or m.group(2))
            hz = k * rate / (2.0 * math.pi)
            hits.append((hz, drv, k, enclosing_trig(code, m.start())))
    # Quantised-time re-rolls: floor(time*k) hands a hash a NEW seed k times a
    # second -- a noise strobe no sinusoid model sees. This was the checker's
    # blind spot: eight shaders shipped stepping at 9..30 Hz while every
    # sinusoidal term in the catalogue was inside budget. The step rate IS the
    # event rate, so it maps onto Hz directly (no 2*pi involved).
    for m in QUANT.finditer(code):
        k = float(m.group(1))
        hits.append((k, "floor(time)", k, True))
    return hits


def main():
    rows, errors, warns = [], [], []
    for d in ("Scene2D", "Scene3D"):
        for frag in sorted(glob.glob(os.path.join(ROOT, d, "*.frag"))):
            base = frag[:-5]
            name = os.path.basename(base)
            allhits = []
            for ext in STAGES:
                p = base + ext
                if os.path.exists(p):
                    allhits += [(h, os.path.basename(p)) for h in scan_file(p)]
            osc = [(h, f) for h, f in allhits if h[3]]          # oscillating only
            worst = max(osc, key=lambda x: x[0][0]) if osc else None
            hz = worst[0][0] if worst else 0.0
            rows.append((name, hz, worst))
            if hz > ERR_HZ:
                errors.append((name, worst))
            elif hz > WARN_HZ:
                warns.append((name, worst))

    rows.sort(key=lambda r: -r[1])
    print(f"temporal_budget: {len(rows)} scene(s) checked "
          f"(error > {ERR_HZ} Hz, warn > {WARN_HZ} Hz)\n")
    print(f"  {'scene':<46}{'fastest':>9}  driver")
    print("  " + "-" * 76)
    for name, hz, w in rows[:20]:
        if not w:
            continue
        (whz, drv, k, _), fn = w
        print(f"  {name:<46}{hz:>7.2f}Hz  {drv}*{k:g}  ({fn})")

    if errors:
        print(f"\n{len(errors)} scene(s) OVER the {ERR_HZ} Hz hard ceiling:")
        for name, w in errors:
            (hz, drv, k, _), fn = w
            print(f"   {name}: {hz:.2f} Hz  ({drv}*{k:g} in {fn})")
    if warns:
        print(f"\n{len(warns)} scene(s) over the {WARN_HZ} Hz review threshold:")
        for name, w in warns:
            (hz, drv, k, _), fn = w
            print(f"   {name}: {hz:.2f} Hz  ({drv}*{k:g} in {fn})")

    if "--report" in sys.argv:
        out = sys.argv[sys.argv.index("--report") + 1]
        with open(out, "w", encoding="utf-8") as fh:
            fh.write("# Temporal budget -- fastest oscillating term per scene\n#\n")
            fh.write(f"# ceilings: full-field brightness 3 Hz | hue 2 Hz | "
                     f"camera/geometry 4 Hz | local detail {ERR_HZ} Hz\n")
            fh.write("# rates: time 1.0/s, audioPhase ~1.2 rad/s, audioAdvance ~0.25/s\n#\n")
            fh.write(f"{'scene':<50}{'Hz':>8}  term\n")
            for name, hz, w in rows:
                term = f"{w[0][1]}*{w[0][2]:g} ({w[1]})" if w else "-- no oscillating time term"
                fh.write(f"{name:<50}{hz:>8.2f}  {term}\n")
        print(f"\nwrote {out}")

    print(f"\nsummary: {len(errors)} error(s), {len(warns)} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
