# -*- coding: utf-8 -*-
r"""Write each scene's MEASURED values into Presets/Komplett.xml: its GPU time, and its restlessness as `complexity`.

    python Tools/sync_scene_measures.py --dry-run
    python Tools/sync_scene_measures.py              # then: python Tools/make_genre_configs.py

Two different things were one attribute.  `complexity` is the busyness the scheduler's mood match weighs against the
arousal (SceneScheduler::moodAccept(): calm music, calm scenes) and its stacking budget sums (no two busy layers at
once); Tools/sync_complexity.py (until 17.10.2026) wrote the GPU cost into it -- a calm but expensive nebula would
have read as busy.  Now:

  gpuMs       the measured GPU time a frame at 1920 x 1080 (`ms_gpu` of .screen/scene-cost.json, written by
              Tools/screen.py's export run): what the adaptive resolution starts from before a scene was seen live.
  complexity  the measured restlessness, 1..10: how much the picture moves and how much it holds --
              * motion (60 %): the screening's median frame change on 32 x 18 blocks (`motion_coarse`,
                .screen/metrics.json) -- large movement and flicker, not the sparkle of single particles,
              * detail (40 %): the mean edge strength of its 160 x 90 frames (`detail_mid`),
              each relative to the picture's brightness (+ 0.10: a dark scene is not calm for being dark, nor
              restless for a small change), ranked, the ranks weighted.  The ranking is mapped onto the distribution
              the hand-set values had, so the scheduler's thresholds (arousal target 1..10, the stacking budget of
              28) keep their meaning.  Measured against the eye on 18 scenes (17.10.2026): a dense snowfall and a
              firefly sparkle field rank busy -- they are, hard white specks all over --, a slowly turning tile
              ball, a disco floor and soft colour clouds calm.

A scene without a measurement keeps what it has.  Repeated entries of one shader (a mesh family) share its values.
"""
import argparse
import collections
import io
import json
import os
import re
import statistics
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KOMPLETT = os.path.join(ROOT, "Presets", "Komplett.xml")
COSTS = os.path.join(ROOT, ".screen", "scene-cost.json")
METRICS = os.path.join(ROOT, ".screen", "metrics.json")
TAG = re.compile(r'<TextureShader\b[^>]*>')


def stem_of(tag):
    m = re.search(r'file="([^"]+)"', tag)
    return re.split(r"[\\/]+", m.group(1))[-1][:-5] if m else None


def ranks(values):
    """name -> percentile rank 0..1."""
    order = sorted(values, key=values.get)
    n = max(1, len(order) - 1)
    return {k: i / n for i, k in enumerate(order)}


def spearman(a, b):
    ra, rb = ranks(a), ranks(b)
    keys = list(a)
    x = np.array([ra[k] for k in keys])
    y = np.array([rb[k] for k in keys])
    return float(np.corrcoef(x, y)[0, 1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    for p in (COSTS, METRICS):
        if not os.path.exists(p):
            sys.exit("missing %s -- run Tools/screen.py first" % p)
    raw = json.load(io.open(COSTS, encoding="utf-8"))
    gpu = {k: v["ms_gpu"] for k, v in raw.items() if isinstance(v, dict) and "ms_gpu" in v}
    rows = json.load(io.open(METRICS, encoding="utf-8"))
    if rows and "motion_coarse" not in rows[0]:
        sys.exit("%s has no motion_coarse -- measured before 17.10.2026; run Tools/screen.py again" % METRICS)
    pm, pd = collections.defaultdict(list), collections.defaultdict(list)
    for r in rows:
        b = r["luma_med"] + 0.10
        pm[r["name"]].append(r["motion_coarse"] / b)
        pd[r["name"]].append(r["detail_mid"] / b)
    motion = {k: statistics.median(v) for k, v in pm.items()}
    det = {k: statistics.median(v) for k, v in pd.items()}

    src = io.open(KOMPLETT, encoding="utf-8", errors="replace").read()
    tags = TAG.findall(src)
    hand = {}
    for t in tags:
        st, cm = stem_of(t), re.search(r'complexity="(\d+)"', t)
        if st and cm:
            hand.setdefault(st, int(cm.group(1)))
    both = [s for s in hand if s in motion and s in det]
    rm, rd = ranks({s: motion[s] for s in both}), ranks({s: det[s] for s in both})
    score = {s: 0.6 * rm[s] + 0.4 * rd[s] for s in both}
    # the hand values' distribution, per entry, onto the measured order
    entry_stems = [stem_of(t) for t in tags if stem_of(t) in score]
    pool = sorted(hand[s] for s in entry_stems)
    by_score = sorted(entry_stems, key=lambda s: score[s])
    want = {}
    for i, s in enumerate(by_score):
        want.setdefault(s, pool[i])

    changes = []

    def repl(mo):
        tag = mo.group(0)
        st = stem_of(tag)
        if st in want:
            tag = re.sub(r'complexity="\d+"', 'complexity="%d"' % want[st], tag)
        if st in gpu:
            g = 'gpuMs="%.2f"' % gpu[st]
            tag = re.sub(r'gpuMs="[^"]*"', g, tag) if 'gpuMs="' in tag else tag[:-1].rstrip() + " " + g + ">"
        if tag != mo.group(0):
            changes.append(st)
        return tag

    out = TAG.sub(repl, src)
    moved = sorted(((s, hand[s], want[s]) for s in want if hand[s] != want[s]), key=lambda x: -abs(x[2] - x[1]))
    print("%d scenes measured (motion %d, detail %d, GPU %d); restlessness vs the hand-set complexity: Spearman %.2f"
          % (len(both), len(motion), len(det), len(gpu), spearman({s: hand[s] for s in both}, score)))
    print("%d scenes change complexity; the largest moves:" % len(moved))
    for s, h, w in moved[:20]:
        print("   %-40s %2d -> %2d   (motion %.3f, detail %.2f, GPU %.2f ms)"
              % (s, h, w, motion[s], det[s], gpu.get(s, float("nan"))))
    print("GPU time: %d scenes, median %.2f ms, max %.2f ms" % (len(gpu), statistics.median(gpu.values()),
                                                                 max(gpu.values())))
    if a.dry_run:
        return 0
    io.open(KOMPLETT, "w", encoding="utf-8", newline="\n").write(out)
    print("Komplett.xml written (%d entries).  Now: python Tools/make_genre_configs.py" % len(changes))
    return 0


if __name__ == "__main__":
    sys.exit(main())
