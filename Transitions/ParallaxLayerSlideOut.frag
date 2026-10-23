#version 330 core
/*****************************************************************************\
 *                         ParallaxLayerSlideOut.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TRANSITION PARALLAX LAYER SLIDE OUT: the old scene slides outwards in layers by brightness, the new one slides in
 *  with its own parallax.
 *
 *  Each scene is read as layers by its brightness (light in front); the old scene's layers fly outwards from the
 *  centre at different speeds and the new scene's layers settle from outside, so the picture has depth in the middle
 *  of the fade.
 *
 *    interpolation -> the progress of the fade (1 old scene, 0 new scene)
 *    audioSwell -> a slight breath of the brightness in the middle (light only)
 *
 *  Per-activation variety:
 *    depthP  float the depth between the layers (0.5..2.2)
 *    reachP  float how far the layers travel (0.5..2.0)
 *    speedP  float clock multiplier (0.5..2.0)
 *    hueP    float hue offset in the middle of the fade (0..6.28)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The outgoing scene.
uniform sampler2D tex1;          ///< The incoming scene (cross-faded in by interpolation).
uniform float     interpolation; ///< Progress of the fade: 1 = tex0 (old scene), 0 = tex1 (new scene).

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< Slow loudness swell: the only envelope allowed to shape geometry.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay): light only.
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioSpread;    ///< Spectral spread (width of the sound), 0..1.
uniform float audioRolloff;   ///< Spectral rolloff (where the sound's energy ends), 0..1.
uniform float audioPhrasePos; ///< Position inside the musical phrase, 0..1 (periodic).
uniform float audioStereo;    ///< Stereo width of the sound, 0 mono .. 1 wide.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float depthP; ///< The depth between the layers (0.5..2.2).
uniform float reachP; ///< How far the layers travel (0.5..2.0).
uniform float speedP; ///< Speed knob: clock multiplier (0.5..2.0).
uniform float hueP;   ///< Hue knob (radians): turns the colours a little in the middle of the fade.

const float Pi = 3.14159265358979; ///< Pi.

float gKA;  ///< The value of the first knob (1 when it is unset).
float gKB;  ///< The value of the second knob (1 when it is unset).
float gSpd; ///< The value of the speed knob (1 when it is unset).

/**  The outgoing scene at a place.
 *
 * @param p  The place, 0..1. (in)
 *
 * @return
 *   The colour of tex0.
 **/
vec4 tA( vec2 p )
{
    return texture( tex0, p );
}

/**  The incoming scene at a place.
 *
 * @param p  The place, 0..1. (in)
 *
 * @return
 *   The colour of tex1.
 **/
vec4 tB( vec2 p )
{
    return texture( tex1, p );
}

/**  A place folded back into the frame by mirroring, so that a warp never reads outside.
 *
 * @param p  The place. (in)
 *
 * @return
 *   The place inside 0..1.
 **/
vec2 uvMirror( vec2 p )
{
    return 1.0 - abs( fract( p * 0.5 ) * 2.0 - 1.0 );
}

/**  The outgoing scene at a place that may lie outside the frame (mirrored back).
 *
 * @param p  The place. (in)
 *
 * @return
 *   The colour of tex0.
 **/
vec4 tAm( vec2 p )
{
    return texture( tex0, uvMirror( p ) );
}

/**  The incoming scene at a place that may lie outside the frame (mirrored back).
 *
 * @param p  The place. (in)
 *
 * @return
 *   The colour of tex1.
 **/
vec4 tBm( vec2 p )
{
    return texture( tex1, uvMirror( p ) );
}

/**  Rotates a colour's hue by an angle (about the grey axis).
 *
 * @param c  The colour. (in)
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The colour with its hue turned.
 **/
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/**  Luminance of a colour (Rec. 709 weights).
 *
 * @param c  The colour. (in)
 *
 * @return
 *   The luminance.
 **/
float trLuma( vec3 c )
{
    return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
}

/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The number.
 **/
float hash21( vec2 p )
{
    p = fract( p * vec2( 443.34, 755.21 ) );
    p += dot( p, p + 54.32 );
    return fract( p.x * p.y );
}

/**  Two pseudo-random numbers 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The numbers.
 **/
vec2 hash22( vec2 p )
{
    return vec2( hash21( p ), hash21( p + vec2( 17.17, 31.31 ) ) );
}

/**  Smooth value noise.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, 0..1.
 **/
