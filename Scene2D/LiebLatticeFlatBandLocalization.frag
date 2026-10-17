#version 330 core
/*****************************************************************************\
 *                              LiebLatticeFlatBandLocalization.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  LIEB LATTICE FLAT BAND LOCALIZATION: 2D line-centered square Lieb lattice with a strictly dispersionless flat
 *  band at zero energy.
 *
 *  Destructive quantum interference creates compactly localized loop states (Aharonov-Bohm cages) with
 *  photo-derived wavepacket phase texturing.
 *
 *    audioAdvance -> navigates compact localized state phase rotation & hopping dynamics
 *    audioKick    -> flashes flat-band excitation & dispersive Dirac cone transition bursts
 *    audioSwell   -> widens lattice site wavepacket penetration & cage luminescence
 *    audioCentroid-> shifts flat-band vs dispersive band quantum state color spectra
 *    audioPhase   -> twists Aharonov-Bohm magnetic flux cage interference
 *
 *  Per-activation variety:
 *    gridPitchP   float Lieb lattice unit cell packing density    (2.5..7.0)
 *    abFluxP      float Aharonov-Bohm synthetic magnetic flux     (0.5..2.2)
 *    cageGlowP    float compact localized loop state luminance    (0.8..2.5)
 *    sublatticeP  float A/B/C sublattice energy offset contrast   (0.4..1.8)
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

uniform float gridPitchP;  ///< Grid pitch knob: Lieb lattice unit cell packing density, 2.5..7.
uniform float abFluxP;     ///< Ab flux knob: Aharonov-Bohm synthetic magnetic flux, 0.5..2.2.
uniform float cageGlowP;   ///< Cage glow knob: compact localized loop state luminance, 0.8..2.5.
uniform float sublatticeP; ///< Sublattice knob: A/B/C sublattice energy offset contrast, 0.4..1.8.

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

    // Lieb lattice geometry: Corner site (A) and two edge sites (B, C) per unit cell
    float pitch = ( gridPitchP > 0.01 ? gridPitchP : 4.5 );
    vec2  p = uv * pitch;
    vec2  cell = floor( p );
    vec2  f = fract( p ) - 0.5;

    // 3 sublattices:
    // A: corner (0,0) -> f near (-0.5, -0.5)
    // B: horizontal edge (0.5, 0) -> f near (0, -0.5)
    // C: vertical edge (0, 0.5) -> f near (-0.5, 0)
    float site_a = exp( -dot( f + vec2( 0.5 ), f + vec2( 0.5 ) ) * 35.0 );
    float site_b = exp( -dot( f + vec2( 0.0, 0.5 ), f + vec2( 0.0, 0.5 ) ) * 35.0 );
    float site_c = exp( -dot( f + vec2( 0.5, 0.0 ), f + vec2( 0.5, 0.0 ) ) * 35.0 );

    // Compact Localized State (CLS) loop on 4 edge sites with alternating phases (+1, -1, +1, -1)
    float loop_dist = abs( max( abs( f.x ), abs( f.y ) ) - 0.25 );
    float cls_loop = exp( -loop_dist * loop_dist * 60.0 );

    // Aharonov-Bohm synthetic flux phase
    float phi_ab = ( abFluxP > 0.01 ? abFluxP : 1.2 ) * audioPhase;
    float cage_phase = sin( t * 3.0 + length( cell ) * 0.5 + phi_ab ) * 0.5 + 0.5;

    // Flat-band localized state wavepacket
    float flat_band_state = cls_loop * cage_phase * ( 0.85 + 0.35 * audioSwell );

    // Excitation flash on kick
    float ex_flash = ( site_a + site_b + site_c ) * ( 1.0 + 3.5 * audioKick ) * ( cageGlowP > 0.01 ? cageGlowP : 1.3 );

    // Inter-site hopping bonds
    float bond_h = exp( -abs( f.y + 0.5 ) * 40.0 ) * smoothstep( 0.5, 0.0, abs( f.x ) );
    float bond_v = exp( -abs( f.x + 0.5 ) * 40.0 ) * smoothstep( 0.5, 0.0, abs( f.y ) );

    // Palette assignment
    float pal_angle = fract( length( cell ) * 0.08 + t * 0.05 + audioCentroid );
    vec3  col_flat = imgPalette( pal_angle );
    vec3  col_bond = imgPalette( fract( pal_angle + 0.5 ) ) * 1.5;

    // Background photo sampling
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.25;

    vec3 col = bg;
    col += col_bond * ( bond_h + bond_v ) * 0.8;
    col += col_flat * ( site_a * 0.5 + site_b + site_c ) * 1.6;
    col += col_flat * flat_band_state * 2.2;
    col += vec3( 0.95, 0.95, 1.0 ) * ex_flash * 1.8;
    col += col_flat * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
