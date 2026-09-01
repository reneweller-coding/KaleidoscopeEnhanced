# -*- coding: utf-8 -*-
r"""Replace repeated camera-rig formula blocks with a named `<rig preset="..."/>`.

    python Tools/migrate_rigs.py --dry-run     # what would change
    python Tools/migrate_rigs.py               # write rigs.xml + Komplett.xml

830 of the catalogue's scenes carry a camera rig, and between them they use
only NINETEEN distinct formula sets -- the top ten cover 98 %.  Written out
per scene that is roughly 2500 lines of near-identical arithmetic, and the
cost of that is not disk space but blindness: when every rig coefficient in
the catalogue was three orders of magnitude too small, giving oscillation
periods of half an hour to five hours, nobody saw it, because nobody reads
2500 near-identical numbers.  Named presets make the same fact a nine-line
table.

Only signatures used at least MIN_USES times become presets.  A rig that
appears once is clearer written out than hidden behind a name invented for it.

The engine resolves `<rig preset="X"/>` from Configurations/rigs.xml in
Configuration::addUniforms, so this is a pure re-expression: the resulting
expression list per scene is identical, which `--verify` checks by comparing
the engine's own "Expr OK" log lines from before and after.
"""
import argparse, collections, io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KOMPLETT = os.path.join(ROOT, "Configurations", "Komplett.xml")
RIGS = os.path.join(ROOT, "Configurations", "rigs.xml")

MIN_USES = 5

BLOCK = re.compile(r'<TextureShader\b[^>]*>.*?</TextureShader>', re.S)
EXPR_LINE = re.compile(r'^[ \t]*<expr\s+name="(rig\w*)"\s+formula="([^"]*)"\s*/>[ \t]*\r?\n', re.M)
GEOM = re.compile(r'geom="(\w+)"')


def signature(block):
    """The scene's rig as a canonical, order-independent tuple."""
    return tuple(sorted((m.group(1), m.group(2)) for m in EXPR_LINE.finditer(block)))


def name_for(sig, geoms):
    """A name that says what the rig DOES, derived from the axes it drives and
    how far it swings -- so the table stays readable without a legend."""
    axes = {a for a, _ in sig}
    if axes <= {"rig2Roll", "rig2Zoom"}:
        roll = next((f for a, f in sig if a == "rig2Roll"), "")
        amp = re.match(r"([\d.]+)", roll)
        return "flat" if (amp and abs(float(amp.group(1)) - 0.035) < 1e-6) \
               else "flat-%s" % (amp.group(1).replace("0.", "") if amp else "x")
    if "rigDolly" in axes:
        return "procedural"
    # Mesh rigs differ only in how wide the yaw swings.
    yaw = next((f for a, f in sig if a == "rigYaw"), "")
    m = re.match(r"([\d.]+)", yaw)
    amp = float(m.group(1)) if m else 0.0
    # Die Yaw-Amplitude IST der Unterschied zwischen den Mesh-Rigs, also steht
    # sie im Namen: "mesh-18" schwenkt 0.18 rad, rund zehn Grad.  Ein
    # durchnummeriertes "mesh-mid-2" haette dieselbe Information versteckt.
    base = "mesh-%02d" % int(round(amp * 100))
    if "rigRoll" in axes:
        base += "-roll"
    # Several sets differ ONLY in which seed drives the yaw, and that is not a
    # detail: pitch always runs on seed2, so a yaw on seed2 swings in phase
    # with it and the camera wobbles along a diagonal instead of tracing a
    # compound path.  Naming the seed keeps that visible in the table rather
    # than hiding it behind an arbitrary "-2".
    ms = re.search(r"seed(\d)", yaw)
    if ms and ms.group(1) != "1":
        base += "-yaw%s" % ms.group(1)
    return base


