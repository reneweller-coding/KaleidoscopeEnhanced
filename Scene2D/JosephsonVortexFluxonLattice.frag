#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file JosephsonVortexFluxonLattice.frag
 * @brief JOSEPHSON VORTEX FLUXON LATTICE: Layered high-Tc superconductor stacked Josephson junctions.
 * Sine-Gordon magnetic fluxons (Josephson vortices) driven by relativistic Lorentz currents
 * race through insulator barriers, emitting coherent terahertz Cherenkov radiation fringes.
 *   audioAdvance -> accelerates fluxon velocity towards Swihart relativistic velocity
 *   audioKick    -> flashes Josephson fluxon collision & annihilation radiation bursts
 *   audioSwell   -> widens superconducting layer thickness & terahertz field luminance
 *   audioCentroid-> shifts terahertz Josephson emission color spectra
 *   audioHigh    -> excites high-frequency Cherenkov plasma wave ripple tails
 *
 * Per-activation variety:
 *   junctionCountP float number of stacked Josephson barriers     (3.0..8.0)
 *   fluxonDensityP float magnetic fluxon soliton packing density  (2.0..6.0)
 *   thzGlowP       float terahertz Cherenkov radiation brightness (0.8..2.5)
 *   swihartSpeedP  float Swihart velocity limit parameter        (0.6..2.2)
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
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float junctionCountP;
uniform float fluxonDensityP;
uniform float thzGlowP;
uniform float swihartSpeedP;

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  col = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float g = dot( col, vec3( 0.333 ) );
    return mix( vec3( g ), col, 0.55 + 0.45 * audioValence );
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2  uv = ( gl_FragCoord.xy - 0.5 * resolution ) / min( resolution.x, resolution.y );
    float t = time * 0.45 + audioAdvance * 0.4;

    // Stacked Josephson junction barriers along Y-axis
    float j_count = ( junctionCountP > 1.0 ? junctionCountP : 5.0 );
    float layer_y = fract( uv.y * j_count ) - 0.5;
    float layer_id = floor( uv.y * j_count );

    // Sine-Gordon fluxon soliton chain: phi(x, t) = 4 * arctan(exp((x - v*t) / gamma))
    float v_swihart = ( swihartSpeedP > 0.01 ? swihartSpeedP : 1.3 );
    float f_density = ( fluxonDensityP > 0.01 ? fluxonDensityP : 3.5 );

    // Alternating fluxon drift directions per junction layer
    float dir = mod( layer_id, 2.0 ) == 0.0 ? 1.0 : -1.0;
    float fluxon_phase = uv.x * f_density - t * 4.0 * v_swihart * dir + layer_id * 0.35;

    // Sine-Gordon 2*pi phase kink profile: dPhi/dx = 2 / cosh((x - vt)/lambda_J)
    float local_x = fract( fluxon_phase / 3.14159265 + 0.5 ) - 0.5;
    float fluxon_core = 1.0 / cosh( local_x * 12.0 );

    // Terahertz Cherenkov radiation wave tail
    float cherenkov = sin( uv.x * 22.0 - t * 8.0 * dir + audioPhase ) * exp( -abs( layer_y ) * 6.0 )
                      * ( 0.6 + 0.8 * audioHigh );

    // Barrier insulator interface line
    float barrier_line = exp( -abs( layer_y ) * 30.0 );

    // Superconducting order parameter phase
    float phi = 4.0 * atan( exp( local_x * 8.0 ) );

    // Radiation flash on kick
    float thz_flash = fluxon_core * ( 1.0 + 3.5 * audioKick ) * ( thzGlowP > 0.01 ? thzGlowP : 1.4 );

    // Palette assignment
    float pal_angle = fract( phi * 0.159 + layer_id * 0.1 + audioCentroid );
    vec3  col_fluxon = imgPalette( pal_angle );
    vec3  col_t_hz = imgPalette( fract( pal_angle + 0.5 ) ) * 2.0;

    // Background photo sampling
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.25;

    vec3 col = bg;
    col += col_fluxon * ( 0.5 + 0.5 * sin( phi ) ) * ( 0.8 + 0.4 * audioSwell );
    col += col_t_hz * fluxon_core * 1.8;
    col += vec3( 0.95, 0.95, 1.0 ) * thz_flash * 2.0;
    col += col_t_hz * abs( cherenkov ) * 1.2;
    col += vec3( 0.7, 0.85, 1.0 ) * barrier_line * 1.2;
    col += col_fluxon * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
