# -*- coding: utf-8 -*-
"""Doxygen comments for the shaders: the shared uniforms, the library helpers and the existing explanations.

Doxygen reads the shaders as C++ (Doxyfile EXTENSION_MAPPING).  The scenes had
their @file/@brief header but tens of thousands of undocumented members --
almost all the same few names in every file (time, audioSwell, tex0, main,
hash21, imgLod ...).  This tool documents them mechanically, without touching
any code:

  1. A plain // comment block directly above a top-level function becomes ///
     (Doxygen ignores //, but the explanation was there).
  2. A trailing // comment after a single top-level declaration becomes ///<.
  3. A top-level declaration without a comment, of a name in VARS, gets ///<.
  4. A top-level function without a comment above, of a name in FUNCS (and
     main), gets a /// @brief line.
  5. A top-level layout(...) in/out; line gets a /// line (Doxygen reads it as a function).

Only comments are added or turned into doc comments; the GLSL is unchanged.
Idempotent.  gen.py runs annotate() on every scene it builds.

  python Tools/doc_shaders.py            # every shader under Scene2D, Scene3D, FX, Transitions, Engine
  python Tools/doc_shaders.py --check    # only count what would change
"""
import argparse, io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIRS = ["Scene2D", "Scene3D", "FX", "Transitions", "Engine"]
EXT = (".frag", ".vert", ".comp", ".tesc", ".tese", ".geom")

