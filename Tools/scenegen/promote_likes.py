# -*- coding: utf-8 -*-
"""Freeze liked chain-lab rolls into named scenes.

The app appends one line per like (key 'f' or the remote's heart) to
liked_rolls.tsv next to the settings ini:
    <time> TAB <Scene.frag> TAB name=value name=value ...
For the chain-lab scenes the rolled knobs choose the transforms themselves, so
a liked roll is a scene of its own.  For every liked lab roll this script
writes src/ChainLike<2D|3D><MMDDhhmmss>.glsl: a copy of the lab's source in
which the structure knobs are constants (so the chain is frozen even if the
lab's classes grow later, and the compiler folds the stage selection away),
builds it and registers it with the lab's moods and ratings.  Tempo and
sharpness stay rolled knobs.  Rolls already frozen are skipped.

Usage: promote_likes.py [--likes FILE] [--dry-run]
"""
import argparse, io, os, re, subprocess, sys

SP = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(SP, "..", ".."))
LABS = {"ChainLab2D": "2D", "ChainLab3D": "3D", "ChainLabTunnel": "Tunnel"}
PIN = ["spaceP", "coreP", "bodyP", "chainAP", "chainBP", "chainCP", "chainDP", "morphP", "depthP", "styleP", "paletteP"]
# The stage classes as the labs define them (for the description only).
CLASSES = {
    "spaceP": ["mirrored lattice", "polar ring tunnel", "twisted lattice", "octahedral lattice", "turning lattice"],
    "coreP": ["no fold core", "tetrahedral KIFS", "octahedral KIFS", "sphere-inversion box fold", "plane folds", "Menger sponge"],
    "bodyP": ["blocks", "balls", "tori", "gyroid membrane", "crosses"],
    "chainAP": ["kaleidoscope", "log-polar spiral", "tunnel", "Moebius stream", "Droste zoom", "polar unwrap",
                "complex exponential", "complex sine", "circle inversion", "hyperbolic Poincare tiling", "bipolar stream"],
    "chainBP": [None, "kaleidoscope", "p6m lattice", "p4m lattice", "iterated fold", "mirror line"],
    "chainCP": [None, "spiral", "tunnel", "inversion", "complex square", "lens", "kaleidoscope", "Joukowski map"],
    "chainDP": [None, "twirl", "shear wave", "ripple", "domain warp", "turning"],
    "morphP": [None, "the first stage", "the symmetry", "the second map", "the warp"],
}

def pick(x, n):
    return min(int(x * n), n - 1)

def describe(v, dim):
    parts = []
    if dim == "3D":
        parts.append("%s of %s with %s" % (CLASSES["spaceP"][pick(v["spaceP"], 5)], CLASSES["bodyP"][pick(v["bodyP"], 5)],
                                          CLASSES["coreP"][pick(v["coreP"], 6)]))
    stages = [CLASSES[k][pick(v[k], len(CLASSES[k]))] for k in ["chainAP", "chainBP", "chainCP", "chainDP"]]
    parts.append({"3D": "coloured by ", "Tunnel": "a relief tunnel of "}.get(dim, "") + " -> ".join(s for s in stages if s))
    m = CLASSES["morphP"][pick(v["morphP"], 5)]
    if m:
        parts.append("%s morphing on with the music" % m)
    return "; ".join(parts)

ap = argparse.ArgumentParser()
ap.add_argument("--likes", default=os.path.join(ROOT, "liked_rolls.tsv"))
ap.add_argument("--dry-run", action="store_true")
a = ap.parse_args()

fit = {l.split("\t")[0]: l.split("\t")[1:] for l in io.open(os.path.join(ROOT, "Tools", "preset_fit.tsv"), encoding="utf-8").read().splitlines() if l}
komplett = io.open(os.path.join(ROOT, "Presets", "Komplett.xml"), encoding="utf-8").read()
made = []
for line in io.open(a.likes, encoding="utf-8").read().splitlines():
    parts = line.split("\t")
    if len(parts) < 3:
        continue
    when, frag, kv = parts
    lab = frag.rsplit(".", 1)[0]
    if lab not in LABS:
        continue
    dim = LABS[lab]
    vals = {k: float(x) for k, x in (p.split("=", 1) for p in kv.split() if "=" in p)}
    pins = [k for k in PIN if k in vals]
    sig = " ".join("%s=%.4f" % (k, vals[k]) for k in pins)
    if any(sig in io.open(os.path.join(SP, "src", f), encoding="utf-8").read()
           for f in os.listdir(os.path.join(SP, "src")) if f.startswith("ChainLike")):
        print("already frozen:", sig)
        continue
    stamp = re.sub(r"\D", "", when)[4:14]                       # MMDDhhmmss
    name = "ChainLike%s%s" % (dim, stamp)
    src = io.open(os.path.join(SP, "src", lab + ".glsl"), encoding="utf-8").read()
    what = describe(vals, dim)
    src = re.sub(r"@brief CHAIN LAB (2D|3D|TUNNEL): .*?(?=\n \*\n)",
                 "@brief CHAIN LIKE %s (%s): a liked roll of the chain lab, frozen -- %s.\n"
                 " * Frozen knobs: %s" % (dim, when, what, sig), src, count=1, flags=re.S)
    src = re.sub(r"^//@params (.*)$", lambda m: "//@params " + " ".join(p for p in m.group(1).split() if p not in pins),
                 src, count=1, flags=re.M)
    consts = "".join("const float %s = %.4f;\n" % (k, vals[k]) for k in pins)
    src = src.replace("//@body\n", "//@body\n" + consts, 1)
    print("%s: %s" % (name, what))
    if a.dry_run:
        continue
    io.open(os.path.join(SP, "src", name + ".glsl"), "w", encoding="utf-8", newline="\n").write(src)
    made.append((name, lab))
if made:
    subprocess.run([sys.executable, os.path.join(SP, "gen.py")] + [n for n, _ in made], check=True)
    moods = {}
    for n, lab in made:
        m = re.search(r'[\\/]%s\.frag"[^>]*mood="([^"]*)"[^>]*complexity="(\d+)"' % lab, komplett)
        moods[n] = (m.group(1), m.group(2)) if m else ("psychedelic", "3")
    rows = ["%s|%s|%s|%s" % (n, moods[n][0], moods[n][1], " ".join(fit.get(lab, ["5"] * 7))) for n, lab in made]
    subprocess.run([sys.executable, os.path.join(SP, "finish_block.py")] + rows, check=True)
print("%d liked roll(s) frozen%s" % (len(made), " (dry run)" if a.dry_run else ""))
