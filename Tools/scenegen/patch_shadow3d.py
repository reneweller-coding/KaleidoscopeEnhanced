# -*- coding: utf-8 -*-
"""Patch (26.11.2026, plan U2): a shadow map for the mesh scenes that stand on a floor.

The host's shadow pass (RenderPipeline: renderShadowPass) draws the active scene
a second time, depth only, into a 2048 x 2048 map, when the scene's program
declares `texShadow`.  The seven scenes that had it so far project with the
host's light (lightM, a sun turning once in 105 s); the mesh scenes here have
their own fixed lamp, and their shading would disagree with a moving sun.  So
the block below projects along the scene's OWN lamp -- smClip(), the same
orthographic construction as RenderPipeline::updateLightMatrixGeneric(), around
a box the scene names (SmCentre, SmBox) -- in both stages: the vertex stage in
the depth pass, the fragment stage for the lookup.  The host's lightM is not
used.

The knob `uniform float shadowMapP` (fragment stage): 0 -- also when no preset
sets it -- = the old look and NO depth pass (EffectShader::usesShadow() reads
the knob for every program that declares it; the old seven are unchanged);
above 0 the lamp's light on the objects and the floor falls into shadow, the
floor by up to 65 % times the knob.  Every added line sits behind
`shadowMapP > 0.0` or `shadowPass > 0.5`, which stays 0 while the knob is 0.

Per scene: the lamp, the box, and the sites (vertex stage: the depth pass's
projection before `vec3 vp = world;`, never the sky shell; fragment stage: an
early return in the depth pass, the shadow on the lamp term of the objects and
on the floor in renderSky()).  Idempotent: on a re-run (markers present) only
the blocks are replaced.  doc_shaders.annotate() and cgvr_format.format_text()
run on each file, as in the generators.

  python Tools/scenegen/patch_shadow3d.py              # all scenes below
  python Tools/scenegen/patch_shadow3d.py MeshDominoWave
"""
import io, os, re, sys

SP = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(SP))
sys.path.insert(0, os.path.join(ROOT, "Tools"))
import cgvr_format                                          # noqa: E402
import doc_shaders                                          # noqa: E402

BEGIN = "// ---- shadow map of the scene's lamp (Tools/scenegen/patch_shadow3d.py) ----"
END = "// ---- end of the shadow map ----"

# name: (lamp direction as the scene writes it, box centre, box half size)
SCENES = {
    "MeshTuningForks": ("vec3( -0.3, 0.8, -0.5 )", "vec3( 0.0, Ground, Dist )", 40.0),
    "MeshDominoWave": ("vec3( 0.2, 0.7, -0.5 )", "vec3( 0.0, Ground, 55.0 )", 45.0),
    "MeshMetronomes": ("vec3( 0.3, 0.7, -0.55 )", "vec3( 0.0, Ground, 52.0 )", 45.0),
    "MeshSeismograph": ("vec3( 0.3, 0.7, -0.5 )", "vec3( 0.0, Ground, Dist )", 30.0),
    "MeshZoetrope": ("vec3( -0.55, 0.5, -0.5 )", "vec3( 0.0, Ground, Dist )", 30.0),
    "MeshFoundryPour": ("vec3( -0.2, 0.8, -0.5 )", "vec3( 0.0, Ground, Dist )", 35.0),
    "MeshPendulumWave": ("vec3( 0.0, 0.8, -0.6 )", "vec3( 0.0, -20.0, Dist )", 70.0),   # Ground: the .frag only
}

CONSTS = '''const vec3  SmLamp = {lamp}; ///< Toward the lamp main() shades with.
const vec3  SmCentre = {centre}; ///< Centre of the shadow box (world units).
const float SmBox = {box}; ///< Half size of the shadow box (world units).
'''

CLIP = r'''
/**  A point in the clip space of the lamp's shadow map: an orthographic view along the lamp onto the box around
 * SmCentre.
 *
 * @param p  The point (world units). (in)
 *
 * @return
 *   Its clip coordinates (w = 1).
 *
 * The construction of RenderPipeline::updateLightMatrixGeneric() -- eye 2 SmBox out along the lamp, looking at the
 * box centre, near 0.1, far 4 SmBox -- but along the scene's own lamp, so the shadows fall where its light says.
 **/
vec4 smClip( vec3 p )
{
    vec3  l = normalize( SmLamp );
    vec3  f = -l;
    vec3  up = ( abs( f.y ) > 0.98 ) ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 1.0, 0.0 );
    vec3  s = normalize( cross( f, up ) );
    vec3  u = cross( s, f );
    vec3  q = p - SmCentre - l * ( 2.0 * SmBox );
    float zn = 0.1, zf = 4.0 * SmBox;
    return vec4( dot( q, s ) / SmBox, dot( q, u ) / SmBox, ( 2.0 * dot( q, f ) - zf - zn ) / ( zf - zn ), 1.0 );
}
'''

