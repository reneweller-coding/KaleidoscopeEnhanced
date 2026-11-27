# -*- coding: utf-8 -*-
r"""Builds Transitions/<Name>.frag from compact drafts (Tools/transgen/drafts/*.txt) and registers them in Presets/Komplett.xml.

    python Tools/transgen/tgen.py build  [Name ...]     write Transitions/<Name>.frag (all drafts when no name is given),
                                                        then doc_shaders.py and cgvr_format.py bring them into the layout
    python Tools/transgen/tgen.py register [Name ...]   add the <TransitionShader> entries to Presets/Komplett.xml
    python Tools/transgen/tgen.py list                  the drafted names

A draft section starts with `=== Name`; header lines `key: value` follow, then a line `---` and the GLSL body:

    brief:    one sentence, the file's @brief (TRANSITION <NAME IN CAPS>: ...)
    about:    one line of description (may repeat)
    music:    what the music does to the form (may repeat)
    knob:     <name>P <min> <max> <what it does>        (two per transition)
    moods:    calm,dreamy,wipe                          (the registration's mood tags)
    minfade:  seconds (0 or absent: none)
    prob:     the registration's probability
    cx:       complexity 1..3
    huegain:  how far hueP turns the colours in the middle (default 0.1)
    warp:     17 knots of a re-timed progress (written by Tools/transition_warp.py, which measures where the change sits
              and spreads it evenly; absent: the progress runs straight)

The body defines `vec4 trans( vec2 p, float d )` with the progress d = 0 (old scene) .. 1 (new scene) and may use the
library of the template: tA/tB/tAm/tBm (the two scenes), trThresh (a soft threshold wipe), trMid, trClock, trBlurA/trBlurB,
hueRot, hash21/hash22, noise2, fbm2, trVeil (a veil colour that never outshines the two scenes) and the knob values gKA, gKB and gSpd.  Exactly the old scene at d = 0 and exactly the new
scene at d = 1 is guaranteed by main().

A body that calls trOrderA/trOrderB (27.11.2026, plan P5: transitions through the depth) gets the depth library: the
two scenes' depth buffers (texDepth0/texDepth1, depthValid, depthPhoto, photoDepthWin, nearFar -- what the combine
stage gives every transition) and trOrderA(p)/trOrderB(p), each scene's depth order at a place, 0 nearest .. 1
farthest, equalised over the picture; where a scene has no depth, the order comes from its brightness (bright = near).
trOrderBoth(oA, oB) is the joint order "far in both scenes".
"""
import io, os, re, subprocess, sys, textwrap

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "Transitions")
KOMPLETT = os.path.join(ROOT, "Presets", "Komplett.xml")


def read_drafts():
    drafts = {}
    order = []
    d = os.path.join(HERE, "drafts")
    for f in sorted(os.listdir(d)):
        if not f.endswith(".txt"):
            continue
        text = io.open(os.path.join(d, f), encoding="utf-8").read().replace("\r\n", "\n")
        for sec in re.split(r"(?m)^=== ", text)[1:]:
            head, _, body = sec.partition("\n---\n")
            lines = head.split("\n")
            name = lines[0].strip()
            meta = {"about": [], "music": [], "knob": []}
            for ln in lines[1:]:
                if not ln.strip():
                    continue
                k, _, v = ln.partition(":")
                k = k.strip()
                v = v.strip()
                if k in ("about", "music", "knob"):
                    meta[k].append(v)
                else:
                    meta[k] = v
            meta["body"] = body.strip("\n")
            meta["name"] = name
            meta["file"] = f
            assert name not in drafts, "twice: " + name
            drafts[name] = meta
            order.append(name)
    return drafts, order


def wrap(prefix, text, width=118):
    return [prefix + ln for ln in textwrap.wrap(text, width - len(prefix))] or [prefix.rstrip()]


TEMPLATE_UNIFORMS = """out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The outgoing scene.
uniform sampler2D tex1;          ///< The incoming scene (cross-faded in by interpolation).
uniform float     interpolation; ///< Progress of the fade: 1 = tex0 (old scene), 0 = tex1 (new scene).

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< Slow loudness swell: the only envelope allowed to shape geometry.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay): light only.
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioSpread;    ///< Spectral spread (width of the sound), 0..1.
uniform float audioRolloff;   ///< Spectral rolloff (where the sound's energy ends), 0..1.
uniform float audioPhrasePos; ///< Position inside the musical phrase, 0..1 (periodic).
uniform float audioStereo;    ///< Stereo width of the sound, 0 mono .. 1 wide.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
"""

