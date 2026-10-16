#version 330 core
/*****************************************************************************\
 *                              QuantumHallSkyrmionCrystal.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  QUANTUM HALL SKYRMION CRYSTAL: 2D triangular crystal of spin-textured Skyrmions in a quantum Hall ferromagnet
 *  near filling factor nu = 1.
 *
 *  Features entangled electron spin textures, fractional quantized Hall current ripples, and Landau level photo
 *  texturing.
 *
 *    audioAdvance -> navigates chiral Hall drift & cyclotron phase evolution
 *    audioKick    -> flashes fractional quasiparticle injection & annihilation bursts
 *    audioBass    -> undulates skyrmion spin stiffness & out-of-plane core diameter
 *    audioSwell   -> enriches quantum Hall ferromagnet background coherence
 *    audioCentroid-> shifts Landau level transition emission spectra
 *
 *  Per-activation variety:
 *    crystalPitchP float triangular skyrmion lattice density       (2.0..6.0)
 *    spinRadiusP   float skyrmion spin-texture transition width    (0.4..1.8)
 *    hallCurrentP  float fractional Hall edge current brightness   (0.8..2.5)
 *    cyclotronP    float electron cyclotron orbit ripple frequency (8.0..24.0)
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

uniform float crystalPitchP; ///< Crystal pitch knob: triangular skyrmion lattice density, 2..6.
uniform float spinRadiusP;   ///< Spin radius knob: skyrmion spin-texture transition width, 0.4..1.8.
uniform float hallCurrentP;  ///< Hall current knob: fractional Hall edge current brightness, 0.8..2.5.
uniform float cyclotronP;    ///< Cyclotron knob: electron cyclotron orbit ripple frequency (8.0..24.0).

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
    float t = time * 0.35 + audioAdvance * 0.3;

    // Hexagonal / Triangular Quantum Hall Skyrmion lattice
    float pitch = ( crystalPitchP > 0.01 ? crystalPitchP : 3.8 );
    vec2  p = uv * pitch;

    // The TRUE inverse of the cart_pos formula below (X = sqrt3*(cx+0.5*cy),
    // Y = 1.5*cy) -- the old inverse belonged to another lattice and left
    // cut-off spikes at the bottom edge.
    vec2 cell = floor( vec2( p.x * 0.57735027 - p.y * 0.33333333,
                             p.y * 0.66666667 ) );

    float min_dist = 1e5;
    vec2  closest_offset = vec2( 0.0 );

    // +-2 instead of +-1: the +-1 search in the SHEARED cell space missed the
    // true nearest centre in the lower half of the picture, and the spheres
    // were cut in half at the cell border ("spheres at the bottom only half").
    for ( int y = -2; y <= 2; ++y )
    {
        for ( int x = -2; x <= 2; ++x )
        {
            vec2  neighbor = vec2( float( x ), float( y ) );
            vec2  cart_pos = vec2( sqrt( 3.0 ) * ( cell.x + neighbor.x + 0.5 * ( cell.y + neighbor.y ) ),
                                   1.5 * ( cell.y + neighbor.y ) );
            vec2  diff = p - cart_pos;
            float d = length( diff );
            if ( d < min_dist )
            {
                min_dist = d;
                closest_offset = diff;
            }
        }
    }

    // Skyrmion spin profile: theta(r) in quantum Hall state
    float spin_w = ( spinRadiusP > 0.01 ? spinRadiusP : 1.0 ) * ( 0.8 + 0.4 * audioBass );
    float spin_angle = 3.14159265 * exp( -min_dist * min_dist * 2.5 * spin_w );
    float azim = atan( closest_offset.y, closest_offset.x ) + spin_angle + audioPhase * 0.5;

    // Out-of-plane spin component S_z = cos(theta)
    float sz = cos( spin_angle );

    // Cyclotron orbit ripples in Landau level
    float cyclo_freq = ( cyclotronP > 0.01 ? cyclotronP : 16.0 );
    float cyclo_ripples = sin( min_dist * cyclo_freq - t * 4.0 ) * exp( -min_dist * 2.0 ) * ( 0.6 + 0.8 * audioHigh );

    // Fractional Hall current around skyrmion cores
    float hall_current = ( hallCurrentP > 0.01 ? hallCurrentP : 1.3 ) * sin( azim * 2.0 + t * 2.0 )
                         * exp( -abs( spin_angle - 1.57 ) * 4.0 );

    // Quasiparticle flash on kick
    float qp_flash = exp( -min_dist * 14.0 ) * ( 1.0 + 3.5 * audioKick );

    // Palette assignment
    float pal_angle = fract( azim * 0.159 + sz * 0.3 + length( cell ) * 0.05 + audioCentroid );
    vec3  col_skyrmion = imgPalette( pal_angle );
    vec3  col_current = imgPalette( fract( pal_angle + 0.5 ) ) * 2.0;

    // Background photo sampling
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.25;

    vec3 col = bg;
    col += col_skyrmion * ( 0.75 + 0.25 * sz ) * ( 0.85 + 0.35 * audioSwell );
    col += col_current * abs( hall_current );
    col += vec3( 0.9, 0.95, 1.0 ) * qp_flash * 2.2;
    col += col_skyrmion * abs( cyclo_ripples ) * 0.9;
    col += col_skyrmion * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
