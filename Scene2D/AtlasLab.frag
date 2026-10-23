#version 330 core
/*****************************************************************************\
 *                              AtlasLab.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  ATLAS LAB: the photo laid on a globe and spread across the screen by eighteen map projections -- plate carree,
 *  Mercator, Mollweide, sinusoidal, orthographic, stereographic, azimuthal equidistant, Lambert's equal-area
 *  azimuthal, gnomonic, Hammer, Eckert IV, Craster's parabolic, Lambert's cylinder, Miller, Gall's stereographic,
 *  Bonne, Werner's heart, the equidistant cone.
 *
 *  The globe turns about changing axes (spinning, tumbling, precessing, nodding, seen from the pole, tilted, two
 *  axes at once, drifting); a third stage lights it (flat, a turning sun with a soft terminator, a dimmed rim, the
 *  world doubled and mirrored); a fourth chooses the view (the whole map, tiled copies, a zoom, a deeper zoom).
 *  Beyond the outline the photo itself continues, dimmed.  The walk changes one stage at a time and cross-fades the
 *  maps, so the continents of one projection slide into another's; a new section changes all four.
 *
 *  Audio Reactivity (structure, not only light):
 *    audioPhase      -> the globe's spin (integrated)
 *    audioHarmAdvance -> the tilt of the axis steps on with each harmonic change (integrated)
 *    audioSwell      -> the light's reach: how deep the night side falls
 *    audioSectionId/Age -> a new section re-rolls every stage
 *
 *  Knobs: seedP (the walk's seed), spinP (the globe's speed), zoomP (the view's size), hueP.
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
uniform float audioSwell;       ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioHarmAdvance; ///< The harmony's advance: ~1 more with every chord change (integrated, never jumps
                                ///< back).
uniform float audioSectionId; ///< Slot of the current song section in the analyzer's fingerprint store (-1: none yet).
uniform float audioSectionPrev; ///< Slot of the previous song section.
uniform float audioSectionAge;  ///< Seconds since the current song section began.

uniform float seedP; ///< Seed knob: the walk's seed, 0..1.
uniform float spinP; ///< Spin knob, 0..1.
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


// ---- the lab's walk ----
/** Test pin of slot 0: 1 + the class to hold it on (0: the walk decides). */
uniform float labPinA;
/** Test pin of slot 1. */
uniform float labPinB;
/** Test pin of slot 2. */
uniform float labPinC;
/** Test pin of slot 3. */
uniform float labPinD;
/** The share of an epoch a class change takes to cross-fade. */
const float LabFade = 0.2;
/** The classes of the four slots, for each of the (up to four) looks the walk blends. */
ivec4 gLabK[4];
/** The weights of those looks. */
float gLabW[4];

/**  A class of a slot in an epoch: a hash of the slot, the epoch and the walk's seed.
 *
 * @param s     The slot, 0..3. (in)
 * @param e     The epoch (a whole number). (in)
 * @param seed  The walk's seed. (in)
 * @param n     The number of classes in the slot. (in)
 *
 * @return
 *   The class, 0..n-1.
 **/
int labCls( int s, float e, float seed, int n )
{
    return int(
        min( floor( hash21( vec2( e * 1.7 + seed, float( s ) * 9.13 + 2.1 ) ) * float( n ) ), float( n - 1 ) ) );
}

/**  The lab's walk through its vocabulary, into gLabK (class of every slot) and gLabW (weight of each look).
 *
 * @param seed    The walk's seed, rolled once per activation. (in)
 * @param n       The number of classes of each slot (0: the slot is not used). (in)
 * @param period  The epoch's length in units of the clock (1: about twenty seconds). (in)
 *
 * The slots change one after another (each takes a fifth of an epoch to cross-fade, the others stand), so a look
 * differs from the one it fades into by one class; a new section of the music re-rolls every slot (the old look fades
 * out over eight seconds).  The clock is the music's own advance with a floor of an epoch a minute.  The labPin knobs
 * hold a slot on a class (1 + class), for tests.
 **/
