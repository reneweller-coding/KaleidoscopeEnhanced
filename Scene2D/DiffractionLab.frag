#version 330 core
/*****************************************************************************\
 *                              DiffractionLab.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  DIFFRACTION LAB: the photo seen through a catalogue of gratings -- a sine grating, a hexagonal lattice, a
 *  five-fold quasicrystal, a Fresnel zone plate, a spiral phase plate, a golden-ratio chirp, a Cantor ladder of
 *  scales, radial rings.
 *
 *  A grating throws ghost copies of the photo to either side of it (the diffraction orders), shifted by the
 *  grating's local direction and strength; the copies add to the picture and the grating's own stripes lie over it,
 *  so moiré arises by itself.  The second stage picks the orders (one, two, one-sided, uneven, or split a little by
 *  colour), the third moves the grating (turning, breathing, travelling, shearing), the fourth combines the copies
 *  (sum, lighten, multiplied stripes, the difference).  The walk changes one stage at a time and cross-fades; a new
 *  section changes all four.  The photo keeps its colours; any colour fringe is a thin edge only.
 *
 *  Audio Reactivity (structure, not only light):
 *    audioSwell      -> how far the orders are thrown (the ghosts open as the music swells)
 *    audioHarmAdvance -> the grating constant drifts toward the next simple ratio (integrated)
 *    audioPhase      -> the grating's turn and travel (integrated)
 *    audioSectionId/Age -> a new section re-rolls every stage
 *
 *  Knobs: seedP (the walk's seed), pitchP (the grating's fineness), reachP (how far the ghosts reach), hueP.
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

uniform float seedP;  ///< Seed knob: the walk's seed, 0..1.
uniform float pitchP; ///< Pitch knob, 0..1.
uniform float reachP; ///< Reach knob: how far the ghosts reach, 0..1.
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

/**  A grating at a place: the direction and strength of its first order and the phase of its own stripes.
 *
 * @param kind  The grating, 0..7. (in)
 * @param p     The place (turned and scaled by the lab's motion). (in)
 * @param K     The grating constant. (in)
 * @param t     The clock. (in)
 * @param ph    The grating's phase (the stripes' position, 0..2 pi). (out)
 *
 * @return
 *   The shift of the first order.
 **/
vec2 diffGrating( int kind, vec2 p, float K, float t, out float ph )
{
    ph = 0.0;
    if ( kind == 0 )
    {
        ph = K * p.x;
        return vec2( 1.0, 0.0 );
    }
    if ( kind == 1 || kind == 2 )
    {
        int  n = kind == 1 ? 3 : 5;
        vec2 g = vec2( 0.0 );
        for ( int i = 0; i < 5; ++i )
        {
            if ( i >= n )
                break;
            float a = 3.14159265 * float( i ) / float( n );
            vec2  d = vec2( cos( a ), sin( a ) );
            float s = K * dot( p, d ) + 0.2 * t * float( i + 1 );
            ph += cos( s );
            g -= sin( s ) * d;
        }
        return g * ( kind == 1 ? 0.7 : 0.55 );
    }
    if ( kind == 3 )
    {
        ph = 0.5 * K * dot( p, p );
        return p * 2.0;
    }
    if ( kind == 4 )
    {
        float r = max( length( p ), 0.05 );
        vec2  e = p / r;
        ph = 3.0 * atan( p.y, p.x ) + K * r * 0.5;
        return ( vec2( -e.y, e.x ) * 3.0 / ( r * 4.0 + 0.5 ) + e * 0.8 );
    }
    if ( kind == 5 )
    {
        float u = K * p.x;
        ph = u + 0.7 * sin( u / 1.618 + 0.3 * t );
        return vec2( 1.0 + 0.35 * cos( u / 1.618 + 0.3 * t ), 0.2 * sin( 0.7 * u ) );
    }
    if ( kind == 6 )
    {
        float s = 0.0;
        float a = 1.0;
        for ( int j = 0; j < 4; ++j )
        {
            s += a * sin( K * 0.5 * pow( 3.0, float( j ) ) * p.x + 0.1 * t * float( j + 1 ) );
            ph += a * K * 0.5 * pow( 3.0, float( j ) ) * p.x;
            a *= 0.5;
        }
        return vec2( s * 0.8, 0.15 * s );
    }
    float r = length( p );
    ph = K * r;
    return p / max( r, 0.05 ) * sin( K * r * 0.5 + 0.3 * t );
}

