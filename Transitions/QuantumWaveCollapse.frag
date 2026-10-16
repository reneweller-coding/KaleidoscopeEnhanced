#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file QuantumWaveCollapse.frag
 * @brief TRANSITION QUANTUM WAVE COLLAPSE: Quantum state superposition & wavefunction
 * collapse transition. Complex probability wavepackets interference patterns
 * collapse abruptly from superposition into the definite incoming state.
 *   interpolation -> sweeps quantum superposition to eigenstate measurement
 *   audioKick     -> triggers wavefunction collapse flash
 *
 * Per-activation variety:
 *   waveP     float matter wave frequency & interference density (0.5..2.2)
 *   collapseP float wavefunction collapse sharpness              (0.5..2.0)
 *   speedP    float quantum phase velocity multiplier            (0.5..2.0)
 *   hueP      float quantum probability phase hue offset         (0..6.28)
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

uniform float waveP;     ///< Wave knob.
uniform float collapseP; ///< Collapse knob: wavefunction collapse sharpness, 0.5..2.
uniform float speedP;    ///< Speed knob, 0..1.
uniform float hueP;      ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    float wav = ( waveP > 0.0 ) ? waveP : 1.0;
    float clp = ( collapseP > 0.0 ) ? collapseP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.0423 * spd; // clock rate measured down to about 1.2/255 of change per frame (PresetEditor
                                   // --transprofile); it spun many times that and read as frantic
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    // Dual-state wavefunction superposition: psi = psi_1 + psi_2.
    // audioBass undulates the de Broglie wavenumber and the slit separation
    // that sets the interference fringe spacing.  Both are spatial factors --
    // the -t*4.0 phase is untouched, so the wave drift rate stays
    // audio-independent -- and mid_transition returns both to their base values
    // at the fade endpoints, where phase_disp and the ring glow are zero.
    float de_broglie_k = 25.0 * wav; // constant: an envelope on a scale re-lays the whole pattern (speed
                                     // pass 14.09.2026)
    float slit_sep = 0.3; // constant: an envelope on a scale re-lays the whole pattern (speed pass 14.09.2026)
    float psi1 = sin( length( p - vec2( slit_sep, 0.0 ) ) * de_broglie_k - t * 4.0 );
    float psi2 = sin( length( p + vec2( slit_sep, 0.0 ) ) * de_broglie_k - t * 4.0 );

    // Probability density: |psi|^2 = (psi1 + psi2)^2
    float prob_density = ( psi1 + psi2 ) * 0.5;
    float interference = prob_density * prob_density;

    // Measurement collapse progression
    float collapse_threshold = smoothstep( 0.0, 1.0, pow( t_prog, clp ) );
    float measured_state = step( collapse_threshold, interference );

    // Quantum phase coordinate displacement
    vec2 phase_disp = vec2( psi1, psi2 ) * 0.03 * mid_transition;

    vec4 c1 = texture( tex1, fract( uv + phase_disp ) );
    vec4 c0 = texture( tex0, fract( uv - phase_disp ) );

    vec4 col = mix( c1, c0, t_prog );

    // Glowing quantum phase rings
    vec3 phase_color = 0.5 + 0.5 * cos( vec3( 0.0, 2.0, 4.0 ) + interference * 6.28 + audioPhase );
    col.rgb += interference * phase_color * mid_transition * ( 1.2 + audioKick * 1.0 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
