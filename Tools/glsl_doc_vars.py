# -*- coding: utf-8 -*-
"""Doxygen comments for the top-level declarations of the GLSL shaders: uniforms, varyings, constants, globals,
buffer blocks and structs (Tools/doc_shaders.py calls it for every top-level declaration).

Where a description comes from, first hit wins:
  1. the shader itself: a trailing comment becomes ///<; a plain // comment directly above a single declaration that
     stands alone (no declaration right below it) becomes ///,
  2. the table here for the file ("File.frag::name"), then for the name, then doc_shaders.VARS,
  3. a knob uniform (name ending in P): its description in the file's header ("bandP (band count)",
     "tensionP float string tension (0.5..2.2)", "sizeP -> ...") and its range in the presets,
  4. a varying (in/out): its name and the stage that writes it ("vRibbonID" -> "Ribbon ID (from the vertex stage).").
A line that declares several names (float gT, gSpread;) is put in a member group (/ ** @{ * / ... / ** @} * /) so that
Doxygen gives its one ///< text to all of them (DISTRIBUTE_GROUP_DOC); the text names each one.
What is still missing is collected in GAPS.
"""
import collections
import glob
import os
import re
import xml.etree.ElementTree as ET

ROOT = os.path.dirname( os.path.dirname( os.path.abspath( __file__ ) ) )
GAPS = []                     # (name, kind, path)

QUALIFIER = r"(?:uniform|in|out|inout|flat|smooth|noperspective|centroid|patch|const|shared|highp|mediump|lowp|readonly|" \
            r"writeonly|coherent|volatile|restrict|precise|invariant|buffer)"
DECL = re.compile( r"^((?:layout\s*\([^)]*\)\s*)?(?:" + QUALIFIER + r"\s+)*)([A-Za-z_]\w*)\s+(.+);$" )
NOT_TYPES = { "return", "precision", "struct", "else", "if", "for", "while", "do", "switch", "case", "discard", "break",
              "continue", "layout" }
DECLARATOR = re.compile( r"^\s*([A-Za-z_]\w*)\s*((?:\[[^\]]*\]\s*)*)(=.*)?$", re.S )
# the first line of a declaration whose initialiser runs over several lines: const float ModeK[12] = float[12]( ...
DECL_START = re.compile( r"^(?:layout\s*\([^)]*\)\s*)?(?:" + QUALIFIER + r"\s+)*[A-Za-z_]\w*\s+[A-Za-z_]\w*\s*(?:\[[^\]]*\]\s*)*=" )
MACRO = re.compile( r"^#\s*define\s+(\w+)" )
GROUP_OPEN = "/** @{ */"
GROUP_CLOSE = "/** @} */"
BUFFER = re.compile( r"^layout\s*\([^)]*\)\s*(?:(?:readonly|writeonly|coherent|volatile|restrict)\s+)*buffer\s+(\w+)" )
STRUCT = re.compile( r"^struct\s+(\w+)" )


def split_top( s, sep="," ):
    """s split at the separators outside parentheses and brackets."""
    out, depth, cur = [], 0, ""
    for ch in s:
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        if ch == sep and depth == 0:
            out.append( cur )
            cur = ""
        else:
            cur += ch
    out.append( cur )
    return out


def declaration( line ):
    """{qual, type, names, comment} of a one-line top-level declaration, or None.  comment is the trailing comment
    with its marker ("// text", "///< text") or None."""
    code, sep, com = line.partition( "//" )
    code = code.strip()
    if not code.endswith( ";" ) or "{" in code or "}" in code:
        return None
    m = DECL.match( code )
    if not m or m.group( 2 ) in NOT_TYPES or m.group( 2 ) in ( "in", "out", "uniform" ):
        return None
    names = []
    for part in split_top( m.group( 3 ) ):
        d = DECLARATOR.match( part )
        if not d:
            return None                          # a prototype "vec2 chain( vec2 p );" or something else
        names.append( d.group( 1 ) )
    qual = m.group( 1 )
    kind = "uniform" if re.search( r"\buniform\b", qual ) else "const" if re.search( r"\bconst\b", qual ) \
        else "shared" if re.search( r"\bshared\b", qual ) else "in" if re.search( r"\bin\b", qual ) \
        else "out" if re.search( r"\bout\b", qual ) else "global"
    return { "qual": qual, "type": m.group( 2 ), "names": names, "kind": kind, "comment": ( "//" + com ) if sep else None }


# ---------------------------------------------------------------------------------------------------------------
#  Where a text comes from
# ---------------------------------------------------------------------------------------------------------------

_RANGES = None


def preset_ranges():
    """{scene base name: {uniform: (min, max)}} over every preset file; the widest range wins."""
    global _RANGES
    if _RANGES is not None:
        return _RANGES
    out = collections.defaultdict( dict )
    for p in sorted( glob.glob( os.path.join( ROOT, "Presets", "*.xml" ) ) ):
        try:
            root = ET.parse( p ).getroot()
        except ET.ParseError:
            continue
        for el in root.iter():
            f = el.get( "file" )
            if not f:
                continue
            base = os.path.splitext( os.path.basename( f.replace( "\\", "/" ) ) )[ 0 ]
            for fl in el.findall( "float" ):
                try:
                    lo, hi = float( fl.get( "minValue" ) ), float( fl.get( "maxValue" ) )
                except ( TypeError, ValueError ):
                    continue
                n = fl.get( "name" )
                if n in out[ base ]:
                    a, b = out[ base ][ n ]
                    lo, hi = min( a, lo ), max( b, hi )
                out[ base ][ n ] = ( lo, hi )
    _RANGES = out
    return out


