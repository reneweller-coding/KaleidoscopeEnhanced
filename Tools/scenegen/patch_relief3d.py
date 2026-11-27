# -*- coding: utf-8 -*-
"""Patch (27.11.2026, plan P4): the photo's depth as a relief on the surfaces of 3D scenes that the photo covers.

A shared GLSL block -- written into each scene file, no include (the decision of
14.10.) -- between the two marker lines BEGIN and END below:

  ReliefFrame       the screen-space derivatives of the shaded point and of the
                    photo coordinate (Mikkelsen's sigma_x, sigma_y).
  reliefFrame(p,uv) takes them: call it where all four pixels of a 2 x 2 quad
                    run the same code (outside pixel-dependent branches).
  reliefDepth(uv,lod)  the photo's depth (the alpha channel of tex0 and tex1,
                    255 = near), the two slots cross-faded with interpolation,
                    each only where it carries a map (photoDepthAmt).
  reliefNormal(n,f,uv,amt)  the normal tilted by the relief: Mikkelsen 2010,
                    "Bump Mapping Unparametrized Surfaces on the GPU" -- the
                    surface gradient from the derivatives of the position, no
                    vertex tangents (his frame with the facet's own normal,
                    the gradient laid into the shading normal's plane).  The
                    height's slope in the photo comes from taps of two coarse
                    mips (reliefSlope(); the 8-bit map would draw terraces),
                    steep edges compressed; the chain rule carries it to the
                    screen.

and the knob `uniform float reliefP` -- 0 (never set: no preset entry) = the
old look, every added line sits behind `if ( reliefP > 0.0 )`; above 0 the
scene's own lighting sees the tilted normal, reliefP sets the relief's depth.

Stage 2 (BLOCK2, SITES2; only in the scenes named there): the knob
`uniform float reliefParP` and reliefParallax() -- the photo's coordinate
shifted along the view ray by the same depth map (steep parallax: at most 10
linear samples and 3 secant steps, the tangent frame from the same
derivatives), reliefPhoto() reads the colour there.  0 = stage 1 only.

Per scene a list of (old, new) pairs places the calls.  Idempotent: on a
re-run (the markers are there) only the block between the markers is
replaced; the sites are placed once.  Afterwards Tools/doc_shaders.annotate() and
Tools/cgvr_format.format_text() run on the file, as in the generators.

  python Tools/scenegen/patch_relief3d.py            # all scenes below
  python Tools/scenegen/patch_relief3d.py OrreryBrass  # some
"""
import io, os, re, sys

SP = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(SP))
sys.path.insert(0, os.path.join(ROOT, "Tools"))
import cgvr_format                                          # noqa: E402
import doc_shaders                                          # noqa: E402

BEGIN = "// ---- photo relief (Tools/scenegen/patch_relief3d.py) ----"
END = "// ---- end of the photo relief ----"

DECLS = [("tex0", "uniform sampler2D tex0; ///< The current photo."),
         ("tex1", "uniform sampler2D tex1; ///< The next photo (cross-faded in by interpolation)."),
         ("interpolation", "uniform float interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.")]

