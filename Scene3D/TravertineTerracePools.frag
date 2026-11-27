#version 330 core
/*****************************************************************************\
 *                              TravertineTerracePools.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TRAVERTINE TERRACE POOLS: a white limestone hillside of stacked pools.
 *
 *  The crust is blinding white, the water in each pool is a shallow turquoise mirror of the sky (the photo), and
 *  the rims are wet and glassy where the water pours over them.  The sky light in the pools rides the bass, the wet
 *  rims glint with the treble, the sun is the swell, and the kick is a wader lifting off as a flash of white.
 *  Camera height fixed.
 *
 *  Audio Reactivity:
 *    audioBass  -> the sky in the pools (light)
 *    audioHigh  -> wet rim glints (light)
 *    audioSwell -> sunlight and the water level (slow)
 *    audioKick  -> a bird flash (light)
 *    audioLevel -> brightness
 *
 *  Per-activation variety: camHP, detailP, stepsP, hueP.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
in vec3  vWorld;    ///< World position (from the vertex stage).
in vec2  vSurfUV;   ///< Surf UV (from the vertex stage).
in vec3  vNormal;   ///< Surface normal (from the vertex stage).
in float vPool;     ///< Pool (from the vertex stage).
in float vTerrace;  ///< Terrace (from the vertex stage).
in float vDist;     ///< Distance (from the vertex stage).

uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform float     sceneAdvance;  ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float     sceneTime;     ///< Seconds since this scene was activated.
uniform float     audioAdvance;  ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                 ///< backwards).
uniform float audioLevel;        ///< Overall loudness, 0..1.
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;         ///< Bass band level, 0..1.
uniform float audioHigh;         ///< High band level, 0..1.
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue;    ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;      ///< Mood valence: 0 dark .. 1 bright.
uniform float camHP;             ///< Camera height knob, 0..1.
uniform float stepsP;            ///< Steps knob, 0..1.
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
 * @param amt  Depth of the relief: 1 = 12 % of the photo's width on the surface. (in)
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
 * the surface:
 *   grad_s h = ( h_x ( sy x n ) + h_y ( n x sx ) ) / ( sx . ( sy x n ) ),   n' = normalize( n - A grad_s h ),
 * with the relief's depth A a share of the photo's extent on the surface (world length per unit of uv), so the tilt
 * does not depend on the scene's scale; a soft limit keeps it below about 45 degrees (the edges of the depth map are
 * steps).  Only textureLod() here: it may run inside pixel-dependent branches (reliefFrame() may not).
 **/
