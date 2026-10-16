#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file AcousticBlackHoleEventHorizon.frag
 * @brief ACOUSTIC BLACK HOLE EVENT HORIZON: Sonic black hole (Dumb Hole) in a transsonic superfluid
 * Laval nozzle. Inflowing fluid accelerates past the local speed of sound (Mach > 1), trapping
 * acoustic phonons behind the acoustic event horizon and radiating analog Hawking radiation.
 *   audioAdvance -> accelerates fluid inflow velocity across transsonic Laval nozzle
 *   audioKick    -> flashes spontaneous quantum phonon pair emission (Hawking bursts)
 *   audioBass    -> deepens supersonic acoustic horizon gravitational shadow & ergoregion
 *   audioSwell   -> widens transsonic sonic horizon radius & analog Hawking temperature glow
 *   audioCentroid-> shifts acoustic Bogoliubov dispersion emission spectra
 *
 * Per-activation variety:
 *   machGradP    float fluid acceleration Mach gradient dM/dr    (0.8..2.5)
 *   horizonRadP  float acoustic event horizon sonic radius        (0.2..0.6)
 *   hawkingTempP float analog Hawking radiation brightness gain  (0.8..2.5)
 *   phononWaveP  float trapped sound wave ripple frequency       (8.0..24.0)
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

uniform float machGradP;    ///< Mach grad knob: fluid acceleration Mach gradient dM/dr, 0.8..2.5.
uniform float horizonRadP;  ///< Horizon rad knob: acoustic event horizon sonic radius, 0.2..0.6.
uniform float hawkingTempP; ///< Hawking temp knob: analog Hawking radiation brightness gain, 0.8..2.5.
uniform float phononWaveP;  ///< Phonon wave knob: trapped sound wave ripple frequency, 8..24.

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
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  col = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float g = dot( col, vec3( 0.333 ) );
    return mix( vec3( g ), col, 0.55 + 0.45 * audioValence );
}

/**  Tints a colour toward the house palette at t, keeping its brightness.
 *
 * @param c  The colour. (in)
 * @param t  Position on the palette, 0..1. (in)
 * @param k  Strength of the tint, 0..1. (in)
 *
 * @return
 *   The tinted colour.
 **/
vec3 palTint( vec3 c, float t, float k )
{
    vec3 tp = imgPalette( t );
    tp *= dot( c, vec3( 0.3333 ) ) / max( dot( tp, vec3( 0.3333 ) ), 1e-3 );
    return mix( c, tp, k );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  uv = ( gl_FragCoord.xy - 0.5 * resolution ) / min( resolution.x, resolution.y );
    float t = time * 0.4 + audioAdvance * 0.35;

    float r = length( uv );
    float theta = atan( uv.y, uv.x );

    // Inflowing fluid velocity field: v(r) ~ -1/r (accelerating inwards)
    float r_h = ( horizonRadP > 0.01 ? horizonRadP : 0.38 ) * ( 1.0 + 0.2 * audioBass );

    // Local Mach number: M(r) = (r_h / r)^gamma
    float gamma_mach = ( machGradP > 0.01 ? machGradP : 1.2 );
    float mach = pow( r_h / max( r, 0.01 ), gamma_mach );

    // Acoustic horizon located at Mach = 1 (where r = r_h)
    float sonic_horizon = exp( -abs( r - r_h ) * 25.0 );

    // Inflowing logarithmic spiral streamlines
    float stream_phase = theta * 4.0 + log( max( r, 0.02 ) ) * 8.0 - t * 3.0 + audioPhase;
    float streamlines = sin( stream_phase ) * 0.5 + 0.5;

    // Trapped supersonic phonon waves (inside horizon, r < r_h)
    float p_freq = ( phononWaveP > 0.01 ? phononWaveP : 16.0 );
    float trapped_phonons = sin( r * p_freq - t * 6.0 ) * smoothstep( r_h + 0.05, r_h - 0.05, r );

    // Analog Hawking radiation (thermal emission at horizon surface)
    float hawking_glow = exp( -abs( r - r_h ) * 8.0 ) * ( 1.0 + 3.5 * audioKick )
                         * ( hawkingTempP > 0.01 ? hawkingTempP : 1.3 );

    // Supersonic shadow (interior of horizon is pitch black / absorbing)
    float shadow = smoothstep( 0.05, r_h + 0.02, r );

    // Color palettes
    vec3 hawking_col = vec3( 1.0, 0.45, 0.15 );
    vec3 stream_col = vec3( 0.15, 0.75, 0.95 );

    vec3 col_hawking = palTint( hawking_col, r * 0.3 + audioCentroid, 0.28 );
    vec3 col_stream = palTint( stream_col, theta * 0.15 + audioCentroid, 0.22 );

    // Background photo sampling
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.25;

    vec3 col = bg * shadow;
    col += col_stream * streamlines * shadow * ( 0.8 + 0.4 * audioSwell );
    col += col_hawking * sonic_horizon * 2.2;
    col += vec3( 0.95, 0.95, 1.0 ) * hawking_glow * 2.0;
    col += col_stream * abs( trapped_phonons ) * 1.2;
    col += col_hawking * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    col *= 0.71; // measured luma 0.708: knee, not a linear trim
    col /= 1.0 + 0.45 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