TEMPLATE_LIB = r"""
const float Pi = 3.14159265358979; ///< Pi.

float gKA;  ///< The value of the first knob (1 when it is unset).
float gKB;  ///< The value of the second knob (1 when it is unset).
float gSpd; ///< The value of the speed knob (1 when it is unset).

/**  The outgoing scene at a place.
 *
 * @param p  The place, 0..1. (in)
 *
 * @return
 *   The colour of tex0.
 **/
vec4 tA( vec2 p )
{
    return texture( tex0, p );
}

/**  The incoming scene at a place.
 *
 * @param p  The place, 0..1. (in)
 *
 * @return
 *   The colour of tex1.
 **/
vec4 tB( vec2 p )
{
    return texture( tex1, p );
}

/**  A place folded back into the frame by mirroring, so that a warp never reads outside.
 *
 * @param p  The place. (in)
 *
 * @return
 *   The place inside 0..1.
 **/
vec2 uvMirror( vec2 p )
{
    return 1.0 - abs( fract( p * 0.5 ) * 2.0 - 1.0 );
}

/**  The outgoing scene at a place that may lie outside the frame (mirrored back).
 *
 * @param p  The place. (in)
 *
 * @return
 *   The colour of tex0.
 **/
vec4 tAm( vec2 p )
{
    return texture( tex0, uvMirror( p ) );
}

/**  The incoming scene at a place that may lie outside the frame (mirrored back).
 *
 * @param p  The place. (in)
 *
 * @return
 *   The colour of tex1.
 **/
vec4 tBm( vec2 p )
{
    return texture( tex1, uvMirror( p ) );
}

/**  Rotates a colour's hue by an angle (about the grey axis).
 *
 * @param c  The colour. (in)
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The colour with its hue turned.
 **/
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/**  Luminance of a colour (Rec. 709 weights).
 *
 * @param c  The colour. (in)
 *
 * @return
 *   The luminance.
 **/
float trLuma( vec3 c )
{
    return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
}

/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The number.
 **/
float hash21( vec2 p )
{
    p = fract( p * vec2( 443.34, 755.21 ) );
    p += dot( p, p + 54.32 );
    return fract( p.x * p.y );
}

/**  Two pseudo-random numbers 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The numbers.
 **/
vec2 hash22( vec2 p )
{
    return vec2( hash21( p ), hash21( p + vec2( 17.17, 31.31 ) ) );
}

/**  Smooth value noise.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, 0..1.
 **/
float noise2( vec2 p )
{
    vec2 i = floor( p );
    vec2 f = fract( p );
    vec2 u = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hash21( i ), hash21( i + vec2( 1.0, 0.0 ) ), u.x ),
                mix( hash21( i + vec2( 0.0, 1.0 ) ), hash21( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}

/**  Fractal noise of four octaves.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, about 0..1.
 **/
float fbm2( vec2 p )
{
    float s = 0.0;
    float a = 0.5;
    for ( int i = 0; i < 4; ++i )
    {
        s += a * noise2( p );
        p = p * 2.03 + vec2( 11.7, 5.3 );
        a *= 0.5;
    }
    return s / 0.9375;
}

/**  A soft threshold wipe: a pixel with the order value f has switched at progress d, and every pixel has switched at d = 1
 *  and none at d = 0, whatever the order values are.
 *
 * @param f  The pixel's order value, 0..1: pixels with small values switch first. (in)
 * @param d  The progress, 0..1. (in)
 * @param s  The softness of the edge, in order units. (in)
 *
 * @return
 *   The weight of the new scene, 0..1.
 **/
float trThresh( float f, float d, float s )
{
    float t = d * ( 1.0 + 2.0 * s ) - s;
    return smoothstep( f - s, f + s, t );
}

/**  The mean brightness of the outgoing scene, estimated from nine fixed points (to centre a brightness order on the picture).
 *
 * @return
 *   The mean luminance, 0..1.
 **/
float trMeanLumaA()
{
    float s = 0.0;
    for ( int j = 0; j < 3; ++j )
        for ( int i = 0; i < 3; ++i )
            s += trLuma( texture( tex0, ( vec2( float( i ), float( j ) ) + 0.5 ) / 3.0 ).rgb );
    return s / 9.0;
}

/**  The envelope of the middle of the transition: 0 at both ends, 1 in the middle.
 *
 * @param d  The progress, 0..1. (in)
 *
 * @return
 *   The envelope.
 **/
float trMid( float d )
{
    return sin( Pi * d );
}

/**  The clock of the transition: seconds, scaled so that the clock alone changes the picture by about 1/255 a frame.
 *
 * @return
 *   The clock.
 **/
float trClock()
{
    return time * 0.1 * gSpd + 0.02 * audioAdvance;
}

/**  A blurred reading of the outgoing scene (nine taps on a disc).
 *
 * @param p  The place. (in)
 * @param r  The radius in pixels. (in)
 *
 * @return
 *   The colour.
 **/
vec4 trBlurA( vec2 p, float r )
{
    vec2 px = r / resolution;
    vec4 s = texture( tex0, p ) * 0.2;
    s += 0.1 * ( texture( tex0, p + vec2( px.x, 0.0 ) ) + texture( tex0, p - vec2( px.x, 0.0 ) )
               + texture( tex0, p + vec2( 0.0, px.y ) ) + texture( tex0, p - vec2( 0.0, px.y ) ) );
    s += 0.1 * ( texture( tex0, p + px * 0.7071 ) + texture( tex0, p - px * 0.7071 )
               + texture( tex0, p + px * vec2( 0.7071, -0.7071 ) ) + texture( tex0, p - px * vec2( 0.7071, -0.7071 ) ) );
    return s;
}

/**  A blurred reading of the incoming scene (nine taps on a disc).
 *
 * @param p  The place. (in)
 * @param r  The radius in pixels. (in)
 *
 * @return
 *   The colour.
 **/
vec4 trBlurB( vec2 p, float r )
{
    vec2 px = r / resolution;
    vec4 s = texture( tex1, p ) * 0.2;
    s += 0.1 * ( texture( tex1, p + vec2( px.x, 0.0 ) ) + texture( tex1, p - vec2( px.x, 0.0 ) )
               + texture( tex1, p + vec2( 0.0, px.y ) ) + texture( tex1, p - vec2( 0.0, px.y ) ) );
    s += 0.1 * ( texture( tex1, p + px * 0.7071 ) + texture( tex1, p - px * 0.7071 )
               + texture( tex1, p + px * vec2( 0.7071, -0.7071 ) ) + texture( tex1, p - px * vec2( 0.7071, -0.7071 ) ) );
    return s;
}
"""

