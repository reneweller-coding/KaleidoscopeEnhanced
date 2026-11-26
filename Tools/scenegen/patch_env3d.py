# -*- coding: utf-8 -*-
"""Patch (26.11.2026, plan U1): the photo as environment light for 3D scenes.

A shared GLSL block -- written into each scene file, no include (the decision of
14.10.) -- between the two marker lines BEGIN and END below:

  envUV(d)          a direction -> a coordinate in the photo.  The photo stands
                    behind the viewer, its centre straight back toward the eye;
                    the far half of the sphere of directions is the near half
                    mirrored at the plane z = 0.  uv = 0.5 + 0.6 * normalize(d).xy:
                    continuous over the whole sphere, no seam (the equirect
                    lookups the scenes had broke at atan's cut), no pole; past the
                    photo's edge the texture's mirrored repeat continues it.  Only
                    x = screen right and y = screen up matter -- the sign of z
                    does not, so view space and the scenes' own eye frames
                    (z away from the viewer) both work as they are.
  envPhoto(uv,lod)  tex0 and tex1 cross-faded with interpolation (1 = tex0), at
                    a mip level, .rgb only: the photo's alpha carries its depth
                    map from this round on.
  envDiffuse(n)     diffuse light: the very coarse mip 7 (8 x 8 texels of the
                    1024 photo) in the normal's direction.
  envReflect(r,rough)  the reflection: a mip from the roughness (1 + 6 rough),
                    never finer than the pixel's footprint in the photo
                    (screen-space derivatives -- call it outside pixel-dependent
                    branches).
  envFresnel(n,v,f0)   Schlick's approximation.

and the knob `uniform float envP` -- 0 (never set: no preset entry) = the old
look, every added line sits behind `if ( envP > 0.0 )`; above 0 the scene's
own environment lookup (where it had one) is replaced by the photo environment
and envP sets how strongly the photo's diffuse light adds.

Per scene a list of (old, new) pairs places the calls.  Idempotent: on a
re-run (the markers are there) only the block between the markers is
replaced; the sites are placed once.  Afterwards Tools/doc_shaders.annotate() and
Tools/cgvr_format.format_text() run on the file, as in the generators.

  python Tools/scenegen/patch_env3d.py            # all scenes below
  python Tools/scenegen/patch_env3d.py JellyBody  # some
"""
import io, os, re, sys

SP = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(SP))
sys.path.insert(0, os.path.join(ROOT, "Tools"))
import cgvr_format                                          # noqa: E402
import doc_shaders                                          # noqa: E402

BEGIN = "// ---- photo environment light (Tools/scenegen/patch_env3d.py) ----"
END = "// ---- end of the photo environment light ----"

DECLS = [("tex0", "uniform sampler2D tex0; ///< The current photo."),
         ("tex1", "uniform sampler2D tex1; ///< The next photo (cross-faded in by interpolation)."),
         ("interpolation", "uniform float interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.")]

