#version 330 core
/*****************************************************************************\
 *                              SPHVortexDance.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  SPH VORTEX DANCE: a whole frame of round drops swirling as one liquid -- no vessel, no splash, the flow periodic
 *  in both directions.
 *
 *  Eight point vortices, half turning one way and half the other, dance round each other by their own mutual
 *  induction (a state of eight cells, stepped on the state pass), and the drops ride the flow they make: each drop
 *  is traced back along the stream to where it came from and wears the photo's colour from there.  The drops stay
 *  round: their shape is measured in the frame, not where they came from; they fade in and out over a few seconds,
 *  so the liquid renews itself.
 *
 *  Audio Reactivity (structure, not only light):
 *    audioPhase      -> the vortices' strengths swell and ebb (integrated)
 *    audioRoughness  -> the viscosity: rough sound widens the vortex cores
 *    audioKick       -> the drops flash (light)
 *
 *  Knobs: dropP (the drops' density), speedP (the dance's pace), photoP (photo share), hueP.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
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
uniform float audioRoughness; ///< Roughness (dissonance) of the sound, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).

uniform float dropP;  ///< Drop knob: the drops' density, 0..1.
uniform float speedP; ///< Speed knob, 0..1.
uniform float photoP; ///< Photo knob: how much of the photo shows, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
// @state 8 1 60
uniform sampler2D texState;   ///< The scene's own field from the last step (EffectShader::stepState).
uniform int       statePass;  ///< 1 while the scene computes its next state, 0 while it draws the frame.
uniform float     stateFrame; ///< Steps of the scene's own field since the activation (0: seed it).
uniform vec2      stateRes;   ///< Size of the scene's own field in texels.
uniform float     stateFrac;  ///< Share of the next step of the scene's own field already due, 0..1 (motion between two
                              ///< steps).

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


// ---- the scene's own field (state pass) ----
/**  An integer hash (Wellons' lowbias32).
 *
 * @param x  The input. (in)
 *
 * @return
 *   A well mixed 32-bit value.
 **/
uint stHashU( uint x )
{
    x ^= x >> 16u;
    x *= 0x7feb352du;
    x ^= x >> 15u;
    x *= 0x846ca68bu;
    x ^= x >> 16u;
    return x;
}
/**  A random number for this cell and this step (state pass): a different one for every k.
 *
 * @param k  Which of the cell's random streams. (in)
 *
 * @return
 *   A pseudo-random number 0..1, the same for the same cell, step and k.
 **/
float stRand( int k )
{
    uvec2 c = uvec2( gl_FragCoord.xy );
    uint  h = stHashU( c.x + stHashU( c.y + stHashU( uint( stateFrame ) * 8u + uint( k ) ) ) );
    return float( h >> 8u ) / 16777216.0;
}
/**  A random number for this step, the same in every cell (state pass).
 *
 * @param k  Which of the step's random streams. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float stRandStep( int k )
{
    return float( stHashU( uint( stateFrame ) * 8u + uint( k ) + 0x9e3779b9u ) >> 8u ) / 16777216.0;
}
/**  A cell wrapped into the field (the field is a torus).
 *
 * @param ip  The cell, anywhere. (in)
 *
 * @return
 *   The same cell inside 0..stateRes-1.
 *
 * The wrap uses floor, not %: GLSL leaves % undefined for a negative operand, and NVIDIA's -1 % 200 read a cell in
 * the middle of the field (a rotor-router grew four discs from one source).
 **/
ivec2 stWrap( ivec2 ip )
{
    vec2 s = stateRes;
    return ivec2( vec2( ip ) - s * floor( ( vec2( ip ) + 0.5 ) / s ) );
}
/**  The field at a cell, wrapped around.
 *
 * @param ip  The cell. (in)
 *
 * @return
 *   The cell's state from the last step.
 **/
vec4 stAt( ivec2 ip )
{
    return texelFetch( texState, stWrap( ip ), 0 );
}
/**  This texel's cell in the state pass.
 *
 * @return
 *   The cell's integer coordinate.
 **/
ivec2 stCell()
{
    return ivec2( gl_FragCoord.xy );
}
/**  The field filtered at a coordinate in cells (linear, wrapped).
 *
 * @param c  The coordinate in cells (cell centres at .5). (in)
 *
 * @return
 *   The interpolated state.
 **/
vec4 stLin( vec2 c )
{
    return texture( texState, c / stateRes );
}
/**  The five-point Laplacian of the field at a cell.
 *
 * @param ip  The cell. (in)
 *
 * @return
 *   The neighbours' sum minus four times the cell.
 **/
