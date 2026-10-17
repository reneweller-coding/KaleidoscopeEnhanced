#version 330 core
/*****************************************************************************\
 *                              QuantumWavepacketSuperposition.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  QUANTUM WAVEPACKET SUPERPOSITION: Time-dependent 2D Schrödinger wavepacket superposition and collision.
 *
 *  High-frequency quantum interference fringes, complex phase rotation coloring, probability density nodes, and
 *  measurement collapse flashes.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous wavepacket propagation & quantum phase evolution
 *    audioKick    -> triggers localized quantum wavepacket collapse flash
 *    audioCentroid-> modulates de Broglie wavelength & fine interference fringe spacing
 *    audioSubBass -> expands wavepacket Gaussian envelope width
 *    audioChromaHue-> rotates the quantum complex phase spectrum
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
uniform float speedP;      ///< Speed knob, 0..1.
uniform float waveVectorP; ///< Wave vector knob, 0.7..1.5.
uniform float packetsP;    ///< Packets knob, 2..4.
uniform float glowP;       ///< Glow / afterglow knob, 0..1.
uniform float hueP;        ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  2D Gaussian wavepacket: psi = exp(-|x - x0|^2 / (2*sigma^2)) * exp(i * k * (x - x0) - i * omega * t)
 *
 * @param p      The point. (in)
 * @param pos0   Centre of the packet. (in)
 * @param kVec   Wave vector. (in)
 * @param sigma  Width of the packet. (in)
 * @param omega  Angular frequency. (in)
 * @param t      Time. (in)
 *
 * @return
 *   psi as a complex number.
 **/
vec2 wavepacket( vec2 p, vec2 pos0, vec2 kVec, float sigma, float omega, float t )
{
    vec2  diff = p - pos0;
    float env = exp( -dot( diff, diff ) / ( 2.0 * sigma * sigma ) );
    float phase = dot( kVec, diff ) - omega * t;
    return env * vec2( cos( phase ), sin( phase ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float k_mod = ( waveVectorP > 0.01 ) ? waveVectorP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.210 * spd + audioAdvance * 0.210 * spd;
    // Time base + music push: audioAdvance ALONE stands still in quiet
    // music (the reported "looks like a still picture" class).

    float sigma = 0.45 * ( 1.0 + 0.15 * audioSubBass );
    float k_mag = ( 18.0 + 10.0 * audioCentroid ) * k_mod;

    // 3 Colliding Gaussian wavepackets
    vec2 pos1 = vec2( sin( t * 0.5 ) * 0.4, cos( t * 0.4 ) * 0.3 );
    vec2 pos2 = vec2( cos( t * 0.6 + 2.0 ) * 0.4, sin( t * 0.5 + 2.0 ) * 0.3 );
    vec2 pos3 = vec2( sin( t * 0.7 + 4.0 ) * 0.4, cos( t * 0.6 + 4.0 ) * 0.3 );

    vec2 k1 = vec2( cos( t * 0.3 ), sin( t * 0.3 ) ) * k_mag;
    vec2 k2 = vec2( cos( t * 0.3 + 2.094 ), sin( t * 0.3 + 2.094 ) ) * k_mag;
    vec2 k3 = vec2( cos( t * 0.3 + 4.188 ), sin( t * 0.3 + 4.188 ) ) * k_mag;

    vec2 psi1 = wavepacket( uv, pos1, k1, sigma, 4.0, t );
    vec2 psi2 = wavepacket( uv, pos2, k2, sigma, 4.0, t );
    vec2 psi3 = wavepacket( uv, pos3, k3, sigma, 4.0, t );

    // Quantum superposition: Psi_total = psi1 + psi2 + psi3
    vec2 psi_total = psi1 + psi2 + psi3;

    // Probability density: |Psi|^2
    float prob_density = dot( psi_total, psi_total );

    // Complex quantum phase angle
    float quantum_phase = atan( psi_total.y, psi_total.x );

    // Sample distorted background photo
    vec2 sample_uv = fract( uv * 0.4 + psi_total * 0.08 + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Complex phase coloring
    vec3 pal_a = imgPalette( quantum_phase / 6.2831853 + t * 0.05 );
    vec3 pal_b = imgPalette( quantum_phase / 6.2831853 + 0.5 );
    vec3 wave_col = mix( pal_a, pal_b, 0.5 + 0.5 * sin( quantum_phase * 2.0 ) );

    wave_col = mix( wave_col, tex_col, 0.35 + 0.15 * audioValence );

    // Glowing quantum interference fringes & collapse burst
    float fringe_glow = prob_density * glw * ( 1.0 + 2.0 * audioKick );
    vec3  fringe_tint = vec3( 1.3, 1.1, 1.8 ) * fringe_glow;

    // Quantum wavepacket measurement collapse flash at wavepacket 1
    float collapse_flash = exp( -length( uv - pos1 ) * 8.0 ) * ( 1.0 + 3.0 * audioKick );
    vec3  final_col = wave_col * 0.4 + fringe_tint + vec3( 1.7, 1.6, 2.0 ) * collapse_flash * 0.6;

    final_col = pow( final_col, vec3( 0.88 ) );
    final_col *= 0.71; // measured luma 0.703: knee, not a linear trim
    final_col /= 1.0 + 0.45 * max( final_col.r, max( final_col.g, final_col.b ) );
    fragColor = vec4( clamp( final_col, 0.0, 1.0 ), 1.0 );
}
