#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file ChainWarpQuasi.frag
 * @brief CHAINWARPQUASI: a chain of continuous transforms -- a flowing domain warp, then a seven-fold quasicrystal.
 * Every stage is continuous and the stages are joined by the photo's mirror repeat, so the whole map is seamless; the
 * photograph flows through it endlessly and never repeats.  Rendered as the photo, as a lit relief of it, or as glowing
 * edges or as glowing contour lines (styleP blends through them).  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flow through the chain (integrated, jump-free)
 *   audioPhase      -> the kaleidoscope turns (integrated)
 *   audioSpread     -> the strength of the distorting stages
 *   audioKick       -> the edges flare (light)
 *   audioMode       -> the tint: cool in minor, warm in major
 *   audioSwell      -> the relief light (slow)
 *
 * Knobs: styleP (photo / relief / glowing edges / contour lines), speedP (flow speed), detailP (texture sharpness),
 * hueP.
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;      ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioSpread;    ///< Spectral spread, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioMode;      ///< Mode of the music: 0 minor .. 1 major.
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).

uniform float styleP;  ///< Look knob, 0..1.
uniform float speedP;  ///< Speed knob, 0..1.
uniform float detailP; ///< Detail knob, 0..1.
uniform float hueP;    ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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


// ---- composable continuous transforms (photo space, centre 0.5) ----
/**  Every stage may be followed by mirrorUV: it is continuous and periodic with the photo's mirror period 2, so
 * stages whose output jumps by whole periods (log-polar at the atan cut) stay seamless, in any order and any
 * number.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param sides  Number of mirror wedges. (in)
 * @param rot    Turn of the folded angle (radians). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tKaleido( vec2 uv, vec2 c, float sides, float rot )
{
    vec2  d = uv - c;
    float sec = 6.2831853 / sides;
    float a = abs( mod( atan( d.y, d.x ), sec ) - 0.5 * sec ) + rot;
    return c + length( d ) * vec2( cos( a ), sin( a ) );
}
/**  Log-polar spiral about c (arms, scale; zoom runs it inward): an endless zoom.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the spiral. (in)
 * @param arms   Spiral arms (even: seamless when mirrored). (in)
 * @param scale  Scale of the log radius. (in)
 * @param zoom   Zoom phase; running it moves inward. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tSpiral( vec2 uv, vec2 c, float arms, float scale, float zoom )
{
    vec2  d = uv - c;
    float a = atan( d.y, d.x );
    // both outputs jump by even integers at the cut (arms even) -> seamless after mirrorUV
    return vec2( log( max( length( d ), 1e-5 ) ) * scale - zoom + a / 3.14159265, a / 3.14159265 * arms * 0.5 );
}
/**  Moebius map streaming the plane from pole pa to pole pb.
 *
 * @param uv     The coordinate. (in)
 * @param pa     The pole the picture streams out of. (in)
 * @param pb     The pole it streams into. (in)
 * @param scale  Scale of the result. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tMobius( vec2 uv, vec2 pa, vec2 pb, float scale )
{
    vec2 z1 = uv - pa, z2 = uv - pb;
    vec2 w = vec2( z1.x * z2.x + z1.y * z2.y, z1.y * z2.x - z1.x * z2.y ) / max( dot( z2, z2 ), 1e-6 );
    return 0.5 + w * scale;
}
/**  The coordinate squared in the complex plane about c (every angle doubled).
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param scale  Scale of the coordinate before squaring. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tSquare( vec2 uv, vec2 c, float scale )
{
    vec2 z = ( uv - c ) * scale;
    return c + vec2( z.x * z.x - z.y * z.y, 2.0 * z.x * z.y );
}
/**  Circle inversion about c with radius R.
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param R   Radius of the inversion circle. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tInvert( vec2 uv, vec2 c, float R )
{
    vec2 d = uv - c;
    return c + d * R * R / max( dot( d, d ), 1e-5 );
}
/**  Twirl about c: rotation that fades out with the radius.
 *
 * @param uv      The coordinate. (in)
 * @param c       Centre of the transform. (in)
 * @param amount  Rotation at the centre (radians). (in)
 * @param radius  Radius over which the twirl fades out. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tTwirl( vec2 uv, vec2 c, float amount, float radius )
{
    vec2  d = uv - c;
    float a = amount * exp( -dot( d, d ) / ( radius * radius ) );
    return c + rot2( a ) * d;
}
/**  Flowing domain warp by noise (strength, time).
 *
 * @param uv        The coordinate. (in)
 * @param strength  Strength of the warp. (in)
 * @param t         Flow phase. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tWarp( vec2 uv, float strength, float t )
{
    return uv + strength * ( vec2( fbm3( uv * 3.0 + vec2( t, 0.0 ) ), fbm3( uv * 3.0 + vec2( 5.2, -t ) ) ) - 0.5 );
}
/**  Iterated fractal fold (angle, scale, iterations).
 *
 * @param uv     The coordinate. (in)
 * @param ang    Turn of each fold (radians). (in)
 * @param scale  Scale of each fold. (in)
 * @param iters  Number of folds, up to 4. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tFold( vec2 uv, float ang, float scale, float iters )
{
    vec2 q = uv - 0.5;
    for ( int i = 0; i < 4; ++i )
    {
        if ( float( i ) >= iters )
            break;
        q = abs( q );
        q = rot2( ang ) * q - vec2( 0.12, 0.08 );
        q *= scale;
    }
    return q + 0.5;
}
/**  Square mirror lattice (wallpaper group p4m) with the given cells.
 *
 * @param uv     The coordinate. (in)
 * @param cells  Cells per unit. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tP4m( vec2 uv, float cells )
{
    vec2 f = abs( fract( uv * cells * 0.5 ) * 2.0 - 1.0 );
    return f.y > f.x ? f.yx : f;
}
/**  Rotation of the coordinate about c by a.
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param a   Angle in radians. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tRot( vec2 uv, vec2 c, float a )
{
    return c + rot2( a ) * ( uv - c );
}
/**  The classic tunnel: angle around, 1/r along (both jump by whole periods at the cut).
 *
 * @param uv      The coordinate. (in)
 * @param c       Centre of the transform. (in)
 * @param depth   Depth scale: the 1/r of the tunnel. (in)
 * @param travel  Flight phase along the tunnel. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tTunnel( vec2 uv, vec2 c, float depth, float travel )
{
    vec2 d = uv - c;
    return vec2( atan( d.y, d.x ) / 3.14159265, depth / max( length( d ), 1e-3 ) + travel );
}
/**  Plain polar unwrap: angle across, radius along.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param scale  Scale of the radius. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tPolar( vec2 uv, vec2 c, float scale )
{
    vec2 d = uv - c;
    return vec2( atan( d.y, d.x ) / 3.14159265, length( d ) * scale );
}
/**  Six-fold mirror tiling (p6m) of the plane, cell size 1/cells.
 *
 * @param uv     The coordinate. (in)
 * @param cells  Cells per unit (cell size 1/cells). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tHex( vec2 uv, float cells )
{
    vec2       q = ( uv - 0.5 ) * cells;
    const vec2 s = vec2( 1.0, 1.7320508 );
    vec2       a = mod( q, s ) - s * 0.5, b = mod( q - s * 0.5, s ) - s * 0.5;
    vec2       h = dot( a, a ) < dot( b, b ) ? a : b;
    float      an = atan( h.y, h.x );
    float      sec = 1.0471976;
    an = abs( mod( an, sec ) - 0.5 * sec );
    return 0.5 + length( h ) * vec2( cos( an ), sin( an ) ) / cells * 2.0;
}
/**  Complex exponential and sine: entire functions, smooth everywhere.
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param k   Scale of the coordinate before the exponential. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tExp( vec2 uv, vec2 c, float k )
{
    vec2 z = ( uv - c ) * k;
    return c + exp( z.x ) * vec2( cos( z.y ), sin( z.y ) ) * 0.3;
}
/**  Complex sine of the coordinate about c (a periodic lattice of the photo).
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param k   Scale of the coordinate before the sine. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tSin( vec2 uv, vec2 c, float k )
{
    vec2 z = ( uv - c ) * k;
    return c + vec2( sin( z.x ) * cosh( z.y ), cos( z.x ) * sinh( z.y ) ) * 0.3;
}
/**  Radial ripple and a sinusoidal shear wave.
 *
 * @param uv    The coordinate. (in)
 * @param c     Centre of the ripples. (in)
 * @param freq  Ripple frequency. (in)
 * @param amp   Amplitude. (in)
 * @param t     Phase. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tRipple( vec2 uv, vec2 c, float freq, float amp, float t )
{
    vec2  d = uv - c;
    float r = length( d );
    return uv + d / max( r, 1e-4 ) * amp * sin( r * freq - t );
}
/**  Sine wave displacement (frequency, amplitude, time).
 *
 * @param uv    The coordinate. (in)
 * @param freq  Wave frequency. (in)
 * @param amp   Amplitude. (in)
 * @param t     Phase. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tWave( vec2 uv, float freq, float amp, float t )
{
    return uv + amp * vec2( sin( uv.y * freq + t ), sin( uv.x * freq * 1.3 - t * 0.8 ) );
}
/**  Lens: bulge (k > 0) or pinch (k < 0) inside radius R.
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param R   Radius of the lens. (in)
 * @param k   Bulge (k > 0) or pinch (k < 0). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tLens( vec2 uv, vec2 c, float R, float k )
{
    vec2  d = uv - c;
    float r = length( d ) / R;
    float f = r < 1.0 ? pow( max( r, 1e-4 ), k ) / max( r, 1e-4 ) : 1.0;
    return c + d * mix( 1.0, f, smoothstep( 1.0, 0.6, r ) );
}
/**  Droste zoom without a spiral: the radius is folded in log scale (a triangle wave in log r), so the picture
 * repeats inward at every scale, mirrored at each repeat; the zoom runs on integrated time.
 *
 * @param uv    The coordinate. (in)
 * @param c     Centre of the transform. (in)
 * @param K     Scale ratio between two repeats. (in)
 * @param zoom  Zoom phase; running it moves inward. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tDroste( vec2 uv, vec2 c, float K, float zoom )
{
    vec2  d = uv - c;
    float r = max( length( d ), 1e-5 );
    float u = log( r ) / log( K ) - zoom;
    float tri = abs( fract( u * 0.5 ) * 2.0 - 1.0 ); // 0..1 triangle wave
    return c + d / r * exp( tri * log( K ) ) * 0.15;
}
/**  A single mirror line through c at angle a (the half-plane reflected).
 *
 * @param uv  The coordinate. (in)
 * @param c   A point of the mirror line. (in)
 * @param a   Angle of the mirror line (radians). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tMirrorLine( vec2 uv, vec2 c, float a )
{
    vec2  n = vec2( cos( a ), sin( a ) );
    float s = dot( uv - c, n );
    return uv - n * ( s - abs( s ) );
}

/**  The {p,q} reflection folding inside the unit disk (shared by the disk and the band model).
 *
 * @param z  The point inside the unit disc. (in)
 * @param p  Sides of each polygon of the {p,q} tiling. (in)
 * @param q  Polygons meeting at each vertex. (in)
 *
 * @return
 *   The point folded into the tiling's fundamental triangle.
 **/
vec2 poincareFold( vec2 z, float p, float q )
{
    float a = 3.14159265 / p;
    float cq = cos( 3.14159265 / q ), sa = sin( a );
    float R = 1.0 / sqrt( max( cq * cq / ( sa * sa ) - 1.0, 1e-4 ) );
    vec2  cc = vec2( R * cq / sa, 0.0 );
    for ( int i = 0; i < 14; ++i )
    {
        float an = atan( z.y, z.x );
        an = abs( mod( an, 2.0 * a ) - a ); // mirror into the wedge [0, pi/p]
        z = length( z ) * vec2( cos( an ), sin( an ) );
        vec2  d = z - cc;
        float dd = dot( d, d );
        if ( dd < R * R )
            z = cc + d * ( R * R / dd ); // mirror in the orthogonal circle
    }
    return z;
}
/**  Poincare-disc transform about c (zoom, move: hyperbolic drift).
 *
 * @param uv    The coordinate. (in)
 * @param c     Centre of the disc. (in)
 * @param p     Sides of each polygon of the {p,q} tiling. (in)
 * @param q     Polygons meeting at each vertex. (in)
 * @param zoom  Scale of the disc. (in)
 * @param move  Hyperbolic drift: a point inside the unit disc. (in)
 *
 * @return
 *   The transformed coordinate.
 *
 * Hyperbolic {p,q} tiling of the Poincare disk, built only from mirrors (the p-fold kaleidoscope and the inversion in a
 * circle orthogonal to the rim), so the map is continuous; the outside of the disk is folded in by the inversion in the
 * rim.  `move` is a point inside the disk: the disk automorphism z -> (z - a) / (1 - conj(a) z) carries the tiling
 * along it (a flight through the hyperbolic plane).  Needs 1/p + 1/q < 1/2.
 **/
vec2 tPoincare( vec2 uv, vec2 c, float p, float q, float zoom, vec2 move )
{
    vec2  z = ( uv - c ) * zoom;
    float r2 = dot( z, z );
    if ( r2 > 1.0 )
        z /= r2; // fold the outside in (continuous at the rim)
    vec2 nu = z - move, de = vec2( 1.0, 0.0 ) - vec2( move.x * z.x + move.y * z.y, move.x * z.y - move.y * z.x );
    z = vec2( nu.x * de.x + nu.y * de.y, nu.y * de.x - nu.x * de.y ) / max( dot( de, de ), 1e-6 );
    return c + poincareFold( z, p, q ) * 0.9;
}
/**  The hyperbolic plane in the BAND model (the hyperbolic Mercator: a line of the plane becomes the band's axis), z
 * = tanh(pi w / 4).
 *
 * @param uv      The coordinate. (in)
 * @param c       Centre of the transform. (in)
 * @param p       Sides of each polygon of the {p,q} tiling. (in)
 * @param q       Polygons meeting at each vertex. (in)
 * @param height  Height of the band on screen. (in)
 * @param travel  Translation along the band (an exact hyperbolic motion). (in)
 *
 * @return
 *   The transformed coordinate.
 *
 * The screen's height is mirror-folded into the band, so the tiling runs as an endless strip; a shift along the band is
 * an exact hyperbolic translation -- the strip flows without end.
 **/
