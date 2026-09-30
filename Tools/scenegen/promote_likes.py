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
PIN = ["spaceP", "coreP", "bodyP", "solidP", "reliefP", "chainAP", "chainBP", "chainCP", "chainDP", "morphP", "depthP", "styleP", "paletteP"]
# The stage classes as the labs define them (for the description only).
CLASSES = {
    "spaceP": ["mirrored lattice", "octahedral lattice", "icosahedral lattice", "hexagonal lattice", "4D-rotated lattice", "log-spherical Droste", "log-cylindrical Droste", "turning lattice", "torus-wrapped world", "hyperbolic half-space", "twisted lattice", "gyroid-warped lattice", "helix", "double helix", "inverted lattice", "polar ring tunnel"],
    "coreP": ["no fold core", "plane folds", "polyhedral kaleidoscope", "sphere-inversion box fold", "Apollonian sphere packing", "hyperbolic honeycomb", "Kleinian fold", "pseudo-Kleinian", "amazing surface", "kaliset", "tetrahedral KIFS", "Sierpinski octahedron", "icosahedral KIFS", "dodecahedral KIFS", "octahedral KIFS", "Menger sponge"],
    "bodyP": ["balls", "superquadrics", "octahedra", "hollow spheres", "tori", "chain links", "gyroid membrane", "Schwarz P surface", "Schwarz D surface", "Neovius surface", "Lidinoid", "blocks", "rod lattice", "crosses"],
    # chain stages in the labs' energy order (calm .. energetic, ORD_A..ORD_D in ChainLab2D)
    "chainAP": [None, "polar unwrap", "elliptic coordinates", "parabolic coordinates", "Farris wallpaper", "Farris frieze", "sunflower spirals", "quasicrystal", "Droste zoom", "Escher spiral Droste", "bipolar Droste", "hyperbolic Poincare tiling", "hyperbolic band", "hyperbolic half-plane", "sphere kaleidoscope", "log-polar spiral", "Archimedean spiral", "hyperbolic spiral", "rotating Riemann sphere", "breathing sphere", "Peirce quincuncial sphere", "Jacobi cn wallpaper", "Jacobi sn/dn wallpaper", "parabolic stream", "hyperbolic Moebius flow", "complex exponential", "cardioid coordinates", "Blaschke product", "wandering poles", "bipolar stream", "complex sine", "tan lattice", "zeta partial sum", "circle inversion", "Moebius stream", "loxodromic stream", "Newton map", "Julia map", "Mandelbrot map", "burning ship", "Phoenix Julia", "kaleidoscope", "tunnel"],
    "chainBP": [None, "mirror line", "p4m lattice", "kaleidoscope", "curved kaleidoscope", "Penrose mirror", "Ammann-Beenker mirror", "12-fold quasicrystal mirror", "p6m lattice", "Sierpinski fold", "Koch fold", "Levy C fold", "Pythagoras-tree fold", "Vicsek fold", "iterated fold", "Apollonian inversion fold"],
    "chainCP": [None, "lens", "fisheye", "blossom", "Farris rosette", "mirrored power", "Cayley transform", "Joukowski map", "spiral", "complex square", "inversion", "kaleidoscope", "tunnel"],
    "chainDP": [None, "turning", "bend", "shear wave", "wave interference", "curl flow", "cylinder flow", "dipole field", "twirl", "vortex pair", "vortex street", "Karman street", "Kelvin-Helmholtz rolls", "domain warp", "ripple"],
    "morphP": ["the first stage", "the symmetry", "the second map", "the warp"],
}

def pick(x, n):
    return min(int(x * n), n - 1)

def describe(v, dim):
    parts = []
    if dim == "3D":
        parts.append("%s of %s with %s" % (CLASSES["spaceP"][pick(v["spaceP"], 16)], CLASSES["bodyP"][pick(v["bodyP"], 14)],
                                          CLASSES["coreP"][pick(v["coreP"], 16)]))
    stages = [CLASSES[k][pick(v[k], len(CLASSES[k]))] for k in ["chainAP", "chainBP", "chainCP", "chainDP"]]
    parts.append({"3D": "coloured by ", "Tunnel": "a relief tunnel of "}.get(dim, "") + " -> ".join(s for s in stages if s))
    mp = v["morphP"]
    if mp >= 0.5:
        parts.append("every stage and the look walking on with the music")
    elif mp >= 0.15:
        parts.append("%s walking on with the music" % CLASSES["morphP"][min(int((mp - 0.15) / 0.35 * 4), 3)])
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