# ---- the shared uniforms, varyings and globals --------------------------------
VARS = {
    "time": "Seconds since the program started (never reset; see sceneTime).",
    "sceneTime": "Seconds since this scene was activated.",
    "sceneAdvance": "The music's advance since this scene was activated (integrated, never jumps).",
    "sceneProgress": "Progress through this scene's solo time, 0..1.",
    "sceneSeed": "A random number fixed per activation.",
    "resolution": "Size of the render target in pixels.",
    "fragColor": "The pixel's colour (output).",
    "tex0": "The current photo.",
    "tex1": "The next photo (cross-faded in by interpolation).",
    "interpolation": "Cross-fade between the photos: 1 = tex0, 0 = tex1.",
    "audioAdvance": "The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).",
    "audioPhase": "Rotation phase driven by the music (integrated, never jumps).",
    "audioLevel": "Overall loudness, 0..1.",
    "audioSwell": "Slow loudness envelope, 0..1 (seconds).",
    "audioKick": "Kick-drum envelope, 0..1 (fast attack, short decay).",
    "audioBeat": "Beat envelope, 0..1.",
    "audioBeatPhase": "Position within the current beat, 0..1.",
    "audioBarPhase": "Position within the current bar, 0..1.",
    "audioOnset": "Onset envelope (any instrument), 0..1.",
    "audioDrop": "Drop envelope: high after a detected drop, decaying.",
    "audioBass": "Bass band level, 0..1.",
    "audioSubBass": "Sub-bass band level, 0..1.",
    "audioMid": "Mid band level, 0..1.",
    "audioHigh": "High band level, 0..1.",
    "audioCentroid": "Spectral centroid (brightness of the sound), 0..1.",
    "audioFlux": "Spectral flux (how fast the spectrum changes), 0..1.",
    "audioSpread": "Spectral spread, 0..1.",
    "audioRoughness": "Roughness (dissonance) of the sound, 0..1.",
    "audioMode": "Mode of the music: 0 minor .. 1 major.",
    "audioValence": "Mood valence: 0 dark .. 1 bright.",
    "audioAmbient": "How ambient (sustained, beatless) the music is, 0..1.",
    "audioChromaHue": "Hue of the dominant pitch class (radians, unwrapped: continuous).",
    "audioChroma": "Pitch-class energies (12 values).",
    "audioSpectrum": "Spectrum bands, 0..1.",
    "hueP": "Hue knob (radians), usually the music's chroma hue plus a rolled offset.",
    "speedP": "Speed knob, 0..1.",
    "detailP": "Detail knob, 0..1.",
    "styleP": "Look knob, 0..1.",
    "paletteP": "Palette knob: photo colours .. colour field, 0..1.",
    "glowP": "Glow / afterglow knob, 0..1.",
    "tiltP": "Tilt knob, 0..1.",
    "sizeP": "Size knob, 0..1.",
    "densityP": "Density knob, 0..1.",
    "spinP": "Spin knob, 0..1.",
    "zoomP": "Zoom knob, 0..1.",
    "scaleP": "Scale knob.",
    "widthP": "Width knob, 0..1.",
    "photoP": "Photo knob: how much of the photo shows, 0..1.",
    "morphP": "Morph knob: how the scene changes over time, 0..1.",
    "camP": "Camera knob, 0..1.",
    "camHP": "Camera height knob, 0..1.",
    "projM": "Projection matrix.",
    "eyeOff": "Stereo eye offset (0 in mono).",
    "gT": "The chain's (or scene's) time this frame.",
    "gRot": "The rotation phase this frame.",
    "gSpread": "The spectral spread this frame, 0..1.",
    "PI": "Pi.",
    "TAU": "Two pi.",
    "maxVertices": "Capacity of the vertex buffer (compute stage).",
    "meshVertexCount": "Vertices of the scene's mesh.",
    "meshExtent": "Half size of the scene's mesh bounding box.",
    "meshCenter": "Centre of the scene's mesh bounding box.",
    "texMeshMaterial": "The mesh's material textures (albedo, roughness, normal ...).",
    "texMeshMaterialLayers": "Number of layers in texMeshMaterial.",
    "texPrevFrame": "The last frame, fully composited (feedback).",
    "vUV": "Texture coordinate 0..1 over the screen (from the vertex stage).",
    "vNormal": "Surface normal (from the vertex stage).",
    "vPos": "Position (from the vertex stage).",
    "vWorld": "World position (from the vertex stage).",
    "vWorldPos": "World position (from the vertex stage).",
    "vView": "View vector (from the vertex stage).",
    "vCol": "Colour (from the vertex stage).",
    "vTexCoord": "Texture coordinate (from the vertex stage).",
    "vDepth": "Depth (from the vertex stage).",
    "vDist": "Distance (from the vertex stage).",
    "vLocal": "Object-space position (from the vertex stage).",
    "vLocalPos": "Object-space position (from the vertex stage).",
    "vObj": "Object-space position (from the vertex stage).",
    "vSeed": "Per-instance random seed (from the vertex stage).",
    "vId": "Instance or element id (from the vertex stage).",
    "vKind": "Element kind (from the vertex stage).",
    "vSide": "Which side of a strip (from the vertex stage).",
    "vBg": "Background flag (from the vertex stage).",
    "attrA": "Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).",
    "attrB": "Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).",
    "gMw": "The chain's morph position this frame (integrated).",
    "gChainM": "The mirrored chain coordinate of this pixel.",
    "gChainDx": "Its screen derivative in x.",
    "gChainDy": "Its screen derivative in y.",
    "audioHarmChange": "Harmonic change (chord change) envelope, 0..1.",
    "audioMelodyPitch": "Pitch of the melody, 0..1 over the tracked range.",
    "audioBuildUp": "Build-up toward a drop, 0..1.",
    "audioSnare": "Snare envelope, 0..1.",
    "nearFar": "Near and far clip distances.",
    "lightM": "Light view-projection matrix (shadow map).",
    "shadowPass": "1 during the shadow map's depth-only pass.",
    "oitPass": "Order-independent transparency pass flag.",
    "meshInstances": "Number of mesh instances.",
    "size": "Size of the simulation grid in cells.",
    "waveP": "Wave knob.",
    "twistP": "Twist knob, 0..1.",
    "tintP": "Tint knob, 0..1.",
    "specularP": "Specular knob, 0..1.",
    "densP": "Density knob, 0..1.",
    "bandP": "Band knob, 0..1.",
    "camDistP": "Camera distance knob, 0..1.",
    "heightP": "Height knob, 0..1.",
    "depthP": "Depth knob, 0..1.",
    "foldP": "Fold knob, 0..1.",
    "swirlP": "Swirl knob, 0..1.",
    "pitchP": "Pitch knob, 0..1.",
    "cellP": "Cell size knob, 0..1.",
    "gridP": "Grid knob, 0..1.",
    "branchP": "Branching knob, 0..1.",
    "layerP": "Layer knob, 0..1.",
    "radiusP": "Radius knob, 0..1.",
    "ringP": "Ring knob, 0..1.",
    "lensP": "Lens knob, 0..1.",
    "spreadP": "Spread knob, 0..1.",
    "spaceP": "Space class knob of the 3D chain, 0..1.",
    "coreP": "Fold core class knob of the 3D chain, 0..1.",
    "bodyP": "Body class knob of the 3D chain, 0..1.",
    "chainAP": "Stage A class knob of the chain (global map), 0..1.",
    "chainBP": "Stage B class knob (symmetry), 0..1.",
    "chainCP": "Stage C class knob (second map), 0..1.",
    "chainDP": "Stage D class knob (warp), 0..1.",
    "orderP": "Order of the chain's four stages (one of 24), 0..1.",
    "solidP": "Solid-texture knob, 0..1.",
    "reliefP": "Relief knob, 0..1.",
    "walkHost": "1 when the app walks this lab's stages (walk uniforms valid).",
    "camHost": "1 when the app drives the camera (camZ, camGaze).",
    "camZ": "Flight position along the camera path (integrated by the app).",
    "camGaze": "Gaze shown, gaze panned to, pan progress.",
}

