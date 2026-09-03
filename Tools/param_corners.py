# -*- coding: utf-8 -*-
"""Parameter-ECKEN abtasten: wo eine Szene an einem Rand ihrer Bereiche leer wird.

    python Tools/param_corners.py --scenes A,B,C [--hold 8]
    python Tools/param_corners.py --from-baseline [--worst 40]
    python Tools/param_corners.py --per-param --scenes A,B,C

--per-param fragt weiter: WELCHER Parameter leert die Ecke?  Je Parametername
ein Lauf mit nur diesem Parameter am unteren Ende (alle anderen in der Mitte)
und einer am oberen; dazu ein Mitte-Lauf als Referenz.  Gemeldet wird jedes
(Szene, Parameter, Ende), das unter die Leer-Schwelle faellt, waehrend die
Mitte darueber liegt -- das ist der Bereich, der zu weit ist, samt Richtung.

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


import re

KOMPLETT = os.path.join(screen.ROOT, "Configurations", "Komplett.xml")


def float_params(names):
    """{Szene: [(param, min, max)]} aus Komplett.xml -- nur echte Bereiche."""
    src = io.open(KOMPLETT, encoding="utf-8", errors="replace").read()
    out = {}
    for n in names:
        m = re.search(r'<TextureShader[^>]*[^"]*%s[.]frag"[^>]*>(.*?)</TextureShader>' % re.escape(n), src, re.S)
        ps = re.findall(r'<float name="(\w+)" minValue="([-\d.]+)" maxValue="([-\d.]+)"', m.group(1)) if m else []
        out[n] = [(q, float(lo), float(hi)) for q, lo, hi in ps if float(hi) > float(lo)]
    return out


def per_param(names, hold):
    params = float_params(names)
    by_name = {}
    for n, ps in params.items():
        for q, lo, hi in ps:
            if q == "hueP":
                continue          # ein Farbwinkel leert kein Bild -- zwei Laeufe gespart
            by_name.setdefault(q, []).append(n)
    print("%d Szene(n), %d Parameternamen -> %d Laeufe (Mitte + je Name min/max) ..."
          % (len(names), len(by_name), 1 + 2 * len(by_name)))
    mid = {r["name"]: r["spatial_std"] for r in screen.measure_scenes(names, hold, 1, 0, {"KALEIDO_PARAM_CORNER": "mid"})}
    res = {}
    for q in sorted(by_name):
        for end in ("min", "max"):
            rows = screen.measure_scenes(by_name[q], hold, 1, 0, {"KALEIDO_PARAM_CORNER": "%s:%s" % (end, q)})
            for r in rows:
                res[(r["name"], q, end)] = r["spatial_std"]
    print("\n%-32s %-12s %8s %8s %8s" % ("Szene", "Parameter", "Mitte", "min", "max"))
    flagged = []
    for n in sorted(params):
        for q, lo, hi in params[n]:
            a, b = res.get((n, q, "min")), res.get((n, q, "max"))
            m = mid.get(n, 0.0)
            bad = [e for e, v in (("min", a), ("max", b)) if v is not None and v < screen.LEER_STD <= m]
            mark = ("  <-- %s leer (Bereich %g..%g)" % (",".join(bad), lo, hi)) if bad else ""
            print("%-32s %-12s %8.4f %8s %8s%s" % (n, q, m,
                  ("%.4f" % a) if a is not None else "-", ("%.4f" % b) if b is not None else "-", mark))
            for e in bad:
                flagged.append((n, q, e, lo, hi))
    print("\n%d (Szene, Parameter, Ende) mit leerem Ende bei gesunder Mitte:" % len(flagged))
    for n, q, e, lo, hi in flagged:
        print("   %-32s %-12s %s-Ende  (%g..%g)" % (n, q, e, lo, hi))
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenes", help="Komma-Liste")
    ap.add_argument("--from-baseline", action="store_true")
    ap.add_argument("--worst", type=int, default=40)
    ap.add_argument("--hold", type=int, default=8)
    ap.add_argument("--per-param", action="store_true")
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

    if a.per_param:
        return per_param(names, a.hold)

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