BLOCK = r'''// The photo's depth map (its alpha channel) is a height on the surfaces the photo covers: its slope tilts the normal,
// and the scene lights the tilted normal as before.  At reliefP = 0 none of it runs and the scene renders as before.
uniform float reliefP;       ///< Photo relief: 0 = off (the old look) .. 1 = full depth; rolled per activation.
uniform vec2  photoDepthAmt; ///< 1 where the photo slot carries a depth map (x: tex0, y: tex1), else 0.

/** The screen-space derivatives a relief needs at one pixel (Mikkelsen's sigma_x and sigma_y, and the photo's). */
struct ReliefFrame
{
    vec3 sx; ///< Shaded point per pixel to the right.
    vec3 sy; ///< Shaded point per pixel up.
    vec2 ux; ///< Photo coordinate per pixel to the right.
    vec2 uy; ///< Photo coordinate per pixel up.
};

/**  The derivatives a relief needs at this pixel.
 *
 * @param p   The shaded point, in the frame of the normal later given to reliefNormal(). (in)
 * @param uv  The photo coordinate, continuous: before a fract() that tiles it (the tiles' seams are steps). (in)
 *
 * @return
 *   The pixel's derivatives.
 *
 * Screen-space derivatives: call it where all four pixels of a 2 x 2 quad run the same code -- outside branches that
 * depend on the pixel (a branch on a value constant per primitive is fine: a quad belongs to one primitive).
 **/
ReliefFrame reliefFrame( vec3 p, vec2 uv )
{
    ReliefFrame f;
    f.sx = dFdx( p );
    f.sy = dFdy( p );
    f.ux = dFdx( uv );
    f.uy = dFdy( uv );
    return f;
}

/**  The photo's depth at a coordinate: both slots cross-faded with interpolation like img(), each only where it
 * carries a depth map.
 *
 * @param uv   Coordinate in the photo. (in)
 * @param lod  Mip level: 0 = full size, 2 = 256 x 256 texels of a 1024 photo. (in)
 *
 * @return
 *   The depth, 0 = far (or no map) .. 1 = near.
 **/
float reliefDepth( vec2 uv, float lod )
{
    return interpolation * photoDepthAmt.x * textureLod( tex0, uv, lod ).a
           + ( 1.0 - interpolation ) * photoDepthAmt.y * textureLod( tex1, uv, lod ).a;
}

/**  The slope of the photo's depth: four taps on the diagonals, one texel of the level out (each a bilinear mean of
 * four texels: together a 3 x 3 Sobel-like kernel of that level).
 *
 * @param uv   Coordinate in the photo. (in)
 * @param lod  Mip level. (in)
 *
 * @return
 *   d depth / d uv.
 **/
vec2 reliefSlope( vec2 uv, float lod )
{
    vec2  e = exp2( lod ) / vec2( textureSize( tex0, 0 ) ); // one texel of that level
    float a = reliefDepth( uv + vec2( -e.x, -e.y ), lod );
    float b = reliefDepth( uv + vec2( e.x, -e.y ), lod );
    float c = reliefDepth( uv + vec2( -e.x, e.y ), lod );
    float d = reliefDepth( uv + vec2( e.x, e.y ), lod );
    return vec2( ( b + d ) - ( a + c ), ( c + d ) - ( a + b ) ) / ( 4.0 * e );
}

/**  The surface normal tilted by the photo's relief (Mikkelsen 2010, "Bump Mapping Unparametrized Surfaces on the
 * GPU").
 *
 * @param n    The surface normal: unit length, pointing out of the surface (the relief rises along it), in the frame
 *             of the point given to reliefFrame(). (in)
 * @param f    The pixel's derivatives (reliefFrame()). (in)
 * @param uv   The photo coordinate as the scene samples the colour (tiled or not). (in)
 * @param amt  Depth of the relief: 1 = 15 % of the photo's width on the surface (less on the map's steep edges). (in)
 *
 * @return
 *   The tilted normal (unit length); n itself where the photo has no map, where the photo is minified so far that a
 *   relief would only shimmer (or at a seam of its tiling), and where the derivatives degenerate.
 *
 * The depth's slope in the photo comes from taps of coarse mips (reliefSlope()), not from the screen derivative of
 * the depth: the 8-bit map is flat between its steps, a derivative of it would draw terraces.  Two scales, averaged:
 * level 2 (256 texels of the 1024 photo, coarser as the photo shrinks on the screen) for the detail, two levels
 * coarser for the shapes -- with the fine one alone the relief was the photo's depth edges as thin lines and little
 * else.  The chain rule takes the slope to the screen (dh/dx = grad h . duv/dx), Mikkelsen's surface gradient onto
 * the surface, with the facet's own normal c = sx x sy in his frame:
 *   grad_s h = ( h_x ( sy x c ) + h_y ( c x sx ) ) / ( c . c ),   n' = normalize( n - A ( grad_s h )_n ),
 * ( )_n the part in the plane of the shading normal n.  With n itself in the frame (the paper's form) the determinant
 * n . ( sx x sy ) vanished wherever a scene's analytic normal stands far from its coarse facets (the dunes: dark
 * cracks).  The relief's depth A is a share of the photo's extent on the surface (world length per unit of uv), so the
 * tilt does not depend on the scene's scale.  The map's edges are steps (an object in front of another): their slope
 * is compressed (g / (1 + |g| / 8)) and the tilt softly limited below about 45 degrees -- uncompressed, the edges
 * saturated at any depth.  Only textureLod() here: it may run inside pixel-dependent branches
 * (reliefFrame() may not).
 **/
vec3 reliefNormal( vec3 n, ReliefFrame f, vec2 uv, float amt )
{
    vec2  ts = vec2( textureSize( tex0, 0 ) );
    vec2  ax = f.ux * ts, ay = f.uy * ts;
    float fp = sqrt( max( dot( ax, ax ), dot( ay, ay ) ) ); // the pixel's footprint in texels of the full photo
    float fade = 1.0 - smoothstep( 24.0, 64.0, fp );
    vec3  c = cross( f.sx, f.sy ); // the facet's own normal (n may be a smooth or analytic one that differs)
    vec3  r1 = cross( f.sy, c ), r2 = cross( c, f.sx );
    float det = dot( c, c );
    float uvl = dot( f.ux, f.ux ) + dot( f.uy, f.uy );
    float has = interpolation * photoDepthAmt.x + ( 1.0 - interpolation ) * photoDepthAmt.y;
    if ( !( has > 0.0 ) || !( fade > 0.0 ) || !( abs( det ) > 1e-20 ) || !( uvl > 1e-16 ) || !( amt > 0.0 ) )
        return n;
    float lod = clamp( log2( max( fp, 1.0 ) ) + 1.0, 2.0, 6.0 );
    vec2  g = 0.5 * ( reliefSlope( uv, lod ) + reliefSlope( uv, lod + 2.0 ) ); // depth per unit of uv
    g /= 1.0 + length( g ) * 0.125; // a step of the map is an occlusion edge, not a cliff: steep slopes compressed
    float wl = sqrt( ( dot( f.sx, f.sx ) + dot( f.sy, f.sy ) ) / uvl ); // world length per unit of uv
    vec3  sg = ( dot( g, f.ux ) * r1 + dot( g, f.uy ) * r2 ) / det;     // the surface gradient of the depth
    sg -= n * dot( n, sg ) / max( dot( n, n ), 1e-6 );                     // ... in the plane of the shading normal
    vec3  t = sg * ( 0.15 * amt * wl * fade );
    t /= sqrt( 1.0 + dot( t, t ) * 1.23 ); // soft limit: |t| < 0.9
    return normalize( n - t );
}
'''

