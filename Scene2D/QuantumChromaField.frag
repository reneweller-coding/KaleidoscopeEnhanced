#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file QuantumChromaField.frag
 * @brief QUANTUM CHROMA FIELD: Multi-layered complex domain quantum wave interference
 * and Riemann surface vortex field. High-contrast holographic diffraction
 * fringes, phase singularities, quantum spin vortices, and dynamic
 * chromatic dispersion covering 100% of the screen.
 *   audioPhase   -> spins quantum phase vortices
 *   audioSubBass -> expands nodal interference envelope
 *   audioKick    -> excites high-energy quantum state collapse & flash
 *   audioFlux    -> modulates interference density & fine wave harmonics
 *
 * Per-activation variety:
 *   waveFreqP  float nodal wave frequency multiplier   (0.5..2.2)
 *   phaseRotP  float quantum phase spin speed          (0.4..1.8)
 *   glowP      float iridescent fringe intensity       (0.5..2.0)
 *   hueP       float color spectrum offset             (0..6.28)
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;    ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;  ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                             ///< backwards).
uniform float audioSwell;    ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;    ///< Overall loudness, 0..1.
uniform float audioKick;     ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid; ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;  ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;  ///< Sub-bass band level, 0..1.
uniform float audioBass;     ///< Bass band level, 0..1.
uniform float audioMid;      ///< Mid band level, 0..1.
uniform float audioHigh;     ///< High band level, 0..1.
uniform float audioFlux;     ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float waveFreqP; ///< Wave freq knob: nodal wave frequency multiplier, 0.5..2.2.
uniform float phaseRotP; ///< Phase rot knob: quantum phase spin speed, 0.4..1.8.
uniform float glowP;     ///< Glow / afterglow knob, 0..1.
uniform float hueP;      ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  Complex multiplication
 *
 * @param a  One complex number. (in)
 * @param b  The other. (in)
 *
 * @return
 *   The product a b.
 **/
vec2 cMul( vec2 a, vec2 b )
{
    return vec2( a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x );
}

/**  Complex division
 *
 * @param a  The numerator. (in)
 * @param b  The denominator. (in)
 *
 * @return
 *   The quotient a / b.
 **/
vec2 cDiv( vec2 a, vec2 b )
{
    float d = dot( b, b );
    return vec2( dot( a, b ), a.y * b.x - a.x * b.y ) / max( d, 1e-5 );
}

/**  Iridescent spectral palette
 *
 * @param t  Position in the spectrum, 0..1. (in)
 *
 * @return
 *   The spectral colour (RGB).
 **/
vec3 spectral( float t )
{
    vec3 a = vec3( 0.5, 0.5, 0.5 );
    vec3 b = vec3( 0.5, 0.5, 0.5 );
    vec3 c = vec3( 1.0, 1.0, 1.0 );
    vec3 d = vec3( 0.00, 0.33, 0.67 );
    return a + b * cos( 6.28318 * ( c * t + d ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float freq = ( waveFreqP > 0.0 ) ? waveFreqP : 1.0;
    float p_spd = ( phaseRotP > 0.0 ) ? phaseRotP : 1.0;
    float glw = ( glowP > 0.0 ) ? glowP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    // Center zoom & multi-scale rotation
    float t = time * 0.2 * p_spd + audioAdvance * 0.15;
    mat2  rot = mat2( cos( t * 0.3 ), -sin( t * 0.3 ), sin( t * 0.3 ), cos( t * 0.3 ) );
    vec2  z = rot * uv * ( 2.8 + 0.6 * sin( time * 0.1 ) - audioSwell * 0.4 );

    // Multi-pole quantum vortex singularities
    int   poles = 5;
    vec2  w = vec2( 0.0 );
    float field_amp = 0.0;

    for ( int k = 0; k < poles; ++k )
    {
        float theta = float( k ) * ( 6.2831853 / float( poles ) ) + t * 0.5;
        float r = 0.9 + 0.3 * sin( t * 1.2 + float( k ) * 1.5 ) + 0.2 * audioSubBass;
        vec2  pole = vec2( cos( theta ), sin( theta ) ) * r;

        vec2  delta = z - pole;
        float d2 = dot( delta, delta ) + 0.04;

        // Quantum vortex phase: z / (z - pole)
        vec2 term = cDiv( z, delta );
        w += term;

        // Wave amplitude accumulation
        field_amp += sin( sqrt( d2 ) * 14.0 * freq - t * 3.0 - audioPhase * 4.0 ) / sqrt( d2 );
    }

    // Riemann surface phase angle & modulus
    float phase = atan( w.y, w.x );
    float mag = length( w );
    float log_mag = log( mag + 1.0 );

    // Interference grid fringes
    float grid1 = sin( phase * 4.0 + log_mag * 8.0 * freq + t * 2.0 );
    float grid2 = cos( phase * 6.0 - log_mag * 10.0 * freq - audioAdvance * 2.0 );
    float interference = ( grid1 * grid2 ) * 0.5 + 0.5;

    // Optical chromatic dispersion mapping
    float c_r = sin( phase + log_mag * 5.0 + 0.00 + audioKick * 1.2 );
    float c_g = sin( phase + log_mag * 5.0 + 2.09 );
    float c_b = sin( phase + log_mag * 5.0 + 4.18 + audioSubBass * 1.0 );
    vec3  wave_color = vec3( c_r, c_g, c_b ) * 0.5 + 0.5;

    // High-energy diffraction spectral rings
    float rings = fract( mag * 0.35 * freq + field_amp * 0.08 + audioFlux * 0.3 );
    vec3  fringe_col = spectral( rings + phase * 0.159 + time * 0.1 );

    // Sample active photo with holographic quantum distortion
    vec2 photo_uv = st + vec2( c_r - c_b, c_g - c_r ) * 0.04 * ( 1.0 + audioKick * 0.8 );
    vec3 photo = img( clamp( photo_uv, 0.0, 1.0 ) );

    // Combine quantum layers
    vec3 col = mix( wave_color, fringe_col, interference );
    col = col * ( 0.8 + 0.8 * interference ) + fringe_col * pow( interference, 4.0 ) * glw * 1.5;
    col += photo * ( 0.3 + 0.4 * audioLevel );

    // Core state collapse flash on heavy beat
    if ( audioKick > 0.6 )
    {
        float core_flash = exp( -length( z ) * 3.0 ) * audioKick * 2.0;
        col += vec3( 0.9, 0.95, 1.0 ) * core_flash;
    }

    // High-frequency quantum sparkle
    float sparkle = sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) + time * 20.0 );
    if ( sparkle > 0.96 )
    {
        col += vec3( 1.0 ) * audioHigh * 0.8;
    }

    if ( hue > 0.001 )
        col = hueRot( col, hue );

    // Vignette
    vec2  v_uv = st * ( 1.0 - st.yx );
    float vig = v_uv.x * v_uv.y * 15.0;
    col *= clamp( pow( vig, 0.22 ), 0.0, 1.0 );

    col /= 1.0 + 0.55 * max( col.r, max( col.g, col.b ) ); // over-bright tail (final review)
    fragColor = vec4( col, 1.0 );
}
