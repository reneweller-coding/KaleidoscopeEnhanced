#version 330 core
/*****************************************************************************\
 *                              WhisperingGalleryMicrocavity.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  WHISPERING GALLERY MICROCAVITY: Deformed optical microcavity resonator exhibiting quantum chaos, ray-wave
 *  correspondence, and whispering gallery modes.
 *
 *  Total internal reflection orbits create rich caustic networks and evanescent boundary tunneling light rays
 *  across the whole viewport.
 *
 *    audioAdvance -> rotates chaotic Poincaré ray trajectory phase
 *    audioPhase   -> deforms microcavity boundary quadropole / octupole shape
 *    audioSnare   -> triggers evanescent laser tunneling bursts
 *    audioSwell   -> thickens volumetric caustic interference sheets
 *    audioTreble  -> modulates high-frequency whispering gallery mode fringes
 *
 *  Per-activation variety:
 *    deformP  float cavity boundary deformation parameter   (0.05..0.35)
 *    orbitP   float ray-orbit chaos & bounce density        (1.0..3.0)
 *    fringeP  float azimuthal mode wavenumber fringe density (8.0..24.0)
 *    tunnelP  float evanescent tunneling radiation gain     (0.5..2.0)
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

uniform float deformP; ///< Deform knob: cavity boundary deformation parameter, 0.05..0.35.
uniform float orbitP;  ///< Orbit knob: ray-orbit chaos & bounce density, 1..3.
uniform float fringeP; ///< Fringe knob: azimuthal mode wavenumber fringe density (8.0..24.0).
uniform float tunnelP; ///< Tunnel knob: evanescent tunneling radiation gain, 0.5..2.

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
    float t = time * 0.3 + audioAdvance * 0.3;

    float r = length( uv );
    float theta = atan( uv.y, uv.x );

    // Deformed cavity boundary: R(theta) = R0 * (1 + eps2 * cos(2*theta) + eps3 * cos(3*theta))
    float def = ( deformP > 0.001 ? deformP : 0.18 );
    float eps2 = def * ( 0.8 + 0.3 * sin( audioPhase ) );
    float eps3 = def * 0.5 * cos( audioPhase * 1.3 );
    float r_theta = 0.42 * ( 1.0 + eps2 * cos( 2.0 * theta + t * 0.2 ) + eps3 * cos( 3.0 * theta - t * 0.15 ) );

    float dist_to_bound = r - r_theta;

    // Whispering gallery modes (confined near inner boundary r < r_theta)
    float mode_freq = ( fringeP > 0.01 ? fringeP : 16.0 ) + 4.0 * audioHigh;
    float wgm_mode = sin( theta * mode_freq - t * 3.0 ) * 0.5 + 0.5;
    float radial_falloff = exp( -abs( dist_to_bound ) * 22.0 );
    float wgm_intensity = wgm_mode * radial_falloff * ( dist_to_bound < 0.0 ? 1.0 : 0.1 );

    // Chaotic internal ray bounces & caustic webbing (Poincaré orbits)
    float caustic_accum = 0.0;
    float orbit_count = 5.0 * ( orbitP > 0.01 ? orbitP : 1.5 );
    for ( float i = 1.0; i <= 5.0; i += 1.0 )
    {
        float angle_offset = i * 1.2566 + t * 0.1;
        float ray_dist = abs( dot( uv, vec2( cos( angle_offset ), sin( angle_offset ) ) ) - 0.25 * sin( t * 0.5 + i ) );
        caustic_accum += exp( -ray_dist * 35.0 ) * ( 0.6 + 0.4 * sin( audioAdvance * 0.2 + i ) );
    }
    caustic_accum *= smoothstep( 0.08, -0.02, dist_to_bound );

    // Evanescent tunneling radiation escaping the cavity
    float tunnel_gain = ( tunnelP > 0.01 ? tunnelP : 1.0 );
    float tunnel_rays = 0.0;
    if ( dist_to_bound > 0.0 )
    {
        float escape_angle = theta + 0.5 * dist_to_bound;
        tunnel_rays = pow( sin( escape_angle * 6.0 + t * 2.0 ) * 0.5 + 0.5, 4.0 );
        tunnel_rays *= exp( -dist_to_bound * 4.0 ) * ( 0.8 + 1.5 * audioMid ) * tunnel_gain;
    }

    // Boundary ring glow
    float bound_ring = exp( -abs( dist_to_bound ) * 45.0 ) * ( 1.0 + 2.0 * audioKick );

    // Synthesis with photo palette
    vec3 col_wgm = imgPalette( fract( theta * 0.159 + t * 0.05 ) ) * wgm_intensity * 2.2;
    vec3 col_caust = imgPalette( fract( caustic_accum * 0.3 + 0.33 ) ) * caustic_accum * 1.4;
    vec3 col_tunnel = imgPalette( fract( theta * 0.159 + 0.66 + dist_to_bound ) ) * tunnel_rays * 2.0;
    vec3 col_ring = imgPalette( t * 0.1 ) * bound_ring * 1.8;

    // Base texture backdrop
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 col_bg = img( bg_uv ) * 0.25;

    vec3 col = col_bg + col_wgm + col_caust + col_tunnel + col_ring;
    col += imgPalette( audioCentroid ) * audioKick * 0.25;
    col *= ( 0.85 + 0.35 * audioSwell );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
