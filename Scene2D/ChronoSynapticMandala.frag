#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file ChronoSynapticMandala.frag
 * @brief CHRONO SYNAPTIC MANDALA: Multi-ring temporal echo kaleidoscope with
 * staggered time-delay rings, synaptic neural energy conduits, and high-frequency
 * harmonic mandala folding.
 *
 * Audio Reactivity:
 *   audioAdvance -> continuous rotation & temporal phase wave progression
 *   audioKick    -> inward-to-outward radial synaptic pulse & flash
 *   audioCentroid-> modulates neural conduit branching frequency
 *   audioSubBass -> expands temporal ring displacement amplitude
 *   audioChromaHue-> rotates the synaptic color palette
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

// Per-activation variety
uniform float speedP; ///< Speed knob, 0..1.
uniform float ringsP;
uniform float foldP; ///< Fold knob, 0..1.
uniform float glowP; ///< Glow / afterglow knob, 0..1.
uniform float hueP;  ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  The house palette: a colour of the photo on an arc that turns with the music's hue.
 *
 * @param t  Position on the palette arc, 0..1 for one turn. (in)
 *
 * @return
 *   The palette colour (RGB).
 **/
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float num_rings = ( ringsP > 1.0 ) ? ringsP : 8.0;
    float folds = ( foldP > 1.0 ) ? foldP : 12.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float r = length( uv );
    float a = atan( uv.y, uv.x );

    // Discrete temporal ring index
    float ring_coord = r * num_rings;
    float ring_idx = floor( ring_coord );
    float ring_frac = fract( ring_coord );

    // Staggered temporal phase per ring (chronological echo)
    float time_lag = ring_idx * ( 0.35 + 0.15 * audioFlux );
    float ring_time = audioAdvance * 0.25 * spd - time_lag;

    // Alternating counter-rotation per ring
    float dir = ( mod( ring_idx, 2.0 ) == 0.0 ) ? 1.0 : -1.0;
    float rot_a = a + ring_time * 0.5 * dir + 0.2 * sin( audioPhase + ring_idx );

    // Radial N-fold kaleidoscope mirror fold
    float seg = 3.14159265 / folds;
    rot_a = mod( rot_a + seg, 2.0 * seg ) - seg;
    rot_a = abs( rot_a );

    vec2 p_fold = vec2( cos( rot_a ), sin( rot_a ) ) * r;

    // Synaptic neural energy conduits (wavy pulses)
    // Only the amplitude is audio-driven -- the phase term stays untouched so
    // the ring echo cannot be remapped mid-flight by a sub-bass swell.
    float wave = sin( r * 28.0 - ring_time * 4.0 + ring_idx ) * ( 0.03 + 0.04 * audioKick )
                 * ( 1.0 + 0.6 * audioSubBass );
    p_fold += vec2( sin( p_fold.y * 15.0 ), cos( p_fold.x * 15.0 ) ) * wave;

    // Sampling image at chrono-delayed coordinates
    vec2 sample_uv = fract( p_fold * ( 0.8 + 0.2 * sin( ring_idx * 1.5 ) ) + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Inter-ring glowing boundary line
    float ring_edge = smoothstep( 0.08, 0.0, abs( ring_frac - 0.5 ) );
    float conduit_glow = exp( -abs( sin( rot_a * folds * 2.0 + ring_time ) ) * ( 15.0 + 10.0 * audioCentroid ) ) * glw;

    // Color mixing across temporal layers
    vec3 pal_a = imgPalette( ring_idx * 0.15 + ring_time * 0.05 );
    vec3 pal_b = imgPalette( ring_idx * 0.15 + 0.5 );
    vec3 mixed_col = mix( pal_a, pal_b, 0.5 + 0.5 * sin( r * 10.0 + ring_time ) );

    mixed_col = mix( mixed_col, tex_col, 0.4 + 0.2 * audioValence );

    // Add glowing conduits & pulse
    vec3 neon_tint = vec3( 1.3, 0.8, 1.6 ) * ( conduit_glow + ring_edge * 0.6 ) * ( 1.0 + 2.5 * audioKick );
    mixed_col += neon_tint;

    // Center lotus bloom flare -- kept small enough to read as an accent,
    // not a white disc swallowing the whole mandala centre.
    float center_flare = exp( -r * 6.0 ) * ( 0.35 + 0.5 * audioLevel );
    mixed_col += imgPalette( 0.8 ) * center_flare;

    // Contrast and vignette
    mixed_col = pow( mixed_col, vec3( 0.9 ) );
    float vig = 1.0 - smoothstep( 0.9, 1.45, r );
    mixed_col *= vig;

    fragColor = vec4( clamp( mixed_col, 0.0, 1.0 ), 1.0 );
}
