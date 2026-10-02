# -*- coding: utf-8 -*-
"""The chain labs' stage classes in their energy order (calm .. energetic), as
the shaders pick them (position = pickStage(knob, len)).  Single source for
promote_likes.py (descriptions) and gen.py (the "// @chainclasses" lines the app
reads for the shader-info overlay, key v).  None = the identity."""
CLASSES = {
    'spaceP': ['mirrored lattice', 'octahedral lattice', 'icosahedral lattice', 'hexagonal lattice', 'rolled world', '4D-rotated lattice', 'log-spherical Droste', 'twisted 3D Droste', 'log-cylindrical Droste', 'turning lattice', 'bent cells', 'torus-wrapped world', 'hyperbolic half-space', 'twisted lattice', 'gyroid-warped lattice', 'noise-warped lattice', 'helix', 'double helix', 'inverted lattice', 'polar ring tunnel'],
    'coreP': ['no fold core', 'plane folds', 'polyhedral kaleidoscope', 'sphere-inversion box fold', 'spherical KIFS', 'Apollonian sphere packing', 'Mandalay box', 'hyperbolic honeycomb', 'Kleinian fold', 'pseudo-Kleinian', 'amazing surface', 'Mandelbulb', 'kaliset', 'tetrahedral KIFS', 'mixed Sierpinski', 'Sierpinski octahedron', 'icosahedral KIFS', 'dodecahedral KIFS', 'octahedral KIFS', 'twisted octahedral KIFS', 'Menger sponge', 'cross-Menger'],
    'bodyP': ['balls', 'pills', 'superquadrics', 'octahedra', 'rhombic dodecahedra', 'icosahedra', 'hollow spheres', 'tori', 'chain links', 'linked rings', 'gyroid membrane', 'Schwarz P surface', 'Schwarz D surface', 'Neovius surface', 'Lidinoid', 'blocks', 'twisted pillars', 'rod lattice', 'stellated octahedra', 'Steinmetz solids', 'crosses', 'gears'],
    'chainAP': [None, 'Farris frieze', 'burning ship', 'Chirikov map', 'cubic Julia', 'Weierstrass p', 'Jacobi sn/dn wallpaper', 'wandering poles', 'Zaslavsky web', 'Henon map', 'Ikeda map', 'circle inversion', 'Farris wallpaper', 'kaleidoscope', 'complex sine', 'tan lattice', 'Mandelbrot map', 'Jacobi cn wallpaper', 'Gumowski-Mira', 'bipolar Droste', 'Phoenix Julia', 'breathing sphere', 'Klein invariants', 'polar unwrap', 'Blaschke product', 'hyperbolic Droste', 'quasicrystal', 'Chebyshev fold', 'hyperbolic band', 'hyperbolic half-plane', 'Newton map', 'magnet map', 'complex exponential', 'Julia map', 'Moebius stream', 'sunflower spirals', 'cardioid coordinates', 'zeta partial sum', 'Cassini ovals', 'Peirce quincuncial sphere', 'rotating Mercator', 'hyperbolic spiral', 'Escher spiral Droste', 'loxodromic stream', 'Archimedean spiral', 'hyperbolic Moebius flow', 'elliptic coordinates', 'theta wave', 'parabolic stream', 'little planet', 'Droste zoom', 'parabolic coordinates', 'rotating Riemann sphere', 'log-polar spiral', 'sphere kaleidoscope', 'tunnel', 'bipolar stream', 'hyperbolic Poincare tiling'],
    'chainBP': [None, 'mirror line', 'origami folds', 'curved kaleidoscope', 'p4m lattice', 'p6m lattice', 'Sierpinski fold', 'Pythagoras-tree fold', 'Pappus chain', 'Steiner kaleidoscope', 'Vicsek fold', 'Levy C fold', 'kaleidoscope', 'Ammann-Beenker mirror', 'Penrose mirror', '12-fold quasicrystal mirror', 'spiral kaleidoscope', 'Schottky mirror', 'modular group mirror', 'Koch fold', 'iterated fold', 'Apollonian inversion fold', 'p3m1 triangle mirror'],
    'chainCP': [None, 'lens', 'zone lens', 'Farris rosette', 'fisheye', 'gravitational lens', 'binary lens', 'Lorentz boost', 'blossom', 'inversion', 'Joukowski map', 'kaleidoscope', 'log vortex', 'Cayley transform', 'mirrored power', 'complex square', 'spiral', 'tunnel'],
    'chainDP': [None, 'turning', 'bend', 'convection cells', 'cylinder flow', 'curl flow', 'dipole field', 'twirl', 'Kelvin-Helmholtz rolls', 'vortex pair', 'Taylor-Green vortices', 'domain warp', 'wave interference', 'double gyre', 'ripple', 'Gerstner waves', 'vortex street', 'Karman street', 'gravitational wave', 'shear wave'],
    'styleP': ['photo', 'relief', 'contour lines', 'flow', 'glowing edges'],
    'orderP': ['A → B → C → D', 'A → B → D → C', 'A → C → B → D', 'A → C → D → B', 'A → D → B → C', 'A → D → C → B', 'B → A → C → D', 'B → A → D → C', 'B → C → A → D', 'B → C → D → A', 'B → D → A → C', 'B → D → C → A', 'C → A → B → D', 'C → A → D → B', 'C → B → A → D', 'C → B → D → A', 'C → D → A → B', 'C → D → B → A', 'D → A → B → C', 'D → A → C → B', 'D → B → A → C', 'D → B → C → A', 'D → C → A → B', 'D → C → B → A'],
}

