#version 330 core
/*****************************************************************************\
 *                              LensSpaceInterior.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  LENS SPACE INTERIOR: inside a lens space -- the three-sphere wrapped p times around itself, every point
 *  identified with its turn by 1/p round one great circle and q/p round the linked one.
 *
 *  The light runs along great circles, so the eye sees the few things in the space again and again: six balls, each
 *  strung into a spiral chain of p copies winding round the two core circles, which are glowing tubes, the copies
 *  shrinking with distance and growing again behind the eye.  The photo fills every copy.
 *
 *  Audio Reactivity (structure, not only light):
 *    audioHarmAdvance -> each change of harmony changes the space: p and q (crossfaded)
 *    audioAdvance    -> the eye's flight along a great circle (integrated)
 *    audioKick       -> the core tubes flash (light)
 *
 *  Knobs: ballP (the balls' size), coreP (the core tubes' thickness), photoP (photo share), hueP.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;        ///< Seconds since this scene was activated.
uniform float sceneAdvance;     ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;     ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                ///< backwards).
uniform float audioLevel;       ///< Overall loudness, 0..1.
uniform float audioValence;     ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioPhase;       ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioKick;        ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHarmAdvance; ///< The harmony's advance: ~1 more with every chord change (integrated, never jumps
                                ///< back).

uniform float ballP;  ///< Ball knob: the balls' size, 0..1.
uniform float coreP;  ///< Fold core class knob of the 3D chain, 0..1.
uniform float photoP; ///< Photo knob: how much of the photo shows, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

// ---- shared building blocks (texture pool, noise, shapes) ----
/**  Pseudo-random number 0..1 from a float.
 *
 * @param n  The input value. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash11( float n )
{
    return fract( sin( n * 127.1 ) * 43758.5453 );
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
    vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
    p3 += dot( p3, p3.yzx + 33.33 );
    return fract( ( p3.x + p3.y ) * p3.z );
}
/**  Pseudo-random 2D vector (each 0..1) from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   Two pseudo-random numbers 0..1.
 **/
vec2 hash22( vec2 p )
{
    vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
    p3 += dot( p3, p3.yzx + 33.33 );
    return fract( ( p3.xx + p3.yz ) * p3.zy );
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
    for ( int i = 0; i < 5; ++i )
    {
        v += a * noise2( p );
        p = mat2( 1.6, 1.2, -1.2, 1.6 ) * p + 2.3;
        a *= 0.5;
    }
    return v;
}
/**  Fractal noise of three octaves, 0..1.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The fractal noise value, 0..1.
 **/
