#version 330 core
/*****************************************************************************\
 *                              SuperradiantBlackHoleBomb.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  SUPERRADIANT BLACK HOLE BOMB: Massive bosonic field trapped in an artificial reflecting mirror cavity around a
 *  rapidly rotating Kerr black hole.
 *
 *  Superradiant scattering exponentially extracts rotational energy, creating violent photon amplification and
 *  ergosphere detonation rings.
 *
 *    audioAdvance -> accelerates black hole spin & bosonic wavefield superradiant amplification
 *    audioKick    -> triggers runaway superradiant cavity explosion flashes
 *    audioSwell   -> widens mirror cavity radius & bosonic cloud density
 *    audioCentroid-> shifts superradiant resonance frequency colors
 *    audioSubBass -> deepens central event horizon gravitational shadow
 *
 *  Per-activation variety:
 *    mirrorRadiusP float spherical reflecting cavity boundary radius (0.6..1.6)
 *    growthRateP   float superradiant instability exponential growth (0.5..2.2)
 *    modeL_P       float bosonic field azimuthal mode number m       (2.0..8.0)
 *    bombGlowP     float runaway explosion luminance gain            (0.8..2.5)
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

uniform float mirrorRadiusP; ///< Mirror radius knob: spherical reflecting cavity boundary radius (0.6..1.6).
uniform float growthRateP;   ///< Growth rate knob: superradiant instability exponential growth (0.5..2.2).
uniform float modeL_P;       ///< Angular mode number knob of the superradiant field.
uniform float bombGlowP;     ///< Bomb glow knob: runaway explosion luminance gain, 0.8..2.5.

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

    float r = length( uv );
    float theta = atan( uv.y, uv.x );

    // Black hole event horizon & ergosphere radius
    float r_horizon = 0.18 * ( 1.0 + 0.2 * audioSubBass );
    float r_ergo = 0.32 * ( 1.0 + 0.2 * audioBass );

    // Spherical reflecting mirror cavity boundary
    float r_mirror = 0.85 * ( mirrorRadiusP > 0.01 ? mirrorRadiusP : 1.0 ) * ( 0.9 + 0.2 * audioSwell );

    // Superradiant bosonic wavefield: Psi(r, theta) = R(r) * cos(m * theta - omega * t)
    // A whole number: the azimuthal mode is cos(m * theta), and a rolled m like 3.4 tore along atan's cut.
    float mode_m = floor( ( modeL_P > 1.0 ? modeL_P : 4.0 ) + 0.5 );
    float growth = ( growthRateP > 0.01 ? growthRateP : 1.2 );

    // Radial standing wave trapped between ergosphere and mirror
    float k_rad = 18.0;
    float radial_wave = sin( ( r - r_horizon ) * k_rad ) * smoothstep( r_horizon, r_horizon + 0.05, r )
                        * smoothstep( r_mirror + 0.02, r_mirror - 0.02, r );
    float azimuthal_wave = cos( mode_m * theta - t * 3.5 + audioPhase );

    // Superradiant exponential amplification in the ergoregion
    float boson_density = radial_wave * azimuthal_wave * ( 1.0 + exp( ( r_ergo - r ) * 6.0 * growth ) );

    // Runaway explosion flash on kick
    float runaway_bomb = pow( clamp( boson_density * 0.8 + 0.5, 0.0, 1.0 ), 3.0 ) * ( 1.0 + 4.0 * audioKick )
                         * ( bombGlowP > 0.01 ? bombGlowP : 1.5 );

    // Mirror boundary reflection glow
    float mirror_glow = exp( -abs( r - r_mirror ) * 35.0 );

    // Central black hole gravitational shadow
    float shadow_mask = smoothstep( r_horizon - 0.02, r_horizon + 0.02, r );

    // Assign photo palette
    vec3 boson_color = palTint( mix( vec3( 0.1, 0.8, 1.0 ), vec3( 1.0, 0.2, 0.5 ), abs( azimuthal_wave ) ),
                                r * 0.3 + audioCentroid, 0.28 );

    // Background photo sampling
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.25;

    vec3 col = bg * shadow_mask;
    col += boson_color * abs( boson_density ) * shadow_mask * ( 0.8 + 0.4 * audioSwell );
    col += vec3( 1.0, 0.95, 0.85 ) * runaway_bomb * shadow_mask * 2.2;
    col += palTint( vec3( 0.9, 0.95, 1.0 ), t * 0.05, 0.2 ) * mirror_glow * 1.8;
    col += boson_color * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