TRANS_DOC = """/**  The picture at a place and progress.
 *
 * @param p  The place, 0..1. (in)
 * @param d  The progress, 0 (old scene) .. 1 (new scene). (in)
 *
 * @return
 *   The colour.
 **/
"""


VEIL_LIB = r"""
/**  The mean brightness of the incoming scene, estimated from nine fixed points.
 *
 * @return
 *   The mean luminance, 0..1.
 **/
float trMeanLumaB()
{
    float s = 0.0;
    for ( int j = 0; j < 3; ++j )
        for ( int i = 0; i < 3; ++i )
            s += trLuma( texture( tex1, ( vec2( float( i ), float( j ) ) + 0.5 ) / 3.0 ).rgb );
    return s / 9.0;
}

/**  The colour of a veil (fog, snow, gauze, foam) in the light of the two scenes: the tint, dimmed until it is at most
 *  a little brighter than the brighter scene, so a veil over two dark scenes is a dark veil and never a flash.
 *
 * @param tint  The veil's own colour in full light. (in)
 *
 * @return
 *   The veil's colour.
 **/
vec3 trVeil( vec3 tint )
{
    float limit = max( trMeanLumaA(), trMeanLumaB() ) + 0.09;
    return tint * min( 1.0, limit / max( trLuma( tint ), 0.05 ) );
}
"""


DEPTH_UNIFORMS = """
uniform sampler2D texDepth0;     ///< Depth buffer of the outgoing scene (window depth; 1 where nothing was drawn).
uniform sampler2D texDepth1;     ///< Depth buffer of the incoming scene.
uniform vec2      depthValid;    ///< How real each depth is (x old, y new scene): 1 3D or photo with a map, 0 none.
uniform vec2      depthPhoto;    ///< 1 where the depth is a photo's (a 2D scene with // @depth), 0 a 3D scene's.
uniform vec2      photoDepthWin; ///< Window depth of a photo's near end (x, depth 1) and far end (y, depth 0).
uniform vec2      nearFar;       ///< Near and far clip distances of the shared 3D projection."""

