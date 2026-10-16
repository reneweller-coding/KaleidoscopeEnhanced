#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file DiracConeGrapheneValleytronics.frag
 * @brief DIRAC CONE GRAPHENE VALLEYTRONICS: 2D honeycomb carbon lattice displaying
 * linear relativistic Dirac cones (E = +/- hbar * v_F * |k|). Valley Hall
 * pseudospin states (K and K' valleys), Berry curvature flux, quantum
 * wavepacket tunneling, and continuous photo texture reflections.
 *   audioAdvance -> drives electronic wavepacket drift across K/K' valleys
 *   audioKick    -> flashes inter-valley quantum tunneling & plasmonic bursts
 *   audioBass    -> undulates Fermi energy surface and Dirac cone slope
 *   audioChromaHue-> shifts valley pseudospin polarization colors
 *
 * Per-activation variety:
 *   coneP   float Dirac cone dispersion slope scale      (0.5..2.2)
 *   valleyP float K/K' valley polarization asymmetry     (0.5..2.0)
 *   speedP  float electronic transport drift velocity    (0.5..2.0)
 *   hueP    float plasmonic spectrum chromatic offset    (0..6.28)
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
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float coneP;   ///< Cone knob: Dirac cone dispersion slope scale, 0.5..2.2.
uniform float valleyP; ///< Valley knob: K/K' valley polarization asymmetry, 0.5..2.
uniform float speedP;  ///< Speed knob, 0..1.
uniform float hueP;    ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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


/**  IMG-PALETTE (house standard): colours come from a rotating arc in the CURRENT slideshow image, so every
 * activation inherits a fresh palette from the photos; the arc follows the musical key (audioChromaHue is circular-
 * slewed = jump-free) with a slow advance drift, valence shapes saturation.
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
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float cne = ( coneP > 0.0 ) ? coneP : 1.0;
    float vly = ( valleyP > 0.0 ) ? valleyP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    // Hexagonal reciprocal space k-vector lattice
    vec2 k_coord = uv * 6.5 * cne;

    // K and K' valley node coordinates (hexagonal symmetry)
    float h1 = sin( k_coord.x + t * 2.0 );
    float h2 = sin( -0.5 * k_coord.x + 0.866 * k_coord.y - t );
    float h3 = sin( -0.5 * k_coord.x - 0.866 * k_coord.y - t );
    float hex_band = sqrt( h1 * h1 + h2 * h2 + h3 * h3 );

    // Conical Dirac cone dispersion: E = |k - K|
    float dirac_energy = hex_band;
    float fermi_level = ( 0.45 + 0.15 * sin( t * 1.5 ) + 0.2 * audioBass );
    float fermi_surface = exp( -abs( dirac_energy - fermi_level ) * 20.0 );

    // Valley pseudospin asymmetry (K vs K' polarization)
    float valley_polarization = sin( k_coord.x * 2.0 + k_coord.y * 3.464 + t * 3.0 ) * vly;

    // Berry curvature flux peaks around Dirac points
    float berry_curvature = exp( -hex_band * 12.0 ) * ( 1.0 + audioKick * 3.0 );

    // Photo texture mapping onto Dirac Fermi contours
    vec2 photo_uv = st + vec2( h1, h2 ) * 0.03 * ( 1.0 + audioKick * 0.7 );
    vec3 photo = img( fract( photo_uv ) );

    // Valley polarization colors: K valley (Emerald/Cyan), K' valley (Magenta/Gold)
    vec3 valley_k = imgPalette( 0.15 ) * 1.5;
    vec3 valley_k2 = imgPalette( 0.65 ) * 1.5;
    vec3 berry_glow = vec3( 1.0, 0.95, 0.4 );

    // USER-FEEDBACK: pseudo-3D relief of the Dirac energy landscape (the
    // cones get actual depth) + plasmon pulses radiating from the nodes.
    float g_ex = dFdx( dirac_energy ), g_ey = dFdy( dirac_energy );
    float relief = clamp( 0.65 + 55.0 * ( g_ex * 0.8 - g_ey * 0.6 ), 0.30, 1.55 );
    float pulse = pow( 0.5 + 0.5 * sin( dirac_energy * 9.0 - t * 5.0 ), 6.0 )
                  * exp( -hex_band * 1.3 ) * ( 0.8 + 1.4 * audioKick );

    vec3 valley_col = mix( valley_k, valley_k2, valley_polarization * 0.5 + 0.5 );

    // Combine visualizer
    vec3 col = mix( photo * 0.8, valley_col, 0.45 + 0.25 * audioSwell );
    col += fermi_surface * vec3( 0.3, 0.85, 1.0 ) * ( 1.0 + audioHigh * 1.2 );
    col += berry_curvature * berry_glow * 2.2;
    col *= relief;
    col += imgPalette( 0.40 ) * pulse * 1.3;

    if ( hue > 0.001 )
        col = hueRot( col, hue );

    // Vignette
    float vig = smoothstep( 1.35, 0.35, length( uv ) );
    col *= vig;

    fragColor = vec4( col, 1.0 );
}
