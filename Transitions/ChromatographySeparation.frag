#version 330 core
/*****************************************************************************\
 *                              ChromatographySeparation.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TRANSITION CHROMATOGRAPHY SEPARATION: Paper chromatography capillary transition.
 *
 *  A liquid solvent front climbs capillary paper fibers, separating the scene's pigments into distinct chromatic
 *  bands based on chemical retention factors (Rf), resolving into the incoming scene.
 *
 *    interpolation -> drives solvent front capillary migration across the frame
 *    audioKick     -> flashes sharp chromatographic pigment separation bands
 *    audioSwell    -> undulates capillary paper fiber texture
 *
 *  Per-activation variety:
 *    solventP float solvent front migration velocity (0.5..2.2)
 *    retardP  float retention factor (Rf) split width (0.5..2.0)
 *    speedP   float animation speed multiplier        (0.5..2.0)
 *    hueP     float pigment spectral hue offset       (0..6.28)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

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

uniform float solventP; ///< Solvent knob: solvent front migration velocity (0.5..2.2).
uniform float retardP;  ///< Retard knob: retention factor (Rf) split width (0.5..2.0).
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float slv = ( solventP > 0.0 ) ? solventP : 1.0;
    float rtd = ( retardP > 0.0 ) ? retardP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.4 * spd; // clock only: audioAdvance integrates transients and sped the motion up on every surge
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    // Solvent front moving upward
    float solvent_front = mix( -1.2, 1.2, t_prog ) * slv;
    float dist_to_solvent = p.y - solvent_front;

    // Different Rf factors for R, G, B channels
    float rf_r = 0.9 * rtd;
    float rf_g = 0.65 * rtd;
    float rf_b = 0.4 * rtd;

    // Capillary paper fibre texture: fine vertical striations in the sheet that
    // deflect the climbing pigment bands.  audioBass undulates how pronounced
    // the weave is.  The whole term is multiplied by mid_transition, so it is
    // exactly zero at both fade endpoints and cannot shift the solvent front,
    // the wipe mask, or the sampled UVs there.
    float fibre = sin( p.x * 85.0 + sin( p.y * 5.0 + t * 0.7 ) * 1.6 );
    float fibre_disp = fibre * 0.006 * ( 1.0 + audioSwell * 0.8 ) * mid_transition;

    float r_disp = max( 0.0, solvent_front * rf_r - p.y ) * 0.04 * mid_transition + fibre_disp;
    float g_disp = max( 0.0, solvent_front * rf_g - p.y ) * 0.04 * mid_transition + fibre_disp;
    float b_disp = max( 0.0, solvent_front * rf_b - p.y ) * 0.04 * mid_transition + fibre_disp;

    float r1 = texture( tex1, fract( uv + vec2( 0.0, r_disp ) ) ).r;
    float g1 = texture( tex1, fract( uv + vec2( 0.0, g_disp ) ) ).g;
    float b1 = texture( tex1, fract( uv + vec2( 0.0, b_disp ) ) ).b;
    vec3  c1 = vec3( r1, g1, b1 );

    float r0 = texture( tex0, fract( uv - vec2( 0.0, r_disp ) ) ).r;
    float g0 = texture( tex0, fract( uv - vec2( 0.0, g_disp ) ) ).g;
    float b0 = texture( tex0, fract( uv - vec2( 0.0, b_disp ) ) ).b;
    vec3  c0 = vec3( r0, g0, b0 );

    float wipe_mask = smoothstep( -0.05, 0.05, dist_to_solvent );
    vec3  col = mix( c0, c1, wipe_mask );

    // Solvent meniscus line glow
    float meniscus = exp( -abs( dist_to_solvent ) * 25.0 ) * mid_transition;
    col += meniscus * vec3( 0.3, 0.85, 1.0 ) * ( 1.3 + audioKick * 1.0 );

    if ( audioChromaHue != 0.0 )
        col = hueRot( col, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col = hueRot( col, hue * mid_transition );

    fragColor = vec4( col, 1.0 );
}
