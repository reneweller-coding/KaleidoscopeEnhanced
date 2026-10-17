#version 330 core
/*****************************************************************************\
 *                              RelativisticPlasmaZpinchInstability.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  RELATIVISTIC PLASMA Z-PINCH INSTABILITY: Megampere relativistic pulsed-power Z-pinch.
 *
 *  Intense axial plasma current self-compresses via azimuthal Lorentz force, degenerating into violent m=0
 *  (sausage) and m=1 (kink) magneto-Rayleigh-Taylor instabilities and fusion hot spots.
 *
 *    audioAdvance -> drives relativistic axial current flow & magnetic pinch dynamics
 *    audioKick    -> ignites thermonuclear fusion hotspot micro-detonations
 *    audioBass    -> pulses azimuthal magnetic pinch Lorentz compression force
 *    audioSwell   -> thickens dense bremsstrahlung emission haze & pinch diameter
 *    audioCentroid-> shifts high-temperature plasma X-ray/EUV emission spectra
 *
 *  Per-activation variety:
 *    kinkAmpP     float m=1 helical kink instability amplitude   (0.5..2.2)
 *    sausageP     float m=0 necking sausage mode wavelength      (4.0..16.0)
 *    pinchRadiusP float central dense plasma pinch radius        (0.08..0.35)
 *    xrayGlowP    float thermonuclear hot-spot X-ray brightness   (0.8..2.5)
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

uniform float kinkAmpP;     ///< Kink amp knob: m=1 helical kink instability amplitude, 0.5..2.2.
uniform float sausageP;     ///< Sausage knob: m=0 necking sausage mode wavelength, 4..16.
uniform float pinchRadiusP; ///< Pinch radius knob: central dense plasma pinch radius, 0.08..0.35.
uniform float xrayGlowP;    ///< Xray glow knob: thermonuclear hot-spot X-ray brightness, 0.8..2.5.

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
    float t = time * 0.45 + audioAdvance * 0.4;

    // Axial current along Y-axis with helical m=1 kink displacement
    float kink_amp = ( kinkAmpP > 0.01 ? kinkAmpP : 1.0 ) * ( 0.15 + 0.1 * sin( t * 0.6 ) );
    float kink_x = sin( uv.y * 6.0 + t * 3.0 + audioPhase ) * kink_amp;

    float dx = uv.x - kink_x;

    // m=0 sausage mode (necking along axis where radius squeezes to near zero)
    float sausage_freq = ( sausageP > 0.01 ? sausageP : 8.0 );
    float sausage_necks = sin( uv.y * sausage_freq - t * 2.0 ) * 0.5 + 0.5;

    // Plasma pinch core radius
    float base_r = ( pinchRadiusP > 0.01 ? pinchRadiusP : 0.18 ) * ( 1.0 - 0.3 * audioBass );
    float pinch_r = base_r * ( 0.35 + 0.65 * sausage_necks );

    float r = abs( dx );
    float in_core = smoothstep( pinch_r + 0.05, pinch_r - 0.02, r );

    // Thermonuclear fusion hotspots at necking pinch points
    float hot_spot = ( 1.0 - sausage_necks ) * exp( -r * 25.0 ) * ( 1.0 + 4.0 * audioKick )
                     * ( xrayGlowP > 0.01 ? xrayGlowP : 1.5 );

    // Azimuthal B-field streamlines and helical return current cage
    float b_field = sin( uv.y * 18.0 + dx * 25.0 - t * 4.0 ) * exp( -r * 3.0 );

    // Bremsstrahlung radiation colors: High-energy plasma X-ray violet-white core tinted by photo
    vec3 plasma_core = vec3( 1.0, 0.95, 0.85 );
    vec3 x_ray_violet = vec3( 0.55, 0.25, 0.95 );
    vec3 hot_pink = vec3( 1.0, 0.15, 0.45 );

    vec3 core_color = palTint( mix( x_ray_violet, hot_pink, sausage_necks ), uv.y * 0.2 + audioCentroid, 0.25 );

    // Background photo sampling
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.25;

    vec3 col = bg;
    col += core_color * in_core * ( 0.8 + 0.5 * audioSwell );
    col += vec3( 0.9, 0.95, 1.0 ) * hot_spot * 2.8;
    col += palTint( vec3( 0.1, 0.7, 1.0 ), uv.y * 0.3, 0.22 ) * abs( b_field ) * 1.4;
    col += core_color * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
