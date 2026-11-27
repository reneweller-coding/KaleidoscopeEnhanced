#version 400 core
/*****************************************************************************\
 *                              GlacierTessellation.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  GLACIER TESSELLATION: low flight over tessellated glacier ice - white/blue subsurface-scattering ice with
 *  crevasse light from INSIDE, tinted by the photo palette; the terrain streams beneath the camera.
 *
 *    audioAdvance -> flight speed      audioKick -> crevasse flash
 *    audioBass    -> ice-wave heave
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

in vec3  vNormal;   ///< Surface normal (from the vertex stage).
in vec3  vWorld;    ///< World position (from the vertex stage).
in vec2  vUV;       ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vCrevasse; ///< Crevasse (from the vertex stage).

uniform sampler2D tex0;           ///< The current photo.
uniform sampler2D tex1;           ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation;  ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     time;           ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform float     hueP;           ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform float     audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float     audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                  ///< backwards).
uniform float audioValence;       ///< Mood valence: 0 dark .. 1 bright.

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
// ---- end of the photo relief ----

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

/**  The photo at a coordinate: the cross-fade of tex0 and tex1.
 *
 * @param uv  Coordinate in the photo, 0..1. (in)
 *
 * @return
 *   The cross-faded photo colour (RGB).
 **/
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/**  IMG-PALETTE (house standard): colours come from a rotating arc in the CURRENT slideshow image; the arc follows
 * the musical key (audioChromaHue is circular-slewed = jump-free), valence shapes saturation.
 *
 * @param t  Position on the palette arc, 0..1 for one turn. (in)
 *
 * @return
 *   The palette colour (RGB).
 **/
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec3 n = normalize( vNormal );
    if ( reliefP > 0.0 ) // the photo's relief carved into the ice (patch_relief3d.py)
        n = reliefNormal( n, reliefFrame( vWorld, vUV ), vUV, reliefP );
    vec3  light_dir = normalize( vec3( 0.6, 0.8, -0.5 ) );
    float diff = max( dot( n, light_dir ), 0.0 );

    // Specular frost
    vec3  view_dir = normalize( -vWorld );
    vec3  refl = reflect( -light_dir, n );
    float spec = pow( max( dot( view_dir, refl ), 0.0 ), 32.0 );

    // Subsurface scattering ice blue
    vec3 ice_core = vec3( 0.05, 0.6, 0.95 );
    vec3 ice_surface = vec3( 0.85, 0.95, 1.0 );
    vec3 ice_col = mix( ice_core, ice_surface, diff * 0.7 + 0.3 );

    // Glowing crevasses: light from inside the ice, tinted by the PHOTO
    // palette (house standard) instead of a fixed neon cyan.
    // 65% of a 1.6x photo-arc colour flooded the whole glacier with the
    // photo's dominant hue (recorded as ORANGE ice).  The photo may only
    // inflect the crevasse teal, never replace it.
    vec3 crevasse_col = mix( vec3( 0.0, 1.0, 0.9 ), imgPalette( 0.18 ), 0.22 )
                        * vCrevasse * 1.6;

    // Sample active photo texture
    vec3 photo = img( vUV );

    vec3 col = ice_col + spec * vec3( 1.0, 1.0, 1.0 ) * 0.8 + crevasse_col;
    col /= 1.0 + 0.45 * max( col.r, max( col.g, col.b ) ); // additive stack knee
    col += photo * 0.25;
    col /= 1.0 + 0.25 * max( col.r, max( col.g, col.b ) );

    // Fog into distance
    float dist = length( vWorld );
    float fog = 1.0 - exp( -dist * 0.008 );
    vec3  fog_col = vec3( 0.02, 0.08, 0.15 );
    col = mix( col, fog_col, fog );

    float h = ( hueP > 0.0 ) ? hueP : 0.0;
    if ( h > 0.001 )
        col = hueRot( col, 0.25 * sin( h ) ); // full rotation turned the ice ORANGE

    fragColor = vec4( col, 1.0 );
}
