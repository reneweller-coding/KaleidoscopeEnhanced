#version 330 core
/*****************************************************************************\
 *                              TilingSubstitutionAutomaton.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TILING SUBSTITUTION AUTOMATON: self-similar tilings grown by substitution -- the chair (an L of three squares
 *  splits into four smaller Ls) and the table (a domino splits into four dominoes, two upright).
 *
 *  Every pixel descends the hierarchy to find its tile; the generations glide in and out, the view zooms endlessly
 *  toward a fixed point of the substitution (one zoom octave is one generation, so it never ends and never jumps),
 *  mirrored at the axes.  Each tile shows its own cut of the photo.
 *
 *  Audio Reactivity (structure, not only light):
 *    audioHarmAdvance -> every change of harmony divides the tiles one generation further or merges them back
 *    (gliding)
 *    audioSectionId   -> a new section crossfades to the other tiling
 *    audioPhase       -> the palette turns through the photo (integrated)
 *    audioKick        -> the youngest edges flash (light)
 *
 *  Knobs: tileP (the first tiling: chair or table), genP (the base generation), zoomP (zoom speed), hueP.
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
uniform float audioSectionId; ///< Slot of the current song section in the analyzer's fingerprint store (-1: none yet).
uniform float audioSectionAge;  ///< Seconds since the current song section began.

uniform float tileP; ///< Tile knob: the first tiling: chair or table, 0..1.
uniform float genP;  ///< Gen knob: the base generation, 0..1.
uniform float zoomP; ///< Zoom knob, 0..1.
uniform float hueP;  ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  An integer hash (Wellons' lowbias32).
 *
 * @param x  The input. (in)
 *
 * @return
 *   A well mixed 32-bit value.
 **/
uint tileHash( uint x )
{
    x ^= x >> 16u;
    x *= 0x7feb352du;
    x ^= x >> 15u;
    x *= 0x846ca68bu;
    x ^= x >> 16u;
    return x;
}
/**  One level down the chair substitution: which of the four sub-chairs holds the point, and the point in its frame.
 *
 * @param q  The point in the chair's frame (the L [0,2]^2 without [1,2]^2); replaced by its place in the sub-chair.
 *           (in,out)
 *
 * @return
 *   The sub-chair: 0 at the corner (the fixed point), 1 in the middle, 2 and 3 in the arms.
 **/
int chairDown( inout vec2 q )
{
    if ( q.x >= 1.0 && !( q.x < 1.5 && q.y >= 0.5 ) )
    {
        q = vec2( 2.0 - q.x, q.y ) * 2.0;
        return 2;
    }
    if ( q.y >= 1.0 && !( q.y < 1.5 && q.x >= 0.5 ) )
    {
        q = vec2( q.x, 2.0 - q.y ) * 2.0;
        return 3;
    }
    if ( q.x >= 0.5 && q.y >= 0.5 )
    {
        q = ( q - 0.5 ) * 2.0;
        return 1;
    }
    q *= 2.0;
    return 0;
}
/**  A point's distance to the edge of the chair it lies in (in the chair's frame).
 *
 * @param q  The point in the chair's frame. (in)
 *
 * @return
 *   The distance to the L's boundary.
 **/
float chairEdge( vec2 q )
{
    float d = min( q.x, q.y );
    if ( q.x > 1.0 )
        return min( d, min( 2.0 - q.x, 1.0 - q.y ) );
    if ( q.y > 1.0 )
        return min( d, min( 2.0 - q.y, 1.0 - q.x ) );
    return min( d, min( length( q - 1.0 ), min( 2.0 - q.x, 2.0 - q.y ) ) );
}
/**  One level down the table substitution (a 2 x 1 domino into four 1 x 0.5 dominoes).
 *
 * @param q  The point in the domino's frame ([0,2] x [0,1]); replaced by its place in the sub-domino. (in,out)
 *
 * @return
 *   The sub-domino: 0 middle bottom (the fixed point's), 1 middle top, 2 left upright, 3 right upright.
 **/
