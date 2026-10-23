#version 330 core
/*****************************************************************************\
 *                              TwinPhotoLab.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TWIN PHOTO LAB: two photos -- the one on show and the one before it -- woven by a vocabulary of connections: a
 *  mask cut from one's brightness, one refracted through the other's gradient, each pushing the other by its
 *  brightness, a checkerboard, a morph that slides pixels toward the other, stripes whose width the other sets, a
 *  hybrid (the coarse masses of one, the fine grain of the other), a swap of luma and colour, a glow where they
 *  differ, Voronoi parity, alternating wedges of a kaleidoscope, a vortex window.
 *
 *  A second stage bends the shared space (kaleidoscope fold, mirrored tiles, swirl, waves, breathing zoom), a third
 *  swaps the photos' roles, a fourth weights them.  The walk changes one stage at a time and cross-fades; a new
 *  section changes all four.  Both photos keep their own colours.
 *
 *  Audio Reactivity (structure, not only light):
 *    audioSwell      -> the mixing degree breathes with it
 *    audioPhase      -> the connections' motions (integrated)
 *    audioHarmAdvance -> the roles drift toward the other photo with each harmonic change (integrated)
 *    audioSectionId/Age -> a new section re-rolls every stage
 *
 *  Knobs: seedP (the walk's seed), scaleP (the pattern scale of checkers, stripes and cells), strengthP (the
 *  connection's strength), hueP.
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

uniform float     seedP;      ///< Seed knob: the walk's seed, 0..1.
uniform float     scaleP;     ///< Scale knob.
uniform float     strengthP;  ///< Strength knob: the connection's strength, 0..1.
uniform float     hueP;       ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform sampler2D texPhotoB0; ///< The second photo, slot 0: the photo shown before the current one (unit 38).
uniform sampler2D texPhotoB1; ///< The second photo, slot 1: the next one it fades over to (unit 39).
uniform float     photoBMix;  ///< How far the second photo has faded from slot 0 to slot 1, 0..1.

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


// ---- the second photo ----
/**  The second photo at a mip level: the photo shown before the current one, gliding over to the next when the photos
 * change (the app's two slots, mixed by photoBMix).
 *
 * @param uv   The point (mirrored at the edges, as imgLod()). (in)
 * @param lod  The mip level: 0 full detail, ~4 a soft field. (in)
 *
 * @return
 *   The colour.
 **/
