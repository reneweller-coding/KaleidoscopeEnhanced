# -*- coding: utf-8 -*-
r"""Measures transitions and keeps Tools/transition_profile.tsv: one command, the harness pinned.

    python Tools/transition_profile.py                   # every registered transition, table rewritten
    python Tools/transition_profile.py A B C             # only these (their rows are replaced, the rest stay)
    python Tools/transition_profile.py --dry A B         # measure and show, write nothing
    python Tools/transition_profile.py --steps A         # also print the per-step changes (where the change sits)

It runs `PresetEditor --transprofile --scene ProfileStill.frag --images <Images> --photos <the two below> drone` and, for the
same names, `PresetEditor --transcheck` (endpoints, jump), at below normal priority.  What it guards against:

* The photos are named.  The editor used to take the first two files of the folder, and a new photo sorting earlier
  moved every row (a cross-fade is the mean difference of the two pictures).  The thresholds in make_genre_configs.py
  were tuned on these two.
* A cross-fade is measured in every run and must read CROSSFADE_TV: if it does not, the harness is not the one the
  table was made with (other photos, the test card because a path with a blank was passed unquoted), and nothing is
  written.
* The rows are merged by name, so a run over five transitions takes seconds and leaves the other 205 alone.

The columns: tv total variation (a cross-fade: 55); core80 the shortest share of the sweep carrying 80 % of it (linear:
0.80); peak the largest single step as a share of tv; flick the clock-driven change per frame; flash the brightest mean
luminance of the sweep above the brighter end.  The soft genres need core80 >= 0.45, peak <= 0.10, flash <= 30 and
flick <= 1.0 (make_genre_configs.py: SOFT_*).
"""
import io
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EDITOR = os.path.join(ROOT, "PresetEditor", "build", "Release", "PresetEditor.exe")
TABLE = os.path.join(ROOT, "Tools", "transition_profile.tsv")
IMAGES = os.environ.get("KALEIDO_PROFILE_IMAGES", os.path.join(ROOT, "Images"))
SCENE = "ProfileStill.frag"          # a still photo as the outgoing scene (Engine/)
PHOTOS = "achat-amethyst-lk3.jpg,achat-himbeere-graphit-2.jpg"
CROSSFADE_TV = 58.27
BELOW_NORMAL = 0x00004000


def soft_limits():
    """Reads the thresholds of the soft genres from make_genre_configs.py (one place holds them).

    @return
      (core, flash, flick, peak).
    """
    src = io.open(os.path.join(ROOT, "Tools", "make_genre_configs.py"), encoding="utf-8").read()
    m = re.search(r"^SOFT_CORE, SOFT_FLASH, SOFT_FLICK, SOFT_PEAK = ([0-9.]+), ([0-9.]+), ([0-9.]+), ([0-9.]+)", src, re.M)
    if not m:
        raise SystemExit("make_genre_configs.py: the SOFT_* line has moved")
    return tuple(float(x) for x in m.groups())


def run(arguments):
    """Runs the editor with a list of arguments at below normal priority.

    @param arguments  The arguments after the program name. (in)

    @return
      Its standard error text.
    """
    p = subprocess.run([EDITOR] + arguments, cwd=os.path.join(ROOT, "Release"), capture_output=True, text=True, encoding="utf-8",
                       errors="replace", creationflags=BELOW_NORMAL, timeout=1800)
    return (p.stdout or "") + (p.stderr or "")