BLOCK = r'''// The photo stands behind the viewer and lights the scene: the normal finds diffuse light in a very coarse mip, the
// reflected ray a reflection in a mip chosen by roughness.  At envP = 0 none of it runs and the scene renders as before.
uniform float envP; ///< Photo environment light: 0 = off (the old look) .. 1 = full; rolled per activation.

/**  Where a direction looks in the photo environment.
 *
 * @param d  The direction (any length): x screen right, y screen up; the sign of z does not matter. (in)
 *
 * @return
 *   The coordinate in the photo.
 *
 * The photo stands behind the viewer, its centre straight back toward the eye, and the far half of the sphere of
 * directions is the near half mirrored at the plane z = 0 -- so the map is continuous over the whole sphere (no seam,
 * no pole) and folds only where a direction turns from toward the viewer to away from it.  Past the photo's edge the
 * texture's mirrored repeat continues it.
 **/
vec2 envUV( vec3 d )
{
    return 0.5 + 0.6 * normalize( d ).xy;
}

/**  The photo as the environment sees it: tex0 and tex1 cross-faded with interpolation like img(), at a mip level,
 * colour only (the alpha channel carries the photo's depth).
 *
 * @param uv   Coordinate in the photo. (in)
 * @param lod  Mip level: 0 = full size, 7 = 8 x 8 texels of a 1024 photo. (in)
 *
 * @return
 *   The photo's colour (RGB).
 **/
vec3 envPhoto( vec2 uv, float lod )
{
    return interpolation * textureLod( tex0, uv, lod ).rgb + ( 1.0 - interpolation ) * textureLod( tex1, uv, lod ).rgb;
}

/**  Diffuse light from the photo: its very coarse mip in the normal's direction stands in for the light gathered over
 * the half sphere around the normal.
 *
 * @param n  The surface normal (frame as for envUV()). (in)
 *
 * @return
 *   The diffuse light (RGB), 0..1.
 **/
vec3 envDiffuse( vec3 n )
{
    return envPhoto( envUV( n ), 7.0 );
}

/**  The photo reflected along a ray, in a mip chosen by the roughness and never finer than the pixel's footprint in
 * the photo -- a small or strongly curved mirror does not shimmer.
 *
 * @param r      The reflected ray (frame as for envUV()). (in)
 * @param rough  Roughness: 0 = mirror .. 1 = matt (the diffuse mip). (in)
 *
 * @return
 *   The reflected light (RGB), 0..1.
 *
 * The footprint comes from screen-space derivatives: call it outside pixel-dependent branches.
 **/
vec3 envReflect( vec3 r, float rough )
{
    vec2  uv = envUV( r );
    vec2  ts = vec2( textureSize( tex0, 0 ) );
    vec2  dx = dFdx( uv ) * ts, dy = dFdy( uv ) * ts;
    float px = 0.5 * log2( max( max( dot( dx, dx ), dot( dy, dy ) ), 1.0 ) );
    return envPhoto( uv, max( px, 1.0 + 6.0 * clamp( rough, 0.0, 1.0 ) ) );
}

/**  How much light a surface reflects at this angle (Schlick's approximation of Fresnel's equations).
 *
 * @param n   The surface normal (unit length). (in)
 * @param v   The direction toward the eye (unit length). (in)
 * @param f0  The reflectance looking straight on. (in)
 *
 * @return
 *   The reflectance, f0..1.
 **/
float envFresnel( vec3 n, vec3 v, float f0 )
{
    return f0 + ( 1.0 - f0 ) * pow( 1.0 - clamp( dot( n, v ), 0.0, 1.0 ), 5.0 );
}
'''

# ---- the call sites ---------------------------------------------------------------------------------------------------
# Spectral family (SpectralOrb, SpectralTorus, JellyBody): no photo at all so far; the photo becomes the room.
SPECTRAL = ("    vec3 outc = col * 1.8;\n",
            "    if ( envP > 0.0 )\n"
            "    {\n"
            "        // The photo as the room (patch_env3d.py): its diffuse light on the body metal and its mirror image,\n"
            "        // strongest at grazing angles; the antinode glow stays on top.\n"
            "        col += base * envDiffuse( N ) * ( 1.1 * envP );\n"
            "        col += envReflect( reflect( -V, N ), 0.22 ) * envFresnel( N, V, 0.35 ) * ( 0.9 * envP );\n"
            "    }\n"
            "    vec3 outc = col * 1.8;\n")

# Sculptures with their own equirect env lookup (MetaSculpt, BloomSculpt): seam at atan's cut, tex0 only (the
# reflection jumped at every photo change), mip 0 (shimmer).
SCULPT = ("    vec3 env = textureLod( tex0, fract( env_uv ), 0.0 ).rgb;\n",
          "    vec3 env = textureLod( tex0, fract( env_uv ), 0.0 ).rgb;\n"
          "    if ( envP > 0.0 )\n"
          "    {\n"
          "        // The photo environment (patch_env3d.py): no seam, both photos, the mip by gloss; and its diffuse light.\n"
          "        env = envReflect( R, 0.5 - 0.45 * glossP );\n"
          "        col += base * envDiffuse( n ) * ( 0.6 * envP );\n"
          "    }\n")