void labWalk( float seed, ivec4 n, float period )
{
    int   n_s = max( int( n.x > 0 ) + int( n.y > 0 ) + int( n.z > 0 ) + int( n.w > 0 ), 1 );
    float clk = ( 0.9 * sceneAdvance + sceneTime / 75.0 ) / period + fract( seed * 0.37 ) * 0.8;
    float m = smoothstep( 0.0, 8.0, audioSectionAge );
    if ( audioSectionPrev == audioSectionId )
        m = 1.0;
    for ( int j = 0; j < 2; ++j )
    {
        float sd = seed + 0.713 * ( j == 0 ? audioSectionPrev : audioSectionId );
        ivec4 base = ivec4( 0 ), alt = ivec4( 0 );
        int   fs = 0;
        float ff = 0.0;
        for ( int s = 0; s < 4; ++s )
        {
            if ( n[s] <= 0 )
                continue;
            float w = clk + float( s ) / float( n_s );
            float e = floor( w );
            base[s] = labCls( s, e, sd, n[s] );
            alt[s] = labCls( s, e + 1.0, sd, n[s] );
            float f = smoothstep( 1.0 - LabFade, 1.0, w - e );
            if ( f > 0.0 )
            {
                fs = s;
                ff = f;
            }
        }
        float wj = j == 0 ? 1.0 - m : m;
        ivec4 b2 = base;
        b2[fs] = alt[fs];
        gLabK[2 * j] = base;
        gLabW[2 * j] = wj * ( 1.0 - ff );
        gLabK[2 * j + 1] = b2;
        gLabW[2 * j + 1] = wj * ff;
    }
    if ( labPinA + labPinB + labPinC + labPinD > 0.5 )
    {
        for ( int i = 0; i < 4; ++i )
        {
            if ( labPinA > 0.5 )
                gLabK[i].x = min( int( labPinA + 0.5 ) - 1, n.x - 1 );
            if ( labPinB > 0.5 )
                gLabK[i].y = min( int( labPinB + 0.5 ) - 1, n.y - 1 );
            if ( labPinC > 0.5 )
                gLabK[i].z = min( int( labPinC + 0.5 ) - 1, n.z - 1 );
            if ( labPinD > 0.5 )
                gLabK[i].w = min( int( labPinD + 0.5 ) - 1, n.w - 1 );
            gLabW[i] = i == 0 ? 1.0 : 0.0;
        }
    }
}

/**  The inverse of a map projection: the place on the globe at a point of the map.
 *
 * @param kind  The projection, 0..17. (in)
 * @param u     The map's coordinates, fitted to the outline's size. (in)
 * @param ok    Whether the point lies inside the map's outline. (out)
 * @param ext   The outline's half extents (its natural scale). (out)
 *
 * @return
 *   Longitude and latitude in radians.
 **/
