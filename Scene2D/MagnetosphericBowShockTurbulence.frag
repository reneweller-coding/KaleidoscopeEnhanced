#version 330 core
/*****************************************************************************\
 *                              MagnetosphericBowShockTurbulence.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  MAGNETOSPHERIC BOW SHOCK TURBULENCE: Planetary magnetosphere collision with supersonic solar wind.
 *
 *  Features hyperbolic bow shock compression fronts, turbulent magnetosheath eddies, ion cyclotron whistler wave
 *  ripples, and photo-derived auroral particle flux curtains.
 *
 *    audioAdvance -> drives supersonic solar wind plasma inflow & magnetosheath turbulence
 *    audioKick    -> flashes geomagnetic substorm reconnection & auroral particle injections
 *    audioBass    -> undulates planetary magnetic dipole compression standoff distance
 *    audioSwell   -> enriches magnetospheric plasma density & auroral curtain thickness
 *    audioCentroid-> shifts magnetospheric ion excitation & oxygen/nitrogen emission spectra
 *
 *  Per-activation variety:
 *    shockCurvP   float hyperbolic bow shock curvature parameter (0.4..1.8)
 *    windSpeedP   float solar wind supersonic drift velocity      (0.6..2.2)
 *    whistlerP    float ion cyclotron whistler wave frequency     (8.0..24.0)
 *    auroraGlowP  float auroral particle curtain luminance gain   (0.8..2.5)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

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

uniform float shockCurvP;  ///< Shock curv knob: hyperbolic bow shock curvature parameter (0.4..1.8).
uniform float windSpeedP;  ///< Wind speed knob: solar wind supersonic drift velocity, 0.6..2.2.
uniform float whistlerP;   ///< Whistler knob: ion cyclotron whistler wave frequency, 8..24.
uniform float auroraGlowP; ///< Aurora glow knob: auroral particle curtain luminance gain, 0.8..2.5.

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

    // Solar wind incoming from left (-x) impacting planetary dipole at (0.35, 0)
    vec2 planet_pos = vec2( 0.35, 0.0 );
    vec2 rel_p = uv - planet_pos;

    // Hyperbolic Bow Shock front: x_shock = -standoff + curv * y^2
    float standoff = ( 0.35 * ( 1.0 - 0.25 * audioBass ) );
    float curv = ( shockCurvP > 0.01 ? shockCurvP : 0.85 );
    float shock_x = -standoff + curv * ( uv.y * uv.y );

    float shock_dist = uv.x - shock_x;
    float shock_front = exp( -abs( shock_dist ) * 30.0 );

    // Turbulent magnetosheath eddies (between bow shock and magnetopause)
    float v_speed = ( windSpeedP > 0.01 ? windSpeedP : 1.2 );
    vec2  sheath_uv = vec2( uv.x * 6.0 + t * 2.5 * v_speed, uv.y * 6.0 );
    float eddy = sin( sheath_uv.x + sin( sheath_uv.y ) ) * cos( sheath_uv.y - sin( sheath_uv.x ) );

    // Ion cyclotron whistler waves propagating in foreshock region (x < shock_x)
    float w_freq = ( whistlerP > 0.01 ? whistlerP : 16.0 );
    float whistler = sin( uv.x * w_freq - t * 4.0 + audioPhase ) * smoothstep( 0.0, -0.2, shock_dist );

    // Auroral particle cusp curtains funneling into planetary magnetic poles
    float r_dipole = length( rel_p );
    float dipole_angle = atan( rel_p.y, rel_p.x );
    float dipole_field = sin( dipole_angle * 2.0 ) / max( r_dipole * r_dipole, 0.01 );

    float aurora_curtain = exp( -abs( sin( dipole_angle ) * r_dipole - 0.15 ) * 12.0 )
                           * smoothstep( 0.5, 0.1, r_dipole );
    aurora_curtain *= ( 1.0 + 3.0 * audioKick ) * ( auroraGlowP > 0.01 ? auroraGlowP : 1.3 );

    // Color palettes
    vec3 solar_wind_col = vec3( 1.0, 0.7, 0.2 );
    vec3 aurora_emerald = vec3( 0.1, 0.95, 0.45 );
    vec3 shock_cyan = vec3( 0.2, 0.85, 1.0 );

    vec3 col_shock = palTint( shock_cyan, uv.y * 0.2 + audioCentroid, 0.25 );
    vec3 col_aurora = palTint( aurora_emerald, t * 0.05 + audioCentroid, 0.28 );
    vec3 col_wind = palTint( solar_wind_col, uv.x * 0.3, 0.22 );

    // Background photo sampling
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.25;

    vec3 col = bg;
    col += col_shock * shock_front * 2.4;
    col += col_wind * abs( eddy ) * smoothstep( -0.2, 0.2, shock_dist ) * ( 0.8 + 0.4 * audioSwell );
    col += col_shock * abs( whistler ) * 0.9;
    col += col_aurora * aurora_curtain * 2.5;
    col += col_aurora * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