def collect():
    src = io.open(KOMPLETT, encoding="utf-8", errors="replace").read()
    sigs = collections.defaultdict(lambda: [0, collections.Counter()])
    for b in BLOCK.finditer(src):
        s = signature(b.group(0))
        if not s:
            continue
        g = GEOM.search(b.group(0).split(">", 1)[0])
        sigs[s][0] += 1
        sigs[s][1][g.group(1) if g else "2d"] += 1
    return src, sigs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    src, sigs = collect()
    common = {s: v for s, v in sigs.items() if v[0] >= MIN_USES}
    rare = {s: v for s, v in sigs.items() if v[0] < MIN_USES}

    # Names must be unique; two signatures can land on the same descriptive
    # name (same swing, different seed per axis), so suffix the collisions.
    names, used = {}, collections.Counter()
    for s, v in sorted(common.items(), key=lambda x: -x[1][0]):
        base = name_for(s, v[1])
        used[base] += 1
        names[s] = base if used[base] == 1 else "%s-%d" % (base, used[base])

    print("%d Rig-Signaturen: %d als Vorlage (>= %dx), %d bleiben ausgeschrieben"
          % (len(sigs), len(common), MIN_USES, len(rare)))
    total = sum(v[0] for v in common.values())
    print("%d Szenen bekommen eine Vorlage, %d behalten ihre Formeln"
          % (total, sum(v[0] for v in rare.values())))
    for s, v in sorted(common.items(), key=lambda x: -x[1][0]):
        print("   %-18s %4dx  %s" % (names[s], v[0], ", ".join(a for a, _ in s)))
    if a.dry_run:
        return 0

    # ---- rigs.xml -----------------------------------------------------------
    out = ['<?xml version="1.0" encoding="utf-8" ?>',
           '<!-- Benannte Kamera-Rigs.  Eine Szene zieht eine Vorlage mit',
           '     <rig preset="NAME"/> statt ihre Formeln auszuschreiben;',
           '     Configuration::addUniforms loest das beim Laden auf.',
           '',
           '     Erzeugt von Tools/migrate_rigs.py.  Wer hier einen',
           '     Koeffizienten aendert, aendert ihn fuer ALLE Szenen der',
           '     Vorlage.  Genau das ist der Punkt: als 830 Kopien war',
           '     nicht zu sehen, dass jede Schwingung eine halbe bis fuenf',
           '     Stunden dauerte. -->',
           '<rigs>']
    for s, v in sorted(common.items(), key=lambda x: -x[1][0]):
        geoms = ", ".join("%s:%d" % (g, n) for g, n in v[1].most_common(4))
        out.append('  <!-- %dx  (%s) -->' % (v[0], geoms))
        out.append('  <rig name="%s">' % names[s])
        for axis, formula in s:
            out.append('    <expr name="%s" formula="%s"/>' % (axis, formula))
        out.append('  </rig>')
    out.append('</rigs>')
    io.open(RIGS, "w", encoding="utf-8", newline="\n").write("\n".join(out) + "\n")

    # ---- Komplett.xml -------------------------------------------------------
    def replace(mo):
        blk = mo.group(0)
        s = signature(blk)
        if s not in names:
            return blk
        indent = "    "
        first = EXPR_LINE.search(blk)
        if first:
            indent = re.match(r"[ \t]*", first.group(0)).group(0)
        stripped = EXPR_LINE.sub("", blk)
        # Put the rig where its first formula stood, not at the end: the rig is
        # the scene's camera, and it reads as such at the top of the block.
        head, rest = stripped.split(">", 1)
        return head + ">" + "\n" + indent + '<rig preset="%s"/>' % names[s] + rest

    new = BLOCK.sub(replace, src)
    io.open(KOMPLETT, "w", encoding="utf-8", newline="\n").write(new)
    print("\nKomplett.xml: %d -> %d Zeilen"
          % (src.count("\n") + 1, new.count("\n") + 1))
    print("rigs.xml geschrieben: %s" % RIGS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
