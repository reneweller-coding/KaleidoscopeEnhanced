# -*- coding: utf-8 -*-
"""One check before a release: every test of the visual side in one run, one report, green or red.

Steps (each with its own threshold; --skip leaves steps out):
  shaders    Tools/shadercheck.py -- every shader compiles and links with the real driver
  shaderdoc  Tools/doc_shaders.py --check -- the shader Doxygen comments are current
  doxygen    Doxygen with EXTRACT_ALL=NO -- no undocumented C++ (if doxygen is installed)
  chain      Tools/chain_regress.py --every 6 -- chain runner and uber shader identical
  perf       Tools/perf_labs.py with music -- fps median >= 100, GPU p90 within budget
  snapshots  Tools/scene_snapshots.py render --jobs 3 + compare against the
             baseline set (Tools/snapshot_baseline.txt names it): red only for
             newly black frames or renders that failed; changed scenes are listed
             in the HTML report to be looked at

The report goes to docs/release_check.md (and the snapshot comparison's HTML
into the snapshot set).  Exit code: the number of red steps.

  python Tools/release_check.py                       # everything (~2 h with the snapshots)
  python Tools/release_check.py --skip snapshots      # ~40 min
  python Tools/release_check.py --label v1.18         # name of this snapshot set
"""
import argparse, datetime, io, os, re, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable
DOXYGEN = r"C:\Program Files\doxygen\bin\doxygen.exe"
# GPU p90 budgets at 2880x1620 on the reference machine (RTX 5090), ms
GPU_BUDGET = {"ChainLab2D": 1.5, "ChainLabTunnel": 2.0, "ChainLab3D": 8.0, "ChainSlice3D": 4.5}


def run(cmd, timeout):
    t = time.time()
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
    return p.returncode, (p.stdout or "") + (p.stderr or ""), time.time() - t


def step_shaders():
    rc, out, dt = run([PY, "Tools/shadercheck.py"], 1800)
    last = [l for l in out.splitlines() if l.startswith("shadercheck:")]
    return rc == 0, (last[-1] if last else out[-300:]), dt


def step_shaderdoc():
    rc, out, dt = run([PY, "Tools/doc_shaders.py", "--check"], 600)
    ok = "would change 0 shader" in out
    return ok, out.strip().splitlines()[-1] if out.strip() else "?", dt


def step_doxygen():
    if not os.path.exists(DOXYGEN):
        return None, "doxygen not installed -- skipped", 0.0
    tmp = os.path.join(os.environ.get("TEMP", "."), "release_check_dox")
    os.makedirs(tmp, exist_ok=True)
    cfg = io.open(os.path.join(ROOT, "Doxyfile"), encoding="utf-8", errors="replace").read()
    cfg += ("\nOUTPUT_DIRECTORY = %s\nGENERATE_HTML = NO\nGENERATE_LATEX = NO\nQUIET = YES\nEXTRACT_ALL = NO\n"
            "EXTRACT_PRIVATE = YES\nEXTRACT_STATIC = YES\nWARN_LOGFILE = %s/warn.txt\n" % (tmp.replace("\\", "/"), tmp.replace("\\", "/")))
    io.open(os.path.join(tmp, "Doxyfile"), "w", encoding="utf-8").write(cfg)
    t = time.time()
    subprocess.run([DOXYGEN, os.path.join(tmp, "Doxyfile")], cwd=ROOT, capture_output=True, timeout=1800)
    warn = io.open(os.path.join(tmp, "warn.txt"), encoding="utf-8", errors="replace").read().splitlines()
    cpp = [w for w in warn if re.search(r"/(Source|PresetEditor|SetupTool)/", w.replace("\\", "/"))]
    shader = [w for w in warn if "not documented" in w and w not in cpp]
    return len(cpp) == 0, "C++: %d warning(s); shaders: %d undocumented (informational)" % (len(cpp), len(shader)), time.time() - t