vec3 imgB( vec2 uv, float lod )
{
    uv = mirrorUV( uv );
    float m = smoothstep( 0.0, 1.0, clamp( photoBMix, 0.0, 1.0 ) );
    return mix( textureLod( texPhotoB0, uv, lod ), textureLod( texPhotoB1, uv, lod ), m ).rgb;
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
/** Test pin of the variants: 1 + the variant 0..99 for every slot, or 1000 * (1 + the slot) + 1 + the variant for that
 * slot alone (the others at variant 0); 0: the walk decides. */
uniform float labPinV;
/** The share of an epoch a class change takes to cross-fade. */
const float LabFade = 0.2;
/** The classes of the four slots, for each of the (up to four) looks the walk blends. */
ivec4 gLabK[4];
/** The weights of those looks. */
float gLabW[4];
/** The variants (0..99) of the four slots' classes, for each of the looks the walk blends: a class is a family of
 * looks, the variant sets its constants (lv(), lk()); variant 0 is the lab's original look. */
ivec4 gLabV[4];

/**  A constant of a lab's look, set by a slot's variant inside a range.
 *
 * @param vi  The slot's variant, 0..99. (in)
 * @param j   The stream: another number for every constant of a look. (in)
 * @param lo  The lower end. (in)
 * @param hi  The upper end; variant 0 gives the middle. (in)
 *
 * @return
 *   The constant.
 **/
float lv( int vi, float j, float lo, float hi )
{
    return vi == 0 ? 0.5 * ( lo + hi )
                   : mix( lo, hi, fract( sin( float( vi ) * 12.9898 + j * 78.233 + 3.7 ) * 43758.5453 ) );
}

/**  A choice of a lab's look, set by a slot's variant.
 *
 * @param vi  The slot's variant, 0..99. (in)
 * @param j   The stream. (in)
 * @param n   The number of choices. (in)
 *
 * @return
 *   0 .. n-1; 0 (the original choice) for variant 0.
 **/
int lk( int vi, float j, int n )
{
    return vi == 0
               ? 0
               : min( int( fract( sin( float( vi ) * 37.719 + j * 51.37 + 1.9 ) * 43758.5453 ) * float( n ) ), n - 1 );
}

/**  A variant of a slot in an epoch: a hash of the slot, the epoch and the walk's seed.
 *
 * @param s     The slot, 0..3. (in)
 * @param e     The epoch (a whole number). (in)
 * @param seed  The walk's seed. (in)
 *
 * @return
 *   The variant, 0..99.
 **/
int labVar( int s, float e, float seed )
{
    return int( min( floor( hash21( vec2( e * 2.9 + seed * 1.3 + 11.0, float( s ) * 7.7 + 3.1 ) ) * 100.0 ), 99.0 ) );
}

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
        ivec4 base = ivec4( 0 ), alt = ivec4( 0 ), vbase = ivec4( 0 ), valt = ivec4( 0 );
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
            vbase[s] = labVar( s, e, sd );
            valt[s] = labVar( s, e + 1.0, sd );
            float f = smoothstep( 1.0 - LabFade, 1.0, w - e );
            if ( f > 0.0 )
            {
                fs = s;
                ff = f;
            }
        }
        float wj = j == 0 ? 1.0 - m : m;
        ivec4 b2 = base, vb2 = vbase;
        b2[fs] = alt[fs];
        vb2[fs] = valt[fs];
        gLabK[2 * j] = base;
        gLabV[2 * j] = vbase;
        gLabW[2 * j] = wj * ( 1.0 - ff );
        gLabK[2 * j + 1] = b2;
        gLabV[2 * j + 1] = vb2;
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
    if ( labPinV > 0.5 )
    {
        int pv = int( labPinV + 0.5 );
        int ps = pv / 1000 - 1;
        int vp = clamp( pv - 1000 * ( pv / 1000 ) - 1, 0, 99 );
        for ( int i = 0; i < 4; ++i )
        {
            if ( ps < 0 )
                gLabV[i] = ivec4( vp );
            else
            {
                gLabV[i] = ivec4( 0 );
                gLabV[i][ps] = vp;
            }
        }
    }
}

/** Which photo plays the first part: 0 the one on show, 1 the second (swapped roles). */
int gRoles = 0;

/**  The photo that plays the first part: the one on show, or (swapped roles) the second one.
 *
 * @param uv   The place. (in)
 * @param lod  The mip level. (in)
 *
 * @return
 *   The colour.
 **/
vec3 twinA( vec2 uv, float lod )
{
    return gRoles == 0 ? imgLod( uv, lod ) : imgB( uv, lod );
}

/**  The photo that plays the second part.
 *
 * @param uv   The place. (in)
 * @param lod  The mip level. (in)
 *
 * @return
 *   The colour.
 **/
vec3 twinB( vec2 uv, float lod )
{
    return gRoles == 0 ? imgB( uv, lod ) : imgLod( uv, lod );
}

/**  The photos' brightness gradient (per unit of uv) at a soft level.
 *
 * @param uv      The place. (in)
 * @param second  0: the photo on show, 1: the second photo. (in)
 *
 * @return
 *   The gradient.
 **/
