#version 330 core
/*****************************************************************************\
 *                              FerroelectricDomainVortexArray.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  FERROELECTRIC DOMAIN VORTEX ARRAY: 2D square array of nanoscale electric polarization vortices and antivortices
 *  in PbTiO3/SrTiO3 oxide superlattices.
 *
 *  Continuous curling of electric dipoles creates localized piezoelectric shear strain, toroidal dipole moments,
 *  and photo texturing.
 *
 *    audioAdvance -> rotates ferroelectric polarization curl vectors & domain wall drift
 *    audioKick    -> flashes piezoelectric stress-release polarization switching pulses
 *    audioSwell   -> enriches dipolar vortex core depth & spontaneous polarization magnitude
 *    audioCentroid-> shifts ferroelectric domain birefringent color spectra
 *    audioPhase   -> twists alternating vortex-antivortex chirality
 *
 *  Per-activation variety:
 *    vortexPitchP float ferroelectric vortex cell pitch scale     (2.5..7.0)
 *    polarStrP    float spontaneous electric polarization strength (0.6..2.2)
 *    piezoP       float piezoelectric shear birefringence contrast (0.8..2.5)
 *    coreDipP     float vortex core electric field singularity     (0.4..1.8)
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

uniform float vortexPitchP; ///< Vortex pitch knob: ferroelectric vortex cell pitch scale, 2.5..7.
uniform float polarStrP;    ///< Polar str knob: spontaneous electric polarization strength (0.6..2.2).
uniform float piezoP;       ///< Piezo knob: piezoelectric shear birefringence contrast (0.8..2.5).
uniform float coreDipP;     ///< Core dip knob: vortex core electric field singularity, 0.4..1.8.

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

    // Square superlattice array of ferroelectric vortices
    float pitch = ( vortexPitchP > 0.01 ? vortexPitchP : 4.5 );
    vec2  p = uv * pitch;
    vec2  cell = floor( p );
    vec2  f = fract( p ) - 0.5;

    // Checkerboard vortex / antivortex topological charge: Q = (-1)^(ix + iy)
    float q_sign = mod( cell.x + cell.y, 2.0 ) == 0.0 ? 1.0 : -1.0;

    // Electric polarization vector P(r) curling around vortex core
    float r = length( f );
    float theta = atan( f.y, f.x );

    // Vortex curl angle: alpha = theta + q_sign * (pi/2) + phase
    float curl_angle = theta + q_sign * 1.5707963 + audioPhase * 0.3 + t * 0.5;
    vec2  p_vec = vec2( cos( curl_angle ), sin( curl_angle ) ) * ( polarStrP > 0.01 ? polarStrP : 1.2 );

    // Core singularity (polarization drops to zero at the core center)
    float core_str = ( coreDipP > 0.01 ? coreDipP : 1.0 );
    float core = clamp( r * 5.0 / core_str, 0.0, 1.0 );
    p_vec *= core;

    // Piezoelectric shear strain ~ dP_x/dy + dP_y/dx
    float shear = abs( sin( curl_angle * 2.0 ) ) * ( piezoP > 0.01 ? piezoP : 1.3 );

    // Polarization switching flash on kick
    float switch_flash = exp( -r * 12.0 ) * ( 1.0 + 3.5 * audioKick );

    // Domain wall boundaries between cells
    float domain_wall = exp( -abs( max( abs( f.x ), abs( f.y ) ) - 0.48 ) * 35.0 );

    // Palette assignment from photo arc
    float pal_angle = fract( curl_angle * 0.159 + length( cell ) * 0.06 + audioCentroid );
    vec3  col_polar = imgPalette( pal_angle );
    vec3  col_shear = imgPalette( fract( pal_angle + 0.5 ) ) * 1.8;

    // Background photo sampling
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.25;

    vec3 col = bg;
    // core/shear cover nearly the whole frame -- their gains dominate the
    // scene's base brightness, and at the original 0.8/0.8 the summed
    // field pushed the average luma past the white threshold.
    col += col_polar * core * ( 0.5 + 0.3 * audioSwell );
    col += col_shear * shear * 0.5;
    col += vec3( 0.9, 0.95, 1.0 ) * switch_flash * 2.2;
    col += col_polar * domain_wall * 1.4;
    col += col_polar * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