DEPTH_LIB = r"""
/**  How far a window depth lies, 0 (near) .. 1 (far): a photo's depth between its two ends, a 3D scene's distance on a
 *  log scale up to 60 units (the scale of Engine/DepthView.frag); the far plane is 1.
 *
 * @param z      The window depth, 0..1. (in)
 * @param photo  1 where the depth is a photo's, 0 a 3D scene's. (in)
 *
 * @return
 *   The farness, 0..1.
 **/
float trFar( float z, float photo )
{
    float n = max( nearFar.x, 1e-3 );
    float f = max( nearFar.y, n + 1.0 );
    float lin = ( 2.0 * n * f ) / max( f + n - ( z * 2.0 - 1.0 ) * ( f - n ), 1e-4 );
    float g3 = clamp( log( max( lin, n ) / n ) / log( 60.0 / n ), 0.0, 1.0 );
    float gp = clamp( ( z - photoDepthWin.x ) / max( photoDepthWin.y - photoDepthWin.x, 1e-6 ), 0.0, 1.0 );
    return mix( g3, gp, clamp( photo, 0.0, 1.0 ) );
}

/**  The brightness of a scene around a place, averaged over a ring of a fortieth of the picture's height: the calm
 *  stand-in for a depth (no texture grain, no single pixel decides).
 *
 * @param t  The scene. (in)
 * @param p  The place, 0..1. (in)
 *
 * @return
 *   The luminance, 0..1.
 **/
float trLumaSoft( sampler2D t, vec2 p )
{
    vec2  r = vec2( resolution.y / resolution.x, 1.0 ) * 0.025;
    float s = 0.2 * trLuma( texture( t, p ).rgb );
    for ( int i = 0; i < 8; ++i )
    {
        float a = float( i ) * 0.785398;
        s += 0.1 * trLuma( texture( t, clamp( p + r * vec2( cos( a ), sin( a ) ), 0.0, 1.0 ) ).rgb );
    }
    return s;
}

/**  The depth order of one scene at a place: 0 nearest .. 1 farthest, as the share of the picture that lies nearer
 *  (equalised, so a front swept over the order covers the picture evenly whatever the scene's depths are -- a soft
 *  empirical distribution over a 5 x 5 grid of the same frame).  From the real depth as far as the scene has one
 *  (`valid`); where it has none (a 2D scene, a photo without a map), or where its depth is flat (a 3D scene drawn on
 *  one plane), from the brightness instead: bright counts as near.  The depth itself is read over five taps 1.5 pixels
 *  apart, so a silhouette is a soft edge and not a stair of single pixels.
 *
 * @param col    The scene's colour. (in)
 * @param dep    The scene's depth buffer. (in)
 * @param p      The place, 0..1. (in)
 * @param valid  How real the depth is, 0..1 (depthValid). (in)
 * @param photo  1 where the depth is a photo's (depthPhoto). (in)
 *
 * @return
 *   The order, 0..1.
 **/
float trOrder( sampler2D col, sampler2D dep, vec2 p, float valid, float photo )
{
    vec2  px = 1.5 / resolution;
    float fz = 0.2 * ( trFar( texture( dep, p ).r, photo ) + trFar( texture( dep, p + vec2( px.x, 0.0 ) ).r, photo )
                       + trFar( texture( dep, p - vec2( px.x, 0.0 ) ).r, photo )
                       + trFar( texture( dep, p + vec2( 0.0, px.y ) ).r, photo )
                       + trFar( texture( dep, p - vec2( 0.0, px.y ) ).r, photo ) );
    float fl = 1.0 - trLumaSoft( col, p );
    float rz = 0.0;
    float rl = 0.0;
    float m = 0.0;
    float mm = 0.0;
    for ( int j = 0; j < 5; ++j )
        for ( int i = 0; i < 5; ++i )
        {
            vec2  q = ( vec2( float( i ), float( j ) ) + 0.5 ) / 5.0;
            float gz = trFar( texture( dep, q ).r, photo );
            float gl = 1.0 - trLuma( texture( col, q ).rgb );
            rz += smoothstep( gz - 0.05, gz + 0.05, fz );
            rl += smoothstep( gl - 0.1, gl + 0.1, fl );
            m += gz;
            mm += gz * gz;
        }
    m /= 25.0;
    float sd = sqrt( max( mm / 25.0 - m * m, 0.0 ) );
    float v = clamp( valid, 0.0, 1.0 ) * smoothstep( 0.02, 0.06, sd );
    return mix( rl, rz, v ) / 25.0;
}

/**  The depth order of the outgoing scene at a place (see trOrder()).
 *
 * @param p  The place, 0..1. (in)
 *
 * @return
 *   The order, 0 nearest .. 1 farthest.
 **/
float trOrderA( vec2 p )
{
    return trOrder( tex0, texDepth0, p, depthValid.x, depthPhoto.x );
}

/**  The depth order of the incoming scene at a place (see trOrder()).
 *
 * @param p  The place, 0..1. (in)
 *
 * @return
 *   The order, 0 nearest .. 1 farthest.
 **/
float trOrderB( vec2 p )
{
    return trOrder( tex1, texDepth1, p, depthValid.y, depthPhoto.y );
}

/**  Where both scenes are far, as one order: a near thing in either scene keeps the place near, so it is the nearer
 *  of the two orders, made even again -- the minimum of two even orders lies near 0 more often, and 1 - (1 - min)^2
 *  spreads it back over 0..1 (exactly for two independent orders).
 *
 * @param oA  The outgoing scene's order. (in)
 * @param oB  The incoming scene's order. (in)
 *
 * @return
 *   The joint order, 0 (near in either scene) .. 1 (far in both).
 **/
float trOrderBoth( float oA, float oB )
{
    float m = 1.0 - min( oA, oB );
    return 1.0 - m * m;
}"""