def header_text( text ):
    """The file's description: the first block comment that holds @file (else the first block comment)."""
    blocks = re.findall( r"/\*(.*?)\*/", text[ :20000 ].replace( "\r", "" ), re.S )
    for blk in blocks:
        if "@file" in blk:
            return blk
    return blocks[ 0 ] if blocks else ""


def from_header( name, head ):
    """The header's description of a knob ("bandP (band count)", "bandP float band count (0..1)", "bandP -> ..."), or ''."""
    flat = re.sub( r"\s*\n\s*\*?\s*", " ", head.replace( "\r", "" ) )
    n = re.escape( name )
    pats = [ r"\b%s\s*\(([^()]{3,120}(?:\([^()]*\)[^()]*)?)\)" % n,
             r"\b%s\s+(?:float|int|vec[234])\s+(.{3,140}?)(?=\s{2,}|\s+\w+P\s+(?:float|int)|$)" % n,
             r"\b%s\s*(?:->|=>|:|=|--|—|→)\s*(.{3,140}?)(?=[.;]\s|\s{2,}|,\s*\w+P\b|$)" % n ]
    for pat in pats:
        m = re.search( pat, flat )
        if m:
            d = m.group( 1 ).strip().rstrip( ",;" ).strip()
            if d and not re.fullmatch( r"[\d.\s,\-+]+", d ):
                return d
    return ""


def humanize( name ):
    """ribbonWidthP -> 'Ribbon width', vRibbonID -> 'Ribbon ID' (without the stage prefix)."""
    base = name[ :-1 ] if name.endswith( "P" ) and len( name ) > 1 and name[ -2 ].islower() else name
    base = re.sub( r"^(v|g|te|tc|f|o|out|in|frag|geo)(?=[A-Z])", "", base )
    words = re.sub( r"(?<=[a-z0-9])(?=[A-Z])|_", " ", base ).split()
    s = " ".join( w if ( w.isupper() and len( w ) > 1 ) else w.lower() for w in words )
    return s[ :1 ].upper() + s[ 1: ]


def number( x ):
    return ( "%g" % x )


def knob( name, path, head ):
    """The text of a knob uniform: its header description and its preset range."""
    d = from_header( name, head )
    r = preset_ranges().get( os.path.splitext( os.path.basename( path ) )[ 0 ], {} ).get( name )
    text = humanize( name ) + " knob"
    if d:
        text += ": " + d
    if r and not re.search( r"\d\s*\.\.\s*\d", d ):
        text += ", " + number( r[ 0 ] ) + ".." + number( r[ 1 ] )
    return text + "."


STAGE_OF_PREFIX = [ ( r"^v[A-Z0-9]", "from the vertex stage" ), ( r"^g[A-Z0-9]", "from the geometry stage" ),
                    ( r"^te[A-Z0-9]", "from the tessellation evaluation stage" ),
                    ( r"^tc[A-Z0-9]", "from the tessellation control stage" ),
                    ( r"^(in|a)[A-Z0-9]", "vertex attribute" ), ( r"^out[A-Z0-9]", "output" ) ]


def varying( name ):
    """The text of an in/out variable: its name and the stage it comes from."""
    for pat, where in STAGE_OF_PREFIX:
        if re.match( pat, name ):
            return "%s (%s)." % ( humanize( name ), where )
    return None


def text_for( name, d, path, head, varsdoc ):
    """The description of one declared name, or ''."""
    base = os.path.basename( path ) + "::"
    lab = re.sub( r"^(Final|Geom)_", "", base )
    for k in ( base + name, lab + name, name ):
        if k in VAR_DOCS:
            return VAR_DOCS[ k ]
    if name in varsdoc:
        return varsdoc[ name ]
    if d[ "kind" ] == "uniform" and re.match( r"^[a-z]\w*[a-z0-9]P$", name ):
        return knob( name, path, head )
    if d[ "kind" ] in ( "in", "out" ):
        return varying( name ) or ""
    return ""


def describe( d, path, head, varsdoc ):
    """The ///< text for a declaration: the description, or for several names 'a: ...; b: ...'; '' if one is missing."""
    texts = []
    for n in d[ "names" ]:
        t = text_for( n, d, path, head, varsdoc )
        if not t:
            GAPS.append( ( n, d[ "kind" ], path ) )
            return ""
        texts.append( t )
    if len( texts ) == 1:
        return texts[ 0 ]
    return "; ".join( n + ": " + t.rstrip( "." ) for n, t in zip( d[ "names" ], texts ) ) + "."


def macro_doc( name, path ):
    """The description of a #define, or ''."""
    for k in ( os.path.basename( path ) + "::" + name, name ):
        if k in MACRO_DOCS:
            return MACRO_DOCS[ k ]
    GAPS.append( ( name, "macro", path ) )
    return ""


def member_doc( struct, name, path ):
    """The description of a struct member, or ''."""
    for k in ( os.path.basename( path ) + "::" + struct + "::" + name, struct + "::" + name ):
        if k in STRUCT_MEMBER_DOCS:
            return STRUCT_MEMBER_DOCS[ k ]
    GAPS.append( ( struct + "::" + name, "member", path ) )
    return ""


def block_doc( name, kind, path ):
    """The description of a buffer block or a struct, or ''."""
    base = os.path.basename( path ) + "::"
    lab = re.sub( r"^(Final|Geom)_", "", base )
    table = BUFFER_DOCS if kind == "buffer" else STRUCT_DOCS
    for k in ( base + name, lab + name, name ):
        if k in table:
            return table[ k ]
    GAPS.append( ( name, kind, path ) )
    return ""


# ---------------------------------------------------------------------------------------------------------------
#  The tables
# ---------------------------------------------------------------------------------------------------------------