vec2 atlasInv( int kind, vec2 u, out float ok, out vec2 ext )
{
    ok = 1.0;
    ext = vec2( 3.14159265, 1.5707963 );
    float rho = length( u );
    float c = 0.0;
    if ( kind == 0 )
        return u;
    if ( kind == 1 )
    {
        ext = vec2( 3.14159265, 3.0 );
        return vec2( u.x, 2.0 * atan( exp( clamp( u.y, -6.0, 6.0 ) ) ) - 1.5707963 );
    }
    if ( kind == 2 )
    {
        ext = vec2( 2.828427, 1.414214 );
        float th = asin( clamp( u.y / 1.414214, -1.0, 1.0 ) );
        float ph = asin( clamp( ( 2.0 * th + sin( 2.0 * th ) ) / 3.14159265, -1.0, 1.0 ) );
        ok = abs( u.x ) <= 2.828427 * cos( th ) && abs( u.y ) <= 1.414214 ? 1.0 : 0.0;
        return vec2( 3.14159265 * u.x / ( 2.828427 * max( cos( th ), 1e-3 ) ), ph );
    }
    if ( kind == 3 )
    {
        float ph = clamp( u.y, -1.5707963, 1.5707963 );
        float lam = u.x / max( cos( ph ), 1e-3 );
        ok = abs( lam ) <= 3.14159265 ? 1.0 : 0.0;
        return vec2( lam, ph );
    }
    if ( kind >= 4 && kind <= 8 )
    {
        if ( kind == 4 )
        {
            ext = vec2( 1.0 );
            c = asin( clamp( rho, 0.0, 1.0 ) );
            ok = rho <= 1.0 ? 1.0 : 0.0;
        }
        else if ( kind == 5 )
        {
            ext = vec2( 2.0 );
            c = 2.0 * atan( rho * 0.5 );
        }
        else if ( kind == 6 )
        {
            ext = vec2( 3.14159265 );
            c = rho;
            ok = rho <= 3.14159265 ? 1.0 : 0.0;
        }
        else if ( kind == 7 )
        {
            ext = vec2( 2.0 );
            c = 2.0 * asin( clamp( rho * 0.5, 0.0, 1.0 ) );
            ok = rho <= 2.0 ? 1.0 : 0.0;
        }
        else
        {
            ext = vec2( 2.0 );
            c = atan( rho );
            ok = c < 1.45 ? 1.0 : 0.0;
        }
        float ph = asin( clamp( u.y * sin( c ) / max( rho, 1e-4 ), -1.0, 1.0 ) );
        float lam = atan( u.x * sin( c ), rho * cos( c ) );
        return vec2( lam, ph );
    }
    if ( kind == 9 )
    {
        ext = vec2( 2.828427, 1.414214 );
        float z2 = 1.0 - ( u.x / 4.0 ) * ( u.x / 4.0 ) - ( u.y / 2.0 ) * ( u.y / 2.0 );
        ok = z2 > 0.0 ? 1.0 : 0.0;
        float z = sqrt( max( z2, 0.0 ) );
        return vec2( 2.0 * atan( z * u.x, 2.0 * ( 2.0 * z * z - 1.0 ) ), asin( clamp( z * u.y, -1.0, 1.0 ) ) );
    }
    if ( kind == 10 )
    {
        ext = vec2( 2.6527, 1.3265 );
        float sn = u.y / 1.3265;
        ok = abs( sn ) <= 1.0 ? 1.0 : 0.0;
        float th = asin( clamp( sn, -1.0, 1.0 ) );
        float ph = asin( clamp( ( th + sin( th ) * cos( th ) + 2.0 * sin( th ) ) / ( 2.0 + 1.5707963 ), -1.0, 1.0 ) );
        return vec2( u.x / ( 0.42223 * ( 1.0 + cos( th ) ) ), ph );
    }
    if ( kind == 11 )
    {
        ext = vec2( 3.07, 1.535 );
        float ph = 3.0 * asin( clamp( u.y / 3.07, -1.0, 1.0 ) );
        ok = abs( u.y ) <= 1.535 ? 1.0 : 0.0;
        float lam = u.x / ( 0.9772 * max( 2.0 * cos( 2.0 * ph / 3.0 ) - 1.0, 1e-3 ) );
        ok *= abs( lam ) <= 3.14159265 ? 1.0 : 0.0;
        return vec2( lam, ph );
    }
    if ( kind == 12 )
    {
        ext = vec2( 3.14159265, 1.0 );
        ok = abs( u.y ) <= 1.0 ? 1.0 : 0.0;
        return vec2( u.x, asin( clamp( u.y, -1.0, 1.0 ) ) );
    }
    if ( kind == 13 )
    {
        ext = vec2( 3.14159265, 2.3 );
        return vec2( u.x, 2.5 * atan( exp( clamp( 0.8 * u.y, -6.0, 6.0 ) ) ) - 0.625 * 3.14159265 );
    }
    if ( kind == 14 )
    {
        ext = vec2( 2.22, 1.71 );
        return vec2( 1.41421 * u.x, 2.0 * atan( u.y / 1.7071 ) );
    }
    if ( kind == 15 || kind == 16 )
    {
        float p1 = kind == 15 ? 0.7853982 : 1.5707963;
        float cot = kind == 15 ? 1.0 : 0.0;
        ext = vec2( 2.6, 1.6 );
        u.y -= kind == 15 ? 0.8 : 1.5708;
        float r = sqrt( u.x * u.x + ( cot - u.y ) * ( cot - u.y ) );
        float ph = cot + p1 - r;
        ok = abs( ph ) <= 1.5707963 ? 1.0 : 0.0;
        float lam = r * atan( u.x, cot - u.y ) / max( cos( ph ), 1e-2 );
        ok *= abs( lam ) <= 3.14159265 ? 1.0 : 0.0;
        return vec2( lam, ph );
    }
    float n = ( cos( 0.5236 ) - cos( 1.0472 ) ) / ( 1.0472 - 0.5236 );
    float G = cos( 0.5236 ) / n + 0.5236;
    ext = vec2( 3.3, 2.65 );
    u.y += 1.1;
    float r = sqrt( u.x * u.x + ( G - u.y ) * ( G - u.y ) );
    float ph = G - r;
    ok = abs( ph ) <= 1.5707963 ? 1.0 : 0.0;
    float lam = atan( u.x, G - u.y ) / n;
    ok *= abs( lam ) <= 3.14159265 ? 1.0 : 0.0;
    return vec2( lam, ph );
}

/**  The globe's rotation for a motion law.
 *
 * @param law  The law, 0..7: spin, tumble, precession, nodding, polar view, tilted, two axes, drift. (in)
 * @param t    The clock. (in)
 * @param hd   The harmonic advance. (in)
 *
 * @return
 *   The rotation matrix.
 **/
