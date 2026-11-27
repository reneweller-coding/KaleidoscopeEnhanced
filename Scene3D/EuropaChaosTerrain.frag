#version 330 core
/*****************************************************************************\
 *                              EuropaChaosTerrain.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  EUROPA CHAOS TERRAIN: blue-white ice rafts in a matrix of rubble ice, the rust-red lineae along the raft edges,
 *  and -- the reason to be here -- the ocean beneath, whose light wells up through the seams with the sub-bass.
 *
 *  Low sunlight (the swell) rakes across the rafts; the kick sparks frost on the ridges; the photo is the ice
 *  texture.  Camera height fixed.
 *
 *  Audio Reactivity:
 *    audioSubBass -> ocean light through the seams (light)
 *    audioSwell   -> sunlight (slow)
 *    audioKick    -> frost sparkle (light)
 *    audioLevel   -> brightness
 *
 *  Per-activation variety: camHP, detailP, raftP, hueP.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
in vec3  vWorld;    ///< World position (from the vertex stage).
in vec2  vSurfUV;   ///< Surf UV (from the vertex stage).
in vec3  vNormal;   ///< Surface normal (from the vertex stage).
in float vSeam;     ///< Seam (from the vertex stage).
in float vRaft;     ///< Raft (from the vertex stage).
in float vDist;     ///< Distance (from the vertex stage).

uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform float     sceneAdvance;  ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float     audioAdvance;  ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                 ///< backwards).
uniform float audioLevel;        ///< Overall loudness, 0..1.
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSubBass;      ///< Sub-bass band level, 0..1.
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue;    ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;      ///< Mood valence: 0 dark .. 1 bright.
uniform float camHP;             ///< Camera height knob, 0..1.
uniform float hueP;              ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  The house palette: a colour of the photo on an arc that turns with the music's hue.
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
    vec3  col = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float g = dot( col, vec3( 0.333 ) );
    return mix( vec3( g ), col, 0.55 + 0.45 * audioValence );
}

/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float hue = ( hueP > 0.001 ) ? hueP : 0.0;
    vec3  n = normalize( vNormal );
    float sun = 0.5 + 0.7 * clamp( audioSwell, 0.0, 1.0 );
    float sub = clamp( audioSubBass, 0.0, 1.0 );

    // Ice: the photo as the crust texture, cold and pale.
    vec2 iuv = fract( vWorld.xz * 0.015 + vRaft * 0.41 );
    vec3 photo = img( iuv );
    if ( reliefP > 0.0 ) // the photo's relief in the ice (patch_relief3d.py)
        n = reliefNormal( n, reliefFrame( vWorld, vWorld.xz * 0.015 + vRaft * 0.41 ), iuv, reliefP );
    vec3 ice = mix( vec3( 0.7, 0.8, 0.9 ), photo * 1.3, 0.35 );
    ice = mix( ice, ice * imgPalette( hue * 0.159 + 0.6 ) * 1.5, 0.2 );
    // Low sun from the side.
    vec3  L = normalize( vec3( -0.7, 0.35, 0.3 ) );
    float diff = max( dot( n, L ), 0.0 );
    vec3  col = ice * ( 0.3 + 0.9 * diff * sun );
    // Rubble matrix between the rafts is darker and rougher.
    float matrix_ice = 1.0 - smoothstep( 0.0, 0.18, vSeam );
    col *= 1.0 - 0.35 * matrix_ice;
    // Lineae: rust-red bands along the raft edges (salts).
    float linea = smoothstep( 0.06, 0.0, abs( vSeam - 0.12 ) );
    col = mix( col, vec3( 0.5, 0.25, 0.12 ) * ( 0.5 + 0.5 * sun ), linea * 0.5 );
    // The ocean light through the seams: blue, welling with the sub-bass.
    float crack = 1.0 - smoothstep( 0.0, 0.07, vSeam );
    vec3  ocean = mix( vec3( 0.2, 0.55, 1.0 ), imgPalette( hue * 0.159 + 0.55 ), 0.3 );
    col += ocean * crack * ( 0.7 + 0.8 * sub );
    col += ocean * exp( -vSeam * 8.0 ) * ( 0.1 + 0.2 * sub );
    // Frost sparkle on the kick: round glints.
    vec2  gu = vWorld.xz * 1.5;
    vec2  gc = floor( gu );
    vec2  gf = fract( gu ) - 0.5;
    vec2  go = vec2( hash21( gc + 1.3 ), hash21( gc + 5.9 ) ) - 0.5;
    float glint = smoothstep( 0.2, 0.05, length( gf - go * 0.6 ) ) * step( 0.9, hash21( gc ) );
    col += vec3( 1.0 ) * glint * ( 0.15 + 0.9 * audioKick ) * diff;
    // Distance: the far plains fade into the thin haze and the black sky.
    float fog = 1.0 - exp( -vDist * 0.006 );
    col = mix( col, vec3( 0.02, 0.03, 0.06 ) + ocean * 0.04 * sub, clamp( fog, 0.0, 0.85 ) );
    col *= 0.75 + 0.5 * audioLevel;

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