# Stage 2 (27.11.2026, plan P4 second stage): parallax inside the surface.  Appended to the block only in the scenes
# of SITES2, so the other scenes' files stay as they are.
BLOCK2 = r'''
// Stage 2: the same depth map shifts the photo's coordinate along the view ray (steep parallax with a refinement), so
// the photo has depth inside the surface when the view onto it changes.  At reliefParP = 0 none of it runs.
uniform float reliefParP; ///< Photo parallax: 0 = off (stage 1 only) .. 1 = a depth of 4 % of the photo's width.

/**  The photo's height for the parallax march: 0.5 = the surface itself (and a slot without a depth map), the two
 * slots cross-faded with interpolation.
 *
 * @param uv    Coordinate in the photo. (in)
 * @param lod   Mip level. (in)
 * @param tile  Above 0.5: the photo tiles (the coordinate wraps); else it is clamped to the photo. (in)
 * @param w0    Weight of tex0's map: interpolation where the slot carries a map, else 0. (in)
 * @param w1    Weight of tex1's map. (in)
 *
 * @return
 *   The height, 0 = deepest .. 1 = the top.
 **/
float reliefParHeight( vec2 uv, float lod, float tile, float w0, float w1 )
{
    vec2  q = tile > 0.5 ? fract( uv ) : clamp( uv, 0.0, 1.0 );
    float h = 0.5;
    if ( w0 > 0.0 ) // uniforms: between two photo changes only one slot is read
        h += w0 * ( textureLod( tex0, q, lod ).a - 0.5 );
    if ( w1 > 0.0 )
        h += w1 * ( textureLod( tex1, q, lod ).a - 0.5 );
    return h;
}

/**  The shift of the photo coordinate by the photo's depth seen along the view ray (steep parallax mapping: at most
 * 10 linear samples, then 3 secant steps).
 *
 * @param n     The surface normal (any length, either side), in the frame of the point given to reliefFrame(). (in)
 * @param v     From the shaded point to the eye (any length), same frame. (in)
 * @param f     The pixel's derivatives (reliefFrame()). (in)
 * @param uv    The photo coordinate, continuous (before a fract() that tiles it). (in)
 * @param amt   Depth of the height field: 1 = 4 % of the photo's width on the surface. (in)
 * @param tile  Above 0.5: the photo tiles; else the shift fades out toward the photo's border. (in)
 *
 * @return
 *   The offset to add to the photo coordinate; 0 where the photo has no map, where it is minified so far that the
 *   relief is off too, and where the derivatives degenerate.
 *
 * The tangent frame comes from the pixel's derivatives, no vertex tangents: the surface gradients of u and v,
 *   grad u = ( ux.x ( sy x c ) + uy.x ( c x sx ) ) / ( c . c ),   c = sx x sy   (grad v with the y components),
 * so a step dp on the surface moves the coordinate by ( grad u . dp, grad v . dp ).  The ray below the surface: at
 * depth z it has moved by -z vt / ( n . v ) along the surface (vt: the view direction's part in the surface), with
 * n . v limited to 0.35 (a grazing view would smear the photo).  The height 0.5 lies on the surface, so a flat map
 * shifts nothing and the photo keeps its place on average.  The march runs in layers from the top (height 1) down
 * until the ray is below the map, then three secant steps between the last two samples.  The height is read from
 * mip level 2 or coarser (as the relief's slope: the 8-bit map's terraces are smoothed by the filter).  Only
 * textureLod() here: it may run inside pixel-dependent branches (reliefFrame() may not).
 **/
vec2 reliefParallax( vec3 n, vec3 v, ReliefFrame f, vec2 uv, float amt, float tile )
{
    vec2  ts = vec2( textureSize( tex0, 0 ) );
    vec2  ax = f.ux * ts, ay = f.uy * ts;
    float fp = sqrt( max( dot( ax, ax ), dot( ay, ay ) ) ); // the pixel's footprint in texels of the full photo
    float fade = 1.0 - smoothstep( 24.0, 64.0, fp );
    vec3  c = cross( f.sx, f.sy );
    float det = dot( c, c );
    float uvl = dot( f.ux, f.ux ) + dot( f.uy, f.uy );
    float w0 = interpolation * photoDepthAmt.x, w1 = ( 1.0 - interpolation ) * photoDepthAmt.y;
    float vl = dot( v, v ), nl = dot( n, n );
    if ( !( w0 + w1 > 0.0 ) || !( fade > 0.0 ) || !( abs( det ) > 1e-20 ) || !( uvl > 1e-16 ) || !( amt > 0.0 )
         || !( vl > 1e-12 ) || !( nl > 1e-12 ) )
        return vec2( 0.0 );
    if ( tile < 0.5 )
    {
        vec2 b = min( uv, 1.0 - uv ); // an untiled photo: no shift at its border (nothing lies beyond it)
        amt *= smoothstep( 0.0, 0.08, min( b.x, b.y ) );
    }
    v *= inversesqrt( vl );
    n *= inversesqrt( nl );
    float vn = dot( n, v );
    vec3  vt = v - n * vn;
    vec3  r1 = cross( f.sy, c ), r2 = cross( c, f.sx );
    vec3  gu = ( f.ux.x * r1 + f.uy.x * r2 ) / det;                      // the surface gradient of u
    vec3  gv = ( f.ux.y * r1 + f.uy.y * r2 ) / det;                      // ... and of v
    float wl = sqrt( ( dot( f.sx, f.sx ) + dot( f.sy, f.sy ) ) / uvl ); // world length per unit of uv
    // The coordinate's change from the top layer (height 1) to the bottom (height 0) along the ray.
    vec2  d = -vec2( dot( gu, vt ), dot( gv, vt ) ) * ( 0.04 * amt * fade * wl / max( abs( vn ), 0.35 ) );
    float lod = clamp( log2( max( fp, 1.0 ) ) + 1.0, 2.0, 6.0 );
    vec2  u0 = uv - 0.5 * d; // where the ray enters the top layer (the surface is the layer 0.5)
    // g( t ) = ( 1 - height ) - t: above 0 while the ray is over the map.
    float ta = 0.0, ga = 1.0 - reliefParHeight( u0, lod, tile, w0, w1 );
    float tb = 1.0, gb = -0.05;
    for ( int i = 1; i < 10; i++ )
    {
        float t = float( i ) * 0.1;
        float g = 1.0 - reliefParHeight( u0 + d * t, lod, tile, w0, w1 ) - t;
        if ( g <= 0.0 )
        {
            tb = t;
            gb = g;
            break;
        }
        ta = t;
        ga = g;
    }
    for ( int i = 0; i < 3; i++ )
    {
        float t = ta + ( tb - ta ) * ga / max( ga - gb, 1e-6 );
        float g = 1.0 - reliefParHeight( u0 + d * t, lod, tile, w0, w1 ) - t;
        if ( g > 0.0 )
        {
            ta = t;
            ga = g;
        }
        else
        {
            tb = t;
            gb = g;
        }
    }
    float th = ta + ( tb - ta ) * ga / max( ga - gb, 1e-6 );
    return d * ( th - 0.5 );
}

/**  The photo's colour at a shifted coordinate, filtered with the unshifted coordinate's footprint (the shift jumps at
 * the map's edges: the implicit derivatives of the shifted coordinate would pick a blurred mip there, a line).
 *
 * @param uv  Coordinate in the photo (shifted by reliefParallax()). (in)
 * @param f   The pixel's derivatives (reliefFrame()). (in)
 *
 * @return
 *   The cross-faded photo colour (RGB).
 **/
vec3 reliefPhoto( vec2 uv, ReliefFrame f )
{
    return ( interpolation * textureGrad( tex0, uv, f.ux, f.uy )
             + ( 1.0 - interpolation ) * textureGrad( tex1, uv, f.ux, f.uy ) ).rgb;
}
'''

