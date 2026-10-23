# -*- coding: utf-8 -*-
"""The chain labs' stage classes in their energy order (calm .. energetic), as
the shaders pick them (position = pickStage(knob, len)).  Single source for
promote_likes.py (descriptions) and gen.py (the "// @chainclasses" lines the app
reads for the shader-info overlay, key v).  None = the identity."""
# Only the photos' own textures (asked 17.10.2026: the colours still did not please): the looks -- relief, contour
# lines, flow and glowing edges in the 2D labs, glowing rims, crests, iso lines and the relief bumps in the 3D labs,
# the tunnel and the slice -- and the colour field stay in the shaders but are never used; the look is the photo.
# gen.py hands the switch to the shaders (const bool chainPhotoOnly).  False brings everything back.
PHOTO_ONLY = True
STYLES = ['photo', 'relief', 'contour lines', 'flow', 'glowing edges']
CLASSES = {
    'spaceP': ['mirrored lattice', 'log-spherical Droste', 'twisted 3D Droste', 'icosahedral lattice', 'log-cylindrical Droste', 'polar ring tunnel', 'noise-warped lattice', '4D-rotated lattice', 'bent cells', 'gyroid-warped lattice', 'octahedral lattice', 'turning lattice', 'torus-wrapped world', 'hyperbolic half-space', 'rolled world', 'hexagonal lattice', 'twisted lattice', 'double helix', 'helix', 'inverted lattice'],
    'coreP': ['no fold core', 'octahedral KIFS', 'Sierpinski octahedron', 'twisted octahedral KIFS', 'polyhedral kaleidoscope', 'Mandelbulb', 'tetrahedral KIFS', 'icosahedral KIFS', 'plane folds', 'dodecahedral KIFS', 'Mandalay box', 'sphere-inversion box fold', 'Apollonian sphere packing', 'pseudo-Kleinian', 'Menger sponge', 'kaliset', 'cross-Menger', 'amazing surface', 'spherical KIFS', 'hyperbolic honeycomb', 'mixed Sierpinski', 'Kleinian fold'],
    'bodyP': ['pills', 'gears', 'twisted pillars', 'Steinmetz solids', 'balls', 'chain links', 'superquadrics', 'octahedra', 'blocks', 'Neovius surface', 'linked rings', 'icosahedra', 'hollow spheres', 'rhombic dodecahedra', 'Schwarz P surface', 'stellated octahedra', 'Schwarz D surface', 'tori', 'Lidinoid', 'crosses', 'gyroid membrane', 'rod lattice'],
    'chainAP': [None, 'Farris frieze', 'spherical harmonic fault', 'burning ship', 'Chirikov map', 'gingerbreadman map', 'cubic Julia', 'Weierstrass p', 'Jacobi sn/dn wallpaper', 'wandering poles', 'gamma function poles', 'Zaslavsky web', 'Bogdanov map', 'Henon map', 'Lozi map', 'Tinkerbell map', 'Ikeda map', 'Hopalong map', 'circle inversion', 'Farris wallpaper', 'kaleidoscope', 'complex sine', 'square root sheet', 'tan lattice', 'Mandelbrot map', 'Jacobi cn wallpaper', 'Ford circle inversion', 'Gumowski-Mira', 'bipolar Droste', 'Phoenix Julia', 'breathing sphere', 'Klein invariants', 'modular lambda function', 'polar unwrap', 'rose fold', 'Blaschke product', 'hyperbolic Droste', 'quasicrystal', 'Schwarz-Christoffel hexagon', 'Chebyshev fold', 'hyperbolic band', 'hyperbolic half-plane', 'Newton map', 'magnet map', 'complex exponential', 'Julia map', 'Moebius stream', 'sunflower spirals', 'cardioid coordinates', 'zeta partial sum', 'Cassini ovals', 'lemniscate coordinates', 'Peirce quincuncial sphere', 'rotating Mercator', 'hyperbolic spiral', 'Escher spiral Droste', 'loxodromic stream', 'Archimedean spiral', 'epitrochoid unrolling', 'hyperbolic Moebius flow', 'elliptic coordinates', 'theta wave', 'parabolic stream', 'little planet', 'Droste zoom', 'parabolic coordinates', 'rotating Riemann sphere', 'log-polar spiral', 'sphere kaleidoscope', 'tunnel', 'bipolar stream', 'hyperbolic Poincare tiling'],
    'chainBP': [None, 'mirror line', 'tent map fold', 'origami folds', 'curved kaleidoscope', 'Whitney cusp fold', 'p4m lattice', 'p6m lattice', 'Sierpinski fold', 'Cantor mirror', 'Pythagoras-tree fold', 'Fibonacci-word mirror', 'Pappus chain', 'Steiner kaleidoscope', 'Vicsek fold', 'Thue-Morse mirror', 'Levy C fold', 'Heighway dragon fold', 'kaleidoscope', 'Ammann-Beenker mirror', 'Penrose mirror', '12-fold quasicrystal mirror', 'spiral kaleidoscope', 'polar tent fold', 'Schottky mirror', 'modular group mirror', 'Koch fold', 'Gosper flake fold', 'iterated fold', 'cat map fold', 'Apollonian inversion fold', 'KIFS triangle fold', 'p3m1 triangle mirror'],
    'chainCP': [None, 'lens', 'Veselago lens', 'cylinder lens', 'zone lens', 'axicon', 'Fresnel step lens', 'Farris rosette', 'compound eye lens', 'fisheye', 'Luneburg lens', 'Maxwell fish eye', 'gravitational lens', 'binary lens', 'Lorentz boost', 'lower mirage', 'blossom', 'inversion', 'Joukowski map', 'kaleidoscope', 'log vortex', 'Cayley transform', 'mirrored power', 'complex square', 'spiral', 'tunnel'],
    'chainDP': [None, 'turning', 'Langmuir cells', 'bend', 'Ekman spiral', 'convection cells', 'cylinder flow', 'curl flow', 'dipole field', 'twirl', 'Kelvin-Helmholtz rolls', 'Lamb-Oseen vortex row', 'vortex pair', 'Kida vortex', 'Taylor-Green vortices', 'domain warp', 'wave interference', 'Faraday standing waves', 'KdV soliton train', 'double gyre', 'ripple', 'capillary ring waves', 'Gerstner waves', 'Airy wave packet', 'vortex street', 'Karman street', 'gravitational wave', 'shear wave'],
    'styleP': STYLES[:1] if PHOTO_ONLY else STYLES,
    'orderP': ['A → B → C → D', 'A → B → D → C', 'A → C → B → D', 'A → C → D → B', 'A → D → B → C', 'A → D → C → B', 'B → A → C → D', 'B → A → D → C', 'B → C → A → D', 'B → C → D → A', 'B → D → A → C', 'B → D → C → A', 'C → A → B → D', 'C → A → D → B', 'C → B → A → D', 'C → B → D → A', 'C → D → A → B', 'C → D → B → A', 'D → A → B → C', 'D → A → C → B', 'D → B → A → C', 'D → B → C → A', 'D → C → A → B', 'D → C → B → A'],
}