vec2 twinGrad( vec2 uv, int second )
{
    float e = 0.012;
    if ( second == 0 )
        return vec2( luma( twinA( uv + vec2( e, 0.0 ), 2.0 ) ) - luma( twinA( uv - vec2( e, 0.0 ), 2.0 ) ),
                     luma( twinA( uv + vec2( 0.0, e ), 2.0 ) ) - luma( twinA( uv - vec2( 0.0, e ), 2.0 ) ) )
               / ( 2.0 * e );
    return vec2( luma( twinB( uv + vec2( e, 0.0 ), 2.0 ) ) - luma( twinB( uv - vec2( e, 0.0 ), 2.0 ) ),
                 luma( twinB( uv + vec2( 0.0, e ), 2.0 ) ) - luma( twinB( uv - vec2( 0.0, e ), 2.0 ) ) )
           / ( 2.0 * e );
}

/**  The two photos connected in one of twelve ways.
 *
 * @param con  The connection, 0..11. (in)
 * @param vi   The connection's variant 0..99: the constants of the way. (in)
 * @param uv   The place in the photos. (in)
 * @param p    The place on screen. (in)
 * @param t    The clock. (in)
 * @param sc   The pattern scale. (in)
 * @param st   The strength, 0..1. (in)
 *
 * @return
 *   The colour.
 **/