def main():
    """Measures, checks the harness, prints and merges.

    @return
      The process exit code: 0, or 1 when the harness is off or a transition fails the endpoint or jump test.
    """
    args = sys.argv[1:]
    dry = "--dry" in args
    show_steps = "--steps" in args
    names = [a for a in args if not a.startswith("--")]
    if not os.path.exists(EDITOR):
        print("PresetEditor.exe is not built:", EDITOR)
        return 1
    out = os.path.join(tempfile.mkdtemp(prefix="kaleido-profile-"), "profile.tsv")
    cmd = ["--transprofile", "--scene", SCENE, "--images", IMAGES, "--photos", PHOTOS, "drone", "--out", out]
    if names:
        cmd += ["--only", ",".join(sorted(set(names + ["Crossfade"])))]
    text = run(cmd)
    if not os.path.exists(out):
        print("no profile written:", text.strip()[-400:])
        return 1
    rows, steps = {}, {}
    for ln in io.open(out, encoding="utf-8").read().splitlines()[1:]:
        v = ln.split("\t")
        if len(v) >= 6:
            n = re.sub(r"\.frag$", "", v[0])
            rows[n] = v[1:6]
            steps[n] = v[6] if len(v) > 6 else ""
    cross = float(rows.get("Crossfade", ["0"])[0])
    if abs(cross - CROSSFADE_TV) > 0.05:
        print("harness off: a cross-fade reads %.2f, the table was made at %.2f -- nothing written" % (cross, CROSSFADE_TV))
        return 1
    check = run(["--transcheck"] + (["--only", ",".join(names)] if names else []))
    # Known failures of the jump test (Tools/transcheck_known.tsv: name, jump, why): accepted as long as they do not
    # get worse by more than a fifth -- the list is for cases looked at and left, not a way to silence new ones.
    known = {}
    known_file = os.path.join(ROOT, "Tools", "transcheck_known.tsv")
    if os.path.exists(known_file):
        for ln in io.open(known_file, encoding="utf-8").read().splitlines()[1:]:
            v = ln.split("\t")
            if len(v) >= 2:
                known[v[0]] = float(v[1])
    jumps, failed, accepted = {}, [], []
    for m in re.finditer(r"^(\w+)\.frag\s+endA\s+([\d.]+)\s+endB\s+([\d.]+)\s+maxStep\s+([\d.]+)\s+jump\s+([\d.]+)x\s+(\w+)", check, re.M):
        jumps[m.group(1)] = (float(m.group(2)), float(m.group(3)), float(m.group(5)), m.group(6))
        if m.group(6) != "OK":
            ends_ok = float(m.group(2)) <= 1.5 and float(m.group(3)) <= 1.5
            if ends_ok and m.group(1) in known and float(m.group(5)) <= 1.2 * known[m.group(1)]:
                accepted.append("%s %.1fx" % (m.group(1), float(m.group(5))))
            else:
                failed.append("%s %.1fx" % (m.group(1), float(m.group(5))))

    lines = io.open(TABLE, encoding="utf-8", newline="").read().replace("\r\n", "\n").split("\n")
    old = {ln.split("\t")[0]: ln.split("\t")[1:6] for ln in lines if ln and not ln.startswith("#") and "\t" in ln}
    core, flash, flick, peak = soft_limits()
    shown = names or sorted(n for n in rows if old.get(n) != rows[n])
    print("%-30s %8s %7s %6s %6s %6s  %-5s %s" % ("transition", "tv", "core80", "peak", "flick", "flash", "soft", "jump"))
    for n in shown:
        if n not in rows:
            print("%-30s not registered in Komplett.xml" % n)
            continue
        r = rows[n]
        ok = float(r[1]) >= core and float(r[2]) <= peak and float(r[3]) <= flick and float(r[4]) <= flash
        j = jumps.get(n)
        print("%-30s %8s %7s %6s %6s %6s  %-5s %s%s" % (n, r[0], r[1], r[2], r[3], r[4], "yes" if ok else "no",
              ("%.1fx %s" % (j[2], j[3])) if j else "-", ("   was " + " ".join(old[n])) if n in old and old[n] != r else ""))
        if show_steps:
            print("    " + steps.get(n, ""))
    differ = sorted(n for n in rows if n in old and old[n] != rows[n])
    missing = sorted(n for n in rows if n not in old)
    print("profile: %d measured, %d differ from the table%s%s" % (len(rows), len(differ), (" (" + ", ".join(differ[:8]) + ")") if differ else "",
          ("; not in the table: " + ", ".join(missing[:8])) if missing else ""))
    print("transcheck: %d checked, %d failed%s%s" % (len(jumps), len(failed), (" (" + ", ".join(failed) + ")") if failed else "",
          ("; known: " + ", ".join(accepted)) if accepted else ""))
    if dry:
        return 1 if failed else 0
    done = set()
    for i, ln in enumerate(lines):
        n = ln.split("\t")[0]
        if ln and not ln.startswith("#") and n in rows and n != "name":
            lines[i] = "\t".join([n] + rows[n])
            done.add(n)
    tail_blank = lines and lines[-1] == ""
    if tail_blank:
        lines.pop()
    for n in sorted(rows):
        if n not in done:
            lines.append("\t".join([n] + rows[n]))
    io.open(TABLE, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print("table written")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