LOOKUP = r'''
/**  How much of the lamp's light reaches a point: the shadow map, 3 x 3 taps on top of the hardware's own 2 x 2
 * comparison filter, the lookup lifted off the surface along its normal (no self-shadowing stripes).
 *
 * @param p  The point (world units). (in)
 * @param n  Its normal (unit length). (in)
 *
 * @return
 *   1 lit .. 0 in shadow; 1 outside the box.
 **/
float smShadow( vec3 p, vec3 n )
{
    vec3  l = normalize( SmLamp );
    float ndl = max( dot( n, l ), 0.0 );
    vec4  c = smClip( p + n * ( 2.0 * SmBox * shadowTexel * 2.2 / max( ndl, 0.15 ) ) );
    vec3  t = c.xyz * 0.5 + 0.5;
    if ( t.z > 1.0 || any( lessThan( t.xy, vec2( 0.0 ) ) ) || any( greaterThan( t.xy, vec2( 1.0 ) ) ) )
        return 1.0;
    float bias = 0.0006 + 0.0030 * ( 1.0 - ndl );
    float s = 0.0;
    for ( int y = -1; y <= 1; ++y )
        for ( int x = -1; x <= 1; ++x )
            s += texture( texShadow, vec3( t.xy + vec2( float( x ), float( y ) ) * 1.5 * shadowTexel, t.z - bias ) );
    return s / 9.0;
}
'''

VDECLS = [("shadowPass", "uniform float shadowPass; ///< 1 during the shadow map's depth-only pass.")]
FDECLS = [("shadowPass", "uniform float shadowPass; ///< 1 during the shadow map's depth-only pass."),
          ("texShadow", "uniform sampler2DShadow texShadow; ///< The lamp's shadow map (depth comparison)."),
          ("shadowTexel", "uniform float shadowTexel; ///< Size of a shadow-map texel (texture coordinates).")]
KNOB = "uniform float shadowMapP; ///< Lamp shadow: 0 = none (the old look, no depth pass) .. 1 = full.\n"

VSITE = ("    vec3 vp = world;\n",
         "    if ( shadowPass > 0.5 )\n"
         "    {\n"
         "        // The shadow map's depth pass (patch_shadow3d.py): the objects through the lamp's view, never the sky.\n"
         "        gl_Position = is_bg ? vec4( 0.0, 0.0, 2.0, 1.0 ) : smClip( world );\n"
         "        return;\n"
         "    }\n"
         "    vec3 vp = world;\n")
FSITE_MAIN = ("void main()\n{\n",
              "void main()\n{\n"
              "    if ( shadowPass > 0.5 )\n"
              "    {\n"
              "        fragColor = vec4( 0.0 ); // the depth pass (patch_shadow3d.py): nothing to shade\n"
              "        return;\n"
              "    }\n")
FSITE_FLOOR = ("        col = mix( vec3( 0.02 ), col, haze );\n",
               "        if ( shadowMapP > 0.0 )\n"
               "            col *= 1.0 - 0.65 * shadowMapP * ( 1.0 - smShadow( P, vec3( 0.0, 1.0, 0.0 ) ) ); // patch_shadow3d.py\n"
               "        col = mix( vec3( 0.02 ), col, haze );\n")
OBJ = re.compile(r"^    vec3 col = alb \* [^\n]*lamp_dir[^\n]*;\n", re.M)


def first_function(s):
    m = re.compile(r"^(?:vec[234]|float|int|void|mat[234]|bool|ivec[234])\s+\w+\s*\(", re.M).search(s)
    assert m, "no function"
    i = m.start()
    head = s[:i].rstrip()
    if head.endswith("*/"):
        j = head.rfind("/**")
        if j >= 0 and "*/" not in head[j:-2]:
            return head.rfind("\n", 0, j) + 1
    return i


def patch_file(path, block, sites):
    raw = io.open(path, "rb").read().decode("utf-8")
    crlf = "\r\n" in raw
    s = raw.replace("\r\n", "\n")
    done = BEGIN in s
    if done:
        a = s.index(BEGIN)
        b = s.index(END, a) + len(END) + 1
        s = s[:a] + s[b:].lstrip("\n")
    i = first_function(s)
    s = s[:i] + block(s) + s[i:]
    for old, new in ([] if done else sites):
        if hasattr(old, "search"):
            m = old.search(s)
            assert m and len(old.findall(s)) == 1, (path, old.pattern)
            s = s[:m.end()] + new + s[m.end():]
        else:
            assert s.count(old) == 1, (path, old[:60])
            s = s.replace(old, new)
    s = cgvr_format.format_text(doc_shaders.annotate(s, path), path)
    if crlf:
        s = s.replace("\n", "\r\n")
    if s != raw:
        io.open(path, "wb").write(s.encode("utf-8"))
        return "patched"
    return "unchanged"


def decls(s, table):
    return "".join(d + "\n" for n, d in table if not re.search(r"\buniform\s+\w+\s+%s\s*;" % n, s))


def patch(name):
    lamp, centre, box = SCENES[name]
    consts = CONSTS.format(lamp=lamp, centre=centre, box="%.1f" % box)
    vert = os.path.join(ROOT, "Scene3D", name + ".vert")
    frag = os.path.join(ROOT, "Scene3D", name + ".frag")
    rv = patch_file(vert, lambda s: BEGIN + "\n" + decls(s, VDECLS) + consts + CLIP + END + "\n\n", [VSITE])
    obj = (OBJ, "    if ( shadowMapP > 0.0 )\n"
                "        col *= 1.0 - shadowMapP * ( 1.0 - smShadow( vPos, n ) ); // the lamp's shadow (patch_shadow3d.py)\n")
    rf = patch_file(frag, lambda s: BEGIN + "\n" + decls(s, FDECLS) + KNOB + consts + CLIP + LOOKUP + END + "\n\n",
                    [FSITE_MAIN, obj, FSITE_FLOOR])
    print(name, rv, rf)


if __name__ == "__main__":
    for n in (sys.argv[1:] or sorted(SCENES)):
        patch(n)