float fbm3( vec2 p )
{
    float v = 0.0, a = 0.5;
    for ( int i = 0; i < 3; ++i )
    {
        v += a * noise2( p );
        p = mat2( 1.6, 1.2, -1.2, 1.6 ) * p + 2.3;
        a *= 0.5;
    }
    return v;
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
/**  Mirror-repeat in the shader (the engine's textures mirror, the editor's repeat -- doing it here makes both
 * identical).
 *
 * @param uv  The coordinate, any range. (in)
 *
 * @return
 *   The coordinate mirror-repeated into 0..1.
 *
 * Identity inside [0,1].
 **/
vec2 mirrorUV( vec2 uv )
{
    return 1.0 - abs( fract( uv * 0.5 ) * 2.0 - 1.0 );
}
/**  The photo at a mip level: lod 0 is full detail, ~4 a soft field, ~7 broad masses.
 *
 * @param uv   Coordinate in the photo (mirror-repeated outside 0..1). (in)
 * @param lod  Mip level of the photo (0 = full detail). (in)
 *
 * @return
 *   The cross-faded photo colour (RGB).
 **/
vec3 imgLod( vec2 uv, float lod )
{
    uv = mirrorUV( uv );
    return ( interpolation * textureLod( tex0, uv, lod ) + ( 1.0 - interpolation ) * textureLod( tex1, uv, lod ) ).rgb;
}
/**  Luminance of a colour (Rec. 601 weights).
 *
 * @param c  The colour. (in)
 *
 * @return
 *   The luminance.
 **/
float luma( vec3 c )
{
    return dot( c, vec3( 0.299, 0.587, 0.114 ) );
}
/**  HSV (all 0..1) to RGB.
 *
 * @param c  Hue, saturation and value, all 0..1. (in)
 *
 * @return
 *   The RGB colour.
 **/
vec3 hsv2rgb( vec3 c )
{
    vec3 k = clamp( abs( mod( c.x * 6.0 + vec3( 0.0, 4.0, 2.0 ), 6.0 ) - 3.0 ) - 1.0, 0.0, 1.0 );
    return c.z * mix( vec3( 1.0 ), k, c.y );
}
/**  Hue of a colour, 0..1.
 *
 * @param c  The colour. (in)
 *
 * @return
 *   The hue, 0..1.
 **/
float hueOf( vec3 c )
{
    float mx = max( c.r, max( c.g, c.b ) ), mn = min( c.r, min( c.g, c.b ) ), d = mx - mn + 1e-5;
    float h = ( mx == c.r ) ? ( c.g - c.b ) / d : ( mx == c.g ) ? 2.0 + ( c.b - c.r ) / d
                                                                : 4.0 + ( c.r - c.g ) / d;
    return fract( h / 6.0 );
}
/**  Saturation of a colour, 0..1.
 *
 * @param c  The colour. (in)
 *
 * @return
 *   The saturation, 0..1.
 **/
float satOf( vec3 c )
{
    float mx = max( c.r, max( c.g, c.b ) );
    return ( mx - min( c.r, min( c.g, c.b ) ) ) / max( mx, 1e-3 );
}
/**  A glowing colour for a place: the photo's own hue where it has one, a slowly wandering hue field (anchored on
 * hue0) where the photo is grey.
 *
 * @param photo  The photo's colour at the place. (in)
 * @param q      The place; drives the wandering hue field. (in)
 * @param hue0   Anchor hue, 0..1. (in)
 *
 * @return
 *   The glow colour (RGB, bright).
 **/
vec3 glowColour( vec3 photo, vec2 q, float hue0 )
{
    vec3 field = hsv2rgb( vec3( fract( hue0 + 0.55 * fbm3( q * 0.8 ) + 0.03 * audioAdvance ), 0.85, 1.0 ) );
    vec3 own = photo / max( max( photo.r, max( photo.g, photo.b ) ), 1e-3 );
    own = own * own * own;
    return mix( field, own, smoothstep( 0.12, 0.35, satOf( photo ) ) );
}
/**  Push a colour toward full saturation, keeping its hue (neon from a photo).
 *
 * @param c  The colour. (in)
 * @param k  Exponent: the higher, the purer (and darker) the neon. (in)
 *
 * @return
 *   The saturated colour.
 **/
vec3 neonOf( vec3 c, float k )
{
    vec3 n = c / max( max( c.r, max( c.g, c.b ) ), 1e-3 );
    return pow( n, vec3( k ) );
}
/**  The photo along an endless scroll in y without mirror seams: the photo repeats mirrored, so a scroll crosses a
 * visible fold every unit; two reads half a period apart are cross-faded so each fold is hidden by the other.
 *
 * @param uv   Coordinate in the photo; y may run on endlessly. (in)
 * @param lod  Mip level of the photo (0 = full detail). (in)
 *
 * @return
 *   The photo colour (RGB).
 **/
vec3 imgScroll( vec2 uv, float lod )
{
    float w = abs( fract( uv.y ) - 0.5 ) * 2.0; // 1 at the fold, 0 between
    w = smoothstep( 0.55, 1.0, w );
    return mix( imgLod( uv, lod ), imgLod( uv + vec2( 0.37, 0.5 ), lod ), w );
}
/**  Height from the photo: broad masses plus a share of the detail.
 *
 * @param uv        Coordinate in the photo. (in)
 * @param lodBroad  Mip level of the broad masses. (in)
 * @param detail    Share of the detail three mip levels finer, 0..1. (in)
 *
 * @return
 *   The height (luma of the photo), 0..1.
 **/
float texHeight( vec2 uv, float lodBroad, float detail )
{
    return mix( luma( imgLod( uv, lodBroad ) ), luma( imgLod( uv, max( lodBroad - 3.0, 0.0 ) ) ), detail );
}
/**  Gradient of the photo's luma at a mip level (per UV unit).
 *
 * @param uv   Coordinate in the photo. (in)
 * @param lod  Mip level of the photo (0 = full detail). (in)
 *
 * @return
 *   The luma gradient per UV unit.
 **/
vec2 texGrad( vec2 uv, float lod )
{
    float e = exp2( lod ) / 1024.0;
    return vec2( luma( imgLod( uv + vec2( e, 0.0 ), lod ) ) - luma( imgLod( uv - vec2( e, 0.0 ), lod ) ),
                 luma( imgLod( uv + vec2( 0.0, e ), lod ) ) - luma( imgLod( uv - vec2( 0.0, e ), lod ) ) )
           / ( 2.0 * e );
}
/**  Edge strength of the photo (0..1-ish) at a mip level.
 *
 * @param uv   Coordinate in the photo. (in)
 * @param lod  Mip level of the photo (0 = full detail). (in)
 *
 * @return
 *   The edge strength, about 0..1.
 **/
float texEdge( vec2 uv, float lod )
{
    return length( texGrad( uv, lod ) ) * exp2( lod ) / 1024.0 * 6.0;
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
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/**  2D rotation matrix.
 *
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The rotation matrix.
 **/
mat2 rot2( float a )
{
    float c = cos( a ), s = sin( a );
    return mat2( c, -s, s, c );
}
/**  Smooth minimum of two distances (blend width k).
 *
 * @param a  One distance. (in)
 * @param b  The other distance. (in)
 * @param k  Blend width. (in)
 *
 * @return
 *   The smooth minimum.
 **/
float smin( float a, float b, float k )
{
    float h = clamp( 0.5 + 0.5 * ( b - a ) / k, 0.0, 1.0 );
    return mix( b, a, h ) - k * h * ( 1.0 - h );
}
/**  Distance from a point to a line segment.
 *
 * @param p  The point. (in)
 * @param a  One end of the segment. (in)
 * @param b  The other end. (in)
 *
 * @return
 *   The distance.
 **/
float sdSeg( vec2 p, vec2 a, vec2 b )
{
    vec2  pa = p - a, ba = b - a;
    float h = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 );
    return length( pa - ba * h );
}
/**  The photo read through a turning kaleidoscope -- the trick of the original Kaleidoscope/Tunnel scenes: uv is
 * folded into mirrored wedges around a slowly wandering centre and turned with time and the integrated audio phase,
 * so the texture itself keeps changing (detailed, continuous, never repeating).
 *
 * @param uv     Coordinate in the photo. (in)
 * @param sides  Number of mirror wedges (whole). (in)
 *
 * @return
 *   The folded coordinate.
 *
 * The fold is continuous at every wedge border and at the atan cut (sides is a whole number); the explicit mip level
 * avoids seams.
 **/
vec2 kaleidoUV( vec2 uv, float sides )
{
    vec2  c = vec2( 0.5 ) + 0.2 * vec2( sin( 0.0107 * sceneTime ), cos( 0.0131 * sceneTime ) );
    vec2  d = uv - c;
    float r = length( d );
    float sec = 6.2831853 / sides;
    float a = abs( mod( atan( d.y, d.x ), sec ) - 0.5 * sec );
    a += 0.03 * sceneTime + 0.25 * audioPhase;
    return c + r * vec2( cos( a ), sin( a ) );
}
/**  The photo through the scene's kaleidoscope.
 *
 * @param uv   Coordinate in the photo. (in)
 * @param lod  Mip level of the photo (0 = full detail). (in)
 *
 * @return
 *   The photo colour through the kaleidoscope (RGB).
 **/
vec3 imgK( vec2 uv, float lod )
{
    return imgLod( kaleidoUV( uv, 6.0 ), lod );
}
/**  Other channels than RGB: the photo's structure, read through the kaleidoscope.
 *
 * @param uv   Coordinate in the photo. (in)
 * @param lod  Mip level of the photo (0 = full detail). (in)
 *
 * @return
 *   The luma gradient per UV unit.
 *
 * Gradient / edges / Laplacian are rotation invariant in magnitude, so they stay seamless across the mirror folds
 * (direction-based colours would not).
 **/
vec2 imgKGrad( vec2 uv, float lod )
{
    float e = exp2( lod ) / 1024.0 + 0.001;
    return vec2( luma( imgK( uv + vec2( e, 0.0 ), lod ) ) - luma( imgK( uv - vec2( e, 0.0 ), lod ) ),
                 luma( imgK( uv + vec2( 0.0, e ), lod ) ) - luma( imgK( uv - vec2( 0.0, e ), lod ) ) )
           / ( 2.0 * e );
}
/**  Edge strength of the kaleidoscoped photo.
 *
 * @param uv   Coordinate in the photo. (in)
 * @param lod  Mip level of the photo (0 = full detail). (in)
 *
 * @return
 *   The edge strength.
 **/
float imgKEdge( vec2 uv, float lod )
{
    return length( imgKGrad( uv, lod ) ) * ( exp2( lod ) / 1024.0 + 0.001 ) * 6.0;
}
/**  Laplacian of the kaleidoscoped photo's luma (ridges and valleys).
 *
 * @param uv   Coordinate in the photo. (in)
 * @param lod  Mip level of the photo (0 = full detail). (in)
 *
 * @return
 *   The Laplacian of the luma (ridges > 0).
 **/
float imgKLap( vec2 uv, float lod )
{
    float e = exp2( lod ) / 1024.0 + 0.001;
    float c = luma( imgK( uv, lod ) );
    return ( luma( imgK( uv + vec2( e, 0.0 ), lod ) ) + luma( imgK( uv - vec2( e, 0.0 ), lod ) )
             + luma( imgK( uv + vec2( 0.0, e ), lod ) ) + luma( imgK( uv - vec2( 0.0, e ), lod ) ) - 4.0 * c )
           * 4.0;
}
/**  Embossed relief of the kaleidoscoped photo, lit from a direction.
 *
 * @param uv        Coordinate in the photo. (in)
 * @param lod       Mip level of the photo (0 = full detail). (in)
 * @param lightDir  Direction of the light in the image plane. (in)
 *
 * @return
 *   The relief shade, 0..1 (0.5 = flat).
 **/
float imgKRelief( vec2 uv, float lod, vec2 lightDir )
{
    vec2 g = imgKGrad( uv, lod ) * ( exp2( lod ) / 1024.0 + 0.001 ) * 8.0;
    return clamp( 0.5 + dot( g, normalize( lightDir ) ), 0.0, 1.0 );
}
/**  A second continuous transform: the photo wound into a log-polar spiral that zooms forever (Droste-like).
 *
 * @param uv    Coordinate in the photo. (in)
 * @param arms  Spiral arms (even: seamless at the atan cut). (in)
 * @param zoom  Zoom phase on integrated time. (in)
 *
 * @return
 *   The spiral coordinate (log radius and angle).
 *
 * angle/pi spans one mirror period, so the atan cut is seamless; the zoom runs on integrated time, never jumps.
 **/
vec2 spiralUV( vec2 uv, float arms, float zoom )
{
    vec2  d = uv - 0.5;
    float r = max( length( d ), 1e-4 );
    float a = atan( d.y, d.x );
    // Both coordinates jump by whole mirror periods (2) at the cut: the shear
    // a/pi jumps by 2, and a/pi*arms/2 by arms (arms must be even).
    return vec2( log( r ) * 0.5 - zoom + a / 3.14159265, a / 3.14159265 * arms * 0.5 );
}
/**  Centred coordinates: y in -0.5..0.5, x scaled by the aspect.
 *
 * @return
 *   The pixel's centred coordinate (y in -0.5..0.5, x scaled by the aspect).
 **/
vec2 screenP()
{
    return ( gl_FragCoord.xy / resolution - 0.5 ) * vec2( resolution.x / resolution.y, 1.0 );
}
/**  House finish: loudness brightness and the soft highlight roll-off.
 *
 * @param col  The scene's colour; written to fragColor after the finish. (in)
 **/
void finish( vec3 col )
{
    col *= 0.9 + 0.2 * audioLevel;
    vec3 t = max( col, 0.0 );
    t /= 1.0 + 0.35 * max( t.r, max( t.g, t.b ) );
    fragColor = vec4( clamp( t, 0.0, 1.0 ), 1.0 );
}

float gId = 0.0;        ///< what was hit: 0, 1 the core tubes, 2 .. 7 the balls
vec4  gQ = vec4( 0.0 ); ///< the hit, folded into the fundamental domain

/**  Turns a complex number by an angle.
 *
 * @param z  The number. (in)
 * @param a  The angle. (in)
 *
 * @return
 *   z e^{i a}.
 **/
vec2 cturn( vec2 z, float a )
{
    return vec2( z.x * cos( a ) - z.y * sin( a ), z.x * sin( a ) + z.y * cos( a ) );
}

/**  The angular distance to the lens space's contents, folded by the action (z1, z2) -> (w z1, w^q z2).
 *
 * @param x   The point on the three-sphere. (in)
 * @param pq  p and q. (in)
 * @param rb  The balls' angular radius. (in)
 * @param rc  The core tubes' angular radius. (in)
 *
 * @return
 *   The distance (sets gId, gQ).
 **/
float lensD( vec4 x, vec2 pq, float rb, float rc )
{
    float a1 = atan( x.y, x.x );
    float k = floor( a1 * pq.x / 6.2831853 + 0.5 );
    float best = 1e9;
    vec4  best_q = x;
    float best_id = 0.0;
    // the two core circles: invariant, no folding needed
    float d_a = asin( clamp( length( x.xy ), 0.0, 1.0 ) ) - rc; // the circle z1 = 0
    float d_b = asin( clamp( length( x.zw ), 0.0, 1.0 ) ) - rc; // the circle z2 = 0
    if ( d_a < best )
    {
        best = d_a;
        best_id = 0.0;
    }
    if ( d_b < best )
    {
        best = d_b;
        best_id = 1.0;
    }
    for ( int j = -1; j <= 1; ++j )
    {
        float kk = k + float( j );
        float ang = -6.2831853 * kk / pq.x;
        vec4  f = vec4( cturn( x.xy, ang ), cturn( x.zw, ang * pq.y ) );
        for ( int b = 0; b < 6; ++b )
        {
            // six balls in the fundamental domain (z1 real): z1 = cos(al), z2 = sin(al) e^(i ga)
            float al = 0.45 + 0.17 * float( b ), ga = 1.0471976 * float( b ) + 0.4;
            vec4  c = vec4( cos( al ), 0.0, sin( al ) * cos( ga ), sin( al ) * sin( ga ) );
            float db = acos( clamp( dot( f, c ), -1.0, 1.0 ) ) - rb * ( 0.6 + 0.09 * float( b ) );
            if ( db < best )
            {
                best = db;
                best_id = 2.0 + float( b );
                best_q = f;
            }
        }
    }
    gId = best_id;
    gQ = best_q;
    return best;
}

/**  p and q of the lens space for one step of the harmony.
 *
 * @param i  The step. (in)
 *
 * @return
 *   (p, q).
 **/
vec2 lensPQ( int i )
{
    if ( i == 0 )
        return vec2( 5.0, 2.0 );
    if ( i == 1 )
        return vec2( 7.0, 3.0 );
    if ( i == 2 )
        return vec2( 8.0, 3.0 );
    if ( i == 3 )
        return vec2( 9.0, 2.0 );
    if ( i == 4 )
        return vec2( 10.0, 3.0 );
    return vec2( 12.0, 5.0 );
}

/**  Renders the lens space from one eye.
 *
 * @param c   The eye on the three-sphere. (in)
 * @param d   The view direction (unit, tangent at c). (in)
 * @param pq  p and q. (in)
 * @param rb  The balls' angular radius. (in)
 * @param rc  The core tubes' angular radius. (in)
 *
 * @return
 *   The colour.
 **/
vec3 renderLens( vec4 c, vec4 d, vec2 pq, float rb, float rc )
{
    float t = 0.002, glow = 0.0;
    bool  hit = false;
    float side = lensD( c, pq, rb, rc ) < 0.0 ? -1.0 : 1.0; // inside a ball or a tube: march to its inner wall
    for ( int i = 0; i < 100; ++i )
    {
        vec4  x = cos( t ) * c + sin( t ) * d; // the light runs along a great circle
        float dd = side * lensD( x, pq, rb, rc );
        glow += 0.02 * exp( -25.0 * max( dd, 0.0 ) ) * exp( -0.3 * t );
        if ( dd < 0.0006 )
        {
            hit = true;
            break;
        }
        t += dd * 0.85;
        if ( t > 6.2 )
            break;
    }
    vec3 tone0 = imgPalette( 0.4 + 0.03 * audioPhase );
    vec3 bg = tone0 * ( 0.08 + 1.5 * glow );
    if ( !hit )
        return bg;
    vec4  x = cos( t ) * c + sin( t ) * d;
    float id = gId;
    vec4  q = gQ;
    // the light: the ray's own direction against the surface's slope along it
    float e = 0.002;
    float slope = side
                  * ( lensD( cos( t - e ) * c + sin( t - e ) * d, pq, rb, rc )
                      - lensD( cos( t + e ) * c + sin( t + e ) * d, pq, rb, rc ) )
                  / ( 2.0 * e );
    float diff = 0.5 + 0.6 * clamp( slope, 0.0, 1.0 );
    vec3  tone = imgPalette( 0.15 + 0.13 * id + 0.03 * audioPhase );
    vec3  c2;
    if ( id < 1.5 )
    {
        vec3 photo = imgLod( mirrorUV( ( id < 0.5 ? x.zw : x.xy ) * 0.8 + 0.5 ), 1.0 );
        c2 = mix( tone * 1.3, photo, 0.3 ) * ( 0.7 + 0.8 * clamp( audioKick, 0.0, 1.0 ) ) * diff;
    }
    else
    {
        vec3 photo = imgLod( q.xy * 0.6 + q.zw * 0.4 + 0.3, 0.4 );
        c2 = mix( tone * 1.4, photo * 1.6, 0.45 + 0.45 * clamp( photoP, 0.0, 1.0 ) ) * diff;
    }
    return mix( bg, c2, exp( -0.2 * t ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  p = screenP();
    float rb = 0.1 + 0.08 * clamp( ballP, 0.0, 1.0 );
    float rc = 0.02 + 0.03 * clamp( coreP, 0.0, 1.0 );
    // the eye flies along a great circle that keeps clear of both cores (|z1| = |z2| throughout), turning slowly
    float a = 0.05 * sceneTime + 0.25 * audioAdvance, b = 0.031 * sceneTime;
    vec4  u = vec4( 0.7071068, 0.0, 0.7071068, 0.0 ), v = vec4( 0.0, 0.7071068, 0.0, 0.7071068 );
    vec4  w1 = vec4( 0.7071068, 0.0, -0.7071068, 0.0 ), w2 = vec4( 0.0, 0.7071068, 0.0, -0.7071068 );
    vec4  c = cos( a ) * u + sin( a ) * v, e3 = -sin( a ) * u + cos( a ) * v;
    vec4  e1 = cos( b ) * w1 + sin( b ) * w2, e2 = -sin( b ) * w1 + cos( b ) * w2;
    vec4  d = normalize( e3 * 1.3 + e1 * p.x + e2 * p.y );
    float h = max( audioHarmAdvance, 0.0 );
    int   i_a = int( mod( floor( h ), 6.0 ) ), i_b = int( mod( floor( h ) + 1.0, 6.0 ) );
    float g = smoothstep( 0.2, 0.8, fract( h ) );
    vec3  col = vec3( 0.0 );
    if ( g < 0.999 )
        col += ( 1.0 - g ) * renderLens( c, d, lensPQ( i_a ), rb, rc );
    if ( g > 0.001 )
        col += g * renderLens( c, d, lensPQ( i_b ), rb, rc );
    finish( col );
}