def step_chain():
    rc, out, dt = run([PY, "Tools/chain_regress.py", "--every", "6"], 7200)
    last = [l for l in out.splitlines() if "combinations differ" in l]
    return rc == 0, (last[-1] if last else out[-300:]), dt


def step_perf():
    rc, out, dt = run([PY, "Tools/perf_labs.py", "--secs", "35", "--wav", "Tools/review128.wav"], 7200)
    bad, lines = [], []
    for l in out.splitlines():
        m = re.match(r"(\w+)\s+(\d+)\s+(\d+)\s+([0-9.]+)\s+([0-9.]+)", l)
        if not m:
            continue
        name, fps, p90 = m.group(1), float(m.group(2)), float(m.group(5))
        lines.append("%s %d fps, GPU p90 %.2f ms" % (name, fps, p90))
        if fps < 100 or p90 > GPU_BUDGET.get(name, 6.0):
            bad.append(name)
    return not bad and bool(lines), ("; ".join(lines) + (" -- over budget: " + ", ".join(bad) if bad else "")), dt


def step_snapshots(label):
    base_f = os.path.join(ROOT, "Tools", "snapshot_baseline.txt")
    rc, out, dt = run([PY, "Tools/scene_snapshots.py", "render", label, "--jobs", "3"], 8 * 3600)
    failed = re.search(r"(\d+) rendered, (\d+) failed", out)
    failed = int(failed.group(2)) if failed else -1
    if not os.path.exists(base_f):
        return None, "rendered %s; no baseline named in Tools/snapshot_baseline.txt -- nothing to compare" % label, dt
    base = io.open(base_f, encoding="utf-8").read().strip()
    rc, out2, dt2 = run([PY, "Tools/scene_snapshots.py", "compare", base, label], 3600)
    last = [l for l in out2.splitlines() if "compared" in l]
    # changed scenes are not a failure by themselves: they have to be looked at
    black = re.search(r"\((\d+) newly black\)", last[-1]) if last else None
    ok = black is not None and black.group(1) == "0" and failed == 0
    return ok, "%s; %d render(s) failed" % (last[-1] if last else out2[-300:], failed), dt + dt2


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--skip", nargs="*", default=[], help="steps to leave out")
    ap.add_argument("--label", default=datetime.date.today().isoformat(), help="name of this snapshot set")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    steps = [("shaders", step_shaders), ("shaderdoc", step_shaderdoc), ("doxygen", step_doxygen),
             ("chain", step_chain), ("perf", step_perf), ("snapshots", lambda: step_snapshots(a.label))]
    rows, red = [], 0
    for name, fn in steps:
        if name in a.skip:
            continue
        print("[%s] ..." % name, flush=True)
        try:
            ok, msg, dt = fn()
        except Exception as e:                                  # a step that crashes is red
            ok, msg, dt = False, "error: %r" % e, 0.0
        state = "skipped" if ok is None else ("green" if ok else "RED")
        red += ok is False
        rows.append((name, state, msg, dt))
        print("[%s] %s (%.0f s): %s" % (name, state, dt, msg), flush=True)
    rep = os.path.join(ROOT, "docs", "release_check.md")
    os.makedirs(os.path.dirname(rep), exist_ok=True)
    with io.open(rep, "w", encoding="utf-8", newline="\n") as f:
        f.write("# Release check %s\n\n" % datetime.datetime.now().strftime("%Y-%m-%d %H:%M"))
        f.write("**%s** -- %d red step(s)\n\n| Step | State | Result | Time |\n|---|---|---|---|\n" % ("GREEN" if red == 0 else "RED", red))
        for name, state, msg, dt in rows:
            f.write("| %s | %s | %s | %.0f min |\n" % (name, state, msg.replace("|", "/"), dt / 60))
    print("report: %s -- %s" % (rep, "GREEN" if red == 0 else "%d RED" % red))
    sys.exit(min(red, 255))


if __name__ == "__main__":
    main()