# Classes the tunnel lab leaves out: they iterate (loops per pixel), and the
# tunnel runs its chain in every march step -- with them it fell to ~30 fps.
TUNNEL_EXCLUDE = {
    "chainAP": {"hyperbolic Poincare tiling", "hyperbolic band", "hyperbolic half-plane", "hyperbolic Droste",
                "sphere kaleidoscope", "Peirce quincuncial sphere", "Jacobi cn wallpaper", "Jacobi sn/dn wallpaper",
                "Weierstrass p", "zeta partial sum", "Mandelbrot map", "burning ship", "Phoenix Julia", "Julia map",
                "cubic Julia", "Newton map", "magnet map", "Henon map", "Ikeda map", "Chirikov map", "Gumowski-Mira",
                "Zaslavsky web", "Klein invariants", "theta wave", "Blaschke product", "wandering poles",
                "Farris wallpaper", "Farris frieze", "quasicrystal"},
    "chainBP": {"Apollonian inversion fold", "Sierpinski fold", "Koch fold", "Levy C fold", "Pythagoras-tree fold",
                "Vicsek fold", "Penrose mirror", "Ammann-Beenker mirror", "12-fold quasicrystal mirror",
                "modular group mirror", "Schottky mirror"},
    "chainCP": set(),
    "chainDP": {"Karman street", "vortex street", "curl flow", "domain warp", "double gyre", "Taylor-Green vortices"},
}
# The quasicrystal mirrors are too heavy for the 3D lab's colour chain (up to
# six evaluations per pixel): 49-59 fps with them, 117 without.
LAB3D_EXCLUDE = {"chainBP": {"Penrose mirror", "Ammann-Beenker mirror", "12-fold quasicrystal mirror"}}
def subset_names(knob, exclude):
    return [n for n in CLASSES[knob] if n not in exclude.get(knob, set())]
def tunnel_classes(knob):
    return subset_names(knob, TUNNEL_EXCLUDE)
# Classes that stream the picture into (or out of) a point without end: the
# tunnel, the Droste zooms, the log-polar spirals and the pole streams.  Their
# centre is a dark opening the eye keeps flying into, and with two of them in
# one chain nearly every roll read as a tunnel.  (Rosettes and kaleidoscopes
# have a centre too, but a still one -- they are not in this list.)  The app
# lets at most one stage of a flat lab (2D lab, FxChain) hold such a class --
# at the roll and on every walk step -- from the "// @chainopening" lines gen.py
# writes (positions in the lists above).
OPENING = {
    "chainAP": {"Droste zoom", "Escher spiral Droste", "bipolar Droste", "hyperbolic Droste", "log-polar spiral",
                "hyperbolic spiral", "parabolic stream", "hyperbolic Moebius flow", "bipolar stream",
                "loxodromic stream", "tunnel"},
    "chainBP": set(),
    "chainCP": {"spiral", "tunnel"},
    "chainDP": set(),
}
def opening_positions(knob, names):
    return [i for i, n in enumerate(names) if n in OPENING.get(knob, set())]

# The classes that sparkle: their aliasing (Tools/chain_class_stats.py --alias,
# the mean luma change 2x2 supersampling makes, in class_stats.tsv) at least
# SPARKLE_ALIAS.  The app runs their chain on a doubled grid ("// @chainss").
SPARKLE_ALIAS = 0.03
def sparkling():
    """(stage, class name) of every class whose measured aliasing reaches SPARKLE_ALIAS."""
    import io, os
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "class_stats.tsv")
    if not os.path.exists(p):
        return set()
    lines = io.open(p, encoding="utf-8").read().splitlines()
    hdr = lines[0].split("\t")
    out = set()
    for l in lines[1:]:
        v = dict(zip(hdr, l.split("\t")))
        try:
            if float(v.get("alias") or 0) >= SPARKLE_ALIAS:
                out.add((v["stage"], v["class"]))
        except ValueError:
            pass
    return out