mat3 atlasRot( int law, float t, float hd )
{
    float a = 0.0, b = 0.0, g = 0.0;
    if ( law == 0 )
        a = 0.35 * t;
    else if ( law == 1 )
        b = 0.3 * t;
    else if ( law == 2 )
    {
        a = 0.3 * t;
        b = 0.5 * sin( 0.1 * t );
        g = 0.5 * cos( 0.1 * t );
    }
    else if ( law == 3 )
    {
        a = 0.25 * t;
        b = 0.4 * sin( 0.35 * t );
    }
    else if ( law == 4 )
    {
        a = 0.3 * t;
        b = 1.5708;
    }
    else if ( law == 5 )
    {
        a = 0.3 * t;
        b = 0.7854 + 0.2 * sin( 0.7 * hd );
    }
    else if ( law == 6 )
    {
        a = 0.22 * t;
        b = 0.17 * t;
        g = 0.11 * t;
    }
    else
    {
        a = 0.1 * t;
        b = 0.3 * sin( 0.05 * t );
    }
    float ca = cos( a ), sa = sin( a ), cb = cos( b ), sb = sin( b ), cg = cos( g ), sg = sin( g );
    mat3  rz = mat3( ca, sa, 0.0, -sa, ca, 0.0, 0.0, 0.0, 1.0 );
    mat3  ry = mat3( cb, 0.0, -sb, 0.0, 1.0, 0.0, sb, 0.0, cb );
    mat3  rx = mat3( 1.0, 0.0, 0.0, 0.0, cg, sg, 0.0, -sg, cg );
    return rz * ry * rx;
}

/**  One look of the lab: the photo on the rotating globe, in a projection.
 *
 * @param k   The classes: x the projection, y the globe's motion, z the light, w the view. (in)
 * @param p   The place on screen. (in)
 * @param t   The clock. (in)
 * @param hd  The harmonic advance. (in)
 * @param zm  The view's zoom (1: the whole map). (in)
 * @param sw  The swell. (in)
 *
 * @return
 *   The colour.
 **/
vec3 atlasLook( ivec4 k, vec2 p, float t, float hd, float zm, float sw )
{
    float ok;
    vec2  ext;
    atlasInv( k.x, vec2( 0.0 ), ok, ext );
    float fit = max( ext.x / 0.89, ext.y / 0.5 ) * 0.98;
    vec2  q = p;
    float z = k.w == 2 ? 1.8 * zm : ( k.w == 3 ? 3.5 * zm : 1.0 );
    q /= z;
    if ( k.w == 1 )
    {
        vec2 cell = 2.0 * ext / fit * 1.0;
        q = ( fract( ( q + 0.5 * cell ) / cell ) - 0.5 ) * cell;
    }
    float oky;
    vec2  ll = atlasInv( k.x, q * fit, oky, ext );
    vec3  bg = imgLod( p * 0.8 + 0.5, 4.5 ) * 0.4;
    if ( oky < 0.5 )
        return bg;
    vec3  s = vec3( cos( ll.y ) * cos( ll.x ), cos( ll.y ) * sin( ll.x ), sin( ll.y ) );
    vec3  s2 = atlasRot( k.y, t, hd ) * s;
    float lon = atan( s2.y, s2.x );
    float lat = asin( clamp( s2.z, -1.0, 1.0 ) );
    vec2  uv = vec2( abs( lon ) / 3.14159265 * ( k.z == 3 ? 2.0 : 1.0 ), lat / 3.14159265 + 0.5 );
    vec3  col = imgLod( uv, 0.6 );
    if ( k.z == 1 )
    {
        float a = 0.2 * t;
        vec3  L = normalize( vec3( 0.7, 0.8 * cos( a ), 0.8 * sin( a ) ) );
        col *= 0.3 + 0.8 * smoothstep( -0.25 - 0.3 * ( 1.0 - sw ), 0.45, dot( s, L ) );
    }
    else if ( k.z == 2 )
    {
        float e = length( q * fit / ext );
        col *= 1.0 - 0.6 * smoothstep( 0.6, 1.1, e );
    }
    return col;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 p = screenP();
    labWalk( seedP * 83.0, ivec4( 18, 8, 4, 4 ), 1.0 );
    float sw = clamp( audioSwell, 0.0, 1.0 );
    float t = ( 0.6 + 0.9 * clamp( spinP, 0.0, 1.0 ) ) * ( sceneTime * 0.5 + 4.0 * audioPhase );
    float zm = 0.8 + 0.7 * clamp( zoomP, 0.0, 1.0 );
    vec3  col = vec3( 0.0 );
    float ws = 0.0;
    for ( int i = 0; i < 4; ++i )
    {
        if ( gLabW[i] > 0.002 )
        {
            col += gLabW[i] * atlasLook( gLabK[i], p, t, audioHarmAdvance, zm, sw );
            ws += gLabW[i];
        }
    }
    finish( max( col / max( ws, 1e-3 ), 0.0 ) );
}