SITES = {
    "SpectralOrb": [SPECTRAL],
    "SpectralTorus": [SPECTRAL],
    "JellyBody": [("    vec3 outc = col * 1.35;\n",
                   "    if ( envP > 0.0 )\n"
                   "    {\n"
                   "        // The photo as the room (patch_env3d.py): it lights the jelly and shines off its wet skin.\n"
                   "        col += body * envDiffuse( N ) * ( 0.9 * envP );\n"
                   "        col += envReflect( reflect( -V, N ), 0.08 ) * envFresnel( N, V, 0.06 ) * ( 1.3 * envP );\n"
                   "    }\n"
                   "    vec3 outc = col * 1.35;\n")],
    "MetaSculpt": [SCULPT],
    "BloomSculpt": [SCULPT],
    # The shell is shaded in a branch on dot( n, V ) -- pixel-dependent, so no derivatives: an explicit mip.
    "Detonation": [("        vec3  env = textureLod( tex0, fract( env_uv ), 0.0 ).rgb;\n",
                    "        vec3  env = textureLod( tex0, fract( env_uv ), 0.0 ).rgb;\n"
                    "        if ( envP > 0.0 )\n"
                    "        {\n"
                    "            // The photo environment (patch_env3d.py): no seam, both photos; an explicit mip, since this\n"
                    "            // branch depends on the pixel (no screen-space derivatives here).  And its diffuse light.\n"
                    "            env = envPhoto( envUV( R ), 2.5 );\n"
                    "            col += rock * envDiffuse( n ) * ( 0.5 * envP );\n"
                    "        }\n")],
    "Ocean": [("    vec3 sky = texture( tex0, fract( sky_uv ) ).rgb;\n",
               "    vec3 sky = texture( tex0, fract( sky_uv ) ).rgb;\n"
               "    if ( envP > 0.0 )\n"
               "        sky = envReflect( R, 0.12 ); // the photo environment (patch_env3d.py): no seam, both photos\n")],
    "ChromeFlow": [("    vec3  env_photo = img( env_uv );\n",
                    "    vec3  env_photo = img( env_uv );\n"
                    "    if ( envP > 0.0 )\n"
                    "        env_photo = envReflect( R, 0.10 ); // the photo environment (patch_env3d.py): no seam\n")],
    "MirrorShardKaleidoscope": [("    vec3 env_photo = img( env_uv );\n",
                                 "    vec3 env_photo = img( env_uv );\n"
                                 "    if ( envP > 0.0 )\n"
                                 "        env_photo = envReflect( R, 0.06 ); // the photo environment (patch_env3d.py): no seam\n")],
    # One environment for the sky shell and the mirror (the file's own principle): the photo term inside it.
    "ChromeForm": [("    col = mix( col, col + photo( pu ) * 0.55, smoothstep( -0.1, 0.5, h ) );\n",
                    "    vec3 ph = photo( pu );\n"
                    "    if ( envP > 0.0 )\n"
                    "        ph = envReflect( dir, 0.12 + 0.5 * clamp( brushP, 0.0, 1.0 ) ); // the photo environment (patch_env3d.py)\n"
                    "    col = mix( col, col + ph * 0.55, smoothstep( -0.1, 0.5, h ) );\n")],
}

FUNC = re.compile(r"^(?:vec[234]|float|int|void|mat[234]|bool|ivec[234])\s+\w+\s*\(", re.M)


def first_function(s):
    """Offset where the block goes: before the first top-level function and the doc comment right above it."""
    m = FUNC.search(s)
    assert m, "no function"
    i = m.start()
    head = s[:i].rstrip()
    if head.endswith("*/"):
        j = head.rfind("/**")
        if j >= 0 and "*/" not in head[j:-2]:
            line0 = head.rfind("\n", 0, j) + 1
            return line0
    return i


def patch(name):
    p = os.path.join(ROOT, "Scene3D", name + ".frag")
    raw = io.open(p, "rb").read().decode("utf-8")
    crlf = "\r\n" in raw
    s = raw.replace("\r\n", "\n")
    done = BEGIN in s                       # sites placed by an earlier run (formatting may have re-aligned them)
    if done:
        a = s.index(BEGIN)
        b = s.index(END, a) + len(END) + 1
        s = s[:a] + s[b:].lstrip("\n")
    decl = "".join(d + "\n" for n, d in DECLS
                   if not re.search(r"\buniform\s+\w+\s+%s\s*;" % n, s))
    blk = BEGIN + "\n" + decl + BLOCK + END + "\n\n"
    i = first_function(s)
    s = s[:i] + blk + s[i:]
    for old, new in ([] if done else SITES[name]):
        assert s.count(old) == 1, (name, old[:60])
        s = s.replace(old, new)
    s = cgvr_format.format_text(doc_shaders.annotate(s, p), p)
    if crlf:
        s = s.replace("\n", "\r\n")
    if s != raw:
        io.open(p, "wb").write(s.encode("utf-8"))
        print(name, "patched")
    else:
        print(name, "unchanged")


if __name__ == "__main__":
    for n in (sys.argv[1:] or sorted(SITES)):
        patch(n)
