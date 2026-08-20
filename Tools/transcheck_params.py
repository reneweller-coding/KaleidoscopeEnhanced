"""
transcheck_params.py -- transition endpoint check ACROSS the parameter ranges.

PresetEditor's built-in --transcheck verifies that every transition renders
exactly scene A at d=0 and exactly scene B at d=1 -- but only for ONE set of
per-activation parameter values. That is not enough: a parameter that scales a
wipe front's POSITION (rather than only its speed) can leave part of the screen
already showing the other scene at an endpoint, and the transition then POPS on
its very first or last frame.

Real example this was written for: AbrikosovVortexLatticeSweep computes
    sweepFront = mix(-1.2, 1.2, tProg) * sweepP
so at tProg=1 the front sits at 1.2*sweepP. The screen spans |p.x| <= 0.889 at
16:9, so the front only clears the frame for sweepP > ~0.774 -- yet sweepP is
registered 0.5..2.0. Measured at sweepP=0.5: mean endpoint error 25.6/255
(threshold 1.5) concentrated in the right 18% of the frame. --transcheck passes
it because the default value happens to be safe.

This walks every <TransitionShader> in Komplett.xml, and for each of its float
params renders both endpoints at the range MINIMUM and MAXIMUM (extremes are
where a front fails to clear), comparing against the linear Crossfade at the
same endpoint -- the same ground truth --transcheck uses.

    python Tools/transcheck_params.py [--quick] [--only NAME]

Needs PresetEditor.exe built. Roughly 1.5 s per render.
"""
import os, re, sys, subprocess, tempfile
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
EXE = os.path.join(ROOT, "PresetEditor", "build", "Release", "PresetEditor.exe")
XML = os.path.join(ROOT, "Configurations", "Komplett.xml")
SCENE = "Scene2D/Tunnel.frag"          # any stable scene works as the A/B pair
W, H = 640, 360
TOL = 1.5                              # same units/threshold as --transcheck
BS = chr(92)


def render(trans, out, d, params, t=3.0):
    cmd = [EXE, "--render", SCENE, trans, out, str(W), str(H),
           "--trans", str(d), "--time", str(t)]
    for k, v in params.items():
        cmd += ["--param", f"{k}={v}"]
    subprocess.run(cmd, capture_output=True, timeout=180)
    return os.path.exists(out)


def mean_diff(a, b):
    x = np.asarray(Image.open(a).convert("RGB"), dtype=np.float64)
    y = np.asarray(Image.open(b).convert("RGB"), dtype=np.float64)
    if x.shape != y.shape:
        return 999.0, None
    d = np.abs(x - y)
    col = d.mean(axis=(0, 2))
    bad = np.where(col > 2)[0]
    where = f"cols {bad.min()}-{bad.max()}/{d.shape[1]}" if len(bad) else ""
    return float(d.mean()), where


def parse_transitions():
    src = open(XML, encoding="utf-8").read()
    out = []
    for m in re.finditer(r'<TransitionShader\b([^>]*)>(.*?)</TransitionShader>', src, re.S):
        head, body = m.group(1), m.group(2)
        f = re.search(r'file="([^"]+)"', head)
        if not f:
            continue
        name = f.group(1).replace(BS + BS, BS).split(BS)[-1]
        params = [(pm.group(1), float(pm.group(2)), float(pm.group(3)))
                  for pm in re.finditer(
                      r'<float\s+name="([^"]+)"\s+minValue="([^"]+)"\s+maxValue="([^"]+)"', body)]
        out.append((name, params))
    return out


def main():
    if not os.path.exists(EXE):
        print("PresetEditor.exe not built"); return 2
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]

    tmp = tempfile.mkdtemp(prefix="transparam_")
    trans = parse_transitions()
    if only:
        trans = [t for t in trans if only.lower() in t[0].lower()]
    print(f"transcheck_params: {len(trans)} transition(s), endpoints at each param's "
          f"min and max (fail = mean |diff| > {TOL}/255)\n")

    refs = {}
    for d in (0.0, 1.0):
        p = os.path.join(tmp, f"ref{d}.png")
        render("Transitions/Crossfade.frag", p, d, {})
        refs[d] = p

    fails, checked = [], 0
    for name, params in trans:
        tf = "Transitions/" + name
        worst = (0.0, "", "")
        for pname, lo, hi in params:
            for val in (lo, hi):
                for d in (0.0, 1.0):
                    out = os.path.join(tmp, "t.png")
                    if os.path.exists(out):
                        os.remove(out)
                    if not render(tf, out, d, {pname: val}):
                        continue
                    checked += 1
                    md, where = mean_diff(out, refs[d])
                    if md > worst[0]:
                        worst = (md, f"{pname}={val:g} d={d:g}", where)
        status = "OK  " if worst[0] <= TOL else "FAIL"
        if worst[0] > TOL:
            fails.append((name, worst))
        print(f"  {status} {name:<44} worst {worst[0]:6.2f}  {worst[1]:<22} {worst[2]}")

    print(f"\n{checked} endpoint render(s); {len(fails)} transition(s) FAIL")
    for n, w in fails:
        print(f"   {n}: mean {w[0]:.2f} at {w[1]}  ({w[2]})")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
