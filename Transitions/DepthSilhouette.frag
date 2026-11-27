#version 330 core
/*****************************************************************************\
 *                            DepthSilhouette.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TRANSITION DEPTH SILHOUETTE: the new scene appears behind the old scene's near things, which darken into
 *  silhouettes against it and then dissolve.
 *
 *  Like a stage lit from behind: the new scene takes the old scene's far places first (the old scene's own depth),
 *  the old scene's near things that remain lose their light and stand as dark shapes in front of the new picture, and
 *  in the last part these shapes dissolve into it.  They never go black: at most about three quarters of their light
 *  goes.
 *  Without a depth on the old side (a 2D scene, a photo without a map) its brightness stands in for it: its bright
 *  parts stay longest and darken into the silhouettes.
 *
 *    interpolation -> the progress of the fade (1 old scene, 0 new scene)
 *    audioSwell -> a slight breath of the brightness in the middle (light only)
 *
 *  Per-activation variety:
 *    shadeP  float how dark the silhouettes get (0.5..2.0)
 *    softP   float how soft the silhouettes' edges are (0.5..2.0)
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

uniform float shadeP; ///< How dark the silhouettes get (0.5..2.0).
uniform float softP;  ///< How soft the silhouettes' edges are (0.5..2.0).
uniform float speedP; ///< Speed knob: clock multiplier (0.5..2.0).
uniform float hueP;   ///< Hue knob (radians): turns the colours a little in the middle of the fade.

uniform sampler2D texDepth0;     ///< Depth buffer of the outgoing scene (window depth; 1 where nothing was drawn).
uniform sampler2D texDepth1;     ///< Depth buffer of the incoming scene.
uniform vec2      depthValid;    ///< How real each depth is (x old, y new scene): 1 3D or photo with a map, 0 none.
uniform vec2      depthPhoto;    ///< 1 where the depth is a photo's (a 2D scene with the depth tag), 0 a 3D scene's.
uniform vec2      photoDepthWin; ///< Window depth of a photo's near end (x, depth 1) and far end (y, depth 0).
uniform vec2      nearFar;       ///< Near and far clip distances of the shared 3D projection.

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

/**  How far a window depth lies, 0 (near) .. 1 (far): a photo's depth between its two ends, a 3D scene's distance on
 * a log scale up to 60 units (the scale of Engine/DepthView.frag); the far plane is 1.
 *
 * @param z      The window depth, 0..1. (in)
 * @param photo  1 where the depth is a photo's, 0 a 3D scene's. (in)
 *
 * @return
 *   The farness, 0..1.
 **/
float trFar( float z, float photo )
{
    float n = max( nearFar.x, 1e-3 );
    float f = max( nearFar.y, n + 1.0 );
    float lin = ( 2.0 * n * f ) / max( f + n - ( z * 2.0 - 1.0 ) * ( f - n ), 1e-4 );
    float g3 = clamp( log( max( lin, n ) / n ) / log( 60.0 / n ), 0.0, 1.0 );
    float gp = clamp( ( z - photoDepthWin.x ) / max( photoDepthWin.y - photoDepthWin.x, 1e-6 ), 0.0, 1.0 );
    return mix( g3, gp, clamp( photo, 0.0, 1.0 ) );
}

/**  The brightness of a scene around a place, averaged over a ring of a fortieth of the picture's height: the calm
 * stand-in for a depth (no texture grain, no single pixel decides).
 *
 * @param t  The scene. (in)
 * @param p  The place, 0..1. (in)
 *
 * @return
 *   The luminance, 0..1.
 **/
float trLumaSoft( sampler2D t, vec2 p )
{
    vec2  r = vec2( resolution.y / resolution.x, 1.0 ) * 0.025;
    float s = 0.2 * trLuma( texture( t, p ).rgb );
    for ( int i = 0; i < 8; ++i )
    {
        float a = float( i ) * 0.785398;
        s += 0.1 * trLuma( texture( t, clamp( p + r * vec2( cos( a ), sin( a ) ), 0.0, 1.0 ) ).rgb );
    }
    return s;
}

