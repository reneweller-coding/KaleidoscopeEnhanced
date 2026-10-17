#version 330 core
/*****************************************************************************\
 *                              BelousovZhabotinskyChemicalWave.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  BELOUSOV-ZHABOTINSKY CHEMICAL WAVE: Classic Belousov-Zhabotinsky (BZ) non-equilibrium chemical oscillator.
 *
 *  Spontaneous formation of rotating Archimedean spiral waves and concentric target patterns undergoing mutual wave
 *  annihilation with photo-derived redox color gradients.
 *
 *    audioAdvance -> drives chemical reaction diffusion phase rotation velocity
 *    audioKick    -> flashes autocatalytic oxidation wave burst fronts
 *    audioSwell   -> broadens chemical diffusion wave thickness & redox contrast
 *    audioCentroid-> shifts ferroin catalyst oxidation-reduction (red-blue) spectra
 *    audioPhase   -> modulates spiral core precession & wave front curvature
 *
 *  Per-activation variety:
 *    spiralDensityP float number of active chemical spiral centers (2.0..8.0)
 *    waveSpeedP     float chemical wavefront propagation velocity (0.6..2.2)
 *    curvP          float Archimedean spiral wave curvature       (4.0..16.0)
 *    redoxContrastP float chemical oxidation contrast             (0.8..2.5)
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
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float spiralDensityP; ///< Spiral density knob: number of active chemical spiral centers (2.0..8.0).
uniform float waveSpeedP;     ///< Wave speed knob: chemical wavefront propagation velocity (0.6..2.2).
uniform float curvP;          ///< Curv knob: Archimedean spiral wave curvature, 4..16.
uniform float redoxContrastP; ///< Redox contrast knob: chemical oxidation contrast, 0.8..2.5.

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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  uv = ( gl_FragCoord.xy - 0.5 * resolution ) / min( resolution.x, resolution.y );
    float t = time * 0.4 + audioAdvance * 0.35;

    float num_spirals = ( spiralDensityP > 1.0 ? spiralDensityP : 4.0 );
    float v_speed = ( waveSpeedP > 0.01 ? waveSpeedP : 1.2 );
    float k_curv = ( curvP > 0.01 ? curvP : 8.0 );

    float total_wave = 0.0;
    float max_wave = -1.0;

    // Superimpose multiple BZ spiral waves with mutual annihilation min/max
    for ( float i = 0.0; i < 4.0; i += 1.0 )
    {
        if ( i >= num_spirals )
            break;

        float ang = i * 1.5707963 + audioPhase * 0.3;
        float rad = 0.45 + 0.15 * sin( t * 0.5 + i );
        vec2  center = vec2( cos( ang ), sin( ang ) ) * rad;

        vec2  diff = uv - center;
        float r = length( diff );
        float phi = atan( diff.y, diff.x );

        // Archimedean spiral: phase = k * r - phi - omega * t
        float chirality = mod( i, 2.0 ) == 0.0 ? 1.0 : -1.0;
        float phase = r * k_curv - phi * chirality - t * 3.0 * v_speed;

        // Autocatalytic sharp pulse wave profile
        float wave = pow( sin( phase ) * 0.5 + 0.5, 2.5 );

        // Annihilation: taking maximum wave state simulates non-overlapping reaction fronts
        if ( wave > max_wave )
        {
            max_wave = wave;
        }
        total_wave += wave;
    }

    float bz_pattern = max_wave * ( redoxContrastP > 0.01 ? redoxContrastP : 1.3 );

    // Wavefront edge flash on kick
    float edge_flash = pow( max_wave, 4.0 ) * ( 1.0 + 3.0 * audioKick );

    // Ferroin catalyst redox states mapped to full photo palette
    float pal_angle = fract( bz_pattern * 0.4 + t * 0.05 + audioCentroid );
    vec3  col_redox = imgPalette( pal_angle );
    vec3  col_front = imgPalette( fract( pal_angle + 0.5 ) ) * 2.2;

    // Background photo sampling
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.25;

    vec3 col = bg;
    col += col_redox * bz_pattern * ( 0.8 + 0.4 * audioSwell );
    col += col_front * edge_flash * 1.5;
    col += col_redox * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
