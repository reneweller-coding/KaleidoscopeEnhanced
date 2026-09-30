# -*- coding: utf-8 -*-
"""The chain labs' stage classes in their energy order (calm .. energetic), as
the shaders pick them (position = pickStage(knob, len)).  Single source for
promote_likes.py (descriptions) and gen.py (the "// @chainclasses" lines the app
reads for the shader-info overlay, key v).  None = the identity."""
CLASSES = {
    'spaceP': ['mirrored lattice', 'octahedral lattice', 'icosahedral lattice', 'hexagonal lattice', 'rolled world', '4D-rotated lattice', 'log-spherical Droste', 'twisted 3D Droste', 'log-cylindrical Droste', 'turning lattice', 'bent cells', 'torus-wrapped world', 'hyperbolic half-space', 'twisted lattice', 'gyroid-warped lattice', 'noise-warped lattice', 'helix', 'double helix', 'inverted lattice', 'polar ring tunnel'],
    'coreP': ['no fold core', 'plane folds', 'polyhedral kaleidoscope', 'sphere-inversion box fold', 'spherical KIFS', 'Apollonian sphere packing', 'Mandalay box', 'hyperbolic honeycomb', 'Kleinian fold', 'pseudo-Kleinian', 'amazing surface', 'Mandelbulb', 'kaliset', 'tetrahedral KIFS', 'mixed Sierpinski', 'Sierpinski octahedron', 'icosahedral KIFS', 'dodecahedral KIFS', 'octahedral KIFS', 'twisted octahedral KIFS', 'Menger sponge', 'cross-Menger'],
    'bodyP': ['balls', 'pills', 'superquadrics', 'octahedra', 'rhombic dodecahedra', 'icosahedra', 'hollow spheres', 'tori', 'chain links', 'linked rings', 'gyroid membrane', 'Schwarz P surface', 'Schwarz D surface', 'Neovius surface', 'Lidinoid', 'blocks', 'twisted pillars', 'rod lattice', 'stellated octahedra', 'Steinmetz solids', 'crosses', 'gears'],
    'chainAP': [None, 'polar unwrap', 'elliptic coordinates', 'parabolic coordinates', 'Cassini ovals', 'Farris wallpaper', 'Farris frieze', 'sunflower spirals', 'quasicrystal', 'Droste zoom', 'Escher spiral Droste', 'little planet', 'rotating Mercator', 'bipolar Droste', 'hyperbolic Droste', 'hyperbolic Poincare tiling', 'hyperbolic band', 'hyperbolic half-plane', 'sphere kaleidoscope', 'Klein invariants', 'log-polar spiral', 'Archimedean spiral', 'hyperbolic spiral', 'rotating Riemann sphere', 'breathing sphere', 'Peirce quincuncial sphere', 'magnet map', 'Jacobi cn wallpaper', 'theta wave', 'Jacobi sn/dn wallpaper', 'Weierstrass p', 'parabolic stream', 'hyperbolic Moebius flow', 'Chebyshev fold', 'complex exponential', 'cardioid coordinates', 'Blaschke product', 'wandering poles', 'bipolar stream', 'complex sine', 'tan lattice', 'zeta partial sum', 'circle inversion', 'Moebius stream', 'loxodromic stream', 'Newton map', 'Julia map', 'Zaslavsky web', 'Gumowski-Mira', 'Chirikov map', 'Henon map', 'Ikeda map', 'Mandelbrot map', 'burning ship', 'Phoenix Julia', 'cubic Julia', 'kaleidoscope', 'tunnel'],
    'chainBP': [None, 'mirror line', 'origami folds', 'p4m lattice', 'p3m1 triangle mirror', 'kaleidoscope', 'spiral kaleidoscope', 'curved kaleidoscope', 'Steiner kaleidoscope', 'Penrose mirror', 'Ammann-Beenker mirror', '12-fold quasicrystal mirror', 'modular group mirror', 'p6m lattice', 'Sierpinski fold', 'Koch fold', 'Levy C fold', 'Pappus chain', 'Pythagoras-tree fold', 'Vicsek fold', 'iterated fold', 'Apollonian inversion fold', 'Schottky mirror'],
    'chainCP': [None, 'lens', 'zone lens', 'fisheye', 'Lorentz boost', 'blossom', 'Farris rosette', 'mirrored power', 'Cayley transform', 'gravitational lens', 'binary lens', 'Joukowski map', 'spiral', 'log vortex', 'complex square', 'inversion', 'kaleidoscope', 'tunnel'],
    'chainDP': [None, 'turning', 'bend', 'shear wave', 'Gerstner waves', 'wave interference', 'convection cells', 'curl flow', 'cylinder flow', 'dipole field', 'Taylor-Green vortices', 'twirl', 'vortex pair', 'double gyre', 'vortex street', 'Karman street', 'gravitational wave', 'Kelvin-Helmholtz rolls', 'domain warp', 'ripple'],
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
