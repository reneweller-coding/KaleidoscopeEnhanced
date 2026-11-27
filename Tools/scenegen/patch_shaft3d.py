# -*- coding: utf-8 -*-
"""Patch (27.11.2026, sprint "shafts3d"): light shafts in the mesh scenes that have the lamp's shadow map.

patch_shadow3d.py (plan U2) gave seven mesh scenes on a floor a shadow map of their own lamp -- smClip(), texShadow,
SmLamp, SmCentre, SmBox, behind the knob shadowMapP.  With the map in the fragment stage the lamp's light can be
followed through the AIR: smShafts() walks the view ray from the eye (the origin in these scenes) to the surface
point in 12 steps, asks the shadow map at every step whether the lamp sees that point, and adds the light a thin
haze would scatter toward the eye there -- beams of light with the objects' shadows cut into them.

  * 12 steps, the start offset jittered per pixel with a STATIC interleaved-gradient noise (no time in it): the
    bands of the coarse stepping become a fine fixed grain, nothing flickers.
  * The haze lies on the floor: its density falls with the height above SmCentre.y and fades toward the edge of a
    sphere of 1.6 SmBox around SmCentre, so the volume has no visible border and the 12 steps are spent where the
    map is.
  * A Henyey-Greenstein lobe (g = 0.45) toward the lamp, the lamp's colour, strength 0.75 .. 1 with the scene's
    slow swell (audioSwell: seconds, no beat in it).  Added as a screen blend after the scene's tone mapping, so
    the result stays in 0..1.

The knob `uniform float shaftP` (fragment stage): 0 -- also when no preset sets it -- = the old code, bit for bit
(both call sites sit behind `shaftP > 0.0 && shadowMapP > 0.0`); it only acts where shadowMapP is on, because only
then the host renders the depth pass (EffectShader::usesShadow()).  No C++: scene knobs reach the shader
generically.

Run AFTER patch_shadow3d.py (the block needs its functions and goes right behind its end marker).  Idempotent: on
a re-run (markers present) only the block is replaced; a shadow block that a later run of patch_shadow3d.py put
inside this one is moved out in front again.  Only the .frag changes.  doc_shaders.annotate() and
cgvr_format.format_text() run on each file, as in the generators.

  python Tools/scenegen/patch_shaft3d.py              # all scenes below
  python Tools/scenegen/patch_shaft3d.py MeshZoetrope
"""
import io, os, sys

SP = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(SP))
sys.path.insert(0, os.path.join(ROOT, "Tools"))
sys.path.insert(0, SP)
import cgvr_format                                          # noqa: E402
import doc_shaders                                          # noqa: E402
import patch_shadow3d                                       # noqa: E402

BEGIN = "// ---- light shafts of the scene's lamp (Tools/scenegen/patch_shaft3d.py) ----"
END = "// ---- end of the light shafts ----"

# name: the lamp's colour as the scene's lamp term writes it (`vec3 col = alb * <colour> * max( dot( n, lamp_dir ) ...`)
SCENES = {
    "MeshTuningForks": "vec3( 1.0, 0.88, 0.7 )",
    "MeshDominoWave": "vec3( 1.0, 0.9, 0.75 )",
    "MeshMetronomes": "vec3( 1.0, 0.88, 0.7 )",
    "MeshSeismograph": "vec3( 1.0, 0.9, 0.75 )",
    "MeshZoetrope": "vec3( 1.0, 0.82, 0.55 )",
    "MeshFoundryPour": "vec3( 0.7, 0.7, 0.75 )",
    "MeshPendulumWave": "vec3( 1.0, 0.92, 0.8 )",
}