# ---- the call sites---------------------------------------------------------------------------------------------------
# Tessellated terrains: the photo tiled over the ground (world xz), the normal from the tessellation stage, lit by one
# sun.  Each gets the relief right where its normal is made, so every light term of the surface sees it.
SITES = {
    "TessellatedLavaLake": [(
        "    vec3 photo = img( cuv );\n",
        "    vec3 photo = img( cuv );\n"
        "    if ( reliefP > 0.0 ) // the photo's relief in the crust (patch_relief3d.py)\n"
        "        n = reliefNormal( n, reliefFrame( vWorld, vWorld.xz * 0.02 + vPlate * 0.37 ), cuv, reliefP );\n")],
    "EuropaChaosTerrain": [(
        "    vec3 photo = img( iuv );\n",
        "    vec3 photo = img( iuv );\n"
        "    if ( reliefP > 0.0 ) // the photo's relief in the ice (patch_relief3d.py)\n"
        "        n = reliefNormal( n, reliefFrame( vWorld, vWorld.xz * 0.015 + vRaft * 0.41 ), iuv, reliefP );\n")],
    "PermafrostPolygons": [(
        "    vec3  n = normalize( vNormal );\n",
        "    vec3  n = normalize( vNormal );\n"
        "    if ( reliefP > 0.0 ) // the photo's relief in the ground pattern (patch_relief3d.py)\n"
        "        n = reliefNormal( n, reliefFrame( vWorld, vWorld.xz * 0.02 + vCell * 0.3 ),\n"
        "                          fract( vWorld.xz * 0.02 + vCell * 0.3 ), reliefP );\n")],
    "TravertineTerracePools": [(
        "    vec3  n = normalize( vNormal );\n",
        "    vec3  n = normalize( vNormal );\n"
        "    if ( reliefP > 0.0 ) // the photo's relief in the crust's banding (patch_relief3d.py)\n"
        "        n = reliefNormal( n, reliefFrame( vWorld, vec2( vWorld.x * 0.02, vWorld.z * 0.014 ) ),\n"
        "                          clamp( vec2( fract( vWorld.x * 0.02 ), fract( vWorld.z * 0.014 ) ), 0.0, 1.0 ), reliefP );\n")],
    "GlacierTessellation": [(
        "    vec3  n = normalize( vNormal );\n",
        "    vec3  n = normalize( vNormal );\n"
        "    if ( reliefP > 0.0 ) // the photo's relief carved into the ice (patch_relief3d.py)\n"
        "        n = reliefNormal( n, reliefFrame( vWorld, vUV ), vUV, reliefP );\n")],
    # The rock between the crystals, not the crystals.
    "CrystallineCavernTessellation": [(
        "    vec3 n = normalize( teNormal );\n",
        "    vec3 n = normalize( teNormal );\n"
        "    if ( reliefP > 0.0 ) // the photo's relief in the rock, not on the crystals (patch_relief3d.py)\n"
        "        n = reliefNormal( n, reliefFrame( tePos, teUV * 3.0 ), fract( teUV * 3.0 ),\n"
        "                          reliefP * ( 1.0 - smoothstep( 0.2, 0.8, teCrystal ) ) );\n")],
    # The dune field: one photo stretched over the whole carpet; the dunes' own normal goes into diffuse and glint.
    # Half the depth: the dunes are lit hard (diffuse and the sand colour both follow the light), and at full depth
    # the relief broke the smooth slopes into cracks (sheet of 27.11.).  The normal goes in as it comes (not
    # normalized): where the block returns it unchanged (no map) the light is the old one bit for bit.
    "SandDuneBarchanMigration": [(
        "    vec3  light_dir = normalize( vec3( 0.8, 0.5, -0.4 ) );\n"
        "    float diff = max( dot( vNormal, light_dir ), 0.0 );\n"
        "    float spec = pow( max( dot( reflect( -light_dir, vNormal ), vec3( 0.0, 1.0, 0.0 ) ), 0.0 ), spec_exp );\n",
        "    vec3 dune_n = vNormal;\n"
        "    if ( reliefP > 0.0 ) // the photo's relief in the sand (patch_relief3d.py)\n"
        "        dune_n = reliefNormal( vNormal, reliefFrame( vWorldPos, vTexCoord ), vTexCoord, 0.5 * reliefP );\n"
        "    vec3  light_dir = normalize( vec3( 0.8, 0.5, -0.4 ) );\n"
        "    float diff = max( dot( dune_n, light_dir ), 0.0 );\n"
        "    float spec = pow( max( dot( reflect( -light_dir, dune_n ), vec3( 0.0, 1.0, 0.0 ) ), 0.0 ), spec_exp );\n")],
    # The folding ring's faces: a normal from the derivatives, lit two-sided; the relief rises toward the eye.
    "KaleidocycleFold": [(
        "    vec3  n = normalize( cross( dFdx( vWorld ), dFdy( vWorld ) ) );\n",
        "    vec3  n = normalize( cross( dFdx( vWorld ), dFdy( vWorld ) ) );\n"
        "    if ( reliefP > 0.0 )\n"
        "    {\n"
        "        // The photo's relief on the face (patch_relief3d.py), raised toward the eye (at the origin) whichever\n"
        "        // way the face winds; the sign of n stays (the top faces' flash reads n.y).\n"
        "        vec2  ru = vTexCoord * 0.5 + vec2( vId * 0.17, vFace * 0.23 );\n"
        "        float fs = dot( n, vWorld ) > 0.0 ? -1.0 : 1.0;\n"
        "        n = fs * reliefNormal( fs * n, reliefFrame( vWorld, ru ), fract( ru ), reliefP );\n"
        "    }\n")],
    # The cloud sheet: one photo over the whole rolling surface.  It had no position in the fragment stage: the vertex
    # stage hands its world point on (VSITES), in the frame of its normal.
    "KelvinHelmholtzCloudWaves": [
        ("in float vBillow; ///< Billow (from the vertex stage).\n",
         "in float vBillow; ///< Billow (from the vertex stage).\n"
         "in vec3  vReliefPos; ///< World point, the frame of vNormal (for the photo relief, patch_relief3d.py).\n"),
        ("    vec3  n = normalize( vNormal );\n",
         "    vec3  n = normalize( vNormal );\n"
         "    if ( reliefP > 0.0 ) // the photo's relief on the clouds (patch_relief3d.py)\n"
         "        n = reliefNormal( n, reliefFrame( vReliefPos, vUV ), vUV, reliefP );\n")],
    # A planet lit hard from one side, the photo as its surface (an equirect map: its seam and poles fade out).
    "Magnetosphere": [(
        "        surf = mix( vec3( dot( surf, vec3( 0.333 ) ) ), surf, 0.6 ) * 0.85;\n",
        "        surf = mix( vec3( dot( surf, vec3( 0.333 ) ) ), surf, 0.6 ) * 0.85;\n"
        "        if ( reliefP > 0.0 ) // the photo's relief on the planet (patch_relief3d.py)\n"
        "            n = reliefNormal( n, reliefFrame( vObj, uv * vec2( 1.0, 0.9 ) ), fract( uv * vec2( 1.0, 0.9 ) ), reliefP );\n")],
}