# ---- the library helpers ----------------------------------------------------------
FUNCS = {
    "main": "Entry point of this shader stage (the file description says what it draws).",
    "img": "The photo at a coordinate: the cross-fade of tex0 and tex1.",
    "imgLod": "The photo at a mip level, mirrored at its edges: lod 0 full detail, ~4 a soft field, ~7 broad masses.",
    "imgPal": "A colour of the photo along a slowly wandering arc (palette lookup).",
    "imgPalette": "The house palette: a colour of the photo on an arc that turns with the music's hue.",
    "palTint": "Tints a colour toward the house palette at t, keeping its brightness.",
    "hue2rgb": "A hue as a colour (the house palette).",
    "hsv2rgb": "HSV (all 0..1) to RGB.",
    "hue_of": "Hue of a colour, 0..1.",
    "satOf": "Saturation of a colour, 0..1.",
    "luma": "Luminance of a colour (Rec. 601 weights).",
    "hueRot": "Rotates a colour's hue by an angle (about the grey axis).",
    "glowColour": "A glowing colour for a place: the photo's own hue where it has one, a wandering hue field where it is grey.",
    "neonOf": "A colour normalised to its maximum and raised to a power: a saturated neon of it.",
    "finish": "Writes the pixel: loudness brightness and a soft highlight roll-off.",
    "screenP": "The pixel's position, centred and aspect-corrected (y spans -0.5..0.5).",
    "mirrorUV": "Mirrored repeat of a coordinate into 0..1 (seamless at every edge).",
    "imgScroll": "The photo along an endless scroll in y, without visible mirror seams.",
    "texHeight": "The photo's luma as a height, blended between a broad and a finer mip level.",
    "texGrad": "Gradient of the photo's luma at a mip level (per UV unit).",
    "texEdge": "Edge strength of the photo at a mip level.",
    "kaleidoUV": "A kaleidoscope of the coordinate around a slowly wandering centre.",
    "spiralUV": "A log-polar spiral of the coordinate (an endless zoom).",
    "imgK": "The photo through the scene's kaleidoscope.",
    "imgKGrad": "Gradient of the kaleidoscoped photo's luma.",
    "imgKEdge": "Edge strength of the kaleidoscoped photo.",
    "imgKLap": "Laplacian of the kaleidoscoped photo's luma (ridges and valleys).",
    "imgKRelief": "The kaleidoscoped photo lit as a relief from a direction, 0..1.",
    "hash11": "Pseudo-random number 0..1 from a float.",
    "hash21": "Pseudo-random number 0..1 from a 2D point.",
    "hash31": "Pseudo-random number 0..1 from a 3D point.",
    "hash13": "Pseudo-random number 0..1 from a 3D point.",
    "hash22": "Pseudo-random 2D vector (each 0..1) from a 2D point.",
    "noise": "Smooth value noise.",
    "noise2": "Smooth 2D value noise, 0..1.",
    "noise3": "Smooth 3D value noise, 0..1.",
    "fbm": "Fractal noise: octaves of value noise.",
    "fbm3": "Fractal noise of three octaves, 0..1.",
    "sdSeg": "Distance from a point to a line segment.",
    "smin": "Smooth minimum of two distances (blend width k).",
    "rot": "2D rotation matrix.",
    "rot2": "2D rotation matrix.",
    "rot2D": "2D rotation matrix.",
    "cexpi": "The complex number e^(i a).",
    "cmul": "Complex multiplication.",
    "cdiv": "Complex division.",
    "csin": "Complex sine.",
    "ccos": "Complex cosine.",
    "chain": "The scene's chain of transforms: a coordinate in, the transformed coordinate out.",
    "imgChain": "The photo through the chain, with its footprint-correct mip level and the luma gradient.",
    "blend4": "Mixes two RGBA values with a clamped weight.",
    "calcNormal": "Surface normal of the distance field by central differences.",
    "cotangentFrame": "Tangent frame from screen derivatives (normal mapping without tangents).",
    "perturbNormal": "The normal tilted by the material's normal map.",
    "materialExposure": "Exposure that brings the material's average brightness to a common level.",
    "renderSky": "The sky colour for a direction.",
    "writeVertex": "Writes one vertex into the output buffer (compute stage).",
    "emitQuad": "Appends a camera-facing quad (two triangles) to the output buffer (compute stage).",
    "tRot": "Rotation of the coordinate about c by a.",
    "tSpiral": "Log-polar spiral about c (arms, scale; zoom runs it inward): an endless zoom.",
    "tMobius": "Moebius map streaming the plane from pole pa to pole pb.",
    "tSquare": "The coordinate squared in the complex plane about c (every angle doubled).",
    "tInvert": "Circle inversion about c with radius R.",
    "tTwirl": "Twirl about c: rotation that fades out with the radius.",
    "tWarp": "Flowing domain warp by noise (strength, time).",
    "tFold": "Iterated fractal fold (angle, scale, iterations).",
    "tP4m": "Square mirror lattice (wallpaper group p4m) with the given cells.",
    "tSin": "Complex sine of the coordinate about c (a periodic lattice of the photo).",
    "tWave": "Sine wave displacement (frequency, amplitude, time).",
    "tKaleido": "Kaleidoscope about c with n mirrors, turned by a.",
    "tPoincare": "Hyperbolic {p,q} tiling of the Poincare disc about c (zoom, move: hyperbolic drift).",
    "tFarris": "Farris wallpaper (a symmetric wave pattern) about c.",
    "farrisWave": "One Farris wave term of a wallpaper symmetry.",
    "hexWave3": "Three-fold (hexagonal) wave term for the Farris wallpapers.",
    "sqWave4": "Four-fold (square) wave term for the Farris wallpapers.",
    "tRosette": "Farris rosette: a p-fold symmetric wave pattern about c.",
    "cnTheta": "Numerator and denominator of the Jacobi cn function via theta series.",
    "penroseFind": "Finds the Penrose rhomb a point lies in (de Bruijn pentagrid).",
    "pentG": "Pentagrid offset of family j.",
    "pentE": "Direction of pentagrid family j.",
    "multiGridFind": "Finds the rhomb a point lies in (de Bruijn multigrid of N families).",
    "gridE": "Direction of multigrid family j.",
    "gridG": "Offset of multigrid family j.",
    "tQuasiMirror": "Quasicrystal mirror of N-fold symmetry about c.",
    "tSphereKaleido": "The plane as a sphere, folded by a spherical kaleidoscope.",
    "tGumowski": "Gumowski-Mira map iterated on the coordinate (a chaotic web).",
    "tHex": "Six-fold mirror lattice (p6m) of the given cell count.",
    "tPolar": "Polar unwrap: angle and radius as the coordinate.",
    "tTunnel": "Tunnel: angle and inverse radius as the coordinate (an endless flight in).",
    "tExp": "Complex exponential of the coordinate (spirals and rings).",
    "tRipple": "Ripple displacement around a centre.",
    "tLens": "Lens bulge about a centre.",
    "tDroste": "Droste effect: the picture repeated inside itself, zooming.",
    "tMirrorLine": "Mirror across a line.",
    "tBipolar": "Bipolar coordinates of two foci.",
    "tJoukowski": "Joukowski map (the aerofoil map).",
    "map": "The scene's distance field: distance from p to the nearest surface.",
    "sdBox": "Signed distance to a box of half size b.",
    "sdBox3": "Signed distance to a box of half size b.",
    "sdTorus3": "Signed distance to a torus (ring radius R, tube radius r).",
    "sdOcta3": "Signed distance bound to an octahedron of size s.",
    "sdTetra3": "Signed distance bound to a tetrahedron of size s.",
    "sdIcosa3": "Signed distance bound to an icosahedron of size s.",
    "sdGyroid3": "Distance bound to a gyroid sheet of the given thickness.",
    "sdNeovius": "Distance bound to a Neovius minimal surface sheet.",
    "sdLidinoid": "Distance bound to a Lidinoid minimal surface sheet.",
    "sdSuperquad": "Distance bound to a superquadric (exponent e).",
    "fRot": "Rotation of p about an axis.",
    "fAbs": "Mirror fold in all three axes.",
    "fSphere": "Sphere-inversion fold (Mandelbox style).",
    "fScale": "Scale and offset step of a fold (tracks the distance derivative gDR).",
    "fRollZ": "The world rolled round the z axis.",
    "fbm2": "Fractal noise of the given number of octaves.",
    "vnoise": "Value noise with a seed.",
    "starsField": "Star field brightness for a direction.",
    "hash1": "Pseudo-random number 0..1 from a float.",
    "hash3": "Pseudo-random vec3 (each 0..1) from a float.",
    "hsh": "Pseudo-random number 0..1 from two values and a seed.",
    "pcg": "PCG random step: advances the state, returns 32 random bits.",
    "rnd": "Random number 0..1 from a PCG state.",
    "kaleido": "Kaleidoscope fold of the coordinate with the given mirrors.",
    "emitSegment": "Appends a thick line segment (two triangles) to the output buffer (compute stage).",
    "segDist": "Closest distance between a ray and a segment (and the ray parameter there).",
    "camPathXY": "The camera path's x/y offset at depth z.",
    "smaxK": "Smooth maximum of two distances (blend width k).",
    "fieldD": "The world's distance field with the flight tube carved out.",
    "gazeTurn": "Turns a direction by the gaze angles (yaw, pitch).",
    "normal3": "Surface normal of the world by a tetrahedron of differences.",
    "photoChain3": "The photo through the chain, projected on three planes (triplanar).",
    "noise1": "Smooth 1D value noise.",
    "lum": "Luminance of the photo at a coordinate.",
    "linearise": "Depth buffer value to linear distance.",
    "shadowAt": "Shadow factor from the shadow map at a world position.",
    "pickStage": "Class position of a knob value (n classes).",
    "subVar": "Sub-variant of a knob value within its class, 0..1.",
    "evenArms": "An even arm count 2..8 from a sub-variant (seamless with mirroring).",
    "sides": "A mirror count 5..9 from a sub-variant.",
    "hashT": "Pseudo-random number 0..1 from a 2D point.",
    "flatAt": "The flat (unlit) colour at a coordinate.",
    "levelFor": "Brightness level between two coordinates.",
}

