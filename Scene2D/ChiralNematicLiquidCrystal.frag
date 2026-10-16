#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file ChiralNematicLiquidCrystal.frag
 * @brief CHIRAL NEMATIC LIQUID CRYSTAL: Cholesteric liquid crystal texture with helical
 * molecular director field twisting, Bragg diffraction selective color reflection,
 * fingerprint texture disclinations, and thermo-chromatic audio waves.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous helical director pitch rotation & domain advection
 *   audioKick    -> flashes Bragg reflection selective wavelength peaks & defect lines
 *   audioCentroid-> modulates helical pitch length & fingerprint fringe spacing
 *   audioSubBass -> expands liquid crystal domain texture elasticity
 *   audioChromaHue-> steers the iridescent Bragg diffraction rainbow spectrum
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
uniform float pitchFreqP;
uniform float defectDensityP;
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

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float p_freq = ( pitchFreqP > 0.01 ) ? pitchFreqP : 1.0;
    float d_dens = ( defectDensityP > 0.01 ) ? defectDensityP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Helical director twisting phase field (fingerprint texture with disclinations)
    float base_pitch = ( 12.0 + 8.0 * audioCentroid ) * p_freq;

    // Topological defect dislocation line at center
    float a_defect = atan( uv.y, uv.x );
    float r_defect = length( uv );

    // GANZZAHLIGE Windung: ein nicht-ganzzahliger atan-Koeffizient springt
    // am Branch-Cut (die gemeldete unstetige Kante links der Mitte).
    float wind = max( 1.0, floor( 2.0 * d_dens + 0.5 ) );
    float helical_phase = r_defect * base_pitch + a_defect * wind - t * 3.0;

    // Second crossed helical director wave
    float cross_pitch = sin( uv.x * base_pitch * 0.8 + t * 2.0 ) * cos( uv.y * base_pitch * 0.8 - t * 2.0 );
    // Elastic distortion amplitude of the domain texture -- sub-bass lets the
    // crossed director wave deform the fingerprint pattern further, i.e. a
    // softer (more elastic) crystal, without touching the pitch itself.
    helical_phase += cross_pitch * 1.5 * ( 1.0 + 0.5 * audioSubBass );

    // Bragg diffraction selective color reflection formula: lambda = 2 * n * p * cos(theta)
    vec3 bragg_color = vec3(
                           sin( helical_phase ),
                           sin( helical_phase + 2.094 ),
                           sin( helical_phase + 4.188 ) )
                           * 0.5
                       + 0.5;

    // Disclination defect line glow
    float defect_line = abs( sin( helical_phase ) );
    float line_glow = smoothstep( 0.85, 1.0, defect_line ) * glw;

    // Sample distorted background photo
    vec2 sample_uv = fract( uv * 0.4 + vec2( sin( helical_phase ), cos( helical_phase ) ) * 0.04 + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Liquid crystal palette
    vec3 pal_base = imgPalette( r_defect * 0.5 + t * 0.05 );
    vec3 lc_base = mix( tex_col * 0.3, pal_base, 0.45 );

    // Add iridescent Bragg diffraction & defect flashes
    vec3 bragg_tint = bragg_color * ( 0.8 + 0.6 * defect_line ) * ( 1.0 + 2.5 * audioKick );
    vec3 defect_tint = vec3( 1.4, 1.3, 1.8 ) * line_glow * ( 1.0 + 2.0 * audioKick );

    vec3 final_col = lc_base + bragg_tint * 0.7 + defect_tint * 0.4;

    // Center topological disclination core bloom
    float core_bloom = exp( -r_defect * 6.0 ) * ( 0.8 + 1.8 * audioKick );
    final_col += imgPalette( 0.85 ) * core_bloom;

    final_col = pow( final_col, vec3( 0.88 ) );
    final_col /= 1.0 + 0.60 * max( final_col.r, max( final_col.g, final_col.b ) ); // over-bright tail (final review)
    fragColor = vec4( clamp( final_col, 0.0, 1.0 ), 1.0 );
}