BLOCK = r'''uniform float shaftP; ///< Light shafts in the haze: 0 = none (the old look) .. 1 = strong; acts only with shadowMapP > 0.
const vec3  ShaftCol = {col}; ///< Colour of the lamp's light in the haze.

/**  Whether the lamp sees a point in the air: one lookup of the shadow map (the hardware's 2 x 2 comparison filter).
 *
 * @param p  The point (world units). (in)
 *
 * @return
 *   1 lit .. 0 in an object's shadow; 1 outside the map.
 **/
float smLit( vec3 p )
{
    vec3 t = smClip( p ).xyz * 0.5 + 0.5;
    if ( t.z > 1.0 || any( lessThan( t.xy, vec2( 0.0 ) ) ) || any( greaterThan( t.xy, vec2( 1.0 ) ) ) )
        return 1.0;
    return textureLod( texShadow, vec3( t.xy, t.z - 0.0015 ), 0.0 );
}

/**  The lamp's light scattered toward the eye by a thin haze over the floor, added to a pixel: light shafts with the
 * objects' shadows cut into them.
 *
 * @param col  The pixel's colour so far, 0..1. (in)
 * @param p    The surface point the pixel shows (world units, the eye at the origin); of the sky shell only the
 *             direction counts. (in)
 * @param sky  True for the sky shell: the ray ends on the floor (below the horizon) or leaves the haze. (in)
 *
 * @return
 *   The colour with the haze's light added (a screen blend, stays in 0..1).
 *
 * 12 steps through the part of the ray inside a sphere of 1.6 SmBox around SmCentre, the start jittered with a
 * static interleaved-gradient noise; the haze's density falls with the height above the floor and toward the edge of
 * the sphere; a Henyey-Greenstein lobe (g = 0.45) toward the lamp; 0.75 .. 1 with the slow swell.
 **/
vec3 smShafts( vec3 col, vec3 p, bool sky )
{
    const int   Steps = 12;
    const float G = 0.45;
    float       radius = 1.6 * SmBox;
    vec3        dir = normalize( p );
    float       b = dot( dir, SmCentre );
    float       disc = b * b - dot( SmCentre, SmCentre ) + radius * radius;
    if ( disc <= 0.0 )
        return col;
    float root = sqrt( disc );
    float t0 = max( b - root, 0.0 );
    float t1 = b + root;
    if ( !sky )
        t1 = min( t1, length( p ) );
    else if ( dir.y < -0.004 )
        t1 = min( t1, SmCentre.y / dir.y );
    if ( t1 <= t0 )
        return col;
    float ds = ( t1 - t0 ) / float( Steps );
    float jit = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
    float sum = 0.0;
    for ( int i = 0; i < Steps; ++i )
    {
        vec3  q = dir * ( t0 + ( float( i ) + jit ) * ds );
        float fog = exp( -max( q.y - SmCentre.y, 0.0 ) / ( 0.45 * SmBox ) )
                    * ( 1.0 - smoothstep( 0.5 * radius, radius, distance( q, SmCentre ) ) );
        sum += fog * smLit( q );
    }
    float c = dot( dir, normalize( SmLamp ) );
    float phase = ( 1.0 - G * G ) / pow( 1.0 + G * G - 2.0 * G * c, 1.5 );
    float env = 0.75 + 0.25 * clamp( audioSwell, 0.0, 1.0 );
    vec3  s = ShaftCol * ( shaftP * 0.6 * env * phase * sum * ds / SmBox );
    return col + ( 1.0 - col ) * ( 1.0 - exp( -s ) );
}
'''

SITE_SKY = ("        fragColor = vec4( renderSky( normalize( vPos ) ), 1.0 );\n",
            "        fragColor = vec4( renderSky( normalize( vPos ) ), 1.0 );\n"
            "        if ( shaftP > 0.0 && shadowMapP > 0.0 )\n"
            "            fragColor.rgb = smShafts( fragColor.rgb, vPos, true ); // patch_shaft3d.py\n")
SITE_OBJ = ("    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );\n}",
            "    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );\n"
            "    if ( shaftP > 0.0 && shadowMapP > 0.0 )\n"
            "        fragColor.rgb = smShafts( fragColor.rgb, vPos, false ); // patch_shaft3d.py\n}")
# A second exit of main() (MeshSeismograph: the paper on the drum, shaded and tone mapped on its own).
SITE_OBJ2 = ("        fragColor = vec4( clamp( _t, 0.0, 1.0 ), 1.0 );\n",
             "        fragColor = vec4( clamp( _t, 0.0, 1.0 ), 1.0 );\n"
             "        if ( shaftP > 0.0 && shadowMapP > 0.0 )\n"
             "            fragColor.rgb = smShafts( fragColor.rgb, vPos, false ); // patch_shaft3d.py\n")


def patch(name):
    path = os.path.join(ROOT, "Scene3D", name + ".frag")
    raw = io.open(path, "rb").read().decode("utf-8")
    crlf = "\r\n" in raw
    s = raw.replace("\r\n", "\n")
    assert patch_shadow3d.BEGIN in s and patch_shadow3d.END in s, (name, "no shadow map: run patch_shadow3d.py first")
    assert "uniform float audioSwell;" in s, (name, "no audioSwell")
    done = BEGIN in s
    if done:
        a = s.index(BEGIN)
        b = s.index(END, a) + len(END) + 1
        inner = s[a:b]
        keep = ""
        if patch_shadow3d.BEGIN in inner:     # patch_shadow3d.py ran again and put its block inside this one
            i = inner.index(patch_shadow3d.BEGIN)
            j = inner.index(patch_shadow3d.END, i) + len(patch_shadow3d.END) + 1
            keep = inner[i:j] + "\n"
        s = s[:a] + keep + s[b:].lstrip("\n")
    i = s.index(patch_shadow3d.END) + len(patch_shadow3d.END) + 1
    s = s[:i] + "\n" + BEGIN + "\n" + BLOCK.replace("{col}", SCENES[name]) + END + "\n\n" + s[i:].lstrip("\n")
    for old, new, needed in ((SITE_SKY[0], SITE_SKY[1], True), (SITE_OBJ[0], SITE_OBJ[1], True),
                             (SITE_OBJ2[0], SITE_OBJ2[1], False)):
        if new in s or (not needed and old not in s):
            continue                                        # already there / a site only some scenes have
        assert s.count(old) == 1, (name, old[:60])
        s = s.replace(old, new)
    s = cgvr_format.format_text(doc_shaders.annotate(s, path), path)
    if crlf:
        s = s.replace("\n", "\r\n")
    if s != raw:
        io.open(path, "wb").write(s.encode("utf-8"))
        print(name, "patched")
    else:
        print(name, "unchanged")


if __name__ == "__main__":
    for n in (sys.argv[1:] or sorted(SCENES)):
        patch(n)
