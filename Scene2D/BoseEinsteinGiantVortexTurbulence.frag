#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file BoseEinsteinGiantVortexTurbulence.frag
 * @brief BOSE-EINSTEIN GIANT VORTEX TURBULENCE: 2D quantum turbulence in a trapped Bose-Einstein
 * condensate. Multiple counter-rotating quantized vortex pairs undergo an inverse energy cascade,
 * clustering into giant macroscopic Onsager vortex storms with photo-derived phase texturing.
 *   audioAdvance -> integrates Gross-Pitaevskii macroscopic wavefunction phase
 *   audioKick    -> excites vortex-antivortex pair annihilation shockwaves
 *   audioBass    -> undulates giant Onsager vortex cluster precession & core size
 *   audioSwell   -> enriches condensate background density & Thomas-Fermi radius
 *   audioCentroid-> shifts quantum vorticity stream colors
 *
 * Per-activation variety:
 *   vortexCountP float number of active quantized vortex cores    (4.0..16.0)
 *   cascadeP     float inverse energy cascade clustering strength (0.5..2.2)
 *   coreRadiusP  float healing length vortex core radius          (0.02..0.12)
 *   soundSpeedP  float Bogoliubov acoustic speed of sound         (0.6..2.2)
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

uniform float vortexCountP;
uniform float cascadeP;
uniform float coreRadiusP;
uniform float soundSpeedP;

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

    // Harmonic trap background (Thomas-Fermi density profile: n(r) = max(0, 1 - r^2/r_tf^2))
    float r = length( uv );
    float r_tf = 0.95 * ( 0.85 + 0.25 * audioSwell );
    float condensate_density = clamp( 1.0 - ( r * r ) / ( r_tf * r_tf ), 0.0, 1.0 );

    float num_vortices = ( vortexCountP > 1.0 ? vortexCountP : 8.0 );
    float cascade = ( cascadeP > 0.01 ? cascadeP : 1.2 );

    float total_phase = audioPhase * 0.3;
    float core_dips = 1.0;

    // Accumulate quantized vortex phases: Psi(r) = sqrt(n) * exp(i * sum(theta_j))
    for ( float j = 0.0; j < 8.0; j += 1.0 )
    {
        if ( j >= num_vortices )
            break;

        // Vortex trajectory (clustered into two giant Onsager storms: positive & negative circulation)
        float sign = mod( j, 2.0 ) == 0.0 ? 1.0 : -1.0;
        float cluster_center = sign * ( 0.35 / max( cascade, 0.5 ) );

        float v_angle = j * 0.7854 + t * ( 0.6 + 0.2 * j ) * sign;
        float v_rad = 0.15 + 0.12 * sin( t * 0.8 + j );
        vec2  v_pos = vec2( cluster_center + cos( v_angle ) * v_rad, sin( v_angle ) * v_rad );

        vec2  diff = uv - v_pos;
        float d = length( diff );
        float angle = atan( diff.y, diff.x );

        total_phase += angle * sign;

        // Healing length core profile: tanh(r / xi)
        float xi = ( coreRadiusP > 0.001 ? coreRadiusP : 0.045 ) * ( 1.0 + 0.4 * audioBass );
        core_dips *= clamp( d / xi, 0.0, 1.0 );
    }

    // Bogoliubov phonon sound ripples
    float c_sound = ( soundSpeedP > 0.01 ? soundSpeedP : 1.2 );
    float phonons = sin( r * 18.0 - t * 4.0 * c_sound ) * 0.08 * ( 0.6 + 0.8 * audioMid );

    float final_density = condensate_density * core_dips + phonons;

    // Annihilation flashes on kick
    float core_flash = ( 1.0 - core_dips ) * ( 1.0 + 3.5 * audioKick );

    // Palette assignment
    vec3 col_phase = imgPalette( fract( total_phase * 0.159 + t * 0.05 + audioCentroid ) );
    vec3 col_core = imgPalette( fract( total_phase * 0.159 + 0.5 ) );

    // Background photo texture
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.25;

    vec3 col = bg;
    col += col_phase * final_density * 1.8;
    col += col_core * core_flash * 2.0;
    col += imgPalette( audioAdvance * 0.1 ) * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
