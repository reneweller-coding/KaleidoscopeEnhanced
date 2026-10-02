# -*- coding: utf-8 -*-
"""The chain's energy order (calm .. energetic) from measurements instead of by hand.

Reads class_stats.tsv (Tools/chain_class_stats.py: motion and detail of every
class alone) and orders each stage's classes by
    energy = z(motion) + 0.5 * z(detail)     (z: within the stage)
The walk picks classes on this scale with the music's energy (EffectShader).

Fixed: position 0 ('none') and the weak positions (B 1-2, C 1, D 1-2; the
lab's gIdW thresholds: classes there barely change the photo, and the calm
fallback lattice fades in over them) -- they keep their classes.

Writes, with --write, the ord functions of src/ChainLab2D.glsl (position ->
branch) and the name lists of chain_classes.py (position -> name); the other
labs take both over (labsubset.py).  Without --write: the table and the rank
correlation with the hand order.

--world: the same for the 3D lab's world (space, fold core, body) from
world_stats.tsv (chain_class_stats.py --world) into the ord functions of
make_chainlab3d.py ('no fold core' and the plain mirrored lattice stay first;
then make_chainlab3d.py, make_chainslice3d.py and gen.py rebuild the labs).

  python apply_energy_order.py            # show
  python apply_energy_order.py --write    # apply (then rebuild the labs)
  python apply_energy_order.py --world [--write]
"""
import argparse, io, os, re, statistics, sys

SG = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SG)
import chain_classes as cc                                    # noqa: E402

STAGES = [("A", "chainAP", "orda", 0), ("B", "chainBP", "ordb", 2), ("C", "chainCP", "ordc", 1), ("D", "chainDP", "ordd", 2)]
WORLD = [("space", "spaceP", "ordsp", 0), ("core", "coreP", "ordco", 0), ("body", "bodyP", "ordbo", -1)]


def zs(v):
    m = statistics.mean(v)
    sd = statistics.pstdev(v) or 1.0
    return [(x - m) / sd for x in v]


def spearman(a, b):
    ra = {x: i for i, x in enumerate(sorted(a, key=lambda k: a[k]))}
    rb = {x: i for i, x in enumerate(sorted(b, key=lambda k: b[k]))}
    n = len(a)
    d2 = sum((ra[k] - rb[k]) ** 2 for k in a)
    return 1 - 6 * d2 / (n * (n * n - 1)) if n > 2 else float("nan")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--world", action="store_true", help="the 3D world stages (world_stats.tsv -> make_chainlab3d.py)")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    lines = io.open(os.path.join(SG, "world_stats.tsv" if a.world else "class_stats.tsv"), encoding="utf-8").read().splitlines()
    hdr = lines[0].split("\t")
    stats = {}
    for l in lines[1:]:
        v = dict(zip(hdr, l.split("\t")))
        if v.get("motion"):
            stats[(v["stage"], v["class"])] = (float(v["motion"]), float(v["detail"]))   # by name: positions move
    src_p = os.path.join(SG, "make_chainlab3d.py") if a.world else os.path.join(SG, "src", "ChainLab2D.glsl")
    src = io.open(src_p, encoding="utf-8", newline="").read()
    cls_p = os.path.join(SG, "chain_classes.py")
    cls = io.open(cls_p, encoding="utf-8", newline="").read()
    for st, knob, fn, weak in (WORLD if a.world else STAGES):
        names = cc.CLASSES[knob]
        n = len(names)
        m = re.search(r"int %s\(int i\) \{(.*?)\}" % fn, src)
        order = [int(x) for x in re.findall(r"return (\d+);", m.group(1))]
        assert len(order) == n, (fn, len(order), n)
        free = [p for p in range(weak + 1, n)]
        key = lambda p: (st, names[p] or "none")
        missing = [p for p in free if key(p) not in stats]
        if missing:
            print("%s: no measurement for positions %s -- skipped" % (st, missing))
            continue
        e = dict(zip(free, (x + 0.5 * y for x, y in zip(zs([stats[key(p)][0] for p in free]),
                                                        zs([stats[key(p)][1] for p in free])))))
        new = list(range(weak + 1)) + sorted(free, key=lambda p: e[p])
        rho = spearman({p: p for p in free}, e)
        print("\n== stage %s (%s): rank correlation hand order vs measured energy %.2f" % (st, knob, rho))
        for j, p in enumerate(new):
            mark = "" if p <= weak else "%+.2f" % e[p]
            print("  %2d <- %2d  %-30s %s" % (j, p, names[p] or "none", mark))
        if a.write:
            body = " ".join("if (i == %d) return %d;" % (j, order[p]) for j, p in enumerate(new[:-1]))
            line = "int %s(int i) { %s return %d; }" % (fn, body, order[new[-1]])
            src = src[:m.start()] + line + src[m.end():]
            new_names = [names[p] for p in new]
            mm = re.search(r"(\n\s*'%s':\s*)\[[^\n]*\](,?)" % knob, cls)
            assert mm, knob
            cls = cls[:mm.start()] + mm.group(1) + repr(new_names) + mm.group(2) + cls[mm.end():]
    if a.write:
        io.open(src_p, "w", encoding="utf-8", newline="").write(src)
        io.open(cls_p, "w", encoding="utf-8", newline="").write(cls)
        print("\nwritten: %s (ord functions), chain_classes.py (names)" % os.path.basename(src_p))


if __name__ == "__main__":
    main()
