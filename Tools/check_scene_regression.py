#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Compare a fresh scan against the committed baseline and flag real changes.

    python Tools/check_scene_regression.py Release\\recheck
    python Tools/check_scene_regression.py Release\\recheck --update

Workflow after touching shaders:

    .\\Tools\\scan_scenes.ps1 -Scenes A,B,C -Out recheck
    python Tools\\check_scene_regression.py Release\\recheck

Only the scenes present in the new scan are compared, so a two-scene edit costs
a two-scene scan rather than the ~70 minutes a full pass takes.

WHY THE TOLERANCES ARE WHAT THEY ARE
------------------------------------
The scan is reproducible but not bit-exact: scene parameters are re-rolled on
every activation, and the probe window catches a different moment each run.
Measured over two back-to-back runs of the same code with the photo pinned, the
worst luma delta across ten scenes was 0.002, and a separate six-scene control
worst-cased at 0.017. The thresholds below sit above that noise floor, so a
flagged scene means something changed in the SHADER, not in the dice.

Two failure modes this is meant to catch, both of which happened during the
2026-08-21 audit and were only noticed by accident:
  * a scene going dark or flat after an exposure edit
  * a scene losing its parameters entirely (renders, but wrongly)

Exit code is 1 if anything exceeds tolerance, so this can gate a commit.
"""
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE = os.path.join(ROOT, "Tools", "scene_metrics.json")

# Above the measured run-to-run noise (worst observed 0.017 on luma), so a hit
# is a real change. Deliberately per-metric: occupancy is coarser-grained than
# luma and needs a wider band to avoid crying wolf.
TOL = {
    "luma":     0.045,
    "contrast": 0.040,
    "occ":      0.120,
    "satHi":    0.100,
    "motion":   0.040,
}


def load(path):
    with io.open(path, encoding="utf-8") as f:
        return json.load(f)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    update = "--update" in sys.argv
    if not args:
        print(__doc__)
        return 2

    scan_dir = args[0]
    if not os.path.isabs(scan_dir):
        scan_dir = os.path.join(ROOT, scan_dir)
    fresh_json = os.path.join(scan_dir, "_metrics.json")

    if not os.path.isfile(BASELINE):
        print("no baseline at %s -- run a full scan first" % BASELINE)
        return 2
    if not os.path.isfile(fresh_json):
        print("no %s\nRun:  python Tools\\scene_metrics.py \"%s\" --json \"%s\""
              % (fresh_json, scan_dir, fresh_json))
        return 2

    base, fresh = load(BASELINE), load(fresh_json)

    rows, missing = [], []
    for name in sorted(fresh):
        if name not in base:
            missing.append(name)
            continue
        hits = []
        for metric, tol in TOL.items():
            a, b = base[name].get(metric), fresh[name].get(metric)
            if a is None or b is None:
                continue
            if abs(b - a) > tol:
                hits.append((metric, a, b, abs(b - a), tol))
        # A flag appearing or disappearing is worth SEEING, but on its own it is
        # weak evidence: flags are a thresholded view of the metrics, so a scene
        # sitting on a boundary flips between runs without anything changing.
        # Observed immediately: BlackHole loses COLOR_FLICKER between two runs
        # of identical code because its hue flicker sits right at 0.12. So a
        # flag-only difference is reported and does NOT fail the check; only a
        # metric moving beyond the noise floor does.
        fa = set(base[name].get("flags", []))
        fb = set(fresh[name].get("flags", []))
        if hits or fa != fb:
            rows.append((name, hits, sorted(fb - fa), sorted(fa - fb)))

    print("compared %d scene(s) against the baseline" % (len(fresh) - len(missing)))
    if missing:
        print("  %d not in the baseline (new scenes?): %s"
              % (len(missing), ", ".join(missing[:5])))

    if not rows:
        print("no change beyond tolerance")
        if update:
            print("(nothing to update)")
        return 0

    print("")
    for name, hits, gained, lost in rows:
        print("  %s" % name)
        for metric, a, b, d, tol in hits:
            print("      %-9s %.3f -> %.3f   delta %.3f  (tolerance %.3f)"
                  % (metric, a, b, d, tol))
        if gained:
            print("      flags gained: %s" % ", ".join(gained))
        if lost:
            print("      flags lost:   %s" % ", ".join(lost))

    hard = [r for r in rows if r[1]]      # only metric moves count as a failure

    if update:
        for name in fresh:
            base[name] = fresh[name]
        with io.open(BASELINE, "w", encoding="utf-8") as f:
            json.dump(base, f, indent=1, sort_keys=True)
        print("")
        print("baseline updated for %d scene(s) -- only do this once the change "
              "above is understood and wanted" % len(fresh))
        return 0

    print("")
    if not hard:
        print("only flag boundaries moved, no metric beyond tolerance -- "
              "that is threshold noise, not a regression")
        return 0
    print("%d scene(s) changed beyond tolerance. If the change is intended, "
          "re-run with --update." % len(hard))
    return 1


if __name__ == "__main__":
    sys.exit(main())
