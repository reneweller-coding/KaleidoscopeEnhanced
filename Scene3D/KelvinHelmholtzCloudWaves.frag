#version 330 core
/*****************************************************************************\
 *                              KelvinHelmholtzCloudWaves.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Shades a 220x120 heightfield of rolling cloud billows shaped by Kelvin-Helmholtz shear instability, lit as a
 *  sunset sky (dusk indigo troughs, amber crests, white cloud caps).
 *
 *  The billow geometry, palette mixing and audio response (audioBass
 *  swelling the wave height, audioKick puffing the crests, audioChromaHue
 *  and hueP rotating the sky hue, audioLevel scaling brightness) are all
 *  computed upstream in KelvinHelmholtzCloudWaves.vert; this stage blends
 *  the baked vCol with the current photo texture and adds a specular
 *  sun-glint plus a highlight on freshly-breaking crests (vBillow).
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

in vec4  vCol;       ///< Colour (from the vertex stage).
in vec2  vUV;        ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3  vNormal;    ///< Surface normal (from the vertex stage).
in float vBillow;    ///< Billow (from the vertex stage).
in vec3  vReliefPos; ///< World point, the frame of vNormal (for the photo relief, patch_relief3d.py).

uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

// ---- photo relief (Tools/scenegen/patch_relief3d.py) ----
// The photo's depth map (its alpha channel) is a height on the surfaces the photo covers: its slope tilts the normal,
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
 * @param n    The surface normal: unit length, pointing out of the surface (the relief rises along it), in the
 *             frame of the point given to reliefFrame(). (in)
 * @param f    The pixel's derivatives (reliefFrame()). (in)
 * @param uv   The photo coordinate as the scene samples the colour (tiled or not). (in)
 * @param amt  Depth of the relief: 1 = 15 % of the photo's width on the surface (less on the map's steep edges).
 *             (in)
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
    float wl = sqrt( ( dot( f.sx, f.sx ) + dot( f.sy, f.sy ) ) / uvl );        // world length per unit of uv
    vec3  sg = ( dot( g, f.ux ) * r1 + dot( g, f.uy ) * r2 ) / det;            // the surface gradient of the depth
    sg -= n * dot( n, sg ) / max( dot( n, n ), 1e-6 );                         // ... in the plane of the shading normal
    vec3 t = sg * ( 0.15 * amt * wl * fade );
    t /= sqrt( 1.0 + dot( t, t ) * 1.23 ); // soft limit: |t| < 0.9
    return normalize( n - t );
}

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
    vec3  gu = ( f.ux.x * r1 + f.uy.x * r2 ) / det;                     // the surface gradient of u
    vec3  gv = ( f.ux.y * r1 + f.uy.y * r2 ) / det;                     // ... and of v
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

/**  The photo's colour at a shifted coordinate, filtered with the unshifted coordinate's footprint (the shift jumps
 * at the map's edges: the implicit derivatives of the shifted coordinate would pick a blurred mip there, a line).
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
             + ( 1.0 - interpolation ) * textureGrad( tex1, uv, f.ux, f.uy ) )
        .rgb;
}
// ---- end of the photo relief ----

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 par_uv = vUV; // the photo's coordinate, shifted by its depth (patch_relief3d.py, stage 2)
    vec3 photo;
    if ( reliefParP > 0.0 )
    {
        ReliefFrame rf = reliefFrame( vReliefPos, vUV );
        par_uv = clamp( vUV + reliefParallax( vNormal, vec3( 0.0, 4.5, -16.0 ) - vReliefPos, rf, vUV, reliefParP, 0.0 ),
                        0.0, 1.0 );
        photo = reliefPhoto( par_uv, rf );
    }
    else
        photo = ( interpolation * texture( tex0, vUV ) + ( 1.0 - interpolation ) * texture( tex1, vUV ) ).rgb;

    vec3 light_dir = normalize( vec3( 0.5, 0.7, -0.4 ) );
    vec3 n = normalize( vNormal );
    if ( reliefP > 0.0 ) // the photo's relief on the clouds (patch_relief3d.py)
        n = reliefNormal( n, reliefFrame( vReliefPos, vUV ), par_uv, reliefP );
    float diff = max( dot( n, light_dir ), 0.0 );

    vec3 col = mix( vCol.rgb, photo * 1.25, 0.45 );
    col = col * ( 0.4 + 0.6 * diff ) + vBillow * vec3( 1.0, 0.8, 0.4 ) * 0.8;

    fragColor = vec4( col, 1.0 );
}