/**  The depth order of one scene at a place: 0 nearest .. 1 farthest, as the share of the picture that lies nearer
 * (equalised, so a front swept over the order covers the picture evenly whatever the scene's depths are -- a soft
 * empirical distribution over a 5 x 5 grid of the same frame).
 *
 * @param col    The scene's colour. (in)
 * @param dep    The scene's depth buffer. (in)
 * @param p      The place, 0..1. (in)
 * @param valid  How real the depth is, 0..1 (depthValid). (in)
 * @param photo  1 where the depth is a photo's (depthPhoto). (in)
 *
 * @return
 *   The order, 0..1.
 *
 * From the real depth as far as the scene has one (`valid`); where it has none (a 2D scene, a photo without a map), or
 * where its depth is flat (a 3D scene drawn on one plane), from the brightness instead: bright counts as near.  The
 * depth itself is read over five taps 1.5 pixels apart, so a silhouette is a soft edge and not a stair of single
 * pixels.
 **/
float trOrder( sampler2D col, sampler2D dep, vec2 p, float valid, float photo )
{
    vec2  px = 1.5 / resolution;
    float fz = 0.2
               * ( trFar( texture( dep, p ).r, photo ) + trFar( texture( dep, p + vec2( px.x, 0.0 ) ).r, photo )
                   + trFar( texture( dep, p - vec2( px.x, 0.0 ) ).r, photo )
                   + trFar( texture( dep, p + vec2( 0.0, px.y ) ).r, photo )
                   + trFar( texture( dep, p - vec2( 0.0, px.y ) ).r, photo ) );
    float fl = 1.0 - trLumaSoft( col, p );
    float rz = 0.0;
    float rl = 0.0;
    float m = 0.0;
    float mm = 0.0;
    for ( int j = 0; j < 5; ++j )
        for ( int i = 0; i < 5; ++i )
        {
            vec2  q = ( vec2( float( i ), float( j ) ) + 0.5 ) / 5.0;
            float gz = trFar( texture( dep, q ).r, photo );
            float gl = 1.0 - trLuma( texture( col, q ).rgb );
            rz += smoothstep( gz - 0.05, gz + 0.05, fz );
            rl += smoothstep( gl - 0.1, gl + 0.1, fl );
            m += gz;
            mm += gz * gz;
        }
    m /= 25.0;
    float sd = sqrt( max( mm / 25.0 - m * m, 0.0 ) );
    float v = clamp( valid, 0.0, 1.0 ) * smoothstep( 0.02, 0.06, sd );
    return mix( rl, rz, v ) / 25.0;
}

/**  The depth order of the outgoing scene at a place (see trOrder()).
 *
 * @param p  The place, 0..1. (in)
 *
 * @return
 *   The order, 0 nearest .. 1 farthest.
 **/
float trOrderA( vec2 p )
{
    return trOrder( tex0, texDepth0, p, depthValid.x, depthPhoto.x );
}

/**  The depth order of the incoming scene at a place (see trOrder()).
 *
 * @param p  The place, 0..1. (in)
 *
 * @return
 *   The order, 0 nearest .. 1 farthest.
 **/
float trOrderB( vec2 p )
{
    return trOrder( tex1, texDepth1, p, depthValid.y, depthPhoto.y );
}

/**  Where both scenes are far, as one order: a near thing in either scene keeps the place near, so it is the nearer
 * of the two orders, made even again -- the minimum of two even orders lies near 0 more often, and 1 - (1 - min)^2
 * spreads it back over 0..1 (exactly for two independent orders).
 *
 * @param oA  The outgoing scene's order. (in)
 * @param oB  The incoming scene's order. (in)
 *
 * @return
 *   The joint order, 0 (near in either scene) .. 1 (far in both).
 **/
float trOrderBoth( float oA, float oB )
{
    float m = 1.0 - min( oA, oB );
    return 1.0 - m * m;
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
    float oA = trOrderA( p );
    // the new scene takes the old one's far places first, about two thirds of the picture ...
    float behind = trThresh( 1.0 - oA, 0.68 * smoothstep( 0.0, 0.6, d ), 0.08 + 0.05 * gKB );
    // ... the near things that remain lose their light ...
    vec4 a = tA( p );
    a.rgb *= 1.0 - ( 0.45 + 0.15 * gKA ) * smoothstep( 0.1, 0.55, d );
    // ... and dissolve in the last part
    float w = max( behind, smoothstep( 0.55, 1.0, d ) );
    return mix( a, tB( p ), w );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    gKA = ( shadeP > 0.0 ) ? shadeP : 1.0;
    gKB = ( softP > 0.0 ) ? softP : 1.0;
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