VAR_DOCS = {
    # ---- music features the host uploads (Source/AudioFeatures.h, EffectShader's kAudioLocs)
    "audioDownbeat": "Downbeat accent: a decaying pulse on the bar's 1, 0..1.",
    "audioStereo": "Stereo width of the music, 0..1.",
    "audioStereoL": "Energy of the left channel, 0..1.",
    "audioStereoR": "Energy of the right channel, 0..1.",
    "audioSharpness": "Sharpness of the sound: 0 dull and dark .. 1 bright and harsh.",
    "audioMelody": "The melody: the dominant pitch every ~80 ms, a ring of 96 (~7.7 s); 0 = no clear pitch.",
    "audioMelodyHead": "Head of the audioMelody ring as a position 0..1 (the newest sample just behind it).",
    "audioMelodyPhase": "Progress toward the next audioMelody sample, 0..1 (lets a scrolling trace move smoothly).",
    "audioMelodyConf": "How sure the analysis is that a melody sounds, 0..1 (0 for drums, noise and silence).",
    "audioWave": "The waveform: 64 points of the time signal, -1..1.",
    "audioPhrasePos": "Position within the current 8-bar phrase, 0..1.",
    "audioPhraseLeft": "Seconds left to the next 8-bar phrase boundary.",
    "audioFlatness": "Spectral flatness: 0 tonal .. 1 noise-like.",
    "audioArousal": "Arousal of the music (energy, rhythm, brightness), 0..1.",
    "audioHat": "Hi-hat / cymbal onset envelope, 0..1.",
    "audioRolloff": "Spectral rolloff: how far the energy reaches into the highs, 0..1.",
    "audioZCR": "Zero-crossing rate: 0 pure tone .. 1 broadband noise.",
    "audioSectionId": "Slot of the current song section in the analyzer's fingerprint store (-1: none yet).",
    "audioSectionPrev": "Slot of the previous song section.",
    "audioSectionAge": "Seconds since the current song section began.",
    "audioSectionKnown": "1 if the current section was recognised (it came back), 0 if it is new.",
    "audioSectionCount": "Number of section changes so far (counts up at every detected change).",
    "audioLowMid": "Low-mid band level (150-500 Hz), 0..1.",
    "audioUpperMid": "Upper-mid band level (2-6 kHz), 0..1.",
    "audioPitch": "The dominant pitch, 0..1 over the tracked range (0 = no clear pitch).",
    "audioDeltaPitch": "Melodic activity: how fast the dominant pitch changes (~0 for a held note).",
    "audioMusic": "Music presence, 0..1 (low when there is no music, e.g. speech in the background).",
    "audioFlip": "Rotation direction, +1 or -1 (flips on strong beats).",
    "audioFadeOut": "Fade-out of the song, 0..1 (rises while the track fades out).",
    "audioRotPhase": "Accumulated rotation angle (radians), driven by the music.",
    "audioBassRel": "Bass now relative to its slow average (1 = as usual).",
    "audioMidRel": "Mids now relative to their slow average (1 = as usual).",
    "audioTrebRel": "Treble now relative to its slow average (1 = as usual).",
    "audioBeatDecay": "Beat pulse with a slow decay, 0..1.",
    "spectroFill": "How full the spectrogram ring texSpectro is, 0..1 (after a scene start).",
    "spectroHead": "Write position of the spectrogram ring texSpectro, 0..1.",
    "texSpectro": "Spectrogram ring: band energies (x) over time (y).",
    "texSSM": "Self-similarity matrix of the recent music (how alike two moments are).",
    "ssmHead": "Write position of the self-similarity ring texSSM, 0..1.",
    "ssmFill": "How full the self-similarity ring texSSM is, 0..1.",
    "dayPhase": "Phase of the slow day cycle, 0..1.",
    "texSmoke3D": "The 3D smoke simulation: depth slices tiled in a 2D atlas.",
    # ---- depth, shadows, meshes (the 3D scenes and the post effects that read their depth)
    "texDepth0": "Depth buffer of the current 3D scene (the source of tex0).",
    "texDepth1": "Depth buffer of the next 3D scene (the source of tex1).",
    "depthValid": "1 where texDepth0 (x) and texDepth1 (y) hold a 3D scene's depth, else 0.",
    "tanHalfFov": "Tangent of half the vertical field of view of the 3D scene.",
    "texShadow": "Shadow map of the key light (depth comparison).",
    "lightDir": "Direction to the key light (unit length).",
    "shadowTexel": "Size of a shadow-map texel in world units.",
    "shadowExtent": "Half size of the area the shadow map covers (world units).",
    "texShadow2": "Shadow map of the second light.",
    "lightDir2": "Direction to the second light (unit length).",
    "lightM2": "View-projection matrix of the second light's shadow map.",
    "shadowPass2": "1 during the second light's depth-only shadow pass.",
    "texMeshMaterialLayers2": "Number of layers in the second mesh's material textures.",
    "mesh2VertexCount": "Vertices of the scene's second mesh.",
    "meshCenter2": "Centre of the second mesh's bounding box.",
    "meshExtent2": "Half size of the second mesh's bounding box.",
    "cubeBudget": "FPS detail budget gliding 1..0.5: every 2nd cube shrinks with it, gone at 0.5",
    "genPass": "1 while the generation pass runs (it fills the state buffer once), 0 in the frames after.",
    "frameIndex": "Frame counter since the scene started.",
    # ---- the chain labs and their passes (Tools/scenegen/make_chainpass.py, EffectShader's chain runner)
    "texIn": "The previous pass's chain coordinate per pixel (RG32F).",
    "firstPass": "1: start from the screen position instead of texIn.",
    "subV": "The class's sub-variant, 0..1 (mirrors, arms, lattice ...).",
    "useStart": "1: start from texStart (a 3D lab's plane input) instead of the screen.",
    "tiltA": "The time tilt's direction (radians) while the app walks the lab (walkHost).",
    "texChain": "The chain coordinate per pixel, computed by the chain passes.",
    "chainOff": "Offset of this pixel grid in the chain texture (in pixels).",
    "texB": "The second input of a fade.",
    "texA": "The first input of a fade.",
    "mixF": "Fade between the inputs, 0..1.",
    "walkA": "Stage A of the app's walk: (shown class, target class, fade).",
    "walkB": "Stage B of the app's walk: (shown class, target class, fade).",
    "walkC": "Stage C of the app's walk: (shown class, target class, fade).",
    "walkD": "Stage D of the app's walk: (shown class, target class, fade).",
    "walkS": "The style of the app's walk: (shown class, target class, fade).",
    "walkO": "The stage order of the app's walk: (shown order, target order, fade).",
    "walkSpace": "The 3D lab's space as the app walks it: (shown, target, fade).",
    "walkCore": "The 3D lab's core as the app walks it: (shown, target, fade).",
    "walkBody": "The 3D lab's body as the app walks it: (shown, target, fade).",
    "texGPos": "Position buffer of the 3D lab (world position per pixel).",
    "plane": "Which projection plane: 0 yz, 1 zx, 2 xy.",
    # ---- the engine's own passes
    "tex": "The input picture.",
    "Accumulate.frag::scale": "Weight of the frame (1 while accumulating, 1/n when resolving).",
    "Present.frag::scale": "Brightness limit for photosensitivity, applied last.",
    "artistTex": "Picture of the playing artist (overlay).",
    "rigRoll": "Roll of the 2D camera rig (radians).",
    "rigZoom": "Zoom of the 2D camera rig.",
    "rigPan": "Pan of the 2D camera rig.",
    "texPrev": "The simulation's previous state.",
    "seedMode": "How the simulation is seeded (pattern of the start state).",
    "flowPhase": "Phase of the flow field (integrated).",
    "impulse": "Strength of the injected impulse.",
    "injectAmt": "How much dye is injected.",
    "decay": "Decay of the trail per step.",
    "depositAmt": "How much each agent deposits on the trail.",
    "texAgents": "The agents' state (position and heading per texel).",
    "texTrail": "The trail map.",
    "imgTrail": "The trail map (written).",
    "texMandelbrot": "The deep-zoom iteration image (from the compute pass).",
    "texBake": "The baked distance field (distance and orbit trap per voxel).",
    "bakeField": "The baked distance field (written).",
    # ---- the compute effects (Engine/Cfx*.comp)
    "count": "Number of elements (boids, particles, walkers ...).",
    "level": "The music's level, 0..1.",
    "kick": "Kick envelope, 0..1.",
    "hue": "Hue offset of the palette.",
    "dt": "Time step of the simulation (seconds).",
    "frame": "Frame counter (seeds the random numbers).",
    "seed": "Random seed of the run.",
    "gridN": "Cells per side of the spatial hash grid.",
    "perCell": "Capacity of a grid cell (elements per cell).",
    "drop": "Drop envelope, 0..1.",
    "damp": "Damping per step.",
    "texSrc": "The input picture.",
    "texPhoto": "The photo.",
    "bright": "Brightness.",
    "imgCur": "The current state.",
    "imgPrev": "The previous state.",
    "imgOut": "The output.",
    "gravity": "Gravity.",
    "imgField": "The crystal field (occupied texels).",
    "imgSrc": "The input field.",
    "imgDst": "The output field.",
    "imgLand": "The terrain: height (r), water (g), sediment (b).",
    "capacity": "Capacity of the buffer (elements).",
    "velSrc": "The velocity field (read).",
    "velDst": "The velocity field (written).",
    "velIO": "The velocity field (read and written).",
    "dyeSrc": "The dye (read).",
    "dyeDst": "The dye (written).",
    "prsSrc": "Divergence (r) and pressure (g), read.",
    "prsDst": "Divergence (r) and pressure (g), written.",
    "dissipation": "Dissipation of velocity and dye per step.",
    "jetPos": "Position of the jet.",
    "jetDir": "Direction of the jet.",
    "jetAmp": "Strength of the jet.",
    "imgWave": "The wave field.",
    "waveSize": "Size of the wave field in texels.",
    "burst": "Strength of the burst.",
    "dropPos": "Where the drop falls.",
    "dropAmp": "Strength of the drop.",
    "goalPhase": "Phase of the attractors' orbits (integrated).",
    "stiff": "Stiffness of the springs.",
    "windPhase": "Phase of the wind wave (integrated).",
    "windAmp": "Strength of the wind.",
    "seedAmp": "Strength of the start pattern.",
    "spec": "The spectrum: 32 band levels, 0..1.",
    "gain": "Gain.",
    "texFrame": "The finished frame.",
    "maxGain": "Largest gain the auto exposure may apply.",
    "startX": "Where the strike starts (x, 0..1).",
    "life": "Lifetime of a bolt (seconds).",
    "maxIter": "Most iterations per pixel.",
    "swirl": "Strength of the swirl.",
    "bass": "Bass level, 0..1.",
    "CfxFFT.comp::N": "Size of the transform (points per line).",
    "CfxFFTLoad.comp::N": "Size of the transform (points per line).",
    "CfxFFTMask.comp::N": "Size of the transform (points per line).",
    "CfxFFTStore.comp::N": "Size of the transform (points per line).",
    # ---- the old effects (FX, Transitions, the first scenes)
    "speed": "Speed of the motion.",
    "sides": "Number of mirror sides.",
    "power": "Exponent of the distortion (the host scales it with the music).",
    "rotate": "1: the picture turns.",
    "interpolationRotation": "Rotation of the picture during the cross-fade (radians).",
    "speedTunnel": "Speed of the flight through the tunnel.",
    "speedTunnelAccel": "Acceleration of the flight through the tunnel.",
    "speedTunnelReverse": "Speed of the flight out of the tunnel.",
    "direction": "Direction of the turn: 1 one way, else the other.",
    "copies": "Copies per side of the tile grid.",
    "FxMulti.frag::rot": "1: the tiles are turned by 45 degrees.",
    "FxSphere.frag::rot": "1: the sphere turns.",
    "negative": "1: the picture is inverted.",
    "vigneting": "1: the corners are darkened.",
    "red": "1: recolour into red.",
    "blue": "1: recolour into blue.",
    "displayGrid": "1: show the deformation grid.",
    "directionPositive": "1: the flow runs the positive way.",
    "leftRight": "1: the flow runs left-right instead of up-down.",
    "negativeU": "1: the u offset is inverted.",
    "negativeV": "1: the v offset is inverted.",
    "scaleFactor": "Strength of the offset.",
    "FxShroom.frag::scale": "Scale of the wobble offset.",
    "radius": "Radius of the sphere.",
    "nrCopies": "Copies of the picture on the sphere.",
    "posX": "Seed of the blot (x).",
    "posY": "Seed of the blot (y).",
    "posZ": "Size of the blot.",
    "divisor": "Detail of the blot.",
    "rot4DP": "4D rotation knob (speed of the rotation in four dimensions).",
    "qP": "Polygons meeting at each vertex of the hyperbolic tiling (knob).",
    "nP": "Refractive index knob (negative refraction).",
    "cavityQ_P": "Quality factor knob of the optical cavity.",
    "paramCP": "The Rossler system's parameter c (knob).",
    "modeL_P": "Angular mode number knob of the superradiant field.",
    "waveHP": "Wave height knob.",
}

