# -*- coding: utf-8 -*-
r"""Report scenes whose mood tag contradicts what they actually render.

    python Tools/mood_vs_measured.py          (needs .screen/metrics.json)

WHY THIS ONLY REPORTS, AND DOES NOT REWRITE
-------------------------------------------
The obvious idea is to derive the tags from the measurement: bright/dark from
luminance, calm/aggressive from motion, and stop hand-maintaining 600
attributes. Reading SceneScheduler::moodAccept settles that it would be wrong.
The four runtime flags are not descriptions of the picture, they are pairings
with the MUSIC:

    bright      biases toward positive valence
    dark        biases toward negative valence
    aggressive  biases toward high arousal (and low ambience)
    calm        biases toward low arousal (and high ambience)

A visually bright scene may legitimately be tagged `dark` because it suits sad
music, and a slow scene may be `aggressive` because it looks menacing. So the
measurement cannot decide the tag, and a tool that overwrote 600 of them from
luminance would be confidently wrong 300 times.

What the measurement CAN do is surface the extremes, where the pairing stops
being defensible: a scene tagged `bright` that renders in the darkest tenth of
the catalogue will look wrong on cheerful music no matter what was intended.
Those are worth a human deciding about, which is what this prints.

One further split matters. "Tagged aggressive but in the stillest tenth" is
usually NOT a tagging question: it overlaps the STARR findings from the same
screening, i.e. scenes that do not move at all. Those want fixing, not
re-labelling, so they are listed separately.
"""
import collections, io, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
METRICS = os.path.join(ROOT, ".screen", "metrics.json")
KOMPLETT = os.path.join(ROOT, "Configurations", "Komplett.xml")

STARR_MOTION = 0.0025          # same threshold the screening flags with


def main():
    if not os.path.exists(METRICS):
        sys.exit("Keine Messung: erst  python Tools/screen.py  laufen lassen.")
    rows = json.load(io.open(METRICS, encoding="utf-8"))
    per = collections.defaultdict(list)
    for r in rows:
        per[r["name"]].append(r)
    meas = {n: dict(luma=max(x["luma_max"] for x in v),
                    mot=max(x["motion_med"] for x in v)) for n, v in per.items()}

    src = io.open(KOMPLETT, encoding="utf-8", errors="replace").read()
    tags = {}
    for m in re.finditer(r'<TextureShader\b[^>]*>', src):
        t = m.group(0)
        f = re.search(r'file="([^"]+)"', t)
        mo = re.search(r'mood="([^"]*)"', t)
        if not f:
            continue
        st = f.group(1).replace("\\", "/").replace("//", "/").rsplit("/", 1)[-1][:-5]
        tags.setdefault(st, set((mo.group(1) if mo else "").split(",")) - {""})

    common = [s for s in meas if s in tags]
    ls = sorted(meas[s]["luma"] for s in common)
    ms = sorted(meas[s]["mot"] for s in common)
    n = len(common)
    p10l, p90l = ls[n // 10], ls[9 * n // 10]
    p10m, p90m = ms[n // 10], ms[9 * n // 10]

    buckets = collections.defaultdict(list)
    still = []
    for s in common:
        v, t = meas[s], tags[s]
        if "bright" in t and v["luma"] <= p10l:
            buckets["bright, rendert im dunkelsten Zehntel"].append((s, v["luma"]))
        if "dark" in t and v["luma"] >= p90l:
            buckets["dark, rendert im hellsten Zehntel"].append((s, v["luma"]))
        if "calm" in t and v["mot"] >= p90m:
            buckets["calm, gehoert zum bewegtesten Zehntel"].append((s, v["mot"]))
        if "aggressive" in t and v["mot"] <= p10m:
            (still if v["mot"] < STARR_MOTION else
             buckets["aggressive, gehoert zum ruhigsten Zehntel"]).append((s, v["mot"]))

    print("%d Szenen mit Messung und Tags" % n)
    print("Luma 10/90 %%: %.3f / %.3f     Bewegung 10/90 %%: %.4f / %.4f"
          % (p10l, p90l, p10m, p90m))
    print("\nDie vier Runtime-Flags sind MUSIK-Paarungen, keine Bildbeschreibungen")
    print("(bright<->Valenz, aggressive<->Arousal). Das hier sind Faelle zum")
    print("Nachdenken, keine Fehler.\n")
    total = 0
    for k in sorted(buckets):
        v = buckets[k]
        total += len(v)
        print("  %s: %d" % (k, len(v)))
        for s, val in sorted(v, key=lambda x: x[1])[:10]:
            print("     %-42s %.4f" % (s, val))
        if len(v) > 10:
            print("     ... und %d weitere" % (len(v) - 10))
    if still:
        print("\n  SEPARAT -- 'aggressive' und bewegt sich fast NICHT (unter %.4f):"
              % STARR_MOTION)
        print("  Das ist kein Tag-Problem, das sind Szenen, die stillstehen.")
        for s, val in sorted(still, key=lambda x: x[1]):
            print("     %-42s %.4f" % (s, val))
    print("\n%d Tag-Fragen, %d stehende Szenen" % (total, len(still)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
