#version 330 core
/*****************************************************************************\
 *                          ChalkDustWipeSmear.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TRANSITION CHALK DUST WIPE SMEAR: a hand wipes chalk over the old scene in broad strokes and the new scene appears
 *  in the smears.
 *
 *  Broad slanting strokes of a sponge smear both scenes along their direction; each stroke leaves the new scene
 *  behind it and a dusting of pale chalk grains at its edge.
 *
 *    interpolation -> the progress of the fade (1 old scene, 0 new scene)
 *    audioSwell -> the breadth of the smear
 *
 *  Per-activation variety:
 *    strokeP float the number of strokes (0.5..2.2)
 *    smearP  float how far the smear reaches (0.5..2.0)
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

uniform float strokeP; ///< The number of strokes (0.5..2.2).
uniform float smearP;  ///< How far the smear reaches (0.5..2.0).
uniform float speedP;  ///< Speed knob: clock multiplier (0.5..2.0).
uniform float hueP;    ///< Hue knob (radians): turns the colours a little in the middle of the fade.

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
    float ang = 0.45;
    vec2  dir = vec2( cos( ang ), sin( ang ) );
    vec2  nor = vec2( -dir.y, dir.x );
    vec2  q = ( p - 0.5 ) * vec2( resolution.x / resolution.y, 1.0 );
    float across = dot( q, nor ) * ( 2.0 + 2.0 * gKA ) + 0.5;
    float along = dot( q, dir ) * 0.8 + 0.5;
    float stroke = floor( across );
    float h = hash21( vec2( stroke, 3.0 ) );
    float f = clamp( 0.6 * along + 0.4 * h, 0.0, 1.0 );
    float w = trThresh( f, d, 0.12 );
    float t = d * 1.24 - 0.12;
    float near = exp( -pow( ( f - t ) / 0.16, 2.0 ) );
    float len = 24.0 * gKB * near * ( 1.0 + 0.3 * audioSwell );
    vec2  step_ = dir * len / resolution;
    vec4  a = ( tAm( p - step_ ) + tAm( p ) + tAm( p + step_ ) ) / 3.0;
    vec4  b = ( tBm( p - step_ ) + tBm( p ) + tBm( p + step_ ) ) / 3.0;
    vec4  c = mix( a, b, w );
    float dust = step( 0.93, hash21( floor( p * resolution * 0.6 ) ) ) * near * 0.5;
    c.rgb = mix( c.rgb, vec3( 0.95, 0.95, 0.93 ), dust );
    return c;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    gKA = ( strokeP > 0.0 ) ? strokeP : 1.0;
    gKB = ( smearP > 0.0 ) ? smearP : 1.0;
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
