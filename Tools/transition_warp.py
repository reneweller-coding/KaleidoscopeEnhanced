# -*- coding: utf-8 -*-
r"""Re-times a transition so that its change is spread evenly over the fade: a measured progress curve, written into the shader.

    python Tools/transition_warp.py Name [Name ...]      # measure, fit, write, measure again
    python Tools/transition_warp.py --strength 0.7 Name  # how far to go towards an even spread (default 0.85)
    python Tools/transition_warp.py --remove Name        # take the curve out again

Some transitions do nearly all of their visible work in a third of their progress (a pixelation whose block size peaks
in the middle, a denoising that has arrived at 55 %): at any fade length that third is a jolt and the rest is waiting.
The cure is not in the effect but in its clock.  This tool

1. gives the shader a function `evenProgress(d)` (a monotone cubic through 17 knots, identity at first) and sends the
   one line that derives the progress from `interpolation` through it -- for a transition generated from a draft
   (Tools/transgen) the knots go into the draft as a `warp:` line and tgen.py builds the shader, or the next build
   would lose them;
2. measures where the change sits (`PresetEditor --transprofile --only Name`, 40 steps, the pinned photos);
3. sets the knots to the inverse of the cumulative change, blended with the identity by --strength, so equal times
   carry equal change; a second pass corrects what the first left;
4. shows the profile and the jump test before and after (Tools/transition_profile.py writes the table).

The curve is monotone and passes through 0 and 1, so the endpoints stay exactly the two scenes and nothing ever runs
backwards; only the pace changes.  It is fitted on a still photo: a transition whose order comes from the picture
itself (FlatAreasFirst) needs its order normalised instead (docs/engine-internals.md, 65).
"""
import io
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transition_profile as tp

ROOT = tp.ROOT
N = 16
BEGIN = "/**  The progress, re-timed so that the change is spread evenly over the fade (knots measured by\n * Tools/transition_warp.py; a monotone cubic through them, identity at 0 and 1)."
FUNC = BEGIN + """
 *
 * @param d  The progress, 0..1. (in)
 *
 * @return
 *   The re-timed progress, 0..1.
 **/
float evenProgress( float d )
{
    const float K[17] = float[17]( %s );
    float       x = clamp( d, 0.0, 1.0 ) * 16.0;
    int         i = int( min( floor( x ), 15.0 ) );
    float       f = x - float( i );
    float       p0 = K[i];
    float       p1 = K[i + 1];
    float       pm = K[max( i - 1, 0 )];
    float       pn = K[min( i + 2, 16 )];
    float       dl = p1 - p0;
    // Tangents limited to three times the flatter neighbouring slope: the curve never runs backwards.
    float m0 = ( i == 0 ) ? dl : min( 0.5 * ( p1 - pm ), 3.0 * min( dl, p0 - pm ) );
    float m1 = ( i == 15 ) ? dl : min( 0.5 * ( pn - p0 ), 3.0 * min( dl, pn - p1 ) );
    float f2 = f * f;
    float f3 = f2 * f;
    return ( 2.0 * f3 - 3.0 * f2 + 1.0 ) * p0 + ( f3 - 2.0 * f2 + f ) * m0 + ( 3.0 * f2 - 2.0 * f3 ) * p1 + ( f3 - f2 ) * m1;
}

"""
FUNC_RE = re.compile(r"/\*\*  The progress, re-timed so that the change is spread evenly.*?\n}\n\n", re.S)   # also after the formatter
PLAIN = re.compile(r"(float\s+\w+\s*=\s*)(clamp\(\s*1\.0\s*-\s*interpolation\s*,\s*0\.0\s*,\s*1\.0\s*\)|1\.0\s*-\s*interpolation)(\s*;)")
OLDWAY = re.compile(r"(float\s+\w+\s*=\s*)clamp\(\s*interpolation\s*,\s*0\.0\s*,\s*1\.0\s*\)(\s*;)")
WARPED = "evenProgress( clamp( 1.0 - interpolation, 0.0, 1.0 ) )"
WARPED_OLD = "1.0 - evenProgress( clamp( 1.0 - interpolation, 0.0, 1.0 ) )"