def build_one(meta):
    name = meta["name"]
    knobs = []
    for k in meta["knob"]:
        parts = k.split(None, 3)
        knobs.append((parts[0], parts[1], parts[2], parts[3] if len(parts) > 3 else ""))
    assert len(knobs) == 2, name + ": two knobs"
    out = ["#version 330 core", "/" + "*" * 77 + "\\", " *" + (name + ".frag").center(76).rstrip(), "\\" + "*" * 77 + "/",
           "/*! @file", " *", " *  @brief"]
    out += wrap(" *  ", meta["brief"])
    out.append(" *")
    for a in meta["about"]:
        out += wrap(" *  ", a)
    out.append(" *")
    out.append(" *    interpolation -> the progress of the fade (1 old scene, 0 new scene)")
    for m in meta["music"]:
        out += wrap(" *    ", m)
    out.append(" *")
    out.append(" *  Per-activation variety:")
    for n, lo, hi, what in knobs:
        out.append(" *    %-7s float %s (%s..%s)" % (n, what, lo, hi))
    out.append(" *    speedP  float clock multiplier (0.5..2.0)")
    out.append(" *    hueP    float hue offset in the middle of the fade (0..6.28)")
    out.append(" *")
    out.append(" *  @author René Weller")
    out.append(" */")
    out.append(TEMPLATE_UNIFORMS.rstrip("\n"))
    out.append("")
    for n, lo, hi, what in knobs:
        out.append("uniform float %s;  ///< %s (%s..%s)." % (n, what[:1].upper() + what[1:].rstrip("."), lo, hi))
    out.append("uniform float speedP; ///< Speed knob: clock multiplier (0.5..2.0).")
    out.append("uniform float hueP;   ///< Hue knob (radians): turns the colours a little in the middle of the fade.")
    body = meta["body"]
    depth = "trOrderA(" in body or "trOrderB(" in body
    if depth:
        out.append(DEPTH_UNIFORMS.rstrip("\n"))
    out.append(TEMPLATE_LIB.rstrip("\n"))
    if "trVeil(" in body or "trMeanLumaB(" in body:
        out.append(VEIL_LIB.rstrip("\n"))
    if depth:
        out.append(DEPTH_LIB.rstrip("\n"))
    out.append("")
    # a doc comment for trans() when the body gives none
    m = re.search(r"(?m)^vec4 trans\(", body)
    assert m, name + ": no trans()"
    before = body[:m.start()].rstrip()
    if not before.endswith("*/"):
        body = body[:m.start()] + TRANS_DOC + body[m.start():]
    out.append(body)
    out.append("")
    warp = meta.get("warp", "").split()
    if warp:
        assert len(warp) == 17, name + ": warp takes 17 knots"
        sys.path.insert(0, os.path.join(ROOT, "Tools"))
        from transition_warp import FUNC
        out.append((FUNC % ", ".join(warp)).rstrip())
        out.append("")
    huegain = meta.get("huegain", "0.1")
    out.append("/** Entry point of this shader stage (the file description says what it draws). */")
    out.append("void main()")
    out.append("{")
    out.append("    gKA = ( %s > 0.0 ) ? %s : 1.0;" % (knobs[0][0], knobs[0][0]))
    out.append("    gKB = ( %s > 0.0 ) ? %s : 1.0;" % (knobs[1][0], knobs[1][0]))
    out.append("    gSpd = ( speedP > 0.0 ) ? speedP : 1.0;")
    out.append("    vec2  p = gl_FragCoord.xy / resolution;")
    out.append("    float d = %s;" % ("evenProgress( clamp( 1.0 - interpolation, 0.0, 1.0 ) )" if warp else "clamp( 1.0 - interpolation, 0.0, 1.0 )"))
    out.append("    if ( d <= 0.0 )")
    out.append("    {")
    out.append("        fragColor = tA( p );")
    out.append("        return;")
    out.append("    }")
    out.append("    if ( d >= 1.0 )")
    out.append("    {")
    out.append("        fragColor = tB( p );")
    out.append("        return;")
    out.append("    }")
    out.append("    vec4 col = trans( p, d );")
    out.append("    col.rgb *= 1.0 + 0.05 * audioSwell * trMid( d );")
    out.append("    if ( hueP > 0.001 )")
    out.append("        col.rgb = hueRot( col.rgb, hueP * %s * trMid( d ) );" % huegain)
    out.append("    fragColor = col;")
    out.append("}")
    return "\n".join(out) + "\n"