vec4 stLap( ivec2 ip )
{
    return stAt( ip + ivec2( 1, 0 ) ) + stAt( ip - ivec2( 1, 0 ) ) + stAt( ip + ivec2( 0, 1 ) )
           + stAt( ip - ivec2( 0, 1 ) ) - 4.0 * stAt( ip );
}
/**  The nine-point Laplacian (isotropic: the diagonals weigh a quarter, the sides a half).
 *
 * @param ip  The cell. (in)
 *
 * @return
 *   The isotropic Laplacian of the field.
 **/
vec4 stLap9( ivec2 ip )
{
    vec4 s = stAt( ip + ivec2( 1, 0 ) ) + stAt( ip - ivec2( 1, 0 ) ) + stAt( ip + ivec2( 0, 1 ) )
             + stAt( ip - ivec2( 0, 1 ) );
    vec4 d = stAt( ip + ivec2( 1, 1 ) ) + stAt( ip - ivec2( 1, 1 ) ) + stAt( ip + ivec2( 1, -1 ) )
             + stAt( ip + ivec2( -1, 1 ) );
    return 0.5 * s + 0.25 * d - 3.0 * stAt( ip );
}
/**  Where the screen shows the field: a screen point (screenP()) mapped to field cells, the field's height filling
 * the screen's height divided by zoom; the field repeats beyond it.
 *
 * @param p     The screen point. (in)
 * @param zoom  How many field heights the screen shows. (in)
 *
 * @return
 *   The coordinate in cells.
 **/
vec2 stView( vec2 p, float zoom )
{
    return ( p * zoom + vec2( 0.5 * stateRes.x / stateRes.y, 0.5 ) ) * stateRes.y;
}
/**  The photo carried by a flow, one step (state pass).
 *
 * @param vel    The fluid's displacement at this cell this step, in cells. (in)
 * @param fresh  The share pulled back toward the plain photo this step. (in)
 *
 * @return
 *   The new displacement (rg) and the carried b, a.
 *
 * The field's rg hold the displacement D = uv - x / H of the photo coordinate each cell shows: periodic where uv itself
 * is not, so the torus has no seam.  Moving the fluid by vel gives D_new(x) = D(x - vel) - vel / H (traced back,
 * linearly filtered); fresh pulls it back toward the plain photo.  b and a travel along with the fluid.
 **/
vec4 stCarry( vec2 vel, float fresh )
{
    vec4 c = stLin( vec2( stCell() ) + 0.5 - vel );
    c.rg = ( c.rg - vel / stateRes.y ) * ( 1.0 - fresh );
    return c;
}
/**  The photo coordinate the frame shows at a field coordinate (a field carried by stCarry()).
 *
 * @param cc  The coordinate in cells. (in)
 *
 * @return
 *   The photo coordinate.
 **/
vec2 stUV( vec2 cc )
{
    return cc / stateRes.y + stLin( cc ).rg;
}
/**  The mip level for a carried photo: how much the map stretches one screen pixel (strands finer than a pixel are
 * averaged, not aliased).
 *
 * @param cc      The coordinate in cells. (in)
 * @param cellPx  Screen pixels per cell. (in)
 *
 * @return
 *   The mip level, 0..6.
 **/
float stLod( vec2 cc, float cellPx )
{
    vec2 d0 = stLin( cc ).rg;
    vec2 ux = stLin( cc + vec2( 1.0, 0.0 ) ).rg - d0 + vec2( 1.0 / stateRes.y, 0.0 );
    vec2 uy = stLin( cc + vec2( 0.0, 1.0 ) ).rg - d0 + vec2( 0.0, 1.0 / stateRes.y );
    return clamp( log2( max( max( length( ux ), length( uy ) ) * 1024.0 / max( cellPx, 1e-3 ), 1.0 ) ), 0.0, 6.0 );
}

const vec2 Domw = vec2( 1.7777778, 1.0 ); ///< the periodic domain: the frame itself (16:9, height 1)

/**  The shortest periodic offset in the domain.
 *
 * @param d  The raw offset. (in)
 *
 * @return
 *   The offset wrapped into half a domain.
 **/
vec2 wrapD( vec2 d )
{
    return d - Domw * floor( d / Domw + 0.5 );
}

/**  The velocity a set of point vortices induces at a point (Lamb-Oseen cores of radius a).
 *
 * @param x    The point. (in)
 * @param pos  The vortices' places. (in)
 * @param gam  Their strengths. (in)
 * @param a    The core radius. (in)
 *
 * @return
 *   The velocity.
 **/
vec2 vortexVel( vec2 x, vec2 pos[8], float gam[8], float a )
{
    vec2 u = vec2( 0.0 );
    for ( int j = 0; j < 8; ++j )
    {
        vec2  d = wrapD( x - pos[j] );
        float r2 = dot( d, d );
        u += gam[j] * vec2( -d.y, d.x ) / ( r2 + a * a ) * 0.1591549;
    }
    return u;
}

/**  The strength of vortex i: alternating signs, swelling with the music's phase.
 *
 * @param i  The vortex. (in)
 *
 * @return
 *   Its circulation.
 **/
