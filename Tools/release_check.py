# -*- coding: utf-8 -*-
"""One check before a release: every test of the visual side in one run, one report, green or red.

Steps (each with its own threshold; --skip leaves steps out):
  selftest   Release/Kaleidoscope.exe -q -- the self-test (score cues, analysis, scheduler, export, QR ...)
  schedule   Tools/check_schedule.py --quick -- the real scheduler over 6 h of silence and 6 h of the structure track
             per genre preset (Kaleidoscope.exe --schedule): solo ranges, holds, labs, lab share, fade floors
  rules      Tools/temporal_budget.py, check_uniform_types.py, check_enum_tables.py, check_strings.py,
             check_mood_tags.py, and shake_scan.py against Tools/shake_baseline.tsv (red only for NEW
             SHAKE/FRAME/STEP hits) -- the standing rules, in seconds
  buildlists Tools/check_build_lists.py -- CMakeLists.txt and Kaleidoscope.pro list what the vcxproj builds;
             Tools/check_settings_path.py -- the settings file is named in SettingsFile.h only
  analyzer   Tools/analyzer_regress.py -- chord changes, drops and tempo of synthetic tracks with a known truth,
             every feature against Tools/analyzer_baseline.json
  shaders    Tools/shadercheck.py -- every shader compiles and links with the real driver
  shaderdoc  Tools/doc_shaders.py --check -- the shader Doxygen comments are current
  layout     Tools/cgvr_format.py --check -- C++ and GLSL in the CGVR layout (docs/cgvr-guidelines.md)
  doxygen    Doxygen with EXTRACT_ALL=NO and WARN_NO_PARAMDOC -- no undocumented member, parameter or
             return value in C++ or GLSL (if doxygen is installed)
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


def step_selftest():
    exe = os.path.join(ROOT, "Release", "Kaleidoscope.exe")
    if not os.path.exists(exe):
        return None, "Release\\Kaleidoscope.exe missing -- build first", 0.0
    env = dict(os.environ, PATH=os.environ.get("PATH", "") + os.pathsep + r"C:\Qt\6.11.1\msvc2022_64\bin")
    t = time.time()
    p = subprocess.run([exe, "-q"], cwd=os.path.join(ROOT, "Release"), capture_output=True, text=True, encoding="utf-8",
                       errors="replace", timeout=900, env=env)
    out = (p.stdout or "") + (p.stderr or "")
    last = re.search(r"(\d+) passed, (\d+) failed", out)
    fails = [l.strip() for l in out.splitlines() if "[FAIL]" in l]
    msg = last.group(0) if last else out[-300:]
    if fails:
        msg += ": " + "; ".join(fails[:3])
    return p.returncode == 0 and last is not None and last.group(2) == "0", msg, time.time() - t


def step_rules():
    checks = [("temporal_budget", [PY, "Tools/temporal_budget.py"]),
              ("uniform types", [PY, "Tools/check_uniform_types.py"]),
              ("enum tables", [PY, "Tools/check_enum_tables.py"]),
              ("strings", [PY, "Tools/check_strings.py"]),
              ("mood tags", [PY, "Tools/check_mood_tags.py"]),
              ("shake", [PY, "Tools/shake_scan.py", "--summary", "--baseline", "Tools/shake_baseline.tsv"])]
    red, parts, total = [], [], 0.0
    for name, cmd in checks:
        rc, out, dt = run(cmd, 600)
        total += dt
        if rc != 0:
            red.append(name)
        line = [l for l in out.splitlines() if l.strip()]
        parts.append("%s %s" % (name, "ok" if rc == 0 else "RED (%s)" % ( line[-1][:120] if line else "rc %d" % rc )))
    return not red, "; ".join(parts), total


def step_schedule():
    t = time.time()
    rc, out, _ = run([PY, "Tools/check_schedule.py", "--quick"], 1800)
    last = [l for l in out.splitlines() if l.startswith("schedule:")]
    fails = [l.strip() for l in out.splitlines() if l.startswith("FAIL") or l.startswith("       ")]
    msg = last[-1] if last else out[-300:]
    if fails:
        msg += ": " + "; ".join(fails[:3])
    return rc == 0, msg, time.time() - t


def step_buildlists():
    rc, out, dt = run([PY, "Tools/check_build_lists.py"], 60)
    rc2, out2, dt2 = run([PY, "Tools/check_settings_path.py"], 60)
    last = [l for l in (out + out2).splitlines() if l.startswith(("build lists:", "settings path:"))]
    return rc == 0 and rc2 == 0, ("; ".join(last) if last else (out + out2)[-300:]), dt + dt2


def step_analyzer():
    rc, out, dt = run([PY, "Tools/analyzer_regress.py"], 300)
    last = [l for l in out.splitlines() if l.startswith(("chord changes", "drops seen", "tempo", "analyzer:"))]
    return rc == 0, " / ".join(l.strip() for l in last) if last else out[-300:], dt


def step_shaders():
    rc, out, dt = run([PY, "Tools/shadercheck.py"], 1800)
    last = [l for l in out.splitlines() if l.startswith("shadercheck:")]
    return rc == 0, (last[-1] if last else out[-300:]), dt


def step_shaderdoc():
    rc, out, dt = run([PY, "Tools/doc_shaders.py", "--check"], 600)
    ok = "would change 0 shader" in out
    return ok, out.strip().splitlines()[-1] if out.strip() else "?", dt


def step_layout():
    rc, out, dt = run([PY, "Tools/cgvr_format.py", "--check"], 1800)
    last = [l for l in out.splitlines() if l.startswith("files:")]
    msg = last[-1] if last else out[-300:]
    return rc == 0 and "changed" not in msg and "refused" not in msg, msg, dt


def step_doxygen():
    if not os.path.exists(DOXYGEN):
        return None, "doxygen not installed -- skipped", 0.0
    tmp = os.path.join(os.environ.get("TEMP", "."), "release_check_dox")
    os.makedirs(tmp, exist_ok=True)
    cfg = io.open(os.path.join(ROOT, "Doxyfile"), encoding="utf-8", errors="replace").read()
    cfg += ("\nOUTPUT_DIRECTORY = %s\nGENERATE_HTML = NO\nGENERATE_LATEX = NO\nQUIET = YES\nEXTRACT_ALL = NO\n"
            "EXTRACT_PRIVATE = YES\nEXTRACT_STATIC = YES\nWARN_NO_PARAMDOC = YES\nWARN_LOGFILE = %s/warn.txt\n"
            % (tmp.replace("\\", "/"), tmp.replace("\\", "/")))
    io.open(os.path.join(tmp, "Doxyfile"), "w", encoding="utf-8").write(cfg)
    t = time.time()
    subprocess.run([DOXYGEN, os.path.join(tmp, "Doxyfile")], cwd=ROOT, capture_output=True, timeout=1800)
    warn = io.open(os.path.join(tmp, "warn.txt"), encoding="utf-8", errors="replace").read().splitlines()
    cpp = [w for w in warn if re.search(r"/(Source|PresetEditor|SetupTool|ExportTool)/", w.replace("\\", "/"))]
    shader = [w for w in warn if w not in cpp and ": warning:" in w]
    return len(cpp) == 0 and len(shader) == 0, "C++: %d warning(s); shaders: %d warning(s)" % (len(cpp), len(shader)), \
        time.time() - t


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
    logged = re.search(r"(\d+) with errors in the log", out)                 # Expr [, OpenGL ERROR, FAILED
    logged = int(logged.group(1)) if logged else 0
    if not os.path.exists(base_f):
        return None, "rendered %s; no baseline named in Tools/snapshot_baseline.txt -- nothing to compare" % label, dt
    base = io.open(base_f, encoding="utf-8").read().strip()
    rc, out2, dt2 = run([PY, "Tools/scene_snapshots.py", "compare", base, label], 3600)
    last = [l for l in out2.splitlines() if "compared" in l]
    # changed scenes are not a failure by themselves: they have to be looked at
    black = re.search(r"\((\d+) newly black\)", last[-1]) if last else None
    ok = black is not None and black.group(1) == "0" and failed == 0
    return ok, "%s; %d render(s) failed; %d scene(s) with errors in the log (listed in the report)" \
        % (last[-1] if last else out2[-300:], failed, logged), dt + dt2


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--skip", nargs="*", default=[], help="steps to leave out")
    ap.add_argument("--label", default=datetime.date.today().isoformat(), help="name of this snapshot set")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    steps = [("selftest", step_selftest), ("schedule", step_schedule), ("rules", step_rules), ("buildlists", step_buildlists), ("analyzer", step_analyzer), ("shaders", step_shaders), ("shaderdoc", step_shaderdoc), ("layout", step_layout), ("doxygen", step_doxygen),
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