vec2 tHyperBand( vec2 uv, vec2 c, float p, float q, float height, float travel )
{
    vec2 w = ( uv - c ) * vec2( 4.0, 2.0 / height );
    w.y = abs( fract( w.y * 0.5 + 0.5 ) * 2.0 - 1.0 ) * 2.0 - 1.0; // triangle wave: mirrored at the band's rims
    w.y *= 0.985;                                                  // the rims are the circle at infinity
    w.x += travel;
    w *= 0.7853982; // pi / 4
    // tanh of a complex number: (sinh 2x + i sin 2y) / (cosh 2x + cos 2y)
    float den = cosh( 2.0 * w.x ) + cos( 2.0 * w.y );
    vec2  z = vec2( sinh( 2.0 * w.x ), sin( 2.0 * w.y ) ) / max( den, 1e-4 );
    return c + poincareFold( z, p, q ) * 0.9;
}
/**  The spiral Droste of Escher's "Print Gallery" as reconstructed by Lenstra and de Smit: in log space the picture
 * is multiplied by beta = 1 - i log(K)/(2 pi), so one turn around the centre is two scale steps K; the log-radius
 * is folded by a mirrored triangle wave of period log K, the angle is kept -- the picture contains itself, turned
 * and shrunk, endlessly, and zooms along the spiral (zoom: integrated time).
 *
 * @param uv    The coordinate. (in)
 * @param c     Centre of the transform. (in)
 * @param K     Scale ratio between two repeats. (in)
 * @param zoom  Zoom phase (integrated time). (in)
 *
 * @return
 *   The transformed coordinate.
 *
 * Seamless: one turn shifts the log-radius by exactly one period of the mirrored wave (2 log K; with log K it was half
 * a period, and the mirror showed as a hard seam).
 **/
vec2 tDrosteSpiral( vec2 uv, vec2 c, float K, float zoom )
{
    vec2  d = uv - c;
    vec2  L = vec2( log( max( length( d ), 1e-5 ) ), atan( d.y, d.x ) );
    float lk = log( K ), b = -lk / 3.14159265;      // one turn = TWO mirrored steps (one period of the triangle wave)
    vec2  w = vec2( L.x - b * L.y, L.y + b * L.x ); // (1 + i b) * L
    float u = ( w.x - zoom * lk ) / lk;
    float tri = abs( fract( u * 0.5 ) * 2.0 - 1.0 ); // mirrored, period 2: 0..1..0
    return c + exp( tri * lk - lk ) * vec2( cos( w.y ), sin( w.y ) ) * 0.45;
}
/**  The complex number e^(i a).
 *
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The unit complex number (cos a, sin a).
 **/
vec2 cexpi( float a )
{
    return vec2( cos( a ), sin( a ) );
}
/**  Complex multiplication.
 *
 * @param a  One complex number. (in)
 * @param b  The other. (in)
 *
 * @return
 *   The product a b.
 **/
vec2 cmul( vec2 a, vec2 b )
{
    return vec2( a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x );
}
/**  Complex division.
 *
 * @param a  The numerator. (in)
 * @param b  The denominator. (in)
 *
 * @return
 *   The quotient a / b.
 **/
vec2 cdiv( vec2 a, vec2 b )
{
    return vec2( a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y ) / max( dot( b, b ), 1e-8 );
}
/**  Three-fold (hexagonal) wave term for the Farris wallpapers.
 *
 * @param X  The point in lattice units. (in)
 * @param n  First wave number. (in)
 * @param m  Second wave number. (in)
 *
 * @return
 *   The complex wave term.
 **/
vec2 hexWave3( vec2 X, float n, float m )
{
    const float Tau = 6.2831853;
    vec2        Y = vec2( X.x + X.y * 0.5773503, X.y * 1.1547005 );
    return ( cexpi( Tau * ( n * Y.x + m * Y.y ) ) + cexpi( Tau * ( m * Y.x - ( n + m ) * Y.y ) )
             + cexpi( Tau * ( -( n + m ) * Y.x + n * Y.y ) ) )
           / 3.0;
}
/**  Four-fold (square) wave term for the Farris wallpapers.
 *
 * @param X  The point in lattice units. (in)
 * @param n  First wave number. (in)
 * @param m  Second wave number. (in)
 *
 * @return
 *   The complex wave term.
 **/
vec2 sqWave4( vec2 X, float n, float m )
{
    const float Tau = 6.2831853;
    return ( cexpi( Tau * ( n * X.x + m * X.y ) ) + cexpi( Tau * ( -m * X.x + n * X.y ) )
             + cexpi( Tau * ( -n * X.x - m * X.y ) ) + cexpi( Tau * ( m * X.x - n * X.y ) ) )
           / 4.0;
}
/**  One Farris wave term of a wallpaper symmetry.
 *
 * @param X     The point in lattice units. (in)
 * @param kind  Wallpaper group (see cexpi's description). (in)
 * @param n     First wave number. (in)
 * @param m     Second wave number. (in)
 *
 * @return
 *   The complex wave term.
 **/
vec2 farrisWave( vec2 X, int kind, float n, float m )
{
    const float Tau = 6.2831853;
    if ( kind == 6 )
        return 0.5 * ( hexWave3( X, n, m ) + hexWave3( X, m, n ) ); // p3m1: p3 + mirrors
    if ( kind >= 10 )
    {                                                                                    // p1, p2, pm, cm
        vec2 Z = kind == 13 ? X * vec2( 0.8, 1.3 ) : vec2( X.x + 0.3 * X.y, X.y * 1.1 ); // oblique / centred lattice
        vec2 w = cexpi( Tau * ( n * Z.x + m * Z.y ) );
        if ( kind == 11 )
            w += cexpi( -Tau * ( n * Z.x + m * Z.y ) ); // p2: half-turns
        if ( kind == 12 || kind == 13 )
            w += cexpi( Tau * ( n * Z.x - m * Z.y ) ); // pm / cm: one mirror
        return w / ( kind == 10 ? 1.0 : 2.0 );
    }
    if ( kind == 7 )
        return 0.5 * ( hexWave3( X, n, m ) + hexWave3( X, -m, -n ) ); // p31m
    if ( kind == 8 )
        return 0.5 * ( sqWave4( X, n, m ) + ( mod( n + m, 2.0 ) < 0.5 ? 1.0 : -1.0 ) * sqWave4( X, m, n ) ); // p4g: p4
                                                                                                             // + glides
    if ( kind == 9 )
    { // cmm: centred rectangular, mirrors both ways
        vec2 Z = X * vec2( 0.8, 1.3 );
        return 0.25
               * ( cexpi( Tau * ( n * Z.x + m * Z.y ) ) + cexpi( -Tau * ( n * Z.x + m * Z.y ) )
                   + cexpi( Tau * ( n * Z.x - m * Z.y ) ) + cexpi( -Tau * ( n * Z.x - m * Z.y ) ) );
    }
    if ( kind == 1 || kind == 2 )
    { // hexagonal lattice coordinates
        vec2 Y = vec2( X.x + X.y * 0.5773503, X.y * 1.1547005 );
        vec2 w = cexpi( Tau * ( n * Y.x + m * Y.y ) ) + cexpi( Tau * ( m * Y.x - ( n + m ) * Y.y ) )
                 + cexpi( Tau * ( -( n + m ) * Y.x + n * Y.y ) );
        if ( kind == 2 )
            w += cexpi( -Tau * ( n * Y.x + m * Y.y ) ) + cexpi( -Tau * ( m * Y.x - ( n + m ) * Y.y ) )
                 + cexpi( -Tau * ( -( n + m ) * Y.x + n * Y.y ) );
        return w / ( kind == 2 ? 6.0 : 3.0 );
    }
    if ( kind == 4 || kind == 5 )
    {                                                // glide groups on a rectangular lattice
        float sg = mod( n, 2.0 ) < 0.5 ? 1.0 : -1.0; // (-1)^n: the half-step of the glide
        vec2  w = cexpi( Tau * ( n * X.x + m * X.y * 0.7 ) ) + sg * cexpi( Tau * ( n * X.x - m * X.y * 0.7 ) );
        if ( kind == 5 )
            w += cexpi( -Tau * ( n * X.x + m * X.y * 0.7 ) ) + sg * cexpi( Tau * ( -n * X.x + m * X.y * 0.7 ) );
        return w / ( kind == 5 ? 4.0 : 2.0 );
    }
    vec2 w = cexpi( Tau * ( n * X.x + m * X.y ) ) + cexpi( Tau * ( -m * X.x + n * X.y ) )
             + cexpi( Tau * ( -n * X.x - m * X.y ) ) + cexpi( Tau * ( m * X.x - n * X.y ) );
    if ( kind == 3 )
        w += cexpi( Tau * ( m * X.x + n * X.y ) ) + cexpi( Tau * ( -n * X.x + m * X.y ) )
             + cexpi( Tau * ( -m * X.x - n * X.y ) ) + cexpi( Tau * ( n * X.x - m * X.y ) );
    return w / ( kind == 3 ? 8.0 : 4.0 );
}
/**  Wallpaper-group transform about c (kind: the group, cells: cells per unit, t: phase).
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param kind   Wallpaper group: which wave terms are combined. (in)
 * @param cells  Cells per unit. (in)
 * @param t      Phase of the wave terms. (in)
 *
 * @return
 *   The transformed coordinate.
 *
 * Farris wallpaper functions ("Creating Symmetry", 2015): sums of plane waves averaged over a symmetry group are smooth
 * complex functions with exactly that symmetry; their value at a point picks the photo's pixel.  Three waves whose
 * amplitudes and phases drift with time: the wallpaper keeps changing while keeping its symmetry.  kind 0: p4 (square),
 * 1: p3 (hexagonal), 2: p6, 3: p4m (square with mirrors), 4: pg, 5: pgg (glide reflections -- impossible as a fold,
 * natural as a wave function), 6: p3m1, 7: p31m, 8: p4g, 9: cmm.
 **/
vec2 tFarris( vec2 uv, vec2 c, int kind, float cells, float t )
{
    vec2 X = ( uv - c ) * cells;
    vec2 f = cmul( cexpi( t * 0.7 ), farrisWave( X, kind, 1.0, 0.0 ) ) * ( 0.8 + 0.2 * sin( t * 0.31 ) )
             + cmul( cexpi( -t * 0.5 + 1.0 ), farrisWave( X, kind, 1.0, 1.0 ) ) * ( 0.6 + 0.4 * sin( t * 0.23 + 2.0 ) )
             + cmul( cexpi( t * 0.9 + 2.0 ), farrisWave( X, kind, 2.0, kind == 3 ? 1.0 : -1.0 ) )
                   * ( 0.4 + 0.3 * sin( t * 0.17 + 4.0 ) )
             + ( kind == 3 ? cmul( cexpi( -t * 0.6 ), farrisWave( X, kind, 3.0, 1.0 ) ) * 0.5
                           : vec2( 0.0 ) ); // p4m: chiral waves made symmetric by the mirrors
    return c + f * 0.35;
}
// ---- Peirce quincuncial: the plane as a square-tiled sphere ----
/**  Complex sine.
 *
 * @param a  The complex argument. (in)
 *
 * @return
 *   sin a.
 **/
vec2 csin( vec2 a )
{
    return vec2( sin( a.x ) * cosh( a.y ), cos( a.x ) * sinh( a.y ) );
}
/**  Complex cosine.
 *
 * @param a  The complex argument. (in)
 *
 * @return
 *   cos a.
 **/
vec2 ccos( vec2 a )
{
    return vec2( cos( a.x ) * cosh( a.y ), -sin( a.x ) * sinh( a.y ) );
}
/**  Numerator and denominator of the Jacobi cn function via theta series.
 *
 * @param v  The complex argument. (in)
 * @param N  Receives the numerator. (out)
 * @param D  Receives the denominator. (out)
 *
 * cn(u; m = 1/2) is doubly periodic on a square lattice (its periods 4K and 2K + 2iK, with K = K' = 1.8540747) and maps
 * each square onto the Riemann sphere: Peirce's quincuncial projection, inverted.  For m = 1/2 the theta nome is q =
 * exp(-pi), so three terms of each series are exact to float precision.  cn = (th4(0)/th2(0)) * th2(v) / th4(v), v = pi
 * u / (2K).
 **/
void cnTheta( vec2 v, out vec2 N, out vec2 D )
{
    // reduce by the periods (2 pi and pi + i pi in v): the series stay small
    float n = floor( v.y / 3.14159265 + 0.5 );
    v -= n * vec2( 3.14159265, 3.14159265 );
    v.x = mod( v.x + 3.14159265, 6.2831853 ) - 3.14159265;
    const float q14 = 0.4559381, q94 = 0.0008505, q254 = 1.6e-9; // q^(1/4), q^(9/4), q^(25/4)
    const float q1 = 0.0432139, q4 = 3.487e-6;                   // q, q^4
    vec2        th2 = 2.0 * ( q14 * ccos( v ) + q94 * ccos( 3.0 * v ) + q254 * ccos( 5.0 * v ) );
    vec2        th4 = vec2( 1.0, 0.0 ) + 2.0 * ( -q1 * ccos( 2.0 * v ) + q4 * ccos( 4.0 * v ) );
    N = th2 * ( 1.0 - 2.0 * q1 + 2.0 * q4 ) / ( 2.0 * ( q14 + q94 + q254 ) ); // th4(0) / th2(0)
    D = th4;
}
/**  The picture on a turning sphere, seen through Peirce's square tiling.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param scale  Scale of the tiling. (in)
 * @param a1     Turn of the sphere about x (radians). (in)
 * @param a2     Turn of the sphere about z (radians). (in)
 *
 * @return
 *   The transformed coordinate.
 *
 * The sphere point is lifted from N/D without dividing (poles are harmless), turned about two axes, and projected back
 * stereographically.
 **/