vec3 reliefNormal( vec3 n, ReliefFrame f, vec2 uv, float amt )
{
    vec2  ts = vec2( textureSize( tex0, 0 ) );
    vec2  ax = f.ux * ts, ay = f.uy * ts;
    float fp = sqrt( max( dot( ax, ax ), dot( ay, ay ) ) ); // the pixel's footprint in texels of the full photo
    float fade = 1.0 - smoothstep( 24.0, 64.0, fp );
    vec3  r1 = cross( f.sy, n ), r2 = cross( n, f.sx );
    float det = dot( f.sx, r1 );
    float uvl = dot( f.ux, f.ux ) + dot( f.uy, f.uy );
    float has = interpolation * photoDepthAmt.x + ( 1.0 - interpolation ) * photoDepthAmt.y;
    if ( !( has > 0.0 ) || !( fade > 0.0 ) || !( abs( det ) > 1e-20 ) || !( uvl > 1e-16 ) || !( amt > 0.0 ) )
        return n;
    float lod = clamp( log2( max( fp, 1.0 ) ) + 1.0, 2.0, 6.0 );
    vec2  g = 0.5 * ( reliefSlope( uv, lod ) + reliefSlope( uv, lod + 2.0 ) ); // depth per unit of uv
    float wl = sqrt( ( dot( f.sx, f.sx ) + dot( f.sy, f.sy ) ) / uvl );        // world length per unit of uv
    vec3  sg = ( dot( g, f.ux ) * r1 + dot( g, f.uy ) * r2 ) / det;            // the surface gradient of the depth
    vec3  t = sg * ( 0.12 * amt * wl * fade );
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
/**  Smooth 2D value noise, 0..1.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, 0..1.
 **/
float noise2( vec2 p )
{
    vec2 i = floor( p ), f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hash21( i ), hash21( i + vec2( 1.0, 0.0 ) ), f.x ),
                mix( hash21( i + vec2( 0.0, 1.0 ) ), hash21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
/**  Fractal noise: octaves of value noise.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The fractal noise value, about 0..1.
 **/
float fbm( vec2 p )
{
    float v = 0.0, a = 0.5;
    for ( int i = 0; i < 4; ++i )
    {
        v += a * noise2( p );
        p = p * 2.03 + 2.7;
        a *= 0.5;
    }
    return v;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float hue = ( hueP > 0.001 ) ? hueP : 0.0;
    float sun = 0.6 + 0.55 * clamp( audioSwell, 0.0, 1.0 );
    float bass = clamp( audioBass, 0.0, 1.0 );
    float hi = clamp( audioHigh * 2.0, 0.0, 1.0 );
    float clock = sceneAdvance * 0.45 + sceneTime * 0.09;
    vec3  n = normalize( vNormal );
    if ( reliefP > 0.0 ) // the photo's relief in the crust's banding (patch_relief3d.py)
        n = reliefNormal( n, reliefFrame( vWorld, vec2( vWorld.x * 0.02, vWorld.z * 0.014 ) ),
                          clamp( vec2( fract( vWorld.x * 0.02 ), fract( vWorld.z * 0.014 ) ), 0.0, 1.0 ), reliefP );
    vec3  L = normalize( vec3( 0.42, 0.78, -0.36 ) );
    float diff = max( dot( n, L ), 0.0 );

    // The crust: white travertine with a warm cream in the shadows and a
    // ripple grain that follows the slope.
    vec3 crust = mix( vec3( 0.93, 0.91, 0.85 ), imgPalette( hue * 0.159 + 0.1 ) * 1.2, 0.2 );
    crust *= 0.82 + 0.3 * fbm( vWorld.xz * 0.9 );
    crust *= 0.78 + 0.35 * fbm( vWorld.xz * 4.0 );
    // The photo lives in the crust as its mineral banding.
    crust = mix(
        crust,
        crust * ( 0.6 + 0.9 * img( clamp( vec2( fract( vWorld.x * 0.02 ), fract( vWorld.z * 0.014 ) ), 0.0, 1.0 ) ) ),
        0.35 );
    vec3 col = crust * ( 0.35 + 0.75 * diff ) * sun;

    // The water in the pools: the level breathes with the swell, so a pool
    // fills and empties without the dam ever moving.
    float level = 0.35 + 0.5 * clamp( audioSwell, 0.0, 1.0 );
    float wet = smoothstep( level - 0.25, level + 0.05, vPool );
    if ( wet > 0.001 )
    {
        // The sky in the water: the photo, turquoise, brighter with the bass.
        vec2 sky_uv = clamp( vec2( vWorld.x * 0.006 + 0.5, 0.6 + vWorld.z * 0.0015 ), 0.0, 1.0 );
        vec3 sky = img( sky_uv ) * mix( vec3( 0.35, 0.85, 0.9 ), imgPalette( hue * 0.159 + 0.5 ), 0.3 );
        sky *= 0.7 + 0.9 * bass;
        // Depth: the middle of a pool is deeper and bluer.
        vec3 water = mix( sky, mix( vec3( 0.05, 0.42, 0.5 ), imgPalette( hue * 0.159 + 0.45 ) * 0.5, 0.35 ),
                          vPool * 0.55 );
        // Ripples on the surface, moving on the clock.
        float rip = fbm( vWorld.xz * 2.2 + vec2( clock * 0.5, clock * 0.25 ) );
        water *= 0.82 + 0.35 * rip;
        // Caustics on the shallow floor.
        water += vec3( 1.0, 0.98, 0.9 ) * pow( smoothstep( 0.5, 0.85, rip ), 2.0 ) * ( 0.25 + 0.3 * bass ) * sun * 0.6;
        col = mix( col, water * sun, wet * 0.92 );
    }
    // The rim: wet, glassy, and where the water pours it catches the sun.
    float lip = smoothstep( 0.35, 0.05, vPool );
    float pour_noise = fbm( vec2( vWorld.x * 0.5, vTerrace * 6.0 - clock * 1.4 ) );
    float pour = lip * smoothstep( 0.45, 0.8, pour_noise );
    col = mix( col, col * vec3( 0.85, 0.95, 1.0 ) * 1.1, lip * 0.5 );
    col += vec3( 1.0, 0.99, 0.95 ) * pour * ( 0.3 + 0.5 * sun );
    // Glints on the wet lip, on the treble: round, jittered points.
    vec2  gg = vWorld.xz * 3.5;
    vec2  gc = floor( gg ), gf = fract( gg ) - 0.5;
    vec2  gj = vec2( hash21( gc + 1.7 ), hash21( gc + 6.3 ) ) - 0.5;
    float glint = smoothstep( 0.2, 0.05, length( gf - gj * 0.7 ) ) * step( 0.9, hash21( gc ) );
    col += vec3( 1.0 ) * glint * lip * hi * 0.9;
    // A wader lifting off: a small white flash low over the terraces.
    float bph = fract( clock * 0.09 );
    vec3  bird = vec3( mix( -30.0, 30.0, bph ), 2.5 + 3.0 * sin( bph * 3.14159 ), 45.0 );
    float bd = length( vWorld - bird );
    col += vec3( 1.0, 0.98, 0.95 ) * exp( -bd * 0.6 ) * audioKick * 1.2;
    // Distance haze over the hill.
    float fog = 1.0 - exp( -max( vDist - 25.0, 0.0 ) * 0.006 );
    vec3  fog_col = mix( vec3( 0.82, 0.88, 0.95 ), imgPalette( hue * 0.159 + 0.6 ), 0.3 ) * sun;
    col = mix( col, fog_col, clamp( fog, 0.0, 0.85 ) );
    col *= 0.9 + 0.2 * audioLevel;

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