int tableDown( inout vec2 q )
{
    if ( q.x < 0.5 )
    {
        q = vec2( q.y, 0.5 - q.x ) * 2.0;
        return 2;
    }
    if ( q.x >= 1.5 )
    {
        q = vec2( q.y, q.x - 1.5 ) * 2.0;
        return 3;
    }
    if ( q.y < 0.5 )
    {
        q = vec2( q.x - 0.5, q.y ) * 2.0;
        return 0;
    }
    q = vec2( q.x - 0.5, q.y - 0.5 ) * 2.0;
    return 1;
}
/**  The tiling at a screen point: the fill of the generation shown, and its edges down to the finest level.
 *
 * @param p      The screen point. (in)
 * @param table  True for the table tiling, false for the chair. (in)
 * @param zf     The zoom within the octave, 0..1. (in)
 * @param gen    The generation shown (fractional: the next one glides in). (in)
 *
 * @return
 *   The colour.
 **/
vec3 tiling( vec2 p, bool table, float zf, float gen )
{
    float s = 0.97 * exp2( -zf );
    vec2  q = table ? vec2( 1.0 + p.x * s, abs( p.y ) * s ) : abs( p ) * s;
    float unit = 1.0 / s; // screen units per frame unit at level 0
    uint  id = 0u;
    float kf = gen + zf;
    int   k_fill = int( floor( kf ) );
    float w_next = smoothstep( 0.55, 1.0, fract( kf ) );
    vec3  fill = vec3( 0.0 ), fill_n = vec3( 0.0 );
    float line = 0.0;
    for ( int i = 0; i < 11; ++i )
    {
        float a = float( i ) - zf; // the level's apparent generation
        float e = ( table ? min( min( q.x, q.y ), min( 2.0 - q.x, 1.0 - q.y ) ) : chairEdge( q ) ) * unit;
        float wl = smoothstep( gen + 1.2, gen + 0.2, a ); // finer levels fade in
        float width = 0.004 * exp2( -0.3 * max( a, 0.0 ) );
        line = max( line, wl * ( 1.0 - smoothstep( width * 0.5, width * 1.5, e ) ) );
        if ( i == k_fill || i == k_fill + 1 )
        {
            // the path's number: leading corner choices (0) add nothing, so a tile keeps its colour when the zoom
            // wraps and it moves up a level
            float h = float( tileHash( id + 0x51edu ) >> 8u ) / 16777216.0;
            vec2  uv = p * 0.6 + 0.5 + vec2( h, fract( h * 7.31 ) ) * 0.8;
            vec3  c = mix( imgLod( uv, 0.8 ), imgPalette( h + 0.03 * audioPhase ), 0.3 ) * ( 0.55 + 0.6 * h );
            if ( i == k_fill )
                fill = c;
            else
                fill_n = c;
        }
        int ch = table ? tableDown( q ) : chairDown( q );
        id = id * 4u + uint( ch );
        unit *= 0.5;
    }
    vec3 col = mix( fill, fill_n, w_next );
    // the joints: a dark groove with a bright lip, so every generation's outline reads
    vec3 edge = mix( imgPalette( 0.5 + 0.03 * audioPhase ), vec3( 1.0 ), 0.5 )
                * ( 0.7 + 0.6 * clamp( audioKick, 0.0, 1.0 ) );
    col *= 1.0 - 0.75 * line;
    return col + edge * line * line * 0.5;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  p = rot2( 0.006 * sceneTime ) * screenP();
    float zf = fract( ( 0.01 + 0.04 * clamp( zoomP, 0.0, 1.0 ) ) * sceneTime );
    float tri = abs( fract( audioHarmAdvance / 8.0 ) * 2.0 - 1.0 ); // up and down through the generations
    float gen = 1.5 + 2.0 * clamp( genP, 0.0, 1.0 ) + 2.0 * tri;
    // a new section crossfades from the last tiling to the next
    float k = floor( clamp( tileP, 0.0, 0.999 ) * 2.0 ) + max( audioSectionId, 0.0 );
    float now = mod( k, 2.0 ), before = mod( k + 1.0, 2.0 );
    float m = mix( before, now, smoothstep( 0.0, 4.0, audioSectionAge ) );
    if ( audioSectionId < 0.5 )
        m = now;
    vec3 col = vec3( 0.0 );
    if ( m < 0.999 )
        col += ( 1.0 - m ) * tiling( p, false, zf, gen );
    if ( m > 0.001 )
        col += m * tiling( p, true, zf, gen );
    finish( col );
}