BUFFER_DOCS = {
    "Verts": "The output vertex buffer: eight floats per vertex (attribute A, attribute B) that the scene draws.",
    "VBO": "The output vertex buffer: one Vertex (attribute A, attribute B) per vertex that the scene draws.",
    "Cmd": "The indirect draw command: [0] the vertex count (counted up atomically), then the other draw arguments.",
    "CmdBuf": "The indirect draw command: [0] the vertex count, [4] the raw count before clamping (atomic).",
    "Accum": "The accumulation buffer: colour and coverage per pixel, added atomically; the present pass resolves it.",
    "Data": "The complex field being transformed (N x N points).",
    "State": "The simulation's state that lives across frames (a marker word, then the bodies or nodes).",
    "Boids": "The boids: position (xy) and velocity (zw) per boid.",
    "Grid": "The spatial hash grid: the elements of each cell.",
    "Parts": "The particles: position (xy) and velocity (zw).",
    "Ctrl": "Control block: the number of live tips and the counters of the strike.",
    "Pos": "The bodies' positions (xyz) and masses (w).",
    "Vel": "The bodies' velocities (xyz) and colour indices (w).",
    "ShardA": "The shards' positions and turns (one vec4 per shard).",
    "ShardB": "The shards' velocities and spins (one vec4 per shard).",
    "Walkers": "The random walkers: position (xy) per walker.",
    "Tips": "The lightning tips: position and heading per tip.",
}