def entry_xml(meta):
    name = meta["name"]
    knobs = [k.split(None, 3) for k in meta["knob"]]
    attrs = 'file="..\\Transitions\\%s.frag" type="normal"' % name
    if float(meta.get("minfade", "0") or 0) > 0:
        attrs += ' minFade="%s"' % meta["minfade"]
    if meta.get("moods"):
        attrs += ' mood="%s"' % meta["moods"]
    attrs += ' probability="%s" complexity="%s"' % (meta.get("prob", "0.06"), meta.get("cx", "1"))
    lines = ["  <TransitionShader %s>" % attrs]
    for n, lo, hi, _ in knobs:
        lines.append('    <float name="%s" minValue="%s" maxValue="%s"></float>' % (n, lo, hi))
    lines.append('    <float name="speedP" minValue="0.5" maxValue="2.0"></float>')
    lines.append('    <float name="hueP"   minValue="0.0" maxValue="6.28"></float>')
    lines.append("  </TransitionShader>")
    return "\n".join(lines) + "\n"


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "list"
    names = sys.argv[2:]
    drafts, order = read_drafts()
    if cmd == "list":
        print(len(order), " ".join(order))
        return
    names = names or order
    if cmd == "build":
        for n in names:
            io.open(os.path.join(OUT, n + ".frag"), "w", encoding="utf-8", newline="\n").write(build_one(drafts[n]))
            print("built", n)
        # The template's output is not yet in the house layout (comment wrapping, aligned uniform comments): the two
        # tools the release check runs bring it there, so a built file never shows up red in it.
        if os.environ.get("TGEN_RAW"):        # an intermediate build of the measuring loop: the layout comes at the end
            return
        tools = os.path.join(ROOT, "Tools")
        subprocess.call([sys.executable, os.path.join(tools, "doc_shaders.py")], cwd=ROOT)
        subprocess.call([sys.executable, os.path.join(tools, "cgvr_format.py")] + [os.path.join(OUT, n + ".frag") for n in names], cwd=ROOT)
    elif cmd == "register":
        s = io.open(KOMPLETT, encoding="utf-8", newline="").read()
        nl = "\r\n" if "\r\n" in s else "\n"
        s = s.replace("\r\n", "\n")
        add = ""
        for n in names:
            if ("Transitions\\%s.frag" % n) in s:
                print("already registered", n)
                continue
            add += "\n" + entry_xml(drafts[n])
            print("registered", n)
        if add:
            i = s.rindex("</TransitionShader>") + len("</TransitionShader>\n")
            s = s[:i] + add + s[i:]
            io.open(KOMPLETT, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
    else:
        raise SystemExit("unknown command " + cmd)


if __name__ == "__main__":
    main()
