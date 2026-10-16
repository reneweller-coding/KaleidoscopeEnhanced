#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file SuperfluidQuantumTurbulence.frag
 * @brief SUPERFLUID QUANTUM TURBULENCE: Microscopic quantized vortex filament tangle
 * in liquid Helium-4 (Gross-Pitaevskii condensate). Luminous vortex core singularities,
 * dynamic reconnections, phase-slip acoustic waves, and Kelvin wave ripples.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous quantized vortex advection & reconnection
 *   audioKick    -> flashes vortex reconnection singularities & acoustic shockwave burst
 *   audioCentroid-> modulates vortex core density & Kelvin wave frequency
 *   audioSubBass -> expands condensate density breathing
 *   audioChromaHue-> rotates the cryogenic superfluid spectrum
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
uniform float vortexCountP;
uniform float kelvinP;
uniform float glowP; ///< Glow / afterglow knob, 0..1.
uniform float hueP;  ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/// Compute quantized vortex phase field: sum_k arctan(y - y_k, x - x_k)
vec2 superfluidField( vec2 p, float t, float nVortices, out float minCoreDist )
{
    float total_phase = 0.0;
    minCoreDist = 1e5;
    int num_v = int( clamp( nVortices, 4.0, 8.0 ) );

    for ( int k = 0; k < 8; k++ )
    {
        if ( k >= num_v )
            break;
        float kf = float( k );
        // Vortex core orbital motion + reconnection oscillation
        float a_orbit = t * 0.4 * ( k % 2 == 0 ? 1.0 : -1.0 ) + kf * ( 6.2831853 / float( num_v ) );
        // Sub-bass swells the orbit RADIUS only, never the orbit angle: the
        // condensate cloud breathes wider on drones while each core keeps
        // travelling along its own continuous t-driven phase.
        float r_orbit = ( 0.45 + 0.2 * sin( t * 0.5 + kf * 1.5 ) ) * ( 1.0 + 0.35 * audioSubBass );
        vec2  v_core = vec2( cos( a_orbit ), sin( a_orbit ) ) * r_orbit;

        vec2  diff = p - v_core;
        float d = length( diff );
        minCoreDist = min( minCoreDist, d );

        // Quantized phase contribution (winding number +1 or -1)
        float winding = ( k % 2 == 0 ) ? 1.0 : -1.0;
        total_phase += atan( diff.y, diff.x ) * winding;
    }

    return vec2( cos( total_phase ), sin( total_phase ) );
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float n_v = ( vortexCountP > 1.0 ) ? vortexCountP : 6.0;
    float klv = ( kelvinP > 0.01 ) ? kelvinP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Superfluid quantum phase evaluation
    float min_core;
    vec2  phase_vec = superfluidField( uv, t, n_v, min_core );
    float quantum_phase = atan( phase_vec.y, phase_vec.x );

    // Kelvin wave ripples propagating on phase field
    float kelvin_wave = sin( quantum_phase * 4.0 * klv + min_core * 25.0 - t * 5.0 );

    // Sample slideshow texture warped by quantum circulation
    vec2 sample_uv = fract( uv * 0.5 + phase_vec * 0.08 + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Glowing quantized vortex cores (zero density singularities)
    float core_glow = exp( -min_core * ( 35.0 + 15.0 * audioCentroid ) ) * glw;

    // Phase interference fringe coloring
    vec3 pal_a = imgPalette( quantum_phase / 6.2831853 + t * 0.05 );
    vec3 pal_b = imgPalette( quantum_phase / 6.2831853 + 0.5 );
    vec3 superfluid_col = mix( pal_a, pal_b, 0.5 + 0.5 * kelvin_wave );

    superfluid_col = mix( superfluid_col, tex_col, 0.35 + 0.15 * audioValence );

    // Add glowing vortex cores and reconnection bursts
    vec3 core_tint = vec3( 1.2, 1.4, 1.9 ) * core_glow * ( 1.0 + 3.0 * audioKick );
    superfluid_col += core_tint;

    // Acoustic shockwave ripples
    float acoustic_wave = abs( sin( min_core * 35.0 - t * 8.0 ) );
    superfluid_col += imgPalette( 0.8 ) * smoothstep( 0.9, 1.0, acoustic_wave ) * 0.35 * audioKick;

    superfluid_col = pow( superfluid_col, vec3( 0.88 ) );
    fragColor = vec4( clamp( superfluid_col, 0.0, 1.0 ), 1.0 );
}