STRUCT_DOCS = {
    "Shape": "A projector's shape: its kind, centre, size and angle.",
    "Vertex": "One vertex as the scene draws it: attribute A and attribute B.",
}

MACRO_DOCS = {
    "InsideSystem.frag::TT": "The scene's clock (time, slowed).",
    "InsideSystem.frag::SPACING": "Spacing of the torus lattice (spacingP, else 7).",
    "InsideSystem.frag::LIGHT_SPACING": "Spacing of the torus lights in lattice cells.",
    "InsideSystem.frag::ATTENUATION": "Fall-off of the neon glow (attenP, else 22), fattened by the slow swell.",
    "InsideSystem.frag::EPSILON": "Surface distance at which the march stops.",
    "InsideSystem.frag::REP": "Domain repetition: p repeated with period r, centred on 0.",
    "InsideSystem.frag::TORUS": "Distance to the small torus around the y axis.",
    "FxLens.frag::PI": "Pi.",
    "PillarHall.frag::SHADOW_WORLD_TEXEL": "One shadow texel in world units (from the light box's size and the map's texel).",
}

STRUCT_MEMBER_DOCS = {
    "Shape::kind": "The shape: 0 an ellipse, 1 a line.",
    "Shape::c": "Centre (on the wall).",
    "Shape::r": "Radii of the ellipse (a line: x is its half length).",
    "Shape::ang": "Angle (radians).",
    "Vertex::attrA": "Attribute A (position, or u/v and an index, by the scene's kind).",
    "Vertex::attrB": "Attribute B (normal, or per-element values).",
}