float gammaOf( int i )
{
    float fi = float( i );
    return ( mod( fi, 2.0 ) < 0.5 ? 1.0 : -1.0 ) * ( 0.12 + 0.07 * hash11( fi * 3.7 ) )
           * ( 1.0 + 0.4 * sin( 0.03 * audioPhase + 1.7 * fi ) );
}

/**  The state pass: the vortices move with the velocity the others induce (their own core excluded).
 *
 * @return
 *   The vortex's place (xy), 0, 1.
 **/
vec4 stateStep()
{
    int i = int( gl_FragCoord.x );
    if ( stateFrame < 0.5 )
        return vec4( ( hash22( vec2( float( i ), 7.3 ) ) - 0.5 ) * Domw, 0.0, 1.0 );
    vec2  pos[8];
    float gam[8];
    for ( int j = 0; j < 8; ++j )
    {
        pos[j] = texelFetch( texState, ivec2( j, 0 ), 0 ).xy;
        gam[j] = j == i ? 0.0 : gammaOf( j );
    }
    float a = 0.05 + 0.05 * clamp( audioRoughness, 0.0, 1.0 );
    float dt = ( 0.6 + 1.2 * clamp( speedP, 0.0, 1.0 ) ) / 60.0;
    vec2  x = pos[i] + vortexVel( pos[i], pos, gam, a ) * dt;
    x = wrapD( x );
    return vec4( x, 0.0, 1.0 );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    if ( statePass == 1 )
    {
        fragColor = stateStep();
        return;
    }
    vec2  p = screenP();
    vec2  pos[8];
    float gam[8];
    for ( int j = 0; j < 8; ++j )
    {
        pos[j] = texelFetch( texState, ivec2( j, 0 ), 0 ).xy;
        gam[j] = gammaOf( j );
    }
    float a = 0.05 + 0.05 * clamp( audioRoughness, 0.0, 1.0 );
    float spacing = 0.03 - 0.016 * clamp( dropP, 0.0, 1.0 );
    float rad = spacing * 0.32;
    float life = 2.4, speed_k = ( 0.6 + 1.2 * clamp( speedP, 0.0, 1.0 ) );
    vec3  tone = imgPalette( 0.35 + 0.03 * audioPhase );
    vec3  col = imgLod( p * 0.3 + 0.5, 5.0 ) * 0.12;
    for ( int ph = 0; ph < 2; ++ph )
    {
        float f = fract( sceneTime / life + 0.5 * float( ph ) );
        float w = 1.0 - abs( 2.0 * f - 1.0 );
        float tau = f * life * speed_k;
        // trace back along the stream (and two neighbours, for the shape's stretch)
        vec2 x0 = p, xa = p + vec2( 0.004, 0.0 ), xb = p + vec2( 0.0, 0.004 );
        for ( int s = 0; s < 6; ++s )
        {
            float h = tau / 6.0;
            x0 -= vortexVel( x0, pos, gam, a ) * h;
            xa -= vortexVel( xa, pos, gam, a ) * h;
            xb -= vortexVel( xb, pos, gam, a ) * h;
        }
        mat2 J = mat2( xa - x0, xb - x0 ) / 0.004; // d(origin) / d(here)
        // the drops: a jittered lattice where they came from; their distance measured back here
        vec2  g = x0 / spacing + float( ph ) * 0.37;
        vec2  cell = floor( g );
        float best = 1e9;
        vec2  best_c = cell;
        for ( int jj = -1; jj <= 1; ++jj )
            for ( int ii = -1; ii <= 1; ++ii )
            {
                vec2  cc = cell + vec2( float( ii ), float( jj ) );
                vec2  c = cc + 0.5 + 0.35 * ( hash22( cc + float( ph ) * 13.1 ) - 0.5 );
                vec2  d_origin = ( g - c ) * spacing;
                float det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
                mat2  ji = mat2( J[1][1], -J[0][1], -J[1][0], J[0][0] ) / ( abs( det ) > 1e-4 ? det : 1e-4 );
                float d = length( ji * d_origin );
                if ( d < best )
                {
                    best = d;
                    best_c = cc;
                }
            }
        float drop = smoothstep( rad, rad * 0.55, best );
        vec2  orig = ( best_c + 0.5 ) * spacing - float( ph ) * 0.37 * spacing;
        vec3  photo = imgLod( orig * 0.55 + 0.5, 1.0 );
        vec3  c = mix( tone * 1.3, photo * 1.5, 0.5 + 0.45 * clamp( photoP, 0.0, 1.0 ) );
        c *= 0.75 + 0.5 * smoothstep( rad, 0.0, best ) + 0.4 * clamp( audioKick, 0.0, 1.0 );
        col = mix( col, c, drop * w );
    }
    finish( col * 1.35 );
}