vec2 tQuincunx( vec2 uv, vec2 c, float scale, float a1, float a2 )
{
    vec2 z = ( uv - c ) * scale * 1.8540747;
    z = vec2( z.x - z.y, z.x + z.y ) * 0.7071068; // squares upright
    vec2 N, D;
    cnTheta( z * 0.8472131, N, D );                                  // pi / (2K)
    vec2  ND = vec2( N.x * D.x + N.y * D.y, N.y * D.x - N.x * D.y ); // N * conj(D)
    float nn = dot( N, N ), dd = dot( D, D );
    vec3  P = vec3( 2.0 * ND, nn - dd ) / max( nn + dd, 1e-12 );
    P.yz = rot2( a1 ) * P.yz;
    P.xy = rot2( a2 ) * P.xy;
    return c + P.xy / max( 1.0 - P.z, 1e-3 ) * 0.4;
}
/**  Apollonian inversion fold: mirrored repetition and inversion in the unit circle, alternating -- the circle
 * packings and limit-set lace of Kleinian groups (Indra's Pearls), built only from continuous steps (a mirrored
 * triangle wave instead of the usual fract, an unconditional inversion).
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param s      Strength of the inversion (the squared radius it inverts in). (in)
 * @param iters  Number of iterations. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tApollo( vec2 uv, vec2 c, float s, float iters )
{
    vec2 p = ( uv - c ) * 2.2;
    for ( int i = 0; i < 6; ++i )
    {
        if ( float( i ) >= iters )
            break;
        p = abs( fract( p * 0.5 + 0.5 ) * 2.0 - 1.0 ) * 2.0 - 1.0; // mirrored repeat, period 4 (continuous)
        p *= s / max( dot( p, p ), 1e-3 );
    }
    return c + p * 0.25;
}
/**  Farris rosettes: sums of z^n conj(z)^m with n - m = k (mod p) -- p-fold rosettes; with k = 1 the pattern has
 * COLOUR TURNING: turning the plane by 2 pi / p turns the picture looked up by the same step, so the photo's
 * colours travel round the rosette.
 *
 * @param r   Radius. (in)
 * @param th  Angle (radians). (in)
 * @param d   Angular frequency. (in)
 * @param e   Exponent of the radius. (in)
 *
 * @return
 *   The complex term.
 *
 * Coefficients turn with time.
 **/
vec2 rosetteTerm( float r, float th, float d, float e )
{
    return pow( r, e ) * vec2( cos( d * th ), sin( d * th ) );
}
/**  Farris rosette: a p-fold symmetric wave pattern about c.
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param p   Symmetry order of the rosette. (in)
 * @param k   Base frequency of the wave terms. (in)
 * @param t   Phase of the terms. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tRosette( vec2 uv, vec2 c, float p, float k, float t )
{
    vec2  d0 = ( uv - c ) * 1.7;
    float r = length( d0 ), th = atan( d0.y, d0.x );
    float d1 = k + p, d2 = k - p;
    vec2  f = cmul( cexpi( t * 0.6 ), rosetteTerm( r, th, d1, abs( d1 ) ) )
              + cmul( cexpi( -t * 0.4 + 1.0 ), rosetteTerm( r, th, d2, abs( d2 ) ) ) * 0.8
              + cmul( cexpi( t * 0.3 + 2.0 ), rosetteTerm( r, th, k, abs( k ) + 2.0 ) ) * 0.6;
    return c + f * 0.6; // audit: 0.3 read too small a patch (flat, grey)
}
// ---- Penrose rhombus tiling (de Bruijn's pentagrid) ----
/**  Direction of pentagrid family j.
 *
 * @param j  The family, 0..4. (in)
 *
 * @return
 *   The family's unit direction.
 **/
vec2 pentE( int j )
{
    float a = 1.2566371 * float( j );
    return vec2( cos( a ), sin( a ) );
}
/**  Pentagrid offset of family j.
 *
 * @param j  The family, 0..4. (in)
 * @param g  Offsets of the first four families. (in)
 *
 * @return
 *   The family's offset (the fifth makes the sum 0).
 **/
float pentG( int j, vec4 g )
{
    return j == 0 ? g.x : j == 1 ? g.y
                      : j == 2   ? g.z
                      : j == 3   ? g.w
                                 : -( g.x + g.y + g.z + g.w );
}
/**  Finds the Penrose rhomb a point lies in (de Bruijn pentagrid).
 *
 * @param x     The point in grid units. (in)
 * @param g     Offsets of four grid families (the fifth makes the sum 0). (in)
 * @param ab    Receives the point's position inside the rhomb, 0..1 along both edges. (out)
 * @param rr    Receives the first family of the rhomb. (out)
 * @param ss    Receives the second family. (out)
 * @param base  Receives the rhomb's corner. (out)
 * @param nrs   Receives the line indices of both families at the crossing. (out)
 *
 * @return
 *   True if the rhomb was found.
 *
 * Five families of parallel lines (directions e_j = 72 deg apart, offsets gam_j with sum 0).  Every crossing of a line
 * of family r (value n_r) with one of family s (n_s) is a rhombus with edges e_r, e_s; its corner is sum_j K_j e_j with
 * K_j = ceil(p . e_j + gam_j) at the crossing p, and K_r, K_s = n_r, n_s.  The tiling is about 5/2 times the pentagrid,
 * so the crossings near x * 0.4 are searched (3 x 3 per pair of families).  Returns the rhombus coordinates a, b in [0,
 * 1] (x = base + a e_r + b e_s).
 **/
bool penroseFind( vec2 x, vec4 g, out vec2 ab, out int rr, out int ss, out vec2 base, out vec2 nrs )
{
    vec2 pg = x * 0.4;
    ab = vec2( 0.5 );
    rr = 0;
    ss = 1;
    base = vec2( 0.0 );
    nrs = vec2( 0.0 );
    for ( int r = 0; r < 4; ++r )
        for ( int s = 1; s < 5; ++s )
        {
            if ( s <= r )
                continue;
            vec2  er = pentE( r ), es = pentE( s );
            float gr = pentG( r, g ), gs = pentG( s, g );
            float det = er.x * es.y - er.y * es.x;
            float nr0 = floor( dot( pg, er ) + gr ), ns0 = floor( dot( pg, es ) + gs );
            for ( int dr = -1; dr <= 1; ++dr )
                for ( int ds = -1; ds <= 1; ++ds )
                {
                    float nr = nr0 + float( dr ), ns = ns0 + float( ds );
                    vec2  p = vec2( ( nr - gr ) * es.y - ( ns - gs ) * er.y, ( ns - gs ) * er.x - ( nr - gr ) * es.x )
                              / det;
                    vec2  b0 = nr * er + ns * es;
                    for ( int j = 0; j < 5; ++j )
                        if ( j != r && j != s )
                            b0 += ceil( dot( p, pentE( j ) ) + pentG( j, g ) ) * pentE( j );
                    vec2  d = x - b0;
                    float a = ( d.x * es.y - d.y * es.x ) / det, b = ( er.x * d.y - er.y * d.x ) / det;
                    if ( a >= 0.0 && a <= 1.0 && b >= 0.0 && b <= 1.0 )
                    {
                        ab = vec2( a, b );
                        rr = r;
                        ss = s;
                        base = b0;
                        nrs = vec2( nr, ns );
                        return true;
                    }
                }
        }
    return false;
}
/**  Penrose mirror: the rhombus coordinates folded symmetrically -- distances to the nearer edge of each pair,
 * sorted.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param cells  Cells per unit. (in)
 * @param drift  Offset of the pentagrid (makes it drift). (in)
 * @param g      Offsets of four of the five grid families (the fifth makes the sum 0). (in)
 *
 * @return
 *   The transformed coordinate.
 *
 * On a shared edge both tiles give the same pair (0, position along the edge, folded), so the map is continuous: a
 * quasi-periodic kaleidoscope that never repeats.
 **/
vec2 tPenrose( vec2 uv, vec2 c, float cells, vec2 drift, vec4 g )
{
    vec2 ab, base, nrs;
    int  r, s;
    penroseFind( ( uv - c ) * cells + drift, g, ab, r, s, base, nrs );
    vec2 f = min( ab, 1.0 - ab );
    return c + vec2( min( f.x, f.y ), max( f.x, f.y ) ) * 0.9;
}
// ---- round 5 ----
/**  Jacobi theta functions for m = 1/2 (q = e^-pi), all four, complex argument.
 *
 * @param v   The complex argument. (in)
 * @param t1  Receives theta 1. (out)
 * @param t2  Receives theta 2. (out)
 * @param t3  Receives theta 3. (out)
 * @param t4  Receives theta 4. (out)
 **/