# ---- globals: values main() works out once per pixel for the helper functions
VAR_DOCS.update( {
    "gCw": "Centre of the wandering transforms this frame (drifts slowly).",
    "gCt": "Second centre of the wandering transforms this frame.",
    "gTC": "The chain's time for this pixel (gT plus the tilt across the picture).",
    "gCam": "The camera position this frame.",
    "gP": "The point the distance field was last evaluated at (scaled; textures the surface).",
    "gDR": "Running scale factor of the folds (divides the distance estimate).",
    "gAxis": "The flight axis (x, y) this frame.",
    "BismuthLabyrinth.frag::gAxis": "The corridor's axis (x, y): the camera's track.",
    "gSide": "Which side of the corridor the ray left by (set while marching).",
    "Final_ChainLab3D.frag::gSide": "Share of the side walls this frame (from the walk).",
    "Geom_ChainLab3D.frag::gSide": "Share of the side walls this frame (from the walk).",
    "gBlock": "Which block the ray hit (set while marching).",
    "gPathAmp": "Amplitude of the camera path's wander.",
    "gTube": "Radius of the flight tube this frame.",
    "gWorldK": "The world's scale: the field's structures 1/gWorldK as large around the camera.",
    "chainPhotoOnly": "Only the photos' own textures: the line looks and the colour field are not used.",
    "gThin": "How far the matter is thinned on the flight path (fading out over 1.4 units).",
    "gCorrR": "Radius of the corridor this frame (breathes with the sub-bass).",
    "hitMat": "Material of the last surface the ray hit (set by the distance field).",
    "hitGlow": "Glow of the last surface the ray hit (set by the distance field).",
    "hitColor": "Colour of the last surface the ray hit (set by the distance field).",
    "sparkPos": "Where the welding sparks are (the last weld point the field met).",
    "cityGlow": "Glow of the city lights at the last hit (set by the distance field).",
    "fissureGlow": "Glow of the fissures at the last hit (set by the distance field).",
    "g_T": "The scene's clock this frame.",
    "gN": "Number of active defect pairs this frame (with a soft edge).",
    "gS": "Scale of the pattern this frame (from its knob).",
    "BatExodusSunset.frag::gS": "How strongly the stream bends this frame (from streamP).",
    "TextureFlowFieldHair.frag::gS": "Scale of the hair's flow field (from curlP).",
    "gRough": "The music's roughness this frame, 0..1.",
    "WindMapStreamlines.frag::gRough": "Turbulence of the wind from the music's roughness.",
    "g_hue": "Hue of the palette this frame (from hueP).",
    "g_light": "Strength of the lights this frame (from lightP).",
    "g_tint": "Strength of the tint this frame (from tintP).",
    "g_rot": "Turn of the mirror ball this frame (radians).",
    "SeifertSurfaceBraidKnot.frag::g_rot": "Rotation of the knot this frame.",
    "g_dens": "Density of the towers this frame (from their knob).",
    "SeaStacksFlight.frag::g_dens": "Density of the sea stacks this frame (from stacksP).",
    "gSwell": "The swell this frame, 0..1.",
    "gBand": "Eight band levels of the music this frame, 0..1.",
    "gDepth": "Depth of the canyon this frame.",
    "gGap": "Gap between the circles this frame.",
    "g_flow": "Phase of the cloud flow this frame (integrated).",
    "gJag": "How jagged the spires are this frame, 0..1.",
    "gRing": "Brightness of each of the five rib rings this frame, 0..1.",
    "g_R": "Rotation of each glass pane this frame.",
    "g_C": "Centre of each glass pane this frame.",
    "g_H": "Half size of each glass pane.",
    "g_col": "Colour of each glass pane.",
    "g_n": "Number of panes this frame.",
    "MusicalFountainShow.frag::g_n": "Number of fountain jets this frame.",
    "gAng": "Turn of the gauze this frame (radians).",
    "gHi": "Treble level this frame, 0..1.",
    "g_sc": "Size of the ice scallops this frame.",
    "gPx": "Size of a pixel (1 / screen height).",
    "gCol": "The colour gathered so far for this pixel.",
    "gW": "Strength of the photo's influence on the waves this frame, 0..1.",
    "gHeat": "Phase of the heating (integrated).",
    "gVisc": "Viscosity this frame (scale of the noise).",
    "gLamp": "Brightness of the lamps this frame.",
    "g_aspect": "Aspect of the screen (width / height).",
    "gTw": "Twist of the pavilion this frame.",
    "gMist": "Thickness of the mist this frame.",
    "gRo": "The camera position this frame.",
    "gFw": "The camera's forward axis.",
    "gRt": "The camera's right axis.",
    "gUp": "The camera's up axis.",
    "g_P": "The knot's p: windings around the axis.",
    "g_Q": "The knot's q: windings through the hole.",
    "g_th": "Thickness of the ribbon this frame.",
    "g_hs": "Height scale of the terrain this frame.",
    "g_det": "Detail scale of the terrain this frame.",
    "g_clock": "The scene's clock this frame (integrated).",
    "g_shape": "The shape knob this frame, 0..1.",
    "gK": "Wave number of the standing waves this frame.",
    "gA": "Amplitude of the standing waves this frame.",
    "gPh": "Phase of the standing waves this frame.",
    "gMix": "Mix toward the minor-mode lobes this frame, 0..1.",
    "g_nv": "Number of vortices this frame.",
    "g_vc": "Centres of the vortices this frame.",
    "g_vs": "Strength and turn of each vortex.",
    "g_wind": "Strength of the wind this frame.",
    "gVS": "Scale of the vortex field this frame.",
    "gSw": "Strength of the swirl this frame.",
    "gPitch": "Spacing of the circuit grid this frame (pixels).",
    "gC": "Strength of the curl this frame.",
    "gCurl": "Strength of the curl this frame.",
    "gSc": "Scale of the pattern this frame.",
    "gBands": "Number of cloud bands this frame.",
    "gShear": "Shear between the bands this frame.",
    "gPos": "Positions of the four magnets.",
    "gDir": "Directions of the four magnets.",
    "gCurve": "How strongly the seams bend this frame.",
    "gCrowd": "Number of people this frame.",
    "deg30": "Thirty degrees in radians.",
    "gH": "Depth of the wall relief this frame (at most 0.59: the axis stays free).",
    "g_tail": "Length of the comet's tail this frame, 0..1.",
    "g_swell": "The swell this frame, 0..1.",
    "g_hi": "Treble level this frame, 0..1.",
    "g_pat": "Pattern mix of the floor this frame, 0..1.",
    "g_drift": "Drift of the floor pattern this frame.",
    "gGrow": "Growth of the sponge cells this frame.",
    "gDens": "Spacing factor of the LED columns this frame (smaller: denser).",
    "g_pads": "Share of lily pads this frame, 0..1.",
    "gBlob": "Size of the oil blobs this frame (the swell).",
    "gSharp": "Width of the oil edges this frame (smaller: sharper; from focusP).",
} )