TOP_DECL = re.compile(r"^((?:layout\s*\([^)]*\)\s*)?(?:(?:uniform|in|out|flat|smooth|noperspective|const|highp|mediump|lowp)\s+)*"
                      r"[A-Za-z_]\w*\s+([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*(?:=\s*[^;,]+)?;)(\s*)(//(?!/)\s?(.*))?\s*$")
TOP_FUNC = re.compile(r"^(?:[A-Za-z_]\w*\s+)+([A-Za-z_]\w*)\s*\(")
SECTION = re.compile(r"^//\s*(-{3,}|={3,}|@)")


def annotate(text, path=""):
    """Doc comments for one shader's text (see the module description); returns the new text."""
    nl = "\r\n" if "\r\n" in text else "\n"
    lines = text.replace("\r\n", "\n").split("\n")
    out = []
    in_block = False
    depth = 0
    stage_main = "Entry point of this shader stage (the file description says what it draws)."
    for i, l in enumerate(lines):
        s = l.strip()
        # block comments and the braces of functions: only top-level lines count
        if in_block:
            out.append(l)
            if "*/" in l:
                in_block = False
            continue
        if s.startswith("/*") and "*/" not in s:
            in_block = True
            out.append(l)
            continue
        code = l.split("//", 1)[0]
        if depth == 0 and re.match(r"^layout\s*\([^)]*\)\s*(in|out)\s*;", l):
            above = out[-1].strip() if out else ""
            if not above.startswith("//"):                       # rule 5: the stage's layout qualifiers
                out.append("/// Layout qualifiers of this stage (work-group size, or the primitive in or out).")
            out.append(l)
            continue
        if depth == 0 and not l.startswith((" ", "\t", "#")):
            m = TOP_DECL.match(l)
            if m and "," not in m.group(1):
                name, comment = m.group(2), m.group(5)
                if m.group(4) is not None:                       # rule 2: a trailing // becomes ///<
                    l = m.group(1) + m.group(3) + "///< " + (comment or "").strip()
                elif name in VARS:                               # rule 3
                    l = m.group(1) + "   ///< " + VARS[name]
            else:
                f = TOP_FUNC.match(l)
                prototype = code.rstrip().endswith(";") and "{" not in code   # a one-liner body has ';' too
                if f and not re.match(r"^(return|else|if|for|while|layout)\b", s) and not prototype:
                    name = f.group(1)
                    # rule 1: a // block directly above (no blank line) becomes ///
                    j = len(out) - 1
                    block = []
                    while j >= 0 and out[j].strip().startswith("//") and not out[j].strip().startswith("///") \
                            and not SECTION.match(out[j].strip()):
                        block.append(j)
                        j -= 1
                    above = out[len(out) - 1].strip() if out else ""
                    if block and not (j >= 0 and out[j].strip().startswith("///")):
                        for k in block:
                            out[k] = out[k].replace("//", "///", 1)
                    elif not above.startswith(("//", "*/", "*", "/**")) or SECTION.match(above):
                        doc = FUNCS.get(name)
                        if doc:                                   # rule 4
                            out.append("/// @brief " + (doc if name != "main" else stage_main))
        depth += code.count("{") - code.count("}")
        if depth < 0:
            depth = 0
        out.append(l)
    return nl.join(out)


def files():
    for d in DIRS:
        for base, _, names in os.walk(os.path.join(ROOT, d)):
            for n in names:
                if n.endswith(EXT):
                    yield os.path.join(base, n)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true", help="count the files that would change, write nothing")
    a = ap.parse_args()
    changed = 0
    for p in files():
        raw = open(p, "rb").read()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            continue
        new = annotate(text, p)
        if new != text:
            changed += 1
            if not a.check:
                open(p, "wb").write(new.encode("utf-8"))
    print("%s %d shader file(s)" % ("would change" if a.check else "changed", changed))


if __name__ == "__main__":
    main()
