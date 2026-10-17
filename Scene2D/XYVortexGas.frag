#version 330 core
/*****************************************************************************\
 *                              XYVortexGas.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  XY VORTEX GAS: the XY model -- a unit arrow in every cell, each turning toward its neighbours under thermal
 *  noise (Langevin dynamics).
 *
 *  Vortices and antivortices appear in pairs; below the Kosterlitz-Thouless point they find each other and
 *  annihilate, above it they unbind and roam as a gas.  Every arrow turns the photo locally: each pixel reads the
 *  photo a little way off in the arrow's direction, so the picture swirls around every vortex, once around
 *  clockwise or counter-clockwise.  Seen between crossed polarisers, every vortex sprouts four dark brushes (a
 *  Schlieren texture).  An endless, periodic field.
 *
 *  Audio Reactivity (structure, not only light):
 *    audioArousal    -> the temperature: excited music unbinds the vortex pairs (a busy gas), calm music lets
 *                       them annihilate (smooth, slow swirls)
 *    audioPhase      -> every arrow and the polarisers turn together (integrated): the brushes sweep
 *    audioOnset      -> a vortex pair set at a wandering place (structure)
 *    audioKick       -> the cores flash (light)
 *
 *  Knobs: tempP (the base temperature around the KT point), swirlP (how far the photo is displaced), scaleP (cell
 *  size), hueP.
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
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioOnset;     ///< Onset envelope (any instrument), 0..1.
uniform float audioArousal;   ///< Arousal of the music (energy, rhythm, brightness), 0..1.

uniform float tempP;  ///< Temp knob: the base temperature around the KT point, 0..1.
uniform float swirlP; ///< Swirl knob, 0..1.
uniform float scaleP; ///< Scale knob.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
// @state 320 180 120
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

/**  One Langevin step of the XY model for this cell (the state pass); the angle is kept as (cos, sin).
 *
 * @return
 *   cos theta, sin theta, vorticity glow, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if ( stateFrame < 0.5 )
    {
        float a = 6.2831853 * fbm( vec2( ip ) * 0.05 ) * 2.0;
        return vec4( cos( a ), sin( a ), 0.0, 1.0 );
    }
    vec4 c = stAt( ip );
    vec2 s = c.rg;
    vec2 sum = stAt( ip + ivec2( 1, 0 ) ).rg + stAt( ip - ivec2( 1, 0 ) ).rg + stAt( ip + ivec2( 0, 1 ) ).rg
               + stAt( ip - ivec2( 0, 1 ) ).rg;
    // torque: sum of sin(theta_j - theta_i) = cross(s, sum)
    float torque = s.x * sum.y - s.y * sum.x;
    float T = 0.89 * ( 0.8 + 0.5 * clamp( tempP, 0.0, 1.0 ) + 0.4 * ( clamp( audioArousal, 0.0, 1.0 ) - 0.5 ) );
    float dt = 0.1;
    // a Gaussian kick from two uniforms (Box-Muller)
    float gau = sqrt( -2.0 * log( max( stRand( 0 ), 1e-6 ) ) ) * cos( 6.2831853 * stRand( 1 ) );
    float dth = dt * torque + sqrt( 2.0 * T * dt ) * gau;
    float a = atan( s.y, s.x ) + dth;
    // an onset: a vortex-antivortex pair at a place drawn every 40 steps
    float slot = floor( stateFrame / 40.0 );
    vec2  at = vec2( hash11( slot * 1.7 + 0.2 ), hash11( slot * 3.9 + 0.8 ) ) * stateRes;
    vec2  d = vec2( ip ) - at;
    d -= stateRes * floor( d / stateRes + 0.5 );
    if ( mod( stateFrame, 40.0 ) < 1.0 && clamp( audioOnset, 0.0, 1.0 ) > 0.6 && length( d ) < 14.0 )
        a = atan( d.y, d.x - 4.0 ) - atan( d.y, d.x + 4.0 );
    // the plaquette's winding: where a vortex sits, the four angles around the corner add up to +-2 pi
    vec2  s1 = stAt( ip + ivec2( 1, 0 ) ).rg, s2 = stAt( ip + ivec2( 1, 1 ) ).rg, s3 = stAt( ip + ivec2( 0, 1 ) ).rg;
    float w = atan( s.x * s1.y - s.y * s1.x, dot( s, s1 ) ) + atan( s1.x * s2.y - s1.y * s2.x, dot( s1, s2 ) )
              + atan( s2.x * s3.y - s2.y * s3.x, dot( s2, s3 ) ) + atan( s3.x * s.y - s3.y * s.x, dot( s3, s ) );
    float vort = abs( w ) > 3.0 ? 1.0 : c.b * 0.9;
    return vec4( cos( a ), sin( a ), vort, 1.0 );
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
    float zoom = 0.4 + 0.45 * clamp( scaleP, 0.0, 1.0 );
    vec2  cc = stView( p, zoom );
    // five taps: the thermal jitter of single arrows averages out, the swirls stay
    vec4  s = 0.4 * stLin( cc )
              + 0.15
                    * ( stLin( cc + vec2( 1.5, 0.0 ) ) + stLin( cc - vec2( 1.5, 0.0 ) ) + stLin( cc + vec2( 0.0, 1.5 ) )
                        + stLin( cc - vec2( 0.0, 1.5 ) ) );
    float a = atan( s.g, s.r ) + 0.4 * audioPhase;
    float len = clamp( length( s.rg ), 0.0, 1.0 );
    // every arrow turns the photo: the pixel reads it a little way off in the arrow's direction
    float sw = 0.03 + 0.08 * clamp( swirlP, 0.0, 1.0 );
    vec2  dir = vec2( cos( a ), sin( a ) );
    vec2  uv = p * 0.7 + 0.5 + sw * dir + 0.005 * sceneTime * vec2( 0.7, 1.0 );
    // the photo smeared along the arrows (a short line integral): the field's swirls become visible as strokes
    vec3 photo = vec3( 0.0 );
    for ( int i = -3; i <= 3; ++i )
        photo += imgLod( uv + dir * float( i ) * 0.006, 0.6 );
    photo /= 7.0;
    // between crossed polarisers (a Schlieren texture): bright where the arrows stand diagonal to the polarisers,
    // dark along them -- every vortex sprouts four dark brushes that turn with the polarisers
    float pol = 0.3 * audioPhase + 0.02 * sceneTime;
    float sch = pow( sin( 2.0 * ( atan( s.g, s.r ) - pol ) ), 2.0 );
    vec3  tone = imgPalette( a / 6.2831853 + 0.03 * audioPhase );
    vec3  col = mix( photo, photo * tone * 1.6, 0.3 ) * ( 0.1 + 1.25 * sch ) * ( 0.4 + 0.6 * len );
    col += mix( tone, vec3( 1.0 ), 0.5 ) * s.b * ( 0.5 + 0.8 * clamp( audioKick, 0.0, 1.0 ) );
    finish( col );
}