void thetaAll( vec2 v, out vec2 t1, out vec2 t2, out vec2 t3, out vec2 t4 )
{
    float n = floor( v.y / 3.14159265 + 0.5 );
    v -= n * vec2( 3.14159265, 3.14159265 );
    v.x = mod( v.x + 3.14159265, 6.2831853 ) - 3.14159265;
    const float q14 = 0.4559381, q94 = 0.0008505, q1 = 0.0432139, q4 = 3.487e-6;
    t1 = 2.0 * ( q14 * csin( v ) - q94 * csin( 3.0 * v ) );
    t2 = 2.0 * ( q14 * ccos( v ) + q94 * ccos( 3.0 * v ) );
    t3 = vec2( 1.0, 0.0 ) + 2.0 * ( q1 * ccos( 2.0 * v ) + q4 * ccos( 4.0 * v ) );
    t4 = vec2( 1.0, 0.0 ) + 2.0 * ( -q1 * ccos( 2.0 * v ) + q4 * ccos( 4.0 * v ) );
}
/**  sn and dn wallpapers (other poles and zeros than cn), values turned with time.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param scale  Scale of the lattice. (in)
 * @param which  0 for sn, 1 for dn. (in)
 * @param t      Turn phase of the values. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tJacobiWall( vec2 uv, vec2 c, float scale, int which, float t )
{
    vec2 z = ( uv - c ) * scale * 1.8540747;
    vec2 t1, t2, t3, t4;
    thetaAll( z * 0.8472131, t1, t2, t3, t4 );
    vec2 f = which == 0 ? cdiv( t1, t4 ) * 1.1803 : cdiv( t3, t4 ) * 0.8409; // sn: th3(0)/th2(0); dn: th4(0)/th3(0)
    return c + cmul( f, cexpi( t * 0.3 ) ) * 0.3;
}
/**  Hyperbolic Moebius flow: two fixed points on the unit circle, the picture streaming from one to the other along
 * circular arcs (flow parameter = time).
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param a   Angle of the two fixed points on the unit circle (radians). (in)
 * @param t   Flow parameter (integrated time). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tHypFlow( vec2 uv, vec2 c, float a, float t )
{
    vec2  z = ( uv - c ) * 2.0;
    vec2  p = cexpi( a ), q = -p;
    vec2  w = cdiv( z - p, z - q ); // fixed points to 0 and infinity
    float lr = 0.5 * log( max( dot( w, w ), 1e-10 ) ) - t, an = atan( w.y, w.x );
    return vec2( lr * 0.5, an / 3.14159265 * 2.0 ); // log-polar of the flow: seamless (angle jumps by 4)
}
/**  Wandering poles: sum of k / (z - p_k) -- a rational map, flowers around every pole.
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param n   Number of poles (up to 5). (in)
 * @param t   Phase of the poles' wandering. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tPoles( vec2 uv, vec2 c, float n, float t )
{
    vec2 z = ( uv - c ) * 2.0, f = vec2( 0.0 );
    for ( int k = 0; k < 5; ++k )
    {
        if ( float( k ) >= n )
            break;
        float fk = float( k );
        vec2  pk = 0.7 * vec2( sin( t * ( 0.21 + 0.05 * fk ) + fk * 1.9 ), cos( t * ( 0.17 + 0.04 * fk ) + fk * 2.7 ) );
        f += cdiv( cexpi( fk * 1.3 ), z - pk ) * ( mod( fk, 2.0 ) < 0.5 ? 1.0 : -1.0 );
    }
    return c + f * 0.35;
}
/**  Bipolar Droste: the spiral Droste between two holes (log of the cross-ratio).
 *
 * @param uv    The coordinate. (in)
 * @param c     Centre of the transform. (in)
 * @param f     Half the distance of the holes. (in)
 * @param K     Scale ratio between two repeats. (in)
 * @param zoom  Zoom phase. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tBiDroste( vec2 uv, vec2 c, float f, float K, float zoom )
{
    vec2  w = cdiv( uv - c + vec2( f, 0.0 ), uv - c - vec2( f, 0.0 ) );
    vec2  L = vec2( 0.5 * log( max( dot( w, w ), 1e-10 ) ), atan( w.y, w.x ) );
    float lk = log( K ), b = -lk / 3.14159265;
    vec2  W = vec2( L.x - b * L.y, L.y + b * L.x );
    float tri = abs( fract( ( W.x / lk - zoom ) * 0.5 ) * 2.0 - 1.0 );
    return c + exp( tri * lk - lk ) * cexpi( W.y ) * 0.45;
}
/**  Hyperbolic spiral r = a / theta: a tunnel whose rings are wound.
 *
 * @param uv      The coordinate. (in)
 * @param c       Centre of the transform. (in)
 * @param a       Spiral constant. (in)
 * @param wind    Winding of the rings. (in)
 * @param travel  Flight phase along the tunnel. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tHypSpiral( vec2 uv, vec2 c, float a, float wind, float travel )
{
    vec2  d = uv - c;
    float an = atan( d.y, d.x ) / 3.14159265;
    return vec2( a / max( length( d ), 1e-3 ) + an * wind - travel, an * 2.0 );
}
/**  Riemann zeta, partial sum of n^-s: a few rotating spirals interfering.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param terms  Terms of the partial sum (up to 7). (in)
 * @param t      Shift along the imaginary axis. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tZeta( vec2 uv, vec2 c, float terms, float t )
{
    vec2 sv = ( uv - c ) * vec2( 2.0, 14.0 ) + vec2( 0.5, t );
    vec2 f = vec2( 0.0 );
    for ( int n = 1; n <= 7; ++n )
    {
        if ( float( n ) > terms )
            break;
        float ln = log( float( n ) );
        f += exp( -sv.x * ln ) * cexpi( -sv.y * ln );
    }
    return c + f * 0.2;
}
/**  Mandelbrot parameter map: z = 0, z <- z^2 + (the point), a few times.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param steps  Number of iterations. (in)
 * @param t      Phase of the small wander of the parameter. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tMandel( vec2 uv, vec2 c, float steps, float t )
{
    vec2 k = ( uv - c ) * 2.2 + vec2( -0.5, 0.0 ) + 0.1 * cexpi( t * 0.2 );
    vec2 z = vec2( 0.0 );
    for ( int i = 0; i < 4; ++i )
    {
        if ( float( i ) >= steps )
            break;
        z = cmul( z, z ) + k;
    }
    return c + z * 0.55;
}
/**  Burning ship: |Re| and |Im| before squaring (the mirror makes the ship).
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param steps  Number of iterations. (in)
 * @param t      Phase of the wander of the parameter k. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tShip( vec2 uv, vec2 c, float steps, float t )
{
    vec2 z = ( uv - c ) * 2.2, k = vec2( -0.4, -0.55 ) + 0.12 * cexpi( t * 0.2 );
    for ( int i = 0; i < 4; ++i )
    {
        if ( float( i ) >= steps )
            break;
        z = abs( z );
        z = cmul( z, z ) + k;
    }
    return c + z * 0.55;
}
/**  Phoenix Julia: z_{n+1} = z^2 + k + p z_{n-1} (a memory term).
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param steps  Number of iterations. (in)
 * @param t      Phase of the wander of the parameter k. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tPhoenix( vec2 uv, vec2 c, float steps, float t )
{
    vec2 z = ( uv - c ) * 2.2, zp = vec2( 0.0 );
    vec2 k = vec2( 0.5667, 0.0 ) + 0.05 * cexpi( t * 0.2 ), pp = vec2( -0.5, 0.0 );
    for ( int i = 0; i < 4; ++i )
    {
        if ( float( i ) >= steps )
            break;
        vec2 zn = cmul( z, z ) + k + cmul( pp, zp );
        zp = z;
        z = zn;
    }
    return c + z * 0.3;
}
/**  Parabolic coordinates (sigma, tau): nested parabolas, mirror-folded.
 *
 * @param uv      The coordinate. (in)
 * @param c       Centre of the transform. (in)
 * @param k       Scale of the coordinate. (in)
 * @param travel  Flow phase along the pattern. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tParabCoords( vec2 uv, vec2 c, float k, float travel )
{
    vec2  d = ( uv - c ) * k;
    float r = length( d );
    float sg = sqrt( max( r + d.x, 0.0 ) ), ta = sqrt( max( r - d.x, 0.0 ) );
    return vec2( sg - travel, ta );
}
/**  Cardioid coordinates: sqrt(1 - 4z) with the angle mirrored (the main bulb of the Mandelbrot set unrolled).
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param k   Scale of the coordinate. (in)
 * @param t   Turn phase of the result. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tCardioid( vec2 uv, vec2 c, float k, float t )
{
    vec2  z = ( uv - c ) * k;
    vec2  w = vec2( 1.0, 0.0 ) - 4.0 * z;
    float r = sqrt( length( w ) ), a = abs( atan( w.y, w.x ) ) * 0.5;
    return c + r * cexpi( a + t * 0.2 ) * 0.6;
}
/**  Sunflower: two log-spiral families crossed (the parastichies of a seed head).
 *
 * @param uv    The coordinate. (in)
 * @param c     Centre of the transform. (in)
 * @param m1    Spirals of the first family. (in)
 * @param m2    Spirals of the second family. (in)
 * @param zoom  Zoom phase. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tSunflower( vec2 uv, vec2 c, float m1, float m2, float zoom )
{
    vec2  d = uv - c;
    float lr = log( max( length( d ), 1e-5 ) ) * 1.5 - zoom, an = atan( d.y, d.x ) / 3.14159265;
    return vec2( lr + an * m1, lr - an * m2 );
}
/**  Breathing sphere: the Riemann sphere bulged by a spherical harmonic, turning.
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param m   Order of the spherical harmonic that bulges the sphere. (in)
 * @param t   Phase of the turn and the breathing. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tBreathSphere( vec2 uv, vec2 c, float m, float t )
{
    vec2  z = ( uv - c ) * 2.2;
    float s = dot( z, z );
    vec3  P = vec3( 2.0 * z, s - 1.0 ) / ( s + 1.0 );
    P.xz = rot2( t * 0.3 ) * P.xz;
    float ph = atan( P.y, P.x ), th = acos( clamp( P.z, -1.0, 1.0 ) );
    float Y = pow( sin( th ), m ) * cos( m * ph + t );
    P *= 1.0 + 0.35 * Y;
    return c + P.xy / max( 1.3 - P.z, 0.05 ) * 0.5;
}
/**  Cayley transform: the upper half-plane to the disk (and back out again).
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param k   Scale of the coordinate. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tCayley( vec2 uv, vec2 c, float k )
{
    vec2 w = ( uv - c ) * k;
    return c + cdiv( w - vec2( 0.0, 1.0 ), w + vec2( 0.0, 1.0 ) ) * 0.45;
}
/**  Fisheye / barrel: radius raised to a drifting power.
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param e   Exponent of the radius: > 1 barrel, < 1 pincushion. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tFisheye( vec2 uv, vec2 c, float e )
{
    vec2  d = uv - c;
    float r = length( d );
    return c + d * pow( max( r, 1e-4 ) * 1.6, e - 1.0 );
}
/**  Curved kaleidoscope: a kaleidoscope in hyperbolic-disk coordinates -- its mirrors are circular arcs (the fold
 * conjugated by a moving disk automorphism).
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param sides  Number of mirror wedges. (in)
 * @param rot    Turn of the folded angle (radians). (in)
 * @param a      The point the mirrors' arcs run through (inside the unit disc). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tCurvedKaleido( vec2 uv, vec2 c, float sides, float rot, vec2 a )
{
    vec2  z = ( uv - c ) * 1.6;
    vec2  w = cdiv( z - a, vec2( 1.0, 0.0 ) - cmul( vec2( a.x, -a.y ), z ) );
    float sec = 6.2831853 / sides;
    float an = abs( mod( atan( w.y, w.x ), sec ) - 0.5 * sec ) + rot;
    w = length( w ) * cexpi( an );
    z = cdiv( w + a, vec2( 1.0, 0.0 ) + cmul( vec2( a.x, -a.y ), w ) );
    return c + z / 1.6;
}
/**  Levy C-curve fold: turn 45 deg, scale sqrt 2, mirror -- repeated.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param iters  Number of iterations. (in)
 * @param turn   Turn of the coordinate before folding (radians). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tLevy( vec2 uv, vec2 c, float iters, float turn )
{
    vec2  p = rot2( turn ) * ( uv - c ) * 2.0;
    float sc = 1.0;
    for ( int i = 0; i < 6; ++i )
    {
        if ( float( i ) >= iters )
            break;
        p = rot2( 0.7853982 ) * p * 1.4142136;
        sc *= 1.4142136;
        p.x = abs( p.x ) - 0.7;
    }
    return c + p / sc * 1.2;
}
/**  Pythagoras-tree fold: mirror, turn 45 deg about the branch point, scale sqrt 2.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param iters  Number of iterations. (in)
 * @param bend   Bend of the branches (radians). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tPythagoras( vec2 uv, vec2 c, float iters, float bend )
{
    vec2  p = ( uv - c ) * 2.5 + vec2( 0.0, 0.8 );
    float sc = 1.0;
    for ( int i = 0; i < 6; ++i )
    {
        if ( float( i ) >= iters )
            break;
        p.x = abs( p.x );
        p -= vec2( 0.0, 1.0 );
        p = rot2( 0.7853982 + bend ) * p * 1.4142136;
        sc *= 1.4142136;
    }
    return c + p / sc * 0.9;
}
/**  Vicsek (cross) fold: abs, sort, scale 3 about the arm.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param iters  Number of iterations. (in)
 * @param turn   Turn of the coordinate before folding (radians). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tVicsek( vec2 uv, vec2 c, float iters, float turn )
{
    vec2  p = rot2( turn ) * ( uv - c ) * 2.0;
    float sc = 1.0;
    for ( int i = 0; i < 4; ++i )
    {
        if ( float( i ) >= iters )
            break;
        p = abs( p );
        if ( p.x < p.y )
            p = p.yx;
        p = p * 3.0 - vec2( 2.0, 0.0 );
        sc *= 3.0;
    }
    return c + p / sc * 1.5;
}
// ---- multigrid quasicrystals (de Bruijn): N line families at pi/N ----
/**  Direction of multigrid family j.
 *
 * @param j  The family. (in)
 * @param N  Number of families. (in)
 *
 * @return
 *   The family's unit direction.
 **/
vec2 gridE( int j, float N )
{
    float a = 3.14159265 * float( j ) / N;
    return vec2( cos( a ), sin( a ) );
}
/**  Offset of multigrid family j.
 *
 * @param j  The family. (in)
 *
 * @return
 *   The family's offset.
 **/
float gridG( int j )
{
    return fract( 0.1234 + 0.6180339 * float( j ) ) - 0.5;
}
/**  Finds the rhomb a point lies in (de Bruijn multigrid of N families).
 *
 * @param x     The point in grid units. (in)
 * @param N     Number of grid families (5..7). (in)
 * @param ab    Receives the point's position inside the rhomb, 0..1 along both edges. (out)
 * @param rr    Receives the first family of the rhomb. (out)
 * @param ss    Receives the second family. (out)
 * @param base  Receives the rhomb's corner. (out)
 * @param nrs   Receives the line indices of both families at the crossing. (out)
 *
 * @return
 *   True if the rhomb was found.
 *
 * N = 4: Ammann-Beenker (8-fold), N = 5: Penrose (10-fold), N = 6: 12-fold, N = 7: 14-fold.  As penroseFind, for any N
 * (up to 7).
 **/