vec3 twinConnect( int con, int vi, vec2 uv, vec2 p, float t, float sc, float st )
{
    vec3  a = twinA( uv, 0.3 );
    vec3  b = twinB( uv, 0.3 );
    float la = luma( a ), lb = luma( b );
    if ( con == 0 )
        return mix( a, b,
                    smoothstep( -lv( vi, 4.0, 0.05, 0.19 ), lv( vi, 4.0, 0.05, 0.19 ),
                                la
                                    - ( lv( vi, 1.0, 0.35, 0.65 )
                                        + lv( vi, 2.0, 0.15, 0.45 ) * sin( lv( vi, 3.0, 0.08, 0.22 ) * t ) ) ) );
    if ( con == 1 )
        return mix( a, twinB( uv + lv( vi, 1.0, 0.0004, 0.0012 ) * st * twinGrad( uv, 0 ) * 60.0, 0.3 ),
                    lv( vi, 2.0, 0.6, 1.0 ) );
    if ( con == 2 )
        return mix( twinA( uv + ( lb - 0.5 ) * lv( vi, 1.0, 0.1, 0.34 ) * st * vec2( 1.0, 0.6 ), 0.3 ),
                    twinB( uv + ( la - 0.5 ) * lv( vi, 1.0, 0.1, 0.34 ) * st * vec2( -0.6, 1.0 ), 0.3 ), 0.5 );
    if ( con == 3 )
    {
        vec2  q = rot2( lv( vi, 1.0, 0.0, 0.2 ) * t ) * p * ( 3.0 + 4.0 * sc );
        float c = 0.5 + 0.5 * sin( 3.14159 * q.x ) * sin( 3.14159 * q.y ) * lv( vi, 2.0, 1.8, 4.2 );
        return mix( a, b, clamp( c, 0.0, 1.0 ) );
    }
    if ( con == 4 )
    {
        vec2  g = twinGrad( uv, 0 ) - twinGrad( uv, 1 );
        float m = 0.5 + 0.5 * sin( lv( vi, 2.0, 0.1, 0.3 ) * t );
        float gs = lv( vi, 1.0, 0.0015, 0.0045 );
        return mix( twinA( uv - gs * st * g * m, 0.3 ), twinB( uv + gs * st * g * ( 1.0 - m ), 0.3 ), m );
    }
    if ( con == 5 )
    {
        float f = ( 6.0 + 14.0 * sc ) * ( p.x + lv( vi, 1.0, 0.1, 0.6 ) * lb + lv( vi, 2.0, 0.02, 0.08 ) * t );
        return mix( a, b,
                    smoothstep( -lv( vi, 3.0, 0.1, 0.4 ), lv( vi, 3.0, 0.1, 0.4 ),
                                sin( 6.2831853 * f ) * ( lv( vi, 4.0, 0.2, 0.6 ) + st ) ) );
    }
    if ( con == 6 )
    {
        vec3  low_a = twinA( uv, lv( vi, 1.0, 2.5, 6.5 ) );
        vec3  hi_b = twinB( uv, 0.3 ) - twinB( uv, lv( vi, 2.0, 1.5, 5.5 ) );
        float k = lv( vi, 3.0, 0.1, 1.1 ) + lv( vi, 4.0, 0.2, 1.6 ) * ( 0.5 + 0.5 * sin( 0.17 * t ) ) * st;
        return low_a + k * hi_b + lv( vi, 5.0, 0.15, 0.45 ) * ( a - low_a ) * ( 1.0 - st );
    }
    if ( con == 7 )
    {
        float m = 0.5 + 0.5 * sin( lv( vi, 1.0, 0.5, 3.5 ) * p.x + 0.3 * t + lv( vi, 2.0, 0.3, 2.7 ) * p.y );
        vec3  c = b - luma( b );
        return mix( a, vec3( la ) + c * lv( vi, 3.0, 0.5, 2.3 ), m * ( 0.5 + 0.5 * st ) );
    }
    if ( con == 8 )
        return mix( b, a,
                    smoothstep( lv( vi, 2.0, 0.0, 0.06 ), lv( vi, 1.0, 0.1, 0.6 ),
                                abs( la - lb ) * ( lv( vi, 4.0, 0.8, 2.2 ) + 2.0 * st ) ) );
    if ( con == 9 )
    {
        vec2  q = p * ( 3.0 + 4.0 * sc ) + lv( vi, 1.0, 0.05, 0.25 ) * t * vec2( 0.6, 0.8 );
        vec2  g = floor( q );
        float d1 = 9.0, d2 = 9.0;
        float par = 0.0;
        float jt = lv( vi, 2.0, 0.4, 1.0 );
        for ( int j = -1; j <= 1; ++j )
        {
            for ( int i = -1; i <= 1; ++i )
            {
                vec2  cg = g + vec2( float( i ), float( j ) );
                float d = length( q - ( cg + 0.5 + jt * ( hash22( cg ) - 0.5 ) ) );
                if ( d < d1 )
                {
                    d2 = d1;
                    d1 = d;
                    par = hash21( cg ) > 0.5 ? 1.0 : 0.0;
                }
                else if ( d < d2 )
                    d2 = d;
            }
        }
        return mix( a, b, mix( par, 0.5, 1.0 - smoothstep( 0.0, lv( vi, 3.0, 0.1, 0.3 ), d2 - d1 ) ) );
    }
    if ( con == 10 )
    {
        float n = 6.0 + 2.0 * floor( sc * 2.99 ) + 2.0 * float( lk( vi, 1.0, 3 ) );
        float an = atan( p.y, p.x ) + lv( vi, 2.0, 0.06, 0.18 ) * t;
        float s = 0.5 + 0.5 * sin( n * an );
        float w = lv( vi, 3.0, 0.1, 0.2 );
        return mix( a, b, smoothstep( 0.5 - w, 0.5 + w, s ) );
    }
    vec2  c = lv( vi, 1.0, 0.2, 0.6 ) * vec2( cos( 0.13 * t ), sin( 0.11 * t ) );
    vec2  d = p - c;
    float r = length( d );
    float w = exp( -r * r * ( 3.0 + 4.0 * sc ) );
    vec2  uv2 = uv + ( rot2( lv( vi, 2.0, 1.2, 3.8 ) * w * st ) * d - d ) * lv( vi, 3.0, 0.5, 1.1 );
    return mix( a, twinB( uv2, 0.3 ), smoothstep( 0.1, 0.6, w ) );
}

/**  One look of the lab.
 *
 * @param k   The classes: x the connection, y the shared space's bend, z the roles, w the weighting. (in)
 * @param kv  The variants of those classes (the constants of each). (in)
 * @param p   The place on screen. (in)
 * @param t   The clock. (in)
 * @param sc  The pattern scale. (in)
 * @param st  The strength. (in)
 * @param sw  The swell. (in)
 * @param hd  The harmonic advance. (in)
 *
 * @return
 *   The colour.
 **/
