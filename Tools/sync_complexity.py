# -*- coding: utf-8 -*-
r"""Set each scene's `complexity` from its MEASURED cost instead of a guess.

    python Tools/sync_complexity.py --dry-run
    python Tools/sync_complexity.py

`complexity` is what SceneScheduler budgets with: it refuses a combination of
scene + incoming scene + two overlays whose complexities exceed a fixed sum.
The attribute has always been hand-set, and measured against a clock over the
whole catalogue (Tools/screen.py writes `.screen/scene-cost.json`) it turns out
to predict almost nothing -- correlation 0.09 over 616 scenes, and the median
cost is the same 1.34 ms at every complexity level from 1 to 10.

That is less damning than it sounds, because there is not much to predict:
84 % of scenes render inside 1.5 ms, which is the floor set by the present pass
and the recorder rather than by the scene. What matters is the tail. Two scenes
cost twelve times the median -- both march 60 steps with a five-octave noise sum
underneath, so 300 noise evaluations per pixel -- and both were sitting at
complexity 4 while `Bubble`, which costs the median, was at 10.

So this tool deliberately does NOT rewrite everything. Scenes inside the noise
floor keep whatever they have: their number carries no information either way,
and churning 600 attributes to encode "we cannot tell" would be worse than
leaving them. Only the outliers are corrected, because only they can actually
make a frame late.
"""
import argparse, io, json, os, re, statistics, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KOMPLETT = os.path.join(ROOT, "Configurations", "Komplett.xml")
COSTS = os.path.join(ROOT, ".screen", "scene-cost.json")

# Below this multiple of the median the number is measurement floor, not scene.
# 3.0 rather than 1.5: measured quantiles are 1.35 (median), 1.60 (90 %) and
# 1.87 (95 %), so anything under ~2.5 ms is indistinguishable from the floor and
# "correcting" it would just churn attributes to encode noise.  At 3x only the
# scenes that can actually make a frame late remain.
QUIET_FACTOR = 3.0
# (multiple of median, complexity to assign)
BANDS = [(6.0, 10), (3.0, 8)]

TAG = re.compile(r'<TextureShader\b[^>]*>')


def stem_of(tag):
    m = re.search(r'file="([^"]+)"', tag)
    if not m:
        return None
    p = m.group(1).replace("\\", "/").replace("//", "/")
    return p.rsplit("/", 1)[-1][:-5]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    if not os.path.exists(COSTS):
        sys.exit("Keine Messung: erst  python Tools/screen.py  laufen lassen.")
    cost = json.load(io.open(COSTS, encoding="utf-8"))
    med = statistics.median(cost.values())
    src = io.open(KOMPLETT, encoding="utf-8", errors="replace").read()

    changes = []

    def repl(mo):
        tag = mo.group(0)
        st = stem_of(tag)
        cm = re.search(r'complexity="(\d+)"', tag)
        if st is None or cm is None or st not in cost:
            return tag
        ratio = cost[st] / med
        if ratio < QUIET_FACTOR:
            return tag                      # inside the floor: no information
        want = next(c for thr, c in BANDS if ratio >= thr)
        have = int(cm.group(1))
        if want == have:
            return tag
        changes.append((st, cost[st], ratio, have, want))
        return tag[:cm.start()] + 'complexity="%d"' % want + tag[cm.end():]

    out = TAG.sub(repl, src)

    print("Median %.2f ms; %d Szenen gemessen" % (med, len(cost)))
    print("%d Szenen ueber dem %.1f-fachen des Medians bekommen einen neuen Wert:"
          % (len(changes), QUIET_FACTOR))
    for st, ms, r, have, want in sorted(changes, key=lambda x: -x[1]):
        print("   %-38s %6.2f ms (%4.1fx)   complexity %2d -> %2d"
              % (st, ms, r, have, want))
    if a.dry_run or not changes:
        return 0
    io.open(KOMPLETT, "w", encoding="utf-8", newline="\n").write(out)
    print("\nKomplett.xml geschrieben. Presets neu erzeugen:"
          "  python Tools/make_genre_configs.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
