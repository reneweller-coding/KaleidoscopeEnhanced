#version 330 core
/*****************************************************************************\
 *                              LogarithmicSpiral.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TRANSITION LOGARITHMIC SPIRAL: Equiangular logarithmic spiral vortex (r = a * exp(b * theta)).
 *
 *  The outgoing scene winds inward along spiral streamlines while the incoming scene unwinds outwards from the
 *  center.
 *
 *    interpolation -> controls spiral vortex winding angle & depth
 *    audioKick     -> flashes spiral arm streamline highlights
 *
 *  Per-activation variety:
 *    spiralP float spiral winding tightness (0.5..2.2)
 *    armsP   float spiral arm count         (0.5..2.0)
 *    speedP  float animation speed          (0.5..2.0)
 *    hueP    float spiral hue offset        (0..6.28)
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

uniform float spiralP; ///< Spiral knob: spiral winding tightness (0.5..2.2).
uniform float armsP;   ///< Arms knob: spiral arm count, 0.5..2.
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
    float spr = ( spiralP > 0.0 ) ? spiralP : 1.0;
    float arm = ( armsP > 0.0 ) ? armsP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.1455 * spd; // clock rate measured down to about 1.2/255 of change per frame (PresetEditor
                                   // --transprofile); it spun many times that and read as frantic
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    float r = length( p );
    float angle = atan( p.y, p.x );

    // Logarithmic spiral mapping: log(r) vs theta.  audioBass undulates the
    // spiral pitch via the log(r) coefficient — a spatial term, so the arm
    // rotation rate stays audio-independent — and, below, the radial breathing
    // radius.  Both ride on mid_transition and are therefore the un-driven
    // values at t_prog 0 and 1, where `blend` self-clamps to 0/1 anyway.
    float pitch_mod = 1.0; // constant: an envelope on a scale re-lays the whole pattern (speed pass 14.09.2026)
    float log_r = log( max( r, 0.001 ) );
    float spiral_angle = angle * arm * 2.0 - log_r * 3.0 * spr * pitch_mod + t_prog * 6.2831853;

    // Spiral swirl displacement
    float breathe_r = 0.8; // constant: an envelope on a scale re-lays the whole pattern (speed pass 14.09.2026)
    float swirl = ( 1.0 - smoothstep( 0.0, breathe_r, r ) ) * mid_transition * 3.14159265;
    vec2  p_warped = rot2D( swirl ) * p;
    vec2  uv_warped = ( p_warped * resolution.y + 0.5 * resolution ) / resolution;

    // Spiral wave mask for staggered wiping
    float spiral_wave = sin( spiral_angle + t * 2.0 );
    float spiral_mask = smoothstep( -0.4, 0.4, spiral_wave );

    float blend = clamp( t_prog * 1.5 - ( 1.0 - spiral_mask ) * 0.5, 0.0, 1.0 );

    vec4 c1 = texture( tex1, fract( mix( uv, uv_warped, mid_transition ) ) );
    vec4 c0 = texture( tex0, fract( mix( uv_warped, uv, 1.0 - mid_transition ) ) );

    vec4 col = mix( c1, c0, blend );

    // Glowing spiral arm highlights
    float arm_glow = exp( -abs( spiral_wave ) * 12.0 ) * mid_transition;
    col.rgb += arm_glow * vec3( 1.0, 0.85, 0.3 ) * ( 1.2 + audioKick * 1.0 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