bool multiGridFind( vec2 x, float N, out vec2 ab, out int rr, out int ss, out vec2 base, out vec2 nrs )
{
    vec2 pg = x * 2.0 / N;
    ab = vec2( 0.5 );
    rr = 0;
    ss = 1;
    base = vec2( 0.0 );
    nrs = vec2( 0.0 );
    for ( int r = 0; r < 6; ++r )
    {
        if ( float( r ) >= N - 1.0 )
            break;
        for ( int s = 1; s < 7; ++s )
        {
            if ( s <= r || float( s ) >= N )
                continue;
            vec2  er = gridE( r, N ), es = gridE( s, N );
            float gr = gridG( r ), gs = gridG( s );
            float det = er.x * es.y - er.y * es.x;
            float nr0 = floor( dot( pg, er ) + gr ), ns0 = floor( dot( pg, es ) + gs );
            for ( int dr = -1; dr <= 1; ++dr )
                for ( int ds = -1; ds <= 1; ++ds )
                {
                    float nr = nr0 + float( dr ), ns = ns0 + float( ds );
                    vec2  p = vec2( ( nr - gr ) * es.y - ( ns - gs ) * er.y, ( ns - gs ) * er.x - ( nr - gr ) * es.x )
                              / det;
                    vec2  b0 = nr * er + ns * es;
                    for ( int j = 0; j < 7; ++j )
                    {
                        if ( float( j ) >= N )
                            break;
                        if ( j != r && j != s )
                            b0 += ceil( dot( p, gridE( j, N ) ) + gridG( j ) ) * gridE( j, N );
                    }
                    vec2  d = x - b0;
                    float a = ( d.x * es.y - d.y * es.x ) / det, b = ( er.x * d.y - er.y * d.x ) / det;
                    if ( a >= 0.0 && a <= 1.0 && b >= 0.0 && b <= 1.0 )
                    {
                        ab = vec2( a, b );
                        rr = r;
                        ss = s;
                        base = b0;
                        nrs = vec2( nr, ns );
                        return true;
                    }
                }
        }
    }
    return false;
}
/**  Quasicrystal mirror of N-fold symmetry about c.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param N      Symmetry order of the quasicrystal (number of grid families). (in)
 * @param cells  Cells per unit. (in)
 * @param drift  Offset of the grid (makes it drift). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tQuasiMirror( vec2 uv, vec2 c, float N, float cells, vec2 drift )
{
    vec2 ab, base, nrs;
    int  r, s;
    multiGridFind( ( uv - c ) * cells + drift, N, ab, r, s, base, nrs );
    vec2 f = min( ab, 1.0 - ab );
    return c + vec2( min( f.x, f.y ), max( f.x, f.y ) ) * 0.9;
}
// ---- flows (stage D): smooth displacements ----
/**  Karman street: vortices of alternating spin shed from an obstacle, drifting downstream and fading in and out (no
 * vortex ever appears or vanishes at once).
 *
 * @param uv        The coordinate. (in)
 * @param strength  Strength of the displacement. (in)
 * @param t         Phase of the shedding (the vortices' life). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tKarman( vec2 uv, float strength, float t )
{
    for ( int k = 0; k < 6; ++k )
    {
        float fk = float( k );
        float ph = fract( t * 0.08 + fk / 6.0 ); // life 0..1, positions wrap while invisible
        vec2  pk = vec2( -0.1 + 1.2 * ph, 0.5 + ( mod( fk, 2.0 ) < 0.5 ? 0.12 : -0.12 ) );
        float life = sin( 3.14159265 * ph );
        vec2  d = uv - pk;
        float g = strength * life * ( mod( fk, 2.0 ) < 0.5 ? 1.0 : -1.0 ) * exp( -dot( d, d ) / 0.02 );
        uv = pk + rot2( g ) * d;
    }
    return uv;
}
/**  Flow round a cylinder with circulation (potential flow), as a displacement.
 *
 * @param uv        The coordinate. (in)
 * @param c         Centre of the cylinder. (in)
 * @param strength  Strength of the displacement. (in)
 * @param circ      Circulation round the cylinder. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tCylinderFlow( vec2 uv, vec2 c, float strength, float circ )
{
    vec2  z = ( uv - c ) * 4.0;
    float r2 = max( dot( z, z ), 0.36 );
    vec2  zi = cdiv( vec2( 1.0, 0.0 ), cmul( z, z ) );
    vec2  vel = vec2( 1.0, 0.0 ) - zi + circ * vec2( -z.y, z.x ) / r2; // conj(dw/dz)
    return uv + strength * vec2( vel.x, -vel.y ) * 0.03 * smoothstep( 0.36, 1.0, dot( z, z ) );
}
/**  Dipole field lines as a displacement.
 *
 * @param uv        The coordinate. (in)
 * @param c         Centre of the dipole. (in)
 * @param strength  Strength of the displacement. (in)
 * @param t         Phase of the dipole's turn. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tDipole( vec2 uv, vec2 c, float strength, float t )
{
    vec2  d = ( uv - c ) * 3.0;
    vec2  m = cexpi( t * 0.3 );
    float r2 = max( dot( d, d ), 0.05 );
    vec2  B = ( 3.0 * dot( m, d ) * d / r2 - m ) / ( r2 * sqrt( r2 ) );
    return uv + strength * B / ( 1.0 + length( B ) ) * 0.04;
}
/**  Two vortices orbiting each other.
 *
 * @param uv        The coordinate. (in)
 * @param c         Centre the two vortices orbit. (in)
 * @param strength  Spin of each vortex (radians at its centre). (in)
 * @param t         Phase of the orbit. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tVortexPair( vec2 uv, vec2 c, float strength, float t )
{
    for ( int k = 0; k < 2; ++k )
    {
        vec2 pk = c + 0.18 * cexpi( t * 0.5 + 3.14159265 * float( k ) );
        vec2 d = uv - pk;
        uv = pk + rot2( strength * exp( -dot( d, d ) / 0.04 ) ) * d;
    }
    return uv;
}
/**  Interference of two wave sources: displaced along the wave field's gradient.
 *
 * @param uv        The coordinate. (in)
 * @param k         Wave number of both sources. (in)
 * @param strength  Strength of the displacement. (in)
 * @param t         Phase of the waves and the sources' drift. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tInterference( vec2 uv, float k, float strength, float t )
{
    vec2  s1 = vec2( 0.3, 0.5 ) + 0.1 * cexpi( t * 0.2 ), s2 = vec2( 0.7, 0.5 ) - 0.1 * cexpi( t * 0.23 );
    vec2  d1 = uv - s1, d2 = uv - s2;
    float r1 = max( length( d1 ), 1e-3 ), r2 = max( length( d2 ), 1e-3 );
    vec2  g = cos( r1 * k - t * 3.0 ) * d1 / r1 + cos( r2 * k - t * 3.0 ) * d2 / r2;
    return uv + strength * g * 0.01;
}
/**  Kelvin-Helmholtz: a shear layer rolling up into a row of billows.
 *
 * @param uv        The coordinate. (in)
 * @param strength  Strength of the roll-up. (in)
 * @param t         Drift phase of the billows. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tKelvinHelmholtz( vec2 uv, float strength, float t )
{
    float y = uv.y - 0.5;
    float roll = exp( -y * y / 0.02 );
    vec2  cellc = vec2( floor( uv.x * 4.0 + t * 0.2 ) + 0.5 - t * 0.2, 2.0 ) / 4.0; // billow centres drift
    float a = strength * roll * sin( 6.2831853 * ( uv.x * 4.0 + t * 0.2 ) );
    return uv + vec2( 0.04 * strength * tanh( y * 10.0 ), 0.0 ) + 0.03 * vec2( -sin( a ), cos( a ) - 1.0 ) * roll;
}
// ---- round 6 ----
/**  Little planet: the photo as an equirectangular panorama on a turning sphere, seen stereographically (longitude
 * jumps by one mirror period: seamless).
 *
 * @param uv    The coordinate. (in)
 * @param c     Centre of the transform. (in)
 * @param zoom  Scale of the coordinate before it is lifted onto the sphere. (in)
 * @param a1    Turn of the sphere about x (radians). (in)
 * @param a2    Turn of the sphere about z (radians). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tLittlePlanet( vec2 uv, vec2 c, float zoom, float a1, float a2 )
{
    vec2  z = ( uv - c ) * zoom;
    float s = dot( z, z );
    vec3  P = vec3( 2.0 * z, s - 1.0 ) / ( s + 1.0 );
    P.yz = rot2( a1 ) * P.yz;
    P.xy = rot2( a2 ) * P.xy;
    return vec2( atan( P.y, P.x ) / 3.14159265, asin( clamp( P.z, -1.0, 1.0 ) ) / 1.5707963 * 0.5 + 0.5 );
}
/**  Rotating Mercator: the screen is the Mercator map of a turning sphere that carries the photo stereographically --
 * loxodromes become straight lines.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param scale  Scale of the coordinate. (in)
 * @param a1     Turn of the sphere about x (radians). (in)
 * @param a2     Turn of the sphere about z (radians). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tMercator( vec2 uv, vec2 c, float scale, float a1, float a2 )
{
    vec2  m = ( uv - c ) * scale;
    float lon = m.x * 3.14159265, lat = atan( sinh( m.y * 3.14159265 ) );
    vec3  P = vec3( cos( lat ) * cos( lon ), cos( lat ) * sin( lon ), sin( lat ) );
    P.yz = rot2( a1 ) * P.yz;
    P.xy = rot2( a2 ) * P.xy;
    return c + P.xy / max( 1.0 - P.z, 0.05 ) * 0.9;
}
/**  Weierstrass p on the square lattice (lemniscatic case): p ~ 1/sn^2.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param scale  Scale of the lattice. (in)
 * @param t      Turn phase of the values. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tWeierstrass( vec2 uv, vec2 c, float scale, float t )
{
    vec2 z = ( uv - c ) * scale * 1.8540747;
    vec2 t1, t2, t3, t4;
    thetaAll( z * 0.8472131, t1, t2, t3, t4 );
    vec2 q = cdiv( t4, t1 ) * 0.8473; // 1 / sn
    return c + cmul( cmul( q, q ), cexpi( t * 0.3 ) ) * 0.12;
}
/**  Schwarz-Christoffel: the unit disk onto a regular n-gon, sc(z) = z 2F1(1/n, 2/n; 1 + 1/n; z^n); outside the disk
 * folded in.
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param n   Sides of the polygon. (in)
 * @param t   Turn phase of the disc. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tPolygonMap( vec2 uv, vec2 c, float n, float t )
{
    vec2  z = cmul( ( uv - c ) * 2.2, cexpi( t * 0.2 ) );
    float r2 = dot( z, z );
    if ( r2 > 1.0 )
        z /= r2;
    vec2 zn = vec2( 1.0, 0.0 );
    for ( int k = 0; k < 6; ++k )
    {
        if ( float( k ) >= n )
            break;
        zn = cmul( zn, z );
    }
    float a = 1.0 / n, b = 2.0 / n, cc = 1.0 + 1.0 / n;
    vec2  term = vec2( 1.0, 0.0 ), sum = vec2( 1.0, 0.0 );
    for ( int k = 0; k < 12; ++k )
    {
        float fk = float( k );
        term = cmul( term, zn ) * ( ( a + fk ) * ( b + fk ) / ( ( cc + fk ) * ( fk + 1.0 ) ) );
        sum += term;
    }
    return c + cmul( z, sum ) * 1.3;
}
/**  Jacobi theta_3 with a wandering complex nome: quasi-periodic waves.
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param k   Scale of the coordinate. (in)
 * @param t   Phase of the nome's wander. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tThetaWave( vec2 uv, vec2 c, float k, float t )
{
    vec2 z = ( uv - c ) * k;
    vec2 q = 0.55 * cexpi( t * 0.3 ), q2 = cmul( q, q );
    vec2 f = vec2( 1.0, 0.0 ), qsq = vec2( 1.0, 0.0 ), qp = q;
    for ( int n = 1; n <= 4; ++n )
    {
        qsq = cmul( qsq, qp );
        qp = cmul( qp, q2 ); // q^(n^2)
        f += 2.0 * cmul( qsq, ccos( 2.0 * float( n ) * z ) );
    }
    return c + f * 0.55;
}
/**  Chebyshev polynomial T_n (recurrence): the plane folded like cos(n acos z).
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param n   Degree of the polynomial. (in)
 * @param k   Scale of the coordinate. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tChebyshev( vec2 uv, vec2 c, float n, float k )
{
    vec2 z = ( uv - c ) * k, t0 = vec2( 1.0, 0.0 ), t1 = z;
    for ( int i = 1; i < 7; ++i )
    {
        if ( float( i ) >= n )
            break;
        vec2 t2 = 2.0 * cmul( z, t1 ) - t0;
        t0 = t1;
        t1 = t2;
    }
    return c + t1 * 0.3;
}
/**  Henon map, a few steps (a drifting).
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param steps  Number of iterations. (in)
 * @param t      Phase of the drift of the parameter a. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tHenon( vec2 uv, vec2 c, float steps, float t )
{
    vec2  p = ( uv - c ) * 2.5;
    float a = 1.2 + 0.2 * sin( t * 0.2 );
    for ( int i = 0; i < 4; ++i )
    {
        if ( float( i ) >= steps )
            break;
        p = vec2( 1.0 - a * p.x * p.x + p.y, 0.3 * p.x );
    }
    return c + p * 0.4;
}
/**  Ikeda map (the laser in a ring cavity), a few steps.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param steps  Number of iterations. (in)
 * @param t      Phase of the drift of the parameter u. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tIkeda( vec2 uv, vec2 c, float steps, float t )
{
    vec2  z = ( uv - c ) * 3.0;
    float u = 0.8 + 0.1 * sin( t * 0.2 );
    for ( int i = 0; i < 4; ++i )
    {
        if ( float( i ) >= steps )
            break;
        z = vec2( 1.0, 0.0 ) + u * cmul( z, cexpi( 0.4 - 6.0 / ( 1.0 + dot( z, z ) ) ) );
    }
    return c + z * 0.3;
}
/**  Chirikov standard map (kicked rotor): islands and chaos.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param K      Strength of the kick. (in)
 * @param steps  Number of iterations. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tChirikov( vec2 uv, vec2 c, float K, float steps )
{
    vec2 q = ( uv - c ) * 6.2831853;
    for ( int i = 0; i < 4; ++i )
    {
        if ( float( i ) >= steps )
            break;
        q.y += K * sin( q.x );
        q.x += q.y;
    }
    return c + q / 6.2831853 * 1.2;
}
/**  Cassini ovals: log-polar of z^2 - a^2 (lemniscate at the critical size).
 *
 * @param uv      The coordinate. (in)
 * @param c       Centre of the transform. (in)
 * @param a       Half the distance of the foci (the lemniscate at the critical size). (in)
 * @param travel  Flow phase along the pattern. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tCassini( vec2 uv, vec2 c, float a, float travel )
{
    vec2 z = ( uv - c ) * 2.0;
    vec2 w = cmul( z, z ) - vec2( a * a, 0.0 );
    return vec2( 0.25 * log( max( dot( w, w ), 1e-10 ) ) - travel, atan( w.y, w.x ) / 3.14159265 );
}
/**  Klein's tetrahedral / octahedral invariants: rational maps with the symmetry of a Platonic solid on a turning
 * sphere; f(1/z) = f(z), so |z| > 1 is folded in (no overflow, continuous); the value is read as a sphere point.
 *
 * @param uv    The coordinate. (in)
 * @param c     Centre of the transform. (in)
 * @param kind  Which invariant: tetrahedral (< 0.5) or octahedral. (in)
 * @param a1    Turn of the sphere about x (radians). (in)
 * @param a2    Turn of the sphere about z (radians). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tKleinInv( vec2 uv, vec2 c, float kind, float a1, float a2 )
{
    vec2  z = ( uv - c ) * 2.0;
    float s = dot( z, z );
    vec3  P = vec3( 2.0 * z, s - 1.0 ) / ( s + 1.0 );
    P.yz = rot2( a1 ) * P.yz;
    P.xy = rot2( a2 ) * P.xy;
    z = P.xy / max( 1.0 - P.z, 1e-3 );
    if ( dot( z, z ) > 1.0 )
        z = vec2( z.x, -z.y ) / dot( z, z );
    vec2 z2 = cmul( z, z ), z4 = cmul( z2, z2 ), N, D;
    if ( kind < 0.5 )
    {
        vec2 i2 = vec2( -z2.y, z2.x ) * 3.4641016;
        vec2 phi = z4 - i2 + vec2( 1.0, 0.0 ), psi = z4 + i2 + vec2( 1.0, 0.0 );
        N = cmul( cmul( phi, phi ), phi );
        D = cmul( cmul( psi, psi ), psi );
    }
    else
    {
        vec2 a = cmul( z4, z4 ) + 14.0 * z4 + vec2( 1.0, 0.0 );
        vec2 b = z4 - vec2( 1.0, 0.0 ), b2 = cmul( b, b );
        N = cmul( cmul( a, a ), a );
        D = 108.0 * cmul( z4, cmul( b2, b2 ) );
    }
    float nn = dot( N, N ), dd = dot( D, D );
    vec2  ND = vec2( N.x * D.x + N.y * D.y, N.y * D.x - N.x * D.y );
    vec3  Q = vec3( 2.0 * ND, nn - dd ) / max( nn + dd, 1e-20 );
    return vec2( atan( Q.y, Q.x ) / 3.14159265, asin( clamp( Q.z, -1.0, 1.0 ) ) / 1.5707963 * 0.5 + 0.5 );
}
/**  Gumowski-Mira map, a few steps.
 *
 * @param x   The argument. (in)
 * @param mu  The map's parameter mu. (in)
 *
 * @return
 *   f(x).
 **/
