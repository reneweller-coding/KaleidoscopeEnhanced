#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file FerroelectricDomainFlip.frag
 * @brief TRANSITION FERROELECTRIC DOMAIN FLIP: Perovskite crystal domain wall transition.
 * Spontaneous electric polarization domains (180° and 90° domain walls)
 * nucleate and propagate across crystal grains, flipping polarization and scenes.
 *   interpolation -> sweeps coercive electric field & polarization reversal
 *   audioKick     -> flashes domain wall Barkhausen jump pulses
 *   audioSwell    -> undulates piezoelectric crystal lattice strain
 *
 * Per-activation variety:
 *   domainP float ferroelectric domain grain density  (0.5..2.2)
 *   wallP   float domain wall boundary sharpness      (0.5..2.0)
 *   speedP  float animation speed multiplier          (0.5..2.0)
 *   hueP    float polarization domain hue offset      (0..6.28)
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
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

uniform float domainP; ///< Domain knob: ferroelectric domain grain density, 0.5..2.2.
uniform float wallP;   ///< Wall knob: domain wall boundary sharpness, 0.5..2.
uniform float speedP;  ///< Speed knob, 0..1.
uniform float hueP;    ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float dom = ( domainP > 0.0 ) ? domainP : 1.0;
    float wal = ( wallP > 0.0 ) ? wallP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.45 * spd; // clock only: audioAdvance integrates transients and sped the motion up on every surge
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    // 90-degree and 180-degree domain stripe patterns
    vec2  q = p * 18.0 * dom;
    float domain_pattern = sin( q.x + sin( q.y * 1.5 ) ) * cos( q.y + sin( q.x * 1.5 ) );

    // Coercive electric field sweep
    float e_field = mix( -1.2, 1.2, t_prog );
    float polarization = domain_pattern - e_field;

    // Piezoelectric shear strain displacement
    float sign_p = sign( polarization );
    vec2  piez_disp = vec2( sign_p * 0.02, -sign_p * 0.02 ) * mid_transition * ( 1.0 + audioSwell * 0.7 );

    vec4 c1 = texture( tex1, fract( uv + piez_disp ) );
    vec4 c0 = texture( tex0, fract( uv - piez_disp ) );

    float domain_wipe = smoothstep( -0.1 / wal, 0.1 / wal, polarization );
    vec4  col = mix( c0, c1, domain_wipe );

    // Glowing ferroelectric domain walls (bound charge accumulation)
    float wall_glow = exp( -abs( polarization ) * 20.0 * wal ) * mid_transition;
    col.rgb += wall_glow * vec3( 1.0, 0.4, 0.85 ) * ( 1.4 + audioKick * 1.0 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
