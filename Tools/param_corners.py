# -*- coding: utf-8 -*-
"""Parameter-ECKEN abtasten: wo eine Szene an einem Rand ihrer Bereiche leer wird.

    python Tools/param_corners.py --scenes A,B,C [--hold 8]
    python Tools/param_corners.py --from-baseline [--worst 40]

Eine Szene, die im Mittel gut misst, kann trotzdem an einem Ende ihrer
Bereiche kein Bild zeigen -- FuturisticCityFlight lag je nach Ziehung
zwischen 0,0062 und 0,0837, und die 0,0062 war eine LEGITIME Ziehung am
dunklen Ende von glowP/fogP.  Fuer den Zuschauer ist das ein leeres Bild,
auch wenn der Median stimmt; keine Mittelwertmessung sieht es.

KALEIDO_PARAM_CORNER=min|max|alt laesst die Engine statt zu wuerfeln die
Ecke ziehen (alle Parameter am unteren Ende / am oberen / abwechselnd).  Das
sind drei Laeufe je Szene; gemeldet wird eine Ecke, deren Struktur unter die
Leer-Schwelle faellt, waehrend der Median (drei Seeds) darueber liegt -- also
ein zu weiter Bereich, kein kaputter Shader.

--from-baseline nimmt die Szenen mit dem kleinsten std_min/std-Verhaeltnis
aus docs/scene-baseline.json (braucht eine Basislinie mit --seeds >= 2).
"""
import argparse
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import screen  # noqa: E402

CORNERS = ("min", "max", "alt")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenes", help="Komma-Liste")
    ap.add_argument("--from-baseline", action="store_true")
    ap.add_argument("--worst", type=int, default=40)
    ap.add_argument("--hold", type=int, default=8)
    a = ap.parse_args()

    names = []
    if a.scenes:
        names = [x.strip() for x in a.scenes.split(",") if x.strip()]
    elif a.from_baseline:
        bj = json.load(io.open(screen.BASELINE, encoding="utf-8"))["scenes"]
        ranked = sorted(bj.items(),
                        key=lambda kv: kv[1].get("std_min", kv[1]["std"]) / max(kv[1]["std"], 1e-6))
        names = [n for n, _ in ranked[:a.worst]]
    if not names:
        sys.exit("Keine Szenen -- --scenes oder --from-baseline angeben.")

    print("%d Szene(n), je 3 Ecken + 3 Seeds Median ..." % len(names))
    corner = {}
    for c in CORNERS:
        for r in screen.measure_scenes(names, a.hold, 1, 0, {"KALEIDO_PARAM_CORNER": c}):
            corner.setdefault(r["name"], {})[c] = r["spatial_std"]
    median = {}
    for seed in (1, 2, 3):
        for r in screen.measure_scenes(names, a.hold, seed, 0):
            median.setdefault(r["name"], []).append(r["spatial_std"])

    print("\n%-36s %8s %8s %8s %8s" % ("Szene", "min", "max", "alt", "Median"))
    flagged = 0
    for n in sorted(corner):
        v = sorted(median.get(n, [0.0]))
        med = v[len(v) // 2]
        cs = corner[n]
        bad = [c for c in CORNERS if cs.get(c, 1.0) < screen.LEER_STD <= med]
        mark = ("  <-- Ecke leer: " + ",".join(bad)) if bad else ""
        flagged += bool(bad)
        print("%-36s %8.4f %8.4f %8.4f %8.4f%s"
              % (n, cs.get("min", 0), cs.get("max", 0), cs.get("alt", 0), med, mark))
    print("\n%d Szene(n) mit leerer Ecke bei gesundem Median -- dort ist der BEREICH"
          " zu weit, nicht der Shader kaputt." % flagged)
    return 0


if __name__ == "__main__":
    sys.exit(main())