float gmF( float x, float mu )
{
    return mu * x + 2.0 * ( 1.0 - mu ) * x * x / ( 1.0 + x * x );
}
/**  Gumowski-Mira map iterated on the coordinate (a chaotic web).
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param mu     The map's parameter mu. (in)
 * @param steps  Number of iterations. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tGumowski( vec2 uv, vec2 c, float mu, float steps )
{
    vec2 p = ( uv - c ) * 12.0;
    for ( int i = 0; i < 5; ++i )
    {
        if ( float( i ) >= steps )
            break;
        float x = p.y + 0.008 * ( 1.0 - 0.05 * p.y * p.y ) * p.y + gmF( p.x, mu );
        p = vec2( x, -p.x + gmF( x, mu ) );
    }
    return c + p * 0.05;
}
/**  Zaslavsky web map: a kick and a turn by 2 pi / q -- a q-fold stochastic web.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param q      Symmetry of the web: the turn per step is 2 pi / q. (in)
 * @param K      Strength of the kick. (in)
 * @param steps  Number of iterations. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tZaslavsky( vec2 uv, vec2 c, float q, float K, float steps )
{
    vec2  p = ( uv - c ) * 18.0;
    float a = 6.2831853 / q;
    for ( int i = 0; i < 5; ++i )
    {
        if ( float( i ) >= steps )
            break;
        float u = p.x + K * sin( p.y );
        p = vec2( u * cos( a ) + p.y * sin( a ), -u * sin( a ) + p.y * cos( a ) );
    }
    return c + p / 18.0;
}
/**  Spherical Droste: a twisted Droste between two antipodal points of a turning sphere -- the poles travel, even
 * through infinity.
 *
 * @param uv    The coordinate. (in)
 * @param c     Centre of the transform. (in)
 * @param K     Scale ratio between two repeats. (in)
 * @param zoom  Zoom phase. (in)
 * @param a1    Turn of the sphere about x (radians). (in)
 * @param a2    Turn of the sphere about z (radians). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tSphereDroste( vec2 uv, vec2 c, float K, float zoom, float a1, float a2 )
{
    vec2  z = ( uv - c ) * 2.0;
    float s = dot( z, z );
    vec3  P = vec3( 2.0 * z, s - 1.0 ) / ( s + 1.0 );
    P.yz = rot2( a1 ) * P.yz;
    P.xy = rot2( a2 ) * P.xy;
    vec2  w = P.xy / max( 1.0 - P.z, 1e-4 );
    vec2  L = vec2( log( max( length( w ), 1e-6 ) ), atan( w.y, w.x ) );
    float lk = log( K ), b = -lk / 3.14159265;
    vec2  W = vec2( L.x - b * L.y, L.y + b * L.x );
    float tri = abs( fract( ( W.x / lk - zoom ) * 0.5 ) * 2.0 - 1.0 );
    return c + exp( tri * lk - lk ) * cexpi( W.y ) * 0.9;
}
/**  Cubic Julia: z^3 + k, k wandering.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param steps  Number of iterations. (in)
 * @param t      Phase of the wander of k. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tJulia3( vec2 uv, vec2 c, float steps, float t )
{
    vec2 z = ( uv - c ) * 2.2, k = 0.55 * cexpi( t * 0.13 + 1.0 );
    for ( int i = 0; i < 3; ++i )
    {
        if ( float( i ) >= steps )
            break;
        z = cmul( cmul( z, z ), z ) + k;
    }
    return c + z * 0.55;
}
/**  Magnet map (the Ising-model fractal, type I): z <- ((z^2 + k - 1) / (2z + k - 2))^2.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param steps  Number of iterations. (in)
 * @param t      Phase of the wander of k. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tMagnet( vec2 uv, vec2 c, float steps, float t )
{
    vec2 z = ( uv - c ) * 2.5, k = vec2( 1.2, 0.3 ) + 0.25 * cexpi( t * 0.17 );
    for ( int i = 0; i < 3; ++i )
    {
        if ( float( i ) >= steps )
            break;
        z = cdiv( cmul( z, z ) + k - vec2( 1.0, 0.0 ), 2.0 * z + k - vec2( 2.0, 0.0 ) );
        z = cmul( z, z );
    }
    return c + z * 0.6;
}
/**  Hyperbolic Droste: Escher's spiral Droste read as a point of the Poincare disk and folded into a {p,q} tiling --
 * self-similar and hyperbolic at once.
 *
 * @param uv    The coordinate. (in)
 * @param c     Centre of the transform. (in)
 * @param K     Scale ratio between two repeats. (in)
 * @param zoom  Zoom phase. (in)
 * @param p     Sides of each polygon of the tiling. (in)
 * @param q     Polygons meeting at each vertex. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tHypDroste( vec2 uv, vec2 c, float K, float zoom, float p, float q )
{
    vec2 w = ( tDrosteSpiral( uv, c, K, zoom ) - c ) / 0.45 * 0.97;
    return c + poincareFold( w, p, q ) * 0.9;
}
// ---- symmetries ----
/**  The modular group PSL(2,Z) as a mirror group ((2,3,inf) triangles): in the half-plane, mirrors x = 0, x = 1/2 and
 * the unit circle, repeated.
 *
 * @param uv      The coordinate. (in)
 * @param c       Centre of the transform. (in)
 * @param scale   Scale of the coordinate. (in)
 * @param travel  Horizontal shift in the half-plane. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tModular( vec2 uv, vec2 c, float scale, float travel )
{
    vec2 w = ( uv - c ) * scale;
    w.y = abs( w.y ) + 0.03;
    w.x += travel;
    for ( int i = 0; i < 12; ++i )
    {
        w.x = abs( fract( w.x + 0.5 ) - 0.5 );
        float r2 = dot( w, w );
        if ( r2 < 1.0 )
            w /= r2;
    }
    return c + vec2( w.x, log( w.y ) * 0.6 ) * 0.9;
}
/**  Schottky mirror group: inversions in four circles (tangent at r = 0.707).
 *
 * @param uv    The coordinate. (in)
 * @param c     Centre of the transform. (in)
 * @param r     Radius of the four mirror circles. (in)
 * @param turn  Turn of the coordinate (radians). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tSchottky( vec2 uv, vec2 c, float r, float turn )
{
    // four circles (tangent at r = 0.707) and a fifth, large one that mirrors
    // the outside in: the whole plane becomes the group's lace
    vec2        z = rot2( turn ) * ( uv - c ) * 3.0;
    const float R0 = 1.75;
    for ( int i = 0; i < 8; ++i )
    {
        float zz = dot( z, z );
        if ( zz > R0 * R0 )
            z *= R0 * R0 / zz;
        for ( int k = 0; k < 4; ++k )
        {
            vec2  cc = cexpi( 1.5707963 * float( k ) ), d = z - cc;
            float dd = dot( d, d );
            if ( dd < r * r )
                z = cc + d * ( r * r / dd );
        }
    }
    return c + z * 0.5;
}
/**  p3m1: the equilateral-triangle mirror group (three mirrors through every three-fold centre): hexagonal cell,
 * angle folded into the 60-degree wedge whose rays run through the cell's corners.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param cells  Cells per unit. (in)
 * @param turn   Turn of the lattice (radians). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tTriMirror( vec2 uv, vec2 c, float cells, float turn )
{
    vec2       q = rot2( turn ) * ( uv - c ) * cells;
    const vec2 s = vec2( 1.0, 1.7320508 );
    vec2       a = mod( q, s ) - s * 0.5, b = mod( q - s * 0.5, s ) - s * 0.5;
    vec2       h = dot( a, a ) < dot( b, b ) ? a : b;
    float      an = abs( mod( atan( h.y, h.x ) - 0.5235988, 2.0943951 ) - 1.0471976 );
    return c + length( h ) * cexpi( an ) / cells * 2.0;
}
/**  Pappus chain: inversion about a point turns the arbelos into a strip; the strip mirror-repeated and inverted back
 * gives the endless chain of circles.
 *
 * @param uv      The coordinate. (in)
 * @param c       Centre of the transform. (in)
 * @param width   Width of the strip (the circles' size). (in)
 * @param travel  Flow phase along the chain. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tPappus( vec2 uv, vec2 c, float width, float travel )
{
    vec2 p = c + vec2( 0.35, 0.0 ), d = uv - p;
    vec2 w = d / max( dot( d, d ), 1e-5 );
    w.y = width * ( abs( mod( w.y / width - 1.0 + travel, 4.0 ) - 2.0 ) - 1.0 );
    return p + w / max( dot( w, w ), 1e-5 ) * 0.8;
}
/**  Origami: up to four mirror lines (folds) turning slowly.
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param n   Number of folds (up to 4). (in)
 * @param t   Phase of the folds' turning. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tOrigami( vec2 uv, vec2 c, float n, float t )
{
    for ( int k = 0; k < 4; ++k )
    {
        if ( float( k ) >= n )
            break;
        float fk = float( k );
        vec2  nn = cexpi( t * ( 0.1 + 0.03 * fk ) + fk * 1.7 );
        vec2  pk = c + 0.18 * cexpi( fk * 2.3 + t * 0.07 );
        float s = dot( uv - pk, nn );
        uv -= nn * ( s - abs( s ) );
    }
    return uv;
}
/**  Steiner: a kaleidoscope seen through a circle inversion -- its mirrors become circles through the inversion
 * point.
 *
 * @param uv   The coordinate. (in)
 * @param c    Centre of the transform. (in)
 * @param n    Mirrors of the kaleidoscope. (in)
 * @param rot  Turn of the folded angle (radians). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tSteiner( vec2 uv, vec2 c, float n, float rot )
{
    vec2  d = ( uv - c ) * 2.0 + vec2( 0.3, 0.0 );
    vec2  w = d / max( dot( d, d ), 1e-6 ) - vec2( 1.2, 0.0 );
    float sec = 6.2831853 / n;
    float an = abs( mod( atan( w.y, w.x ) + rot, sec ) - 0.5 * sec );
    w = length( w ) * cexpi( an ) + vec2( 1.2, 0.0 );
    return c + ( w / max( dot( w, w ), 1e-6 ) - vec2( 0.3, 0.0 ) ) * 0.5;
}
/**  Spiral kaleidoscope: the sectors twist with the log-radius.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param sides  Number of mirror wedges. (in)
 * @param twist  Twist of the sectors per unit of log radius. (in)
 * @param rot    Turn of the folded angle (radians). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tSpiralKaleido( vec2 uv, vec2 c, float sides, float twist, float rot )
{
    vec2  d = uv - c;
    float r = max( length( d ), 1e-5 ), sec = 6.2831853 / sides;
    float an = abs( mod( atan( d.y, d.x ) + twist * log( r ) + rot, sec ) - 0.5 * sec );
    return c + r * cexpi( an );
}
// ---- second maps ----
/**  Gravitational lens (point mass): the source seen through an Einstein ring.
 *
 * @param uv   The coordinate. (in)
 * @param c    Centre of the frame. (in)
 * @param rE   Einstein radius of the lens. (in)
 * @param pos  Position of the mass relative to c. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tGravLens( vec2 uv, vec2 c, float rE, vec2 pos )
{
    vec2 d = uv - c - pos;
    return uv - rE * rE * d / max( dot( d, d ), 1e-5 );
}
/**  Binary lens: two masses orbiting -- caustic folds.
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the orbit. (in)
 * @param rE  Einstein radius. (in)
 * @param t   Orbit phase (radians). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tBinaryLens( vec2 uv, vec2 c, float rE, float t )
{
    vec2 d1 = uv - c - 0.12 * cexpi( t ), d2 = uv - c + 0.12 * cexpi( t );
    return uv - rE * rE * ( d1 / max( dot( d1, d1 ), 1e-5 ) + 0.6 * d2 / max( dot( d2, d2 ), 1e-5 ) );
}
/**  Lorentz boost (hyperbolic rotation): squeezed along the diagonals.
 *
 * @param uv   The coordinate. (in)
 * @param c    Centre of the transform. (in)
 * @param phi  Rapidity of the boost. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tBoost( vec2 uv, vec2 c, float phi )
{
    vec2  d = uv - c;
    float ch = cosh( phi ), sh = sinh( phi );
    return c + vec2( d.x * ch + d.y * sh, d.x * sh + d.y * ch );
}
/**  Log vortex: turned by an angle growing with log r (a spiral sink).
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param k   Turn per unit of log radius. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tLogVortex( vec2 uv, vec2 c, float k )
{
    vec2 d = uv - c;
    return c + rot2( k * log( max( length( d ), 1e-4 ) ) ) * d;
}
/**  Zone lens: the magnification oscillates with r^2 (a smooth Fresnel lens).
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param a   Strength of the magnification's oscillation. (in)
 * @param k   Frequency of the zones in r^2. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tZoneLens( vec2 uv, vec2 c, float a, float k )
{
    vec2 d = uv - c;
    return c + d * ( 1.0 + a * sin( k * dot( d, d ) ) );
}
// ---- flows ----
/**  Gravitational wave: plus and cross polarisation, travelling out.
 *
 * @param uv  The coordinate. (in)
 * @param c   Source of the wave. (in)
 * @param h   Strain amplitude. (in)
 * @param t   Phase of the wave. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tGravWave( vec2 uv, vec2 c, float h, float t )
{
    vec2  d = uv - c;
    float ph = sin( length( d ) * 25.0 - t * 3.0 ) * exp( -length( d ) * 1.5 );
    return uv + h * ph * ( cos( t * 0.3 ) * vec2( d.x, -d.y ) + sin( t * 0.3 ) * vec2( d.y, d.x ) );
}
/**  Double gyre (the textbook time-periodic flow), advected four steps.
 *
 * @param uv  The coordinate. (in)
 * @param A   Amplitude of the flow. (in)
 * @param t   Phase of the period. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tDoubleGyre( vec2 uv, float A, float t )
{
    vec2  p = mirrorUV( uv ) * vec2( 2.0, 1.0 );
    float s = 0.25 * sin( 0.6 * t );
    for ( int i = 0; i < 4; ++i )
    {
        float f = s * p.x * p.x + ( 1.0 - 2.0 * s ) * p.x, dfx = 2.0 * s * p.x + 1.0 - 2.0 * s;
        p += 0.08 * 3.14159265 * A
             * vec2( -sin( 3.14159265 * f ) * cos( 3.14159265 * p.y ),
                     cos( 3.14159265 * f ) * sin( 3.14159265 * p.y ) * dfx );
    }
    return p / vec2( 2.0, 1.0 );
}
/**  Taylor-Green vortices, amplitude breathing.
 *
 * @param uv  The coordinate. (in)
 * @param A   Amplitude of the vortices. (in)
 * @param t   Phase of the breathing. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tTaylorGreen( vec2 uv, float A, float t )
{
    vec2  p = uv * 9.424778;
    float a = A * sin( t * 0.4 );
    for ( int i = 0; i < 4; ++i )
        p += 0.16 * a * vec2( sin( p.x ) * cos( p.y ), -cos( p.x ) * sin( p.y ) );
    return p / 9.424778;
}
/**  Convection cells: displaced along the gradient of a hexagonal wave field.
 *
 * @param uv  The coordinate. (in)
 * @param k   Wave number of the hexagonal field. (in)
 * @param s   Strength of the displacement. (in)
 * @param t   Phase of the field. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tConvection( vec2 uv, float k, float s, float t )
{
    vec2 g = vec2( 0.0 );
    for ( int j = 0; j < 3; ++j )
    {
        vec2 e = cexpi( 2.0943951 * float( j ) );
        g -= k * e * sin( k * dot( e, uv ) + t * 0.3 );
    }
    return uv + s * g * 0.002;
}
/**  Gerstner waves: three trochoidal waves, horizontal displacement.
 *
 * @param uv  The coordinate. (in)
 * @param A   Amplitude of the waves. (in)
 * @param t   Phase of the waves. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tGerstner( vec2 uv, float A, float t )
{
    for ( int j = 0; j < 3; ++j )
    {
        vec2 dir = cexpi( 0.7 + 1.9 * float( j ) );
        uv += A * dir * cos( dot( dir, uv ) * ( 14.0 + 5.0 * float( j ) ) - t * ( 1.5 + 0.4 * float( j ) ) ) * 0.022;
    }
    return uv;
}
// ---- idea round 4 ----
/**  Farris frieze: a power series in w = exp(i z) -- periodic along the band, fading across it; the band folded
 * (mirrored) so friezes stack endlessly.
 *
 * @param uv      The coordinate. (in)
 * @param c       Centre of the transform. (in)
 * @param period  Period of the frieze along the band. (in)
 * @param t       Phase of the terms. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tFrieze( vec2 uv, vec2 c, float period, float t )
{
    vec2 z = ( uv - c ) * vec2( 6.2831853 / period, 3.0 );
    z.y = abs( fract( z.y / 3.0 * 0.5 + 0.25 ) * 2.0 - 1.0 ) * 1.5; // mirrored band, 0..1.5
    vec2 w = exp( -z.y ) * cexpi( z.x );
    vec2 w2 = cmul( w, w ), w3 = cmul( w2, w );
    vec2 f = cmul( cexpi( t * 0.5 ), w ) + cmul( cexpi( -t * 0.7 + 1.0 ), w2 ) * 0.7
             + cmul( cexpi( t * 0.3 + 2.0 ), w3 ) * 0.5;
    return c + f * 0.4;
}
/**  Jacobi sn/cn wallpaper: cn itself (m = 1/2) as a doubly periodic picture, its value turned with time (the colours
 * travel round every cell).
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param scale  Scale of the lattice. (in)
 * @param t      Turn phase of the values. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tEllipticWall( vec2 uv, vec2 c, float scale, float t )
{
    vec2 z = ( uv - c ) * scale * 1.8540747;
    vec2 N, D;
    cnTheta( z * 0.8472131, N, D );
    vec2 zeta = cdiv( N, D );
    return c + cmul( zeta, cexpi( t * 0.3 ) ) * 0.3;
}
/**  The hyperbolic plane in the upper half-plane: z = (w - i)/(w + i) to the disk; the lower half is the mirror
 * image; a horizontal shift is an exact hyperbolic (parabolic) motion -- the tiling crawls along the horizon line.
 *
 * @param uv      The coordinate. (in)
 * @param c       Centre of the transform. (in)
 * @param p       Sides of each polygon of the {p,q} tiling. (in)
 * @param q       Polygons meeting at each vertex. (in)
 * @param scale   Scale of the half-plane. (in)
 * @param travel  Horizontal shift (an exact parabolic motion). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tHalfPlane( vec2 uv, vec2 c, float p, float q, float scale, float travel )
{
    vec2 w = ( uv - c ) * scale;
    w.y = abs( w.y ) + 0.04;
    w.x += travel;
    vec2 z = cdiv( w - vec2( 0.0, 1.0 ), w + vec2( 0.0, 1.0 ) );
    return c + poincareFold( z, p, q ) * 0.9;
}
/**  Archimedean spiral coordinates: r against the angle -- arms of equal spacing; one turn shifts both outputs by
 * exactly one mirror period.
 *
 * @param uv      The coordinate. (in)
 * @param c       Centre of the transform. (in)
 * @param k       Spacing of the arms (scale of the radius). (in)
 * @param travel  Flow phase along the pattern. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tArchimedes( vec2 uv, vec2 c, float k, float travel )
{
    vec2  d = uv - c;
    float r = length( d ) * k, a = atan( d.y, d.x ) / 3.14159265;
    return vec2( r - a - travel, r + a );
}
/**  Koch fold: the snowflake's mirrors and a scale of 3, repeated.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param iters  Number of iterations. (in)
 * @param turn   Turn of the coordinate before folding (radians). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tKoch( vec2 uv, vec2 c, float iters, float turn )
{
    vec2       p = rot2( turn ) * ( uv - c ) * 2.0;
    const vec2 n = vec2( -0.5, 0.8660254 );
    float      sc = 1.0;
    for ( int i = 0; i < 4; ++i )
    {
        if ( float( i ) >= iters )
            break;
        p.x = abs( p.x );
        p.x -= 0.5;
        p -= 2.0 * min( 0.0, dot( p, n ) ) * n;
        p *= 3.0;
        sc *= 3.0;
        p.x -= 1.5;
    }
    return c + p / sc * 1.4;
}
/**  Bend: the picture turned by an angle that grows across it (a bounded bend).
 *
 * @param uv  The coordinate. (in)
 * @param k   Turn across the picture (radians per unit). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tBend( vec2 uv, float k )
{
    return 0.5 + rot2( k * ( uv.x - 0.5 ) ) * ( uv - 0.5 );
}
// ---- idea round 3 ----
/**  Blaschke product: z * prod (z - a)/(1 - conj(a) z) -- the unit disk wrapped onto itself several times around
 * zeros that wander; conformal, continuous (its poles lie outside the disk and only fold far picture in).
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param n   Number of zeros (how often the disc is wrapped). (in)
 * @param t   Phase of the zeros' wander. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tBlaschke( vec2 uv, vec2 c, float n, float t )
{
    vec2 z = ( uv - c ) * 2.2, B = z;
    for ( int k = 0; k < 4; ++k )
    {
        if ( float( k ) >= n )
            break;
        float fk = float( k );
        vec2  a = 0.55 * vec2( cos( t * ( 0.3 + 0.07 * fk ) + fk * 2.1 ), sin( t * ( 0.23 + 0.05 * fk ) + fk * 1.3 ) );
        B = cmul( B, cdiv( z - a, vec2( 1.0, 0.0 ) - cmul( vec2( a.x, -a.y ), z ) ) );
    }
    return c + B * 0.9; // spot check: 0.45 read too small a patch
}
/**  Parabolic stream: in inverted coordinates a plain translation -- circles all touching at one point, the picture
 * streaming through them (a parabolic Moebius flow).
 *
 * @param uv      The coordinate. (in)
 * @param c       Centre of the transform. (in)
 * @param scale   Scale of the coordinate. (in)
 * @param travel  Translation in the inverted coordinates. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tParabolic( vec2 uv, vec2 c, float scale, float travel )
{
    vec2 z = ( uv - c ) * scale;
    vec2 w = vec2( z.x, -z.y ) / max( dot( z, z ), 1e-5 );
    return w * 0.3 + vec2( travel, 0.0 );
}
/**  Elliptic coordinates around two foci: confocal ellipses and hyperbolas.
 *
 * @param uv      The coordinate. (in)
 * @param c       Centre of the transform. (in)
 * @param f       Half the distance of the foci. (in)
 * @param travel  Flow phase along the pattern. (in)
 *
 * @return
 *   The transformed coordinate.
 *
 * nu uses acos without the sign of y (mirror-symmetric, hence continuous).
 **/