# ---- constants
VAR_DOCS.update( {
    # the scene geometry shared by families of scenes
    "Ground": "Height of the ground (world units).",
    "Dist": "Distance of the main object from the camera (world units).",
    "Extent": "Size of the tessellated ground patch (x, z in world units).",
    "TanY": "Tangent of half the vertical field of view (the scene projection's 55 degrees).",
    "TanHalfFov": "Tangent of half the vertical field of view (the scene projection's 55 degrees).",
    "Aspect": "Assumed screen aspect (16:9; this stage does not know the real one).",
    "Asp": "Assumed screen aspect (16:9; this stage does not know the real one).",
    "AspectGuess": "Assumed screen aspect (16:9; this stage does not know the real one).",
    "Cam": "Distance the vertex stage pushes the scene back from the camera.",
    "CamZ": "Distance the vertex stage pushes the scene back from the camera.",
    "Tilt": "The vertex stage's fixed tilt (radians).",
    "Gw": "Columns of the host's vertex grid.",
    "GH": "Rows of the host's vertex grid.",
    "SunDir": "Direction to the sun (normalised where it is used).",
    "Pi": "Pi.",
    "Root3": "The square root of 3.",
    "Lw": "Luminance weights (Rec. 709).",
    "M2": "Rotation and scale between two noise octaves.",
    "Scale": "Fixed-point scale of the accumulation buffer (colour times Scale, added as integers).",
    "Ceil": "Height of the ceiling (world units).",
    "GroundY": "Height of the ground (world units).",
    "FloorY": "Height of the floor (world units).",
    "Floor": "Height of the floor (metres).",
    "Floory": "Height of the floor line (screen units).",
    "BedY": "Height of the sea bed (world units).",
    "PivotY": "Height of the pivots (world units).",
    "TowerH": "Height of the towers (world units).",
    "TowerTop": "Height of the bridge towers' tops.",
    "TowerFoot": "Foot of the receiver tower.",
    "Top": "Height of the chime's suspension point.",
    "Spacing": "Spacing between neighbouring objects (world units).",
    "Pitch": "Spacing between neighbouring dominoes (world units).",
    "PerLane": "Dominoes per lane.",
    "HalfAisle": "Half width of the aisle (world units).",
    "kR": "Radius of a gear.",
    "Rate": "Turning speed of the drum (radians per second).",
    # counts of the compute stages
    "Nquads": "Number of quads the scene emits.",
    "Layers": "Number of window layers.",
    "Rings": "Number of rings.",
    "Sect": "Number of sectors per ring.",
    "R0": "Radius of the innermost ring.",
    "Dr": "Radial spacing between the rings.",
    "Nodes": "Capacity of the node list.",
    "Walkers": "Number of random walkers.",
    "Seeds": "Number of seed nodes.",
    "Sides": "Sides of the tube around each segment.",
    "ShadowForest.comp::Sides": "Sides of a tree trunk.",
    "Grid": "Cells per side of the spatial hash grid.",
    "MetaSculpt.comp::Grid": "Cells per side of the marching grid.",
    "OffNodes": "Offset of the node list in the state buffer.",
    "OffWalk": "Offset of the walkers in the state buffer.",
    "OffGrid": "Offset of the spatial grid in the state buffer.",
    "Loops": "Number of string loops.",
    "Segs": "Segments per loop.",
    "SegSect": "Segments per sector of a flake.",
    "Flakes": "Number of snow flakes.",
    "Dust": "Number of dust specks.",
    "Haze": "Number of haze points.",
    "Specks": "Number of far-field specks.",
    "Zooids": "Zooids per colony.",
    "PerZooid": "Quads per zooid.",
    "Cols": "Columns of the colony grid.",
    "Rows": "Rows of the colony grid.",
    "Smoke3DSim.frag::Cols": "Columns of depth slices in the atlas.",
    "Smoke3DSim.frag::Rows": "Rows of depth slices in the atlas.",
    "VolumetricFire.vert::Cols": "Columns of depth slices in the smoke atlas.",
    "VolumetricFire.vert::Rows": "Rows of depth slices in the smoke atlas.",
    "SuperfluidVortexRingPinchOff.comp::Cols": "Columns of the vortex-ring grid.",
    "SuperfluidVortexRingPinchOff.comp::Rows": "Rows of the vortex-ring grid.",
    "Snow": "Number of marine-snow specks.",
    "SnowBase": "Index of the first marine-snow speck (after the creatures).",
    "Strands": "Number of vortex strands.",
    "PerStr": "Points per strand.",
    "Steps": "Number of steps.",
    "CfxCrystal.comp::Steps": "Steps each walker takes per frame.",
    "CfxErosion.comp::Steps": "Steps of a droplet's life.",
    "FxSunShafts.frag::Steps": "Samples along the march toward the light.",
    "Harmonograph.comp::Steps": "Points along the curve.",
    "EscalatorHallCrossing.comp::Steps": "Steps per escalator flight.",
    "Feathers": "Most feathers.",
    "Ribbons": "Number of ribbons.",
    "Stars": "Number of stars.",
    "FieldW": "Width of the grass field (world units).",
    "FieldD": "Depth of the grass field (world units).",
    "Seg": "Segments per strand.",
    "PlanetR": "Radius of the planet.",
    "Lines": "Number of field lines.",
    "SphereV": "Rows of the planet sphere's mesh.",
    "RootsPerTree": "Prop roots per tree.",
    "SegsPerRoot": "Segments per root.",
    "NumCubes": "Number of cubes.",
    "NumRings": "Number of rings.",
    "PerRing": "Cubes per ring.",
    "NumPoints": "Number of points.",
    "N": "Number of particles.",
    "TunnelLen": "Length of the tunnel (world units).",
    "Shards": "Most shards.",
    "Orgs": "Number of skeletons.",
    "Trees": "Number of trees.",
    "Spanx": "Half width of the ground (world units).",
    "Spanz": "Depth of the ground (world units).",
    "WallZ": "Depth of the wall the shadows fall on.",
    "Sparks": "Sparks per shell.",
    "SkyAz": "Columns (azimuth) of the sky dome's mesh.",
    "SkyEl": "Rows (elevation) of the sky dome's mesh.",
    "SkyBase": "Index of the first sky-dome quad (after the sparks).",
    "Grav": "Gravity (downward acceleration).",
    "Drag": "Air drag of the sparks.",
    "Beams": "Number of roof beams.",
    "BeamPitch": "Spacing between the roof beams.",
    "SlotW": "Width of the gaps between the beams.",
    "Span": "Depth of the hall (world units).",
    "Bands": "Number of spectrum bands.",
    "Depth": "Depth of the weave (world units).",
    "AgeSpan": "How far back in the spectrogram the weave reaches (share of the ring).",
    "GridRes": "Cells per side of the particle grid.",
    "CellSize": "Size of a grid cell.",
    "ParticleM": "Mass of a particle.",
    "Viscosity": "Viscosity of the fluid.",
    "Nqubit": "Number of qubits.",
    "BoltCount": "Number of lightning bolts.",
    "BoltSteps": "Segments per bolt.",
    "CreepArms": "Number of surface-creep arms.",
    "CreepSteps": "Segments per creep arm.",
    "SparkSegs": "Number of corona spark segments.",
    "Parts": "Number of particles.",
    "Eps": "Softening length of the gravity.",
    "Fires": "Number of fires.",
    "TubeLen": "Length of the tube (world units).",
    "NumRibbons": "Number of ribbons.",
    "Samples": "Samples per pixel.",
    "Radius": "Radius of the filter (pixels).",
    "Iters": "Iterations per walker and frame.",
    "Warmup": "Iterations before a walker starts to plot.",
    "Tile": "Size of a depth slice's tile in the atlas (pixels).",
    "R": "Radius.",
    "DrumSkin.comp::R": "Radius of the drum skin.",
    "MeshGearTrain.vert::R": "Radius of a gear.",
    "Res": "Voxels per side of the baked field.",
    "SpectroRows": "Rows of the spectrogram ring.",
    "Np": "Number of glass panes.",
    "NrBubbles": "Number of bubbles.",
    "TrackGap": "Gap between neighbouring tracks.",
    "NIter": "Number of inversion steps.",
    "Ballr": "Radius of a ball.",
    "Ball": "Centre of the mirror ball.",
    "Br": "Radius of the mirror ball.",
    "Oc": "Centre of the oculus.",
    "Orbs": "Number of orbs.",
    "Contrast": "Contrast of the orbs.",
    "Colorshift": "Colour shift between the orbs.",
    "CosMul": "Amplitude of the cosine warp.",
    "XMul": "Frequency of the cosine warp in x.",
    "XDivide": "Wavelength of the sine warp in x.",
    "YDivide": "Wavelength of the warp in y.",
    "Halfw": "Half width of the hall (metres).",
    "Endz": "Depth of the end wall (metres).",
    "Sunc": "Centre of the sun disc.",
    "Sunr": "Radius of the sun disc.",
    "MoonX": "Where the moon hangs: angle off the view axis in x (radians).",
    "MoonY": "Where the moon hangs: angle off the view axis in y (radians).",
    "PlateW": "Plates across the picture.",
    "PlateH": "Plates down the picture.",
    "CandleA": "Position of the first candle light.",
    "CandleB": "Position of the second candle light.",
    "FloodA": "Position of the first flood light.",
    "FloodB": "Position of the second flood light.",
    "Fl": "Height of the floor (metres).",
    "VAULT": "Height of the vault (metres).",
    "HALFW": "Half width of the nave (metres).",
    "COLX": "Distance of the columns from the axis (metres).",
    "ZEND": "Depth of the nave's end (metres).",
    "AizA": "The Aizawa system's parameter a.",
    "AIZ_B": "The Aizawa system's parameter b.",
    "AIZ_C": "The Aizawa system's parameter c.",
    "AIZ_D": "The Aizawa system's parameter d.",
    "AIZ_E": "The Aizawa system's parameter e.",
    "AIZ_F": "The Aizawa system's parameter f.",
    "Color1": "First colour of the paint flow.",
    "Color2": "Second colour of the paint flow.",
    "Color3": "Third colour of the paint flow (the deep shade).",
    "Color4": "Fourth colour of the paint flow (the highlight).",
    "Emboss": "Strength of the emboss (refraction).",
    "Intensity": "Strength of the waves.",
    "Frequency": "Frequency of the waves.",
    "ReflectionCutOff": "Slope below which there is no reflection.",
    "ReflectionIntence": "Sharpness of the reflections.",
    "CubeFaceNormals": "Normals of the six cube faces.",
    "CubeNormals": "Normals of the six cube faces.",
    "ModeM": "Lobes around the equator of each pitch class's mode (m).",
    "Alpha": "The first zeros of the Bessel functions J_n, one per mode: they set its shape and its frequency.",
    "Order": "The Bessel order n of each mode (the J_n whose zero Alpha holds).",
} )

VAR_DOCS.update( {
    "hist": "Histogram of the work group (256 bins).",
    "ofs": "Start of each histogram bin (prefix sums).",
    "CfxFFT.comp::s": "The line being transformed, in shared memory.",
    "tile": "The bodies of the current tile, shared by the work group.",
    "exposure": "Exposure of the tonemap.",
} )