vec3 twinLook( ivec4 k, ivec4 kv, vec2 p, float t, float sc, float st, float sw, float hd )
{
    vec2 q = p;
    if ( k.y == 1 )
    {
        float sec = 6.2831853 / ( 6.0 + 2.0 * float( lk( kv.y, 1.0, 3 ) ) );
        float an = abs( mod( atan( q.y, q.x ) + lv( kv.y, 2.0, 0.02, 0.08 ) * t, sec ) - 0.5 * sec );
        q = length( q ) * vec2( cos( an ), sin( an ) );
    }
    else if ( k.y == 2 )
        q = abs( fract( q * lv( kv.y, 3.0, 0.6, 1.2 ) + 0.5 + lv( kv.y, 5.0, 0.0, 0.04 ) * t ) * 2.0 - 1.0 )
                * lv( kv.y, 4.0, 0.4, 0.7 )
            - lv( kv.y, 4.0, 0.4, 0.7 ) * 0.4909;
    else if ( k.y == 3 )
        q = rot2( lv( kv.y, 6.0, 0.7, 2.1 ) * exp( lv( kv.y, 7.0, -4.0, -1.0 ) * dot( q, q ) )
                  * sin( lv( kv.y, 8.0, 0.1, 0.3 ) * t ) )
            * q;
    else if ( k.y == 4 )
        q += lv( kv.y, 9.0, 0.02, 0.06 )
             * vec2( sin( lv( kv.y, 10.0, 4.0, 10.0 ) * q.y + 0.5 * t ),
                     sin( lv( kv.y, 11.0, 3.5, 8.5 ) * q.x - 0.4 * t ) );
    else if ( k.y == 5 )
        q *= 1.0 + lv( kv.y, 12.0, 0.12, 0.38 ) * sin( lv( kv.y, 13.0, 0.1, 0.3 ) * t );
    vec2  uv = q * 0.8 + 0.5;
    float swap = k.z == 1
                     ? 1.0
                     : ( k.z == 2 ? 0.5 + 0.5 * sin( lv( kv.z, 1.0, 0.06, 0.18 ) * t + lv( kv.z, 2.0, 0.2, 0.6 ) * hd )
                                  : 0.0 );
    vec3  col = vec3( 0.0 );
    for ( int r = 0; r < 2; ++r )
    {
        float w = r == 0 ? 1.0 - swap : swap;
        if ( w < 0.002 )
            continue;
        gRoles = r;
        col += w * twinConnect( k.x, kv.x, uv, q, t, sc, st );
    }
    gRoles = 0;
    float bg = lv( kv.w, 1.0, 0.03, 0.33 );
    float bias = k.w == 1 ? bg
                          : ( k.w == 2 ? -bg
                                       : ( k.w == 3 ? lv( kv.w, 2.0, 0.1, 0.3 ) * sin( lv( kv.w, 3.0, 0.15, 0.45 ) * t )
                                                          * ( lv( kv.w, 4.0, 0.2, 0.6 ) + sw )
                                                    : 0.0 ) );
    vec3  a = imgLod( uv, 0.3 ), b = imgB( uv, 0.3 );
    return clamp( col + bias * ( b - a ), 0.0, 1.6 );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 p = screenP();
    labWalk( seedP * 83.0, ivec4( 12, 6, 3, 4 ), 1.0 );
    float sw = clamp( audioSwell, 0.0, 1.0 );
    float t = sceneTime * 0.7 + 5.0 * audioPhase;
    float st = ( 0.5 + 0.5 * clamp( strengthP, 0.0, 1.0 ) ) * ( 0.7 + 0.5 * sw );
    vec3  col = vec3( 0.0 );
    float ws = 0.0;
    for ( int i = 0; i < 4; ++i )
    {
        if ( gLabW[i] > 0.002 )
        {
            col += gLabW[i] * twinLook( gLabK[i], gLabV[i], p, t, clamp( scaleP, 0.0, 1.0 ), st, sw, audioHarmAdvance );
            ws += gLabW[i];
        }
    }
    finish( max( col / max( ws, 1e-3 ), 0.0 ) );
}