vec2 tElliptic( vec2 uv, vec2 c, float f, float travel )
{
    vec2  d = uv - c;
    float r1 = length( d + vec2( f, 0.0 ) ), r2 = length( d - vec2( f, 0.0 ) );
    float mu = log( max( ( r1 + r2 ) / ( 2.0 * f ), 1.0 )
                    + sqrt( max( pow( ( r1 + r2 ) / ( 2.0 * f ), 2.0 ) - 1.0, 0.0 ) ) );
    float nu = acos( clamp( ( r1 - r2 ) / ( 2.0 * f ), -1.0, 1.0 ) );
    return vec2( mu * 0.6 - travel, nu / 3.14159265 * 2.0 );
}
/**  tan z: the plane in stripes, each a whole sphere of picture between two poles.
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param k   Scale of the coordinate. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tTanLattice( vec2 uv, vec2 c, float k )
{
    vec2  z = ( uv - c ) * k;
    float den = cos( 2.0 * z.x ) + cosh( 2.0 * z.y );
    return c + vec2( sin( 2.0 * z.x ), sinh( 2.0 * z.y ) ) / max( den, 1e-4 ) * 0.25;
}
/**  Newton's method for z^3 = w, a few steps: the picture folded along the fractal borders of the three basins (a
 * rational map: continuous off its poles).
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param steps  Number of iterations. (in)
 * @param t      Phase (integrated time). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tNewton( vec2 uv, vec2 c, float steps, float t )
{
    vec2 z = ( uv - c ) * 2.4, w = cexpi( t * 0.3 );
    for ( int i = 0; i < 4; ++i )
    {
        if ( float( i ) >= steps )
            break;
        vec2 z2 = cmul( z, z );
        z -= cdiv( cmul( z2, z ) - w, 3.0 * z2 );
    }
    return c + z * 0.4;
}
/**  Newton's method for z^n = w (n = 3..5): n basins, fractal borders.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param steps  Number of iterations. (in)
 * @param n      Power n of z^n = w (3..5): the number of basins. (in)
 * @param t      Phase (integrated time). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tNewtonN( vec2 uv, vec2 c, float steps, float n, float t )
{
    vec2 z = ( uv - c ) * 2.4, w = cexpi( t * 0.3 );
    for ( int i = 0; i < 4; ++i )
    {
        if ( float( i ) >= steps )
            break;
        vec2 zn1 = vec2( 1.0, 0.0 );
        for ( int k = 0; k < 4; ++k )
        {
            if ( float( k ) >= n - 1.0 )
                break;
            zn1 = cmul( zn1, z );
        }
        z -= cdiv( cmul( zn1, z ) - w, n * zn1 );
    }
    return c + z * 0.4;
}
/**  Julia map: z -> z^2 + k a few times, k wandering near the Mandelbrot border.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param steps  Number of iterations. (in)
 * @param t      Phase of the wander of k near the Mandelbrot border. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tJulia( vec2 uv, vec2 c, float steps, float t )
{
    vec2 z = ( uv - c ) * 2.4;
    vec2 k = 0.7885 * cexpi( t * 0.15 + 0.4 );
    for ( int i = 0; i < 4; ++i )
    {
        if ( float( i ) >= steps )
            break;
        z = cmul( z, z ) + k;
    }
    return c + z * 0.35;
}
/**  The polyhedral fold (Knighty) on the Riemann sphere: the plane lifted onto the turning sphere, folded by the
 * tetrahedral/octahedral/icosahedral mirrors, projected back -- a spherical kaleidoscope with 12..120 copies.
 *
 * @param p  The point on the sphere. (in)
 * @param n  Symmetry: 3 tetrahedral, 4 octahedral, 5 icosahedral. (in)
 *
 * @return
 *   The point folded into the fundamental triangle.
 **/