# Vertex stages that hand a position on (scenes whose fragment stage had none): placed once, like the sites.
VSITES = {
    "KelvinHelmholtzCloudWaves": [
        ("out float vBillow; ///< Billow (from the vertex stage).\n",
         "out float vBillow; ///< Billow (from the vertex stage).\n"
         "out vec3  vReliefPos; ///< World point, the frame of vNormal (for the photo relief, patch_relief3d.py).\n"),
        ("    vBillow = billow_crest;\n",
         "    vBillow = billow_crest;\n"
         "    vReliefPos = world_p;\n")],
}

# Stage 2, the parallax (knob reliefParP): scenes with a fixed camera and one untiled photo over the whole surface.  The
# photo's coordinate is shifted before the colour is read, and the relief's normal (stage 1) reads the map at the
# shifted coordinate too.  With reliefParP = 0 `par_uv` is the old coordinate and the old fetch runs.  The eye is the
# vertex stage's camera, written out per scene (in the frame of the point given to reliefFrame()).
SITES2 = {
    # Camera of SandDuneBarchanMigration.vert: vp = R( pos - (0, 1.5, 0) ) + (0, 0, 7), pitch -0.62 -> the eye in the
    # frame of vWorldPos is ( 0, 1.5 - 7 sin( -0.62 ), -7 cos( -0.62 ) ).
    "SandDuneBarchanMigration": [
        ("    vec3 photo = img( vTexCoord );\n",
         "    vec2 par_uv = vTexCoord; // the photo's coordinate, shifted by its depth (patch_relief3d.py, stage 2)\n"
         "    vec3 photo;\n"
         "    if ( reliefParP > 0.0 )\n"
         "    {\n"
         "        ReliefFrame rf = reliefFrame( vWorldPos, vTexCoord );\n"
         "        vec3        eye = vec3( 0.0, 1.5 - 7.0 * sin( -0.62 ), -7.0 * cos( -0.62 ) ); // the vertex stage's camera\n"
         "        par_uv = clamp( vTexCoord + reliefParallax( vNormal, eye - vWorldPos, rf, vTexCoord, reliefParP, 0.0 ),\n"
         "                        0.0, 1.0 );\n"
         "        photo = reliefPhoto( par_uv, rf );\n"
         "    }\n"
         "    else\n"
         "        photo = img( vTexCoord );\n"),
        ("        dune_n = reliefNormal( vNormal, reliefFrame( vWorldPos, vTexCoord ), vTexCoord, 0.5 * reliefP );\n",
         "        dune_n = reliefNormal( vNormal, reliefFrame( vWorldPos, vTexCoord ), par_uv, 0.5 * reliefP );\n")],
    # Camera of KelvinHelmholtzCloudWaves.vert: cam_pos = ( 0, 4.5, -16 ), no rotation.
    "KelvinHelmholtzCloudWaves": [
        ("    vec3 photo = ( interpolation * texture( tex0, vUV ) + ( 1.0 - interpolation ) * texture( tex1, vUV ) ).rgb;\n",
         "    vec2 par_uv = vUV; // the photo's coordinate, shifted by its depth (patch_relief3d.py, stage 2)\n"
         "    vec3 photo;\n"
         "    if ( reliefParP > 0.0 )\n"
         "    {\n"
         "        ReliefFrame rf = reliefFrame( vReliefPos, vUV );\n"
         "        par_uv = clamp( vUV + reliefParallax( vNormal, vec3( 0.0, 4.5, -16.0 ) - vReliefPos, rf, vUV, reliefParP,\n"
         "                                              0.0 ),\n"
         "                        0.0, 1.0 );\n"
         "        photo = reliefPhoto( par_uv, rf );\n"
         "    }\n"
         "    else\n"
         "        photo = ( interpolation * texture( tex0, vUV ) + ( 1.0 - interpolation ) * texture( tex1, vUV ) ).rgb;\n"),
        ("        n = reliefNormal( n, reliefFrame( vReliefPos, vUV ), vUV, reliefP );\n",
         "        n = reliefNormal( n, reliefFrame( vReliefPos, vUV ), par_uv, reliefP );\n")],
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
    done2 = "reliefParallax(" in s          # stage 2's sites placed (the block with the definition is cut out here)
    blk = BEGIN + "\n" + decl + BLOCK + (BLOCK2 if name in SITES2 else "") + END + "\n\n"
    i = first_function(s)
    s = s[:i] + blk + s[i:]
    for old, new in ([] if done else SITES[name]):
        assert s.count(old) == 1, (name, old[:60])
        s = s.replace(old, new)
    for old, new in ([] if done2 else SITES2.get(name, [])):
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
    if name in VSITES:
        patch_vert(name)


def patch_vert(name):
    """The vertex stage's sites (a position handed on), once: a re-run finds them in place."""
    p = os.path.join(ROOT, "Scene3D", name + ".vert")
    raw = io.open(p, "rb").read().decode("utf-8")
    crlf = "\r\n" in raw
    s = raw.replace("\r\n", "\n")
    if "vReliefPos" in s:
        print(name + ".vert", "unchanged")
        return
    for old, new in VSITES[name]:
        assert s.count(old) == 1, (name, old[:60])
        s = s.replace(old, new)
    s = cgvr_format.format_text(doc_shaders.annotate(s, p), p)
    if crlf:
        s = s.replace("\n", "\r\n")
    io.open(p, "wb").write(s.encode("utf-8"))
    print(name + ".vert", "patched")


if __name__ == "__main__":
    for n in (sys.argv[1:] or sorted(SITES)):
        patch(n)