/**  One look of the lab.
 *
 * @param k  The classes: x the grating, y the orders, z the grating's motion, w the combination. (in)
 * @param p  The place. (in)
 * @param t  The clock. (in)
 * @param K  The grating constant. (in)
 * @param R  How far the orders are thrown. (in)
 *
 * @return
 *   The colour.
 **/
vec3 diffLook( ivec4 k, vec2 p, float t, float K, float R )
{
    vec2 q = p;
    if ( k.z == 0 )
        q = rot2( 0.05 * t ) * q;
    else if ( k.z == 1 )
        q *= 1.0 + 0.2 * sin( 0.25 * t );
    else if ( k.z == 2 )
        q += vec2( 0.06 * t, 0.0 );
    else
        q.x += 0.3 * q.y * sin( 0.2 * t );
    float ph;
    vec2  D = diffGrating( k.x, q, K, t, ph ) * R * 0.09;
    vec3  sum = vec3( 0.0 );
    float wsum = 0.0;
    vec3  mx = vec3( 0.0 );
    vec3  first = vec3( 0.0 );
    int   lo = k.y == 2 ? 0 : -2;
    for ( int m = -2; m <= 2; ++m )
    {
        if ( m < lo )
            continue;
        if ( k.y == 0 && abs( m ) > 1 )
            continue;
        float w = m == 0 ? 0.45 : ( abs( m ) == 1 ? 0.22 : 0.09 );
        if ( k.y == 3 )
            w *= ( m > 0 ? 1.6 : 0.5 );
        float vis = 0.72 + 0.28 * cos( float( m ) * ph );
        vec2  off = float( m ) * D;
        vec3  c;
        if ( k.y == 4 )
        {
            c = vec3( imgLod( p * 0.8 + 0.5 + off * 0.96 * 0.8, 0.4 ).r, imgLod( p * 0.8 + 0.5 + off * 0.8, 0.4 ).g,
                      imgLod( p * 0.8 + 0.5 + off * 1.04 * 0.8, 0.4 ).b );
        }
        else
        {
            c = imgLod( p * 0.8 + 0.5 + off * 0.8, 0.4 );
        }
        sum += w * vis * c;
        wsum += w;
        mx = max( mx, c * vis );
        if ( m == 0 )
            first = c;
    }
    vec3 avg = sum / max( wsum, 1e-3 ) * 1.1;
    if ( k.w == 1 )
        return mix( avg, mx, 0.7 );
    if ( k.w == 2 )
        return avg * ( 0.7 + 0.5 * cos( ph ) );
    if ( k.w == 3 )
        return clamp( abs( first - avg ) * 2.2 + 0.35 * first, 0.0, 1.4 );
    return avg;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 p = screenP();
    labWalk( seedP * 83.0, ivec4( 8, 5, 4, 4 ), 1.0 );
    float sw = clamp( audioSwell, 0.0, 1.0 );
    float K = ( 9.0 + 22.0 * clamp( pitchP, 0.0, 1.0 ) ) * ( 1.0 + 0.12 * sin( 0.7 * audioHarmAdvance ) );
    float R = ( 0.5 + 1.1 * clamp( reachP, 0.0, 1.0 ) ) * ( 0.5 + 0.9 * sw );
    float t = sceneTime * 0.6 + 4.0 * audioPhase;
    vec3  col = vec3( 0.0 );
    float ws = 0.0;
    for ( int i = 0; i < 4; ++i )
    {
        if ( gLabW[i] > 0.002 )
        {
            col += gLabW[i] * diffLook( gLabK[i], p, t, K, R );
            ws += gLabW[i];
        }
    }
    finish( max( col / max( ws, 1e-3 ), 0.0 ) );
}