float noise2( vec2 p )
{
    vec2 i = floor( p );
    vec2 f = fract( p );
    vec2 u = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hash21( i ), hash21( i + vec2( 1.0, 0.0 ) ), u.x ),
                mix( hash21( i + vec2( 0.0, 1.0 ) ), hash21( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}

/**  Fractal noise of four octaves.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, about 0..1.
 **/
float fbm2( vec2 p )
{
    float s = 0.0;
    float a = 0.5;
    for ( int i = 0; i < 4; ++i )
    {
        s += a * noise2( p );
        p = p * 2.03 + vec2( 11.7, 5.3 );
        a *= 0.5;
    }
    return s / 0.9375;
}

/**  A soft threshold wipe: a pixel with the order value f has switched at progress d, and every pixel has switched at
 * d = 1 and none at d = 0, whatever the order values are.
 *
 * @param f  The pixel's order value, 0..1: pixels with small values switch first. (in)
 * @param d  The progress, 0..1. (in)
 * @param s  The softness of the edge, in order units. (in)
 *
 * @return
 *   The weight of the new scene, 0..1.
 **/
float trThresh( float f, float d, float s )
{
    float t = d * ( 1.0 + 2.0 * s ) - s;
    return smoothstep( f - s, f + s, t );
}

/**  The mean brightness of the outgoing scene, estimated from nine fixed points (to centre a brightness order on the
 * picture).
 *
 * @return
 *   The mean luminance, 0..1.
 **/
float trMeanLumaA()
{
    float s = 0.0;
    for ( int j = 0; j < 3; ++j )
        for ( int i = 0; i < 3; ++i )
            s += trLuma( texture( tex0, ( vec2( float( i ), float( j ) ) + 0.5 ) / 3.0 ).rgb );
    return s / 9.0;
}

/**  The envelope of the middle of the transition: 0 at both ends, 1 in the middle.
 *
 * @param d  The progress, 0..1. (in)
 *
 * @return
 *   The envelope.
 **/
float trMid( float d )
{
    return sin( Pi * d );
}

/**  The clock of the transition: seconds, scaled so that the clock alone changes the picture by about 1/255 a frame.
 *
 * @return
 *   The clock.
 **/
float trClock()
{
    return time * 0.1 * gSpd + 0.02 * audioAdvance;
}

/**  A blurred reading of the outgoing scene (nine taps on a disc).
 *
 * @param p  The place. (in)
 * @param r  The radius in pixels. (in)
 *
 * @return
 *   The colour.
 **/
vec4 trBlurA( vec2 p, float r )
{
    vec2 px = r / resolution;
    vec4 s = texture( tex0, p ) * 0.2;
    s += 0.1
         * ( texture( tex0, p + vec2( px.x, 0.0 ) ) + texture( tex0, p - vec2( px.x, 0.0 ) )
             + texture( tex0, p + vec2( 0.0, px.y ) ) + texture( tex0, p - vec2( 0.0, px.y ) ) );
    s += 0.1
         * ( texture( tex0, p + px * 0.7071 ) + texture( tex0, p - px * 0.7071 )
             + texture( tex0, p + px * vec2( 0.7071, -0.7071 ) ) + texture( tex0, p - px * vec2( 0.7071, -0.7071 ) ) );
    return s;
}

/**  A blurred reading of the incoming scene (nine taps on a disc).
 *
 * @param p  The place. (in)
 * @param r  The radius in pixels. (in)
 *
 * @return
 *   The colour.
 **/
vec4 trBlurB( vec2 p, float r )
{
    vec2 px = r / resolution;
    vec4 s = texture( tex1, p ) * 0.2;
    s += 0.1
         * ( texture( tex1, p + vec2( px.x, 0.0 ) ) + texture( tex1, p - vec2( px.x, 0.0 ) )
             + texture( tex1, p + vec2( 0.0, px.y ) ) + texture( tex1, p - vec2( 0.0, px.y ) ) );
    s += 0.1
         * ( texture( tex1, p + px * 0.7071 ) + texture( tex1, p - px * 0.7071 )
             + texture( tex1, p + px * vec2( 0.7071, -0.7071 ) ) + texture( tex1, p - px * vec2( 0.7071, -0.7071 ) ) );
    return s;
}

/**  The picture at a place and progress.
 *
 * @param p  The place, 0..1. (in)
 * @param d  The progress, 0 (old scene) .. 1 (new scene). (in)
 *
 * @return
 *   The colour.
 **/
vec4 trans( vec2 p, float d )
{
    vec2  dir = p - 0.5;
    vec4  a0 = tA( p );
    vec4  b0 = tB( p );
    float la = trLuma( a0.rgb );
    float lb = trLuma( b0.rgb );
    float k = 0.28 * gKA * gKB * ( 1.0 + 0.3 * audioSwell );
    vec4  a = tAm( 0.5 + dir / ( 1.0 + k * ( 0.3 + la ) * smoothstep( 0.0, 0.7, d ) ) );
    vec4  b = tBm( 0.5 + dir / ( 1.0 - 0.5 * k * ( 0.3 + lb ) * ( 1.0 - smoothstep( 0.3, 1.0, d ) ) ) );
    return mix( a, b, smoothstep( 0.35, 0.65, d ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    gKA = ( depthP > 0.0 ) ? depthP : 1.0;
    gKB = ( reachP > 0.0 ) ? reachP : 1.0;
    gSpd = ( speedP > 0.0 ) ? speedP : 1.0;
    vec2  p = gl_FragCoord.xy / resolution;
    float d = clamp( 1.0 - interpolation, 0.0, 1.0 );
    if ( d <= 0.0 )
    {
        fragColor = tA( p );
        return;
    }
    if ( d >= 1.0 )
    {
        fragColor = tB( p );
        return;
    }
    vec4 col = trans( p, d );
    col.rgb *= 1.0 + 0.05 * audioSwell * trMid( d );
    if ( hueP > 0.001 )
        col.rgb = hueRot( col.rgb, hueP * 0.0 * trMid( d ) );
    fragColor = col;
}