vec3 polyFold( vec3 p, float n )
{
    float cospin = cos( 3.14159265 / n ), scospin = sqrt( max( 0.75 - cospin * cospin, 1e-4 ) );
    vec3  nc = vec3( -0.5, -cospin, scospin );
    for ( int i = 0; i < 5; ++i )
    {
        if ( float( i ) >= n )
            break;
        p.xy = abs( p.xy );
        p -= 2.0 * min( 0.0, dot( p, nc ) ) * nc;
    }
    return p;
}
/**  The plane as a sphere, folded by a spherical kaleidoscope.
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param n   Mirrors of the spherical kaleidoscope. (in)
 * @param a1  Turn of the sphere about x (radians). (in)
 * @param a2  Turn of the sphere about z (radians). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tSphereKaleido( vec2 uv, vec2 c, float n, float a1, float a2 )
{
    vec2  z = ( uv - c ) * 2.5;
    float s = dot( z, z );
    vec3  P = vec3( 2.0 * z, s - 1.0 ) / ( s + 1.0 );
    P.yz = rot2( a1 ) * P.yz;
    P.xz = rot2( a2 ) * P.xz;
    P = polyFold( P, n );
    return c + P.xy / max( 1.0 - P.z, 1e-3 ) * 1.2;
}
/**  Quasicrystal (de Bruijn): n plane waves in n directions -- a pattern with n-fold symmetry that never repeats;
 * phases drift, the pattern breathes.
 *
 * @param uv  The coordinate. (in)
 * @param c   Centre of the transform. (in)
 * @param n   Number of plane-wave directions (the symmetry order). (in)
 * @param k   Spatial frequency of the waves. (in)
 * @param t   Phase (integrated time). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tQuasi( vec2 uv, vec2 c, float n, float k, float t )
{
    vec2 x = ( uv - c ) * k, f = vec2( 0.0 );
    for ( int j = 0; j < 7; ++j )
    {
        if ( float( j ) >= n )
            break;
        float a = 3.14159265 * float( j ) / n;
        f += cexpi( dot( x, vec2( cos( a ), sin( a ) ) ) * 6.2831853 + t * ( 0.5 + 0.13 * float( j ) ) );
    }
    return c + f / n * 0.6;
}
/**  Sierpinski fold: the three mirrors of a triangle, then scale 2 -- a continuous iterated function system (every
 * step a reflection or a scale).
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param iters  Number of iterations. (in)
 * @param turn   Turn of the coordinate before folding (radians). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tSierpinski( vec2 uv, vec2 c, float iters, float turn )
{
    vec2 q = ( uv - c ) * 2.0;
    vec2 n1 = vec2( -0.8660254, 0.5 ), n2 = vec2( 0.8660254, 0.5 );
    for ( int i = 0; i < 4; ++i )
    {
        if ( float( i ) >= iters )
            break;
        q.x = abs( q.x );
        q -= 2.0 * min( 0.0, dot( q, n1 ) ) * n1;
        q -= 2.0 * min( 0.0, dot( q, n2 ) ) * n2;
        q = rot2( turn ) * q;
        q = q * 2.0 - vec2( 0.0, 1.0 );
    }
    return c + q * 0.12;
}
/**  Mirrored power: z^alpha with the angle mirrored first (|arg z|), so any alpha -- also a drifting one -- stays
 * continuous.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param alpha  Exponent of the power (may drift). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tPowerMirror( vec2 uv, vec2 c, float alpha )
{
    vec2  d = ( uv - c ) * 2.0;
    float r = length( d ), a = abs( atan( d.y, d.x ) );
    return c + pow( r, alpha ) * vec2( cos( alpha * a ), sin( alpha * a ) ) * 0.45;
}
/**  Vortex street: four point vortices of alternating spin drifting past; each turns the picture near it by a bounded
 * angle (a smooth, divergence-free flow).
 *
 * @param uv        The coordinate. (in)
 * @param strength  Spin of each vortex. (in)
 * @param t         Drift phase of the vortices. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tVortexStreet( vec2 uv, float strength, float t )
{
    for ( int k = 0; k < 4; ++k )
    {
        float fk = float( k );
        vec2  pk = vec2( 0.5 + 0.45 * sin( t * 0.21 + fk * 1.57 ),
                         0.5 + ( mod( fk, 2.0 ) - 0.5 ) * 0.35 + 0.1 * sin( t * 0.3 + fk ) );
        vec2  d = uv - pk;
        float g = strength * ( mod( fk, 2.0 ) < 0.5 ? 1.0 : -1.0 ) * exp( -dot( d, d ) / 0.03 );
        uv = pk + rot2( g ) * d;
    }
    return uv;
}
/**  Curl flow: displaced along the curl of a noise field -- divergence-free, so the picture swirls like a fluid
 * without bunching up.
 *
 * @param uv        The coordinate. (in)
 * @param strength  Strength of the displacement. (in)
 * @param t         Flow phase of the noise field. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tCurl( vec2 uv, float strength, float t )
{
    const float e = 0.01;
    vec2        q = uv * 3.0 + vec2( 0.3 * t, -0.2 * t );
    float       a = fbm3( q + vec2( 0.0, e ) ), b = fbm3( q - vec2( 0.0, e ) );
    float       c1 = fbm3( q + vec2( e, 0.0 ) ), d1 = fbm3( q - vec2( e, 0.0 ) );
    return uv + strength * vec2( a - b, -( c1 - d1 ) ) / ( 2.0 * e ) * 0.02;
}
/**  Bipolar coordinates around two foci at c -/+ (f, 0): sigma (the angle the foci subtend) across, tau (log ratio of
 * the distances) along -- the picture streams out of one focus into the other.
 *
 * @param uv      The coordinate. (in)
 * @param c       Midpoint between the foci. (in)
 * @param f       Half the distance of the foci. (in)
 * @param bands   Bands across (whole number). (in)
 * @param travel  Flow phase along the bands. (in)
 *
 * @return
 *   The transformed coordinate.
 *
 * sigma/pi jumps by 2 on the segment between the foci, so `bands` must be whole.
 **/
vec2 tBipolar( vec2 uv, vec2 c, float f, float bands, float travel )
{
    vec2  z = uv - c;
    vec2  a = z + vec2( f, 0.0 ), b = z - vec2( f, 0.0 );
    float sigma = atan( a.y * b.x - a.x * b.y, a.x * b.x + a.y * b.y );
    float tau = 0.5 * log( max( dot( a, a ), 1e-8 ) / max( dot( b, b ), 1e-8 ) );
    return vec2( sigma / 3.14159265 * bands, tau * 0.35 - travel );
}
/**  The rotating Riemann sphere: the plane lifted onto the sphere (inverse stereographic projection), the sphere
 * turned about two axes, and projected back -- the picture streams out of one pole and into the other.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param scale  Scale of the coordinate. (in)
 * @param a1     Turn of the sphere about x (radians). (in)
 * @param a2     Turn of the sphere about z (radians). (in)
 *
 * @return
 *   The transformed coordinate.
 *
 * (An elliptic Moebius map, continuous except at the pole's image.)
 **/
vec2 tRiemann( vec2 uv, vec2 c, float scale, float a1, float a2 )
{
    vec2  z = ( uv - c ) * scale;
    float s = dot( z, z );
    vec3  P = vec3( 2.0 * z, s - 1.0 ) / ( s + 1.0 );
    P.yz = rot2( a1 ) * P.yz;
    P.xy = rot2( a2 ) * P.xy;
    return c + P.xy / max( 1.0 - P.z, 1e-3 ) / scale;
}
/**  Loxodromic stream: the Moebius map sending the two poles to 0 and infinity, then log-polar -- the picture screws
 * out of one pole and into the other along spirals.
 *
 * @param uv     The coordinate. (in)
 * @param pa     The pole the picture screws out of. (in)
 * @param pb     The pole it screws into. (in)
 * @param twist  Twist of the spirals (whole number: seamless). (in)
 * @param flow   Flow phase along the spirals. (in)
 *
 * @return
 *   The transformed coordinate.
 *
 * (log|w| + i arg w, mirror-repeated: arg jumps by 2 pi on the segment between the poles, i.e. by a whole number of
 * periods when the angle is scaled by 1/pi and `twist` stays whole.)
 **/
vec2 tLoxo( vec2 uv, vec2 pa, vec2 pb, float twist, float flow )
{
    vec2  z1 = uv - pa, z2 = uv - pb;
    vec2  w = vec2( z1.x * z2.x + z1.y * z2.y, z1.y * z2.x - z1.x * z2.y ) / max( dot( z2, z2 ), 1e-6 );
    float lr = 0.5 * log( max( dot( w, w ), 1e-10 ) ), an = atan( w.y, w.x ) / 3.14159265;
    return vec2( lr * 0.3 + an * twist - flow, an * 2.0 + lr * 0.15 );
}
/**  Blossom: the radius swells and shrinks with the angle, n whole petals.
 *
 * @param uv    The coordinate. (in)
 * @param c     Centre of the transform. (in)
 * @param n     Number of petals (whole). (in)
 * @param amp   How far the radius swells and shrinks. (in)
 * @param turn  Turn of the petals (radians). (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tPetal( vec2 uv, vec2 c, float n, float amp, float turn )
{
    vec2  d = uv - c;
    float a = atan( d.y, d.x );
    return c + d * ( 1.0 + amp * sin( n * a + turn ) );
}
/**  Joukowski map w = z + R^2 / z (the airfoil map): circles become wings.
 *
 * @param uv     The coordinate. (in)
 * @param c      Centre of the transform. (in)
 * @param R      Radius of the circle that becomes the wing. (in)
 * @param scale  Scale of the coordinate. (in)
 *
 * @return
 *   The transformed coordinate.
 **/
vec2 tJoukowski( vec2 uv, vec2 c, float R, float scale )
{
    vec2 z = ( uv - c ) * scale;
    vec2 iz = vec2( z.x, -z.y ) / max( dot( z, z ), 1e-5 );
    return c + ( z + R * R * iz ) * 0.5;
}

/// @cond
vec2 chain( vec2 p );
/// @endcond
/**  A loop count the compiler cannot see through (it depends on a uniform), so the loop is NOT unrolled and its body
 * -- a whole chain -- is inlined once.
 *
 * @param n  The count. (in)
 *
 * @return
 *   n (plus a uniform-dependent 0).
 **/
int loopN( int n )
{
    return n + int( min( interpolation, 0.0 ) );
}
/** @{ */
vec2 gChainM, gChainDx, gChainDy; ///< mirrored chain coordinate of this pixel and its derivatives per pixel
/** @} */
/**  The chain's photo read with a seam-proof footprint (per axis the smaller of the two one-sided differences) and
 * the screen-space luma gradient.
 *
 * @param p     The pixel's centred coordinate. (in)
 * @param bias  Bias added to the footprint's mip level. (in)
 * @param grad  Receives the luma gradient of the photo there. (out)
 *
 * @return
 *   The photo colour through the chain (RGB).
 **/
vec3 imgChain( vec2 p, float bias, out vec2 grad )
{
    vec2 c0 = chain( p );
    vec2 m0 = mirrorUV( c0 );
    // Footprint from the screen derivatives of the MIRRORED coordinate: it is
    // continuous over every seam of the chain, so one evaluation suffices
    // (it used to be five, each an inlined copy of the whole chain).
    vec2 dx = dFdx( m0 ), dy = dFdy( m0 );
    gChainM = m0;
    gChainDx = dx;
    gChainDy = dy;
    float lod = clamp( log2( max( max( length( dx ), length( dy ) ) * 1024.0, 1.0 ) ) + bias, 0.0, 9.0 );
    vec3  col = imgLod( c0, lod );
    float l = luma( col );
    grad = vec2( dFdx( l ), dFdy( l ) ) * 1.5; // luma change per 1.5 px, as before
    return col;
}

/** @{ */
float gT, gSpread; ///< gT: The chain's (or scene's) time this frame; gSpread: The spectral spread this frame, 0..1.
/** @} */
/**  The scene's chain of transforms: a coordinate in, the transformed coordinate out.
 *
 * @param p  The coordinate. (in)
 *
 * @return
 *   The coordinate after the chain.
 **/
vec2 chain( vec2 p )
{
    vec2 uv = p * 0.5 + 0.5;
    vec2 cw = vec2( 0.5 ) + 0.15 * vec2( sin( 0.017 * sceneTime ), cos( 0.013 * sceneTime ) );
    uv = tWarp( uv, 0.05 + 0.15 * gSpread, gT );
    uv = mirrorUV( uv );
    uv = tQuasi( uv, cw, 7.0, 5.0, gT * 1.5 );
    return uv;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  p = screenP();
    float kick = clamp( audioKick, 0.0, 1.0 );
    float swell = clamp( audioSwell, 0.0, 1.0 );
    float mode = clamp( audioMode, 0.0, 1.0 );
    gT = ( 0.03 + 0.06 * clamp( speedP, 0.0, 1.0 ) ) * sceneTime + 0.25 * audioAdvance;
    gSpread = clamp( audioSpread, 0.0, 1.0 );
    vec2  grad;
    vec3  ph = imgChain( p, 1.0 - 1.2 * clamp( detailP, 0.0, 1.0 ), grad );
    float m = luma( ph );
    vec3  photo = max( ( ph - m ) * 1.4 + m, 0.0 );
    // Relief: the chain's photo lit from a slowly circling light.
    float la = 0.1 * sceneTime;
    float relief = clamp( 0.5 + dot( grad, vec2( cos( la ), sin( la ) ) ) * 5.0, 0.0, 1.0 );
    vec3  relief_c = photo * ( 0.3 + 1.2 * relief ) + vec3( 1.0 ) * pow( relief, 6.0 ) * ( 0.1 + 0.3 * swell );
    // Glowing edges: gradient magnitude as neon in the photo's colour.
    float edge = smoothstep( 0.02, 0.25, length( grad ) );
    vec3  neon = glowColour( ph, p, hueP * 0.159 ) * edge * ( 1.2 + 1.2 * kick ) + photo * 0.06;
    // Isolines of the chain's luma: glowing contour lines.
    float xi = m * 12.0 - gT * 6.0; // the contour lines flow uphill (integrated, jump-free)
    float pxi = fwidth( xi ) + 1e-4;
    float iso = smoothstep( pxi * 1.5, 0.0, abs( fract( xi ) - 0.5 ) - 0.5 + pxi * 1.5 );
    vec3  iso_c = glowColour( ph, p, hueP * 0.159 ) * iso * ( 1.0 + kick ) + photo * 0.08;
    float st = clamp( styleP, 0.0, 1.0 ) * 3.0; // 0 photo, 1 relief, 2 edges, 3 isolines
    vec3  col = mix( photo, relief_c, smoothstep( 0.0, 1.0, st ) );
    col = mix( col, neon, smoothstep( 1.0, 2.0, st ) );
    col = mix( col, iso_c, smoothstep( 2.0, 3.0, st ) );
    col *= mix( vec3( 0.9, 0.97, 1.08 ), vec3( 1.08, 0.98, 0.9 ), mode );
    col += glowColour( ph, p, hueP * 0.159 ) * edge * kick * 0.3 * ( 1.0 - smoothstep( 1.0, 2.0, st ) );
    finish( col );
}
