#version 330 core
/*****************************************************************************\
 *                              SolitonWaveCollision.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TRANSITION SOLITON WAVE COLLISION: Non-linear Korteweg-de Vries (KdV) soliton transition.
 *
 *  Two non-linear solitary waves (sech^2 solitons) propagate toward each other, collide with non-linear phase
 *  shifts without dispersing, and leave the incoming scene behind.
 *
 *    interpolation -> sweeps soliton wave collision trajectory across viewport
 *    audioKick     -> flashes maximum non-linear wave crest superposition peak
 *    audioSwell    -> drives soliton wave amplitude & non-linear steepness
 *
 *  Per-activation variety:
 *    solitonP float soliton amplitude & velocity ratio    (0.5..2.2)
 *    widthP   float solitary wave sech^2 spatial width   (0.5..2.0)
 *    speedP   float animation speed multiplier           (0.5..2.0)
 *    hueP     float soliton wave crest hue offset        (0..6.28)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< slow loudness swell: the only envelope allowed to shape geometry
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float solitonP; ///< Soliton knob: soliton amplitude & velocity ratio, 0.5..2.2.
uniform float widthP;   ///< Width knob, 0..1.
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;     ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  Hyperbolic cosine.
 *
 * @param x  The input. (in)
 *
 * @return
 *   The value.
 **/
float cosh( float x )
{
    return 0.5 * ( exp( x ) + exp( -x ) );
}

/**  Hyperbolic secant (the input clamped against overflow).
 *
 * @param x  The input. (in)
 *
 * @return
 *   The value.
 **/
float sech( float x )
{
    return 1.0 / cosh( clamp( x, -15.0, 15.0 ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float slt = ( solitonP > 0.0 ) ? solitonP : 1.0;
    float wdt = ( widthP > 0.0 ) ? widthP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.45 * spd; // clock only: audioAdvance integrates transients and sped the motion up on every surge
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    // Soliton 1 (traveling right) & Soliton 2 (traveling left)
    float x1 = ( p.x - mix( -1.2, 1.2, t_prog ) ) * 8.0 / wdt;
    float x2 = ( p.x - mix( 1.2, -1.2, t_prog ) ) * 8.0 / wdt;

    float s1 = sech( x1 );
    float s2 = sech( x2 );
    float wave = ( s1 * s1 + s2 * s2 ) * slt;

    // Non-linear coordinate displacement
    vec2 sol_disp = vec2( wave * 0.04 * mid_transition * ( 1.0 + audioSwell * 0.7 ), 0.0 );

    vec4 c1 = texture( tex1, fract( uv + sol_disp ) );
    vec4 c0 = texture( tex0, fract( uv - sol_disp ) );

    float wipe_mask = smoothstep( -0.5, 0.5, x1 );
    vec4  col = mix( c0, c1, wipe_mask );

    // Glowing soliton wave crests
    float crest_glow = pow( wave, 2.0 ) * mid_transition;
    col.rgb += crest_glow * vec3( 0.2, 0.9, 1.0 ) * ( 1.5 + audioKick * 1.17 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