def spline(knots, d):
    """The curve the shader evaluates, in Python (to compose two passes).

    @param knots  The 17 knots. (in)
    @param d      The progress, 0..1. (in)

    @return
      The re-timed progress.
    """
    x = min(max(d, 0.0), 1.0) * N
    i = int(min(x // 1, N - 1))
    f = x - i
    p0, p1 = knots[i], knots[i + 1]
    pm, pn = knots[max(i - 1, 0)], knots[min(i + 2, N)]
    dl = p1 - p0
    m0 = dl if i == 0 else min(0.5 * (p1 - pm), 3.0 * min(dl, p0 - pm))
    m1 = dl if i == N - 1 else min(0.5 * (pn - p0), 3.0 * min(dl, pn - p1))
    f2, f3 = f * f, f * f * f
    return (2 * f3 - 3 * f2 + 1) * p0 + (f3 - 2 * f2 + f) * m0 + (3 * f2 - 2 * f3) * p1 + (f3 - f2) * m1


def write_knots(path, knots):
    """Puts the function with these knots into the shader and routes the progress line through it.

    @param path   The shader file. (in)
    @param knots  The 17 knots, or None to remove the function. (in)
    """
    s = io.open(path, encoding="utf-8", newline="").read()
    nl = "\r\n" if "\r\n" in s else "\n"
    s = s.replace("\r\n", "\n")
    s = FUNC_RE.sub("", s)
    s = s.replace(WARPED_OLD, "clamp( interpolation, 0.0, 1.0 )").replace(WARPED, "clamp( 1.0 - interpolation, 0.0, 1.0 )")
    if knots is not None:
        body = FUNC % ", ".join("%.4f" % k for k in knots)
        m = re.search(r"/\*\*[^\n]*Entry point[^\n]*\*/\nvoid main\(\)|void main\(\)", s)
        if not m:
            raise SystemExit("no main() in " + path)
        s = s[:m.start()] + body + s[m.start():]
        if PLAIN.search(s):
            s = PLAIN.sub(lambda q: q.group(1) + WARPED + q.group(3), s, count=1)
        elif OLDWAY.search(s):
            s = OLDWAY.sub(lambda q: q.group(1) + WARPED_OLD + q.group(2), s, count=1)
        else:
            raise SystemExit("no progress line of a known form in " + path)
    io.open(path, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))


def draft_of(name):
    """The draft file of a generated transition (Tools/transgen/drafts), or None for a hand-written one.

    @param name  The transition. (in)

    @return
      The path of the draft file, or None.
    """
    folder = os.path.join(ROOT, "Tools", "transgen", "drafts")
    for f in sorted(os.listdir(folder)):
        if f.endswith(".txt") and re.search(r"(?m)^=== %s\s*$" % re.escape(name), io.open(os.path.join(folder, f), encoding="utf-8").read()):
            return os.path.join(folder, f)
    return None


def write_draft_knots(draft, name, knots, final):
    """Sets the `warp:` line of a draft and rebuilds the shader from it.

    A generated shader is overwritten by the next build, so its curve lives in the draft.

    @param draft  The draft file. (in)
    @param name   The transition. (in)
    @param knots  The 17 knots, or None for no curve. (in)
    @param final  True for the last build, which also brings the file into the house layout. (in)
    """
    s = io.open(draft, encoding="utf-8", newline="").read()
    nl = "\r\n" if "\r\n" in s else "\n"
    s = s.replace("\r\n", "\n")
    a = re.search(r"(?m)^=== %s\s*$" % re.escape(name), s).start()
    b = s.index("\n---\n", a)
    head = re.sub(r"(?m)^warp:.*\n?", "", s[a:b]).rstrip("\n")
    if knots is not None:
        head += "\nwarp: " + " ".join("%.4f" % k for k in knots)
    s = s[:a] + head + s[b:]
    io.open(draft, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
    env = dict(os.environ)
    if not final:
        env["TGEN_RAW"] = "1"
    else:
        env.pop("TGEN_RAW", None)
    subprocess.run([sys.executable, os.path.join(ROOT, "Tools", "transgen", "tgen.py"), "build", name], cwd=ROOT, env=env, capture_output=True)


def measure(name):
    """The per-step changes of one transition over 40 steps.

    @param name  The transition. (in)

    @return
      The list of 40 step changes.
    """
    out = os.path.join(os.environ.get("TEMP", "."), "kaleido_warp_%s.tsv" % name)
    tp.run(["--transprofile", "--scene", tp.SCENE, "--images", tp.IMAGES, "--photos", tp.PHOTOS, "drone", "--only", name, "--out", out])
    for ln in io.open(out, encoding="utf-8").read().splitlines()[1:]:
        v = ln.split("\t")
        if v[0] == name + ".frag":
            return [float(x) for x in v[6].split(",")]
    raise SystemExit("not measured: " + name)


def equaliser(steps, strength):
    """Knots of the curve that spreads these step changes evenly.

    @param steps     The measured step changes. (in)
    @param strength  0 = identity .. 1 = fully even. (in)

    @return
      The 17 knots.
    """
    total = sum(steps) or 1.0
    floor = 0.15 * total / len(steps)           # a stretch without change still gets some time: no leap across it
    w = [max(s, floor) for s in steps]
    tw = sum(w)
    cum = [0.0]
    for s in w:
        cum.append(cum[-1] + s / tw)
    knots = []
    for k in range(N + 1):
        u = k / N
        j = max(i for i in range(len(cum)) if cum[i] <= u + 1e-12)
        if j >= len(steps):
            inv = 1.0
        else:
            inv = (j + (u - cum[j]) / max(cum[j + 1] - cum[j], 1e-9)) / len(steps)
        knots.append((1.0 - strength) * u + strength * inv)
    knots[0], knots[-1] = 0.0, 1.0
    return knots


def main():
    """Fits and writes the curves, then shows the result.

    @return
      The process exit code.
    """
    args = sys.argv[1:]
    strength = 0.85
    if "--strength" in args:
        strength = float(args[args.index("--strength") + 1])
        del args[args.index("--strength"):args.index("--strength") + 2]
    remove = "--remove" in args
    names = [a for a in args if not a.startswith("--")]
    for n in names:
        path = os.path.join(ROOT, "Transitions", n + ".frag")
        draft = draft_of(n)
        if draft:
            put = lambda k, final=False: write_draft_knots(draft, n, k, final)
        else:
            put = lambda k, final=False: write_knots(path, k)
        if remove:
            put(None, True)
            print(n, "curve removed")
            continue
        put(None if draft else [k / N for k in range(N + 1)])
        first = equaliser(measure(n), strength)
        put(first)
        second = equaliser(measure(n), strength)          # what the first pass left, measured through it
        knots = [spline(first, k) for k in second]
        knots[0], knots[-1] = 0.0, 1.0
        put(knots, True)
        print(n, "knots", " ".join("%.3f" % k for k in knots))
    if names:
        tools = os.path.join(ROOT, "Tools")
        subprocess.call([sys.executable, os.path.join(tools, "cgvr_format.py")] + [os.path.join(ROOT, "Transitions", n + ".frag") for n in names], cwd=ROOT)
        return subprocess.call([sys.executable, os.path.join(tools, "transition_profile.py"), "--dry"] + names, cwd=ROOT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