# Classes the tunnel lab leaves out: they iterate (loops per pixel), and the
# tunnel runs its chain in every march step -- with them it fell to ~30 fps.
TUNNEL_EXCLUDE = {
    "chainAP": {"Tinkerbell map", "Lozi map", "Hopalong map", "gingerbreadman map", "Bogdanov map", "Schwarz-Christoffel hexagon", "modular lambda function", "Ford circle inversion", "gamma function poles", "hyperbolic Poincare tiling", "hyperbolic band", "hyperbolic half-plane", "hyperbolic Droste",
                "sphere kaleidoscope", "Peirce quincuncial sphere", "Jacobi cn wallpaper", "Jacobi sn/dn wallpaper",
                "Weierstrass p", "zeta partial sum", "Mandelbrot map", "burning ship", "Phoenix Julia", "Julia map",
                "cubic Julia", "Newton map", "magnet map", "Henon map", "Ikeda map", "Chirikov map", "Gumowski-Mira",
                "Zaslavsky web", "Klein invariants", "theta wave", "Blaschke product", "wandering poles",
                "Farris wallpaper", "Farris frieze", "quasicrystal"},
    "chainBP": {"Heighway dragon fold", "Gosper flake fold", "Cantor mirror", "tent map fold", "cat map fold", "KIFS triangle fold", "Thue-Morse mirror", "Apollonian inversion fold", "Sierpinski fold", "Koch fold", "Levy C fold", "Pythagoras-tree fold",
                "Vicsek fold", "Penrose mirror", "Ammann-Beenker mirror", "12-fold quasicrystal mirror",
                "modular group mirror", "Schottky mirror"},
    "chainCP": set(),
    "chainDP": {"capillary ring waves", "KdV soliton train", "Lamb-Oseen vortex row", "Karman street", "vortex street", "curl flow", "domain warp", "double gyre", "Taylor-Green vortices"},
}
# The quasicrystal mirrors are too heavy for the 3D lab's colour chain (up to
# six evaluations per pixel): 49-59 fps with them, 117 without.
LAB3D_EXCLUDE = {"chainAP": {"Schwarz-Christoffel hexagon", "Ford circle inversion", "modular lambda function"},
                "chainBP": {"Penrose mirror", "Ammann-Beenker mirror", "12-fold quasicrystal mirror", "Thue-Morse mirror", "Cantor mirror"},
                "chainDP": {"Lamb-Oseen vortex row", "capillary ring waves"}}
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
SPARKLE_ALIAS = 0.0075        # 03.10.: the top ~8 % (9 of 119), 2-3/255 of change
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
