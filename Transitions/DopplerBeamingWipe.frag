#version 330 core
/*****************************************************************************\
 *                              DopplerBeamingWipe.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TRANSITION DOPPLER BEAMING WIPE: Relativistic Doppler shift & headlamp effect.
 *
 *  Approaching scene elements experience intense blue-shifting and relativistic beaming brightness amplification
 *  while receding elements red-shift away.
 *
 *    interpolation -> sweeps relativistic velocity beta = v/c across screen
 *    audioKick     -> flashes relativistic Lorentz headlamp focus
 *    audioSwell    -> widens Doppler spectral frequency shift
 *
 *  Per-activation variety:
 *    dopplerP float Doppler spectral shift magnitude (0.5..2.2)
 *    angleP   float relativistic boost angle         (0.5..2.0)
 *    speedP   float animation speed multiplier       (0.5..2.0)
 *    hueP     float Doppler chromatic hue offset     (0..6.28)
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

uniform float dopplerP; ///< Doppler knob: Doppler spectral shift magnitude (0.5..2.2).
uniform float angleP;   ///< Angle knob: relativistic boost angle, 0.5..2.
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

/**  2D rotation matrix.
 *
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The rotation matrix.
 **/
mat2 rot2D( float a )
{
    float c = cos( a ), s = sin( a );
    return mat2( c, -s, s, c );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float dpl = ( dopplerP > 0.0 ) ? dopplerP : 1.0;
    float ang = ( angleP > 0.0 ) ? angleP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.4 * spd; // clock only: audioAdvance integrates transients and sped the motion up on every surge
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    // Boost direction vector
    vec2  boost_dir = normalize( vec2( cos( t * 0.3 * ang ), sin( t * 0.3 * ang ) ) );
    float proj = dot( p, boost_dir );

    // Doppler factor delta = 1 / (gamma * (1 - beta * cos theta))
    float beta = mix( -0.8, 0.8, t_prog ) * dpl;
    float doppler_factor = 1.0 + beta * proj * 1.5;

    // Relativistic aberration displacement
    vec2 aberr_disp = boost_dir * beta * 0.05 * mid_transition;

    vec4 c1 = texture( tex1, fract( uv + aberr_disp ) );
    vec4 c0 = texture( tex0, fract( uv - aberr_disp ) );

    // Doppler color shift: Blue shift (approaching) vs Red shift (receding).
    // audioBass widens the spectral shift — it scales the tint AMOUNT only,
    // never beta itself (which sets the aberration).  mid_transition drives the
    // amount to exactly 0 at both fade endpoints, where the tint is vec3(1.0)
    // and the frame is untinted; the clamp keeps mix() from extrapolating past
    // the tint colour.
    float shift_amount = clamp( abs( beta ) * mid_transition * ( 1.0 + audioSwell * 0.7 ), 0.0, 1.0 );
    vec3  blue_tint = vec3( 0.3, 0.85, 1.2 );
    vec3  red_tint = vec3( 1.2, 0.4, 0.2 );
    vec3  doppler_tint = ( beta > 0.0 ) ? mix( vec3( 1.0 ), blue_tint, shift_amount )
                                        : mix( vec3( 1.0 ), red_tint, shift_amount );

    vec4 col = mix( c1, c0, t_prog );
    col.rgb *= doppler_tint;

    // Relativistic beaming headlamp beam
    float headlamp = exp( -abs( proj ) * 15.0 ) * mid_transition;
    col.rgb += headlamp * vec3( 1.0, 0.95, 0.85 ) * ( 1.0 + audioKick * 1.0 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
