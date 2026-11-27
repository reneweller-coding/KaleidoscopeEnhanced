#version 330 core
/*****************************************************************************\
 *                              TessellatedLavaLake.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TESSELLATED LAVA LAKE: dark crust plates drifting on a lake of melt; between the plates the lava glows, and the
 *  glow is the music -- the bass pushes the orange-white up through the seams, the kick flares them, the swell
 *  heaves the whole surface (evaluation stage).
 *
 *  The crust carries the photo as its scorched texture; the sky above is night with the lake's own glow on the
 *  smoke.  Camera height fixed on the shore.
 *
 *  Audio Reactivity:
 *    audioBass  -> seam glow (light)
 *    audioKick  -> seam flare (light)
 *    audioSwell -> heave (evaluation stage, slow)
 *    audioLevel -> brightness
 *
 *  Per-activation variety: camHP, detailP, plateP, hueP.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
in vec3  vWorld;    ///< World position (from the vertex stage).
in vec2  vSurfUV;   ///< Surf UV (from the vertex stage).
in vec3  vNormal;   ///< Surface normal (from the vertex stage).
in float vSeam;     ///< Seam (from the vertex stage).
in float vPlate;    ///< Plate (from the vertex stage).
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
uniform float audioBass;         ///< Bass band level, 0..1.
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float hue = ( hueP > 0.001 ) ? hueP : 0.0;
    vec3  n = normalize( vNormal );
    vec3  V = normalize( vec3( 0.0, camHP, 0.0 ) - vWorld );
    float bass = clamp( audioBass, 0.0, 1.0 );

    // Crust: dark basalt with the photo scorched into it, per plate offset.
    vec2 cuv = fract( vWorld.xz * 0.02 + vPlate * 0.37 );
    vec3 photo = img( cuv );
    if ( reliefP > 0.0 ) // the photo's relief in the crust (patch_relief3d.py)
        n = reliefNormal( n, reliefFrame( vWorld, vWorld.xz * 0.02 + vPlate * 0.37 ), cuv, reliefP );
    vec3 crust = mix( vec3( 0.12, 0.1, 0.1 ), photo * 0.5, 0.5 );
    crust *= 0.6 + 0.4 * hash21( floor( vWorld.xz * 0.8 ) );
    vec3  L = normalize( vec3( 0.3, 0.6, -0.4 ) );
    float diff = max( dot( n, L ), 0.0 );
    crust *= 0.4 + 0.8 * diff;
    // The melt in the seams: orange-white, brighter with the bass, flaring
    // on the kick; the seam width grows a little with the bass (light only).
    float seam_glow = 1.0 - smoothstep( 0.0, 0.12 + 0.08 * bass, vSeam );
    vec3  melt = mix( vec3( 1.0, 0.45, 0.08 ), imgPalette( hue * 0.159 + 0.05 ), 0.3 );
    vec3  hot = mix( melt, vec3( 1.0, 0.9, 0.6 ), bass * 0.6 );
    float pulse = 0.8 + 0.6 * bass + 1.2 * audioKick;
    vec3  col = mix( crust, hot * pulse * 1.6, seam_glow );
    // The glow bleeds onto the plate edges.
    float bleed = exp( -vSeam * 6.0 ) * ( 0.3 + 0.7 * bass );
    col += melt * bleed * 0.5;
    // Heat shimmer speckle: round sparks rising from the seams (light).
    vec2  su = ( vWorld.xz + vec2( 0.0, -sceneAdvance * 3.0 ) ) * 0.8;
    vec2  sc = floor( su );
    vec2  sf = fract( su ) - 0.5;
    vec2  so = vec2( hash21( sc + 1.3 ), hash21( sc + 5.9 ) ) - 0.5;
    float spark = smoothstep( 0.18, 0.05, length( sf - so * 0.6 ) ) * step( 0.96, hash21( sc ) ) * seam_glow;
    col += vec3( 1.0, 0.8, 0.5 ) * spark * 2.0;
    // Distance: the far lake dims into smoke lit from below.
    float fog = 1.0 - exp( -vDist * 0.005 );
    vec3  smoke = mix( vec3( 0.12, 0.05, 0.03 ), melt * 0.25, bass * 0.5 );
    col = mix( col, smoke, clamp( fog, 0.0, 0.9 ) );
    col *= 0.75 + 0.5 * audioLevel;

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
