#version 330 core
/*****************************************************************************\
 *                              PlasmonicMetamaterialBlackHole.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  PLASMONIC METAMATERIAL BLACK HOLE: Omnidirectional optical absorber in graded-index metamaterials.
 *
 *  Continuous radial variation of dielectric permittivity and magnetic permeability curves light rays into
 *  logarithmic spiral orbits toward a central plasmonic absorbing core.
 *
 *    audioAdvance -> rotates spiral Poynting vector energy trajectories towards core
 *    audioKick    -> flashes central plasmonic core resistive dissipation hot spots
 *    audioSwell   -> widens metamaterial gradient trapping radius & Poynting streamline glow
 *    audioCentroid-> shifts transformation optics dielectric dispersion spectra
 *    audioSubBass -> deepens central optical trap absorption null depth
 *
 *  Per-activation variety:
 *    trapRadiusP  float graded-index metamaterial outer trap radius (0.6..1.6)
 *    spiralCurlP  float logarithmic ray-bending curvature         (2.0..6.0)
 *    absorberP    float central plasmonic core absorption gain     (0.8..2.5)
 *    poyntingP    float Poynting vector streamline ripple density  (8.0..24.0)
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

uniform float trapRadiusP; ///< Trap radius knob: graded-index metamaterial outer trap radius (0.6..1.6).
uniform float spiralCurlP; ///< Spiral curl knob: logarithmic ray-bending curvature, 2..6.
uniform float absorberP;   ///< Absorber knob: central plasmonic core absorption gain, 0.8..2.5.
uniform float poyntingP;   ///< Poynting knob: Poynting vector streamline ripple density, 8..24.

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

    float r = length( uv );
    float theta = atan( uv.y, uv.x );

    // Graded refractive index profile: n(r) = (R_out / r)^2 inside trap radius
    float r_out = ( trapRadiusP > 0.01 ? trapRadiusP : 0.85 ) * ( 0.9 + 0.2 * audioSwell );
    float r_core = 0.15 * ( 1.0 + 0.2 * audioSubBass );

    // Logarithmic spiral light bending rays: r = r0 * exp(-k * theta)
    float k_curl = ( spiralCurlP > 0.01 ? spiralCurlP : 3.5 );
    float spiral_phase = theta * 6.0 + log( max( r, 0.01 ) ) * k_curl - t * 3.5 + audioPhase;

    // Poynting energy flow streamlines
    float p_freq = ( poyntingP > 0.01 ? poyntingP : 16.0 );
    float poynting_waves = sin( spiral_phase ) * 0.5 + 0.5;

    // Inward spiral wave intensity
    float in_trap = smoothstep( r_out + 0.05, r_out - 0.05, r );
    float spiral_stream = poynting_waves * in_trap;

    // Central plasmonic absorbing core (Joule heating hot spot)
    float core_absorption = exp( -r * r * 45.0 ) * ( 1.0 + 4.0 * audioKick ) * ( absorberP > 0.01 ? absorberP : 1.3 );

    // Optical trap boundary ring
    float trap_boundary = exp( -abs( r - r_out ) * 25.0 );

    // Full absorption shadow in innermost center
    float center_shadow = smoothstep( 0.04, r_core, r );

    // Palette assignment
    float pal_angle = fract( spiral_phase * 0.159 + r * 0.3 + audioCentroid );
    vec3  col_ray = imgPalette( pal_angle );
    vec3  col_core = imgPalette( fract( pal_angle + 0.5 ) ) * 2.2;

    // Background photo sampling
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.25;

    vec3 col = bg * center_shadow;
    col += col_ray * spiral_stream * center_shadow * ( 0.8 + 0.4 * audioSwell ) * 1.8;
    col += col_core * core_absorption * 2.5;
    col += vec3( 0.9, 0.95, 1.0 ) * trap_boundary * 1.6;
    col += col_ray * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
