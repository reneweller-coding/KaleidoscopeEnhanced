#version 330 core
/*****************************************************************************\
 *                              AnomalousFloquetTopologicalInsulator.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  ANOMALOUS FLOQUET TOPOLOGICAL INSULATOR: Out-of-equilibrium Floquet topological state driven by circularly
 *  polarized light.
 *
 *  High-frequency time-periodic driving breaks time-reversal symmetry, creating chiral edge states traversing bulk
 *  bandgaps with photo-derived quasienergy spectra.
 *
 *    audioAdvance -> drives Floquet drive frequency & quasienergy phase integration
 *    audioKick    -> flashes Floquet band inversion topological transitions
 *    audioSwell   -> widens chiral edge state penetration depth & bandgap luminance
 *    audioCentroid-> shifts Floquet quasienergy Brillouin zone spectra
 *    audioPhase   -> modulates circular polarization driving helicity
 *
 *  Per-activation variety:
 *    latticePitchP float hexagonal lattice cell packing density   (2.5..7.0)
 *    driveAmpP     float periodic laser driving field intensity   (0.6..2.2)
 *    gapWidthP     float Floquet topological bandgap width        (0.4..1.8)
 *    edgeGlowP     float chiral boundary current luminance gain   (0.8..2.5)
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

uniform float latticePitchP; ///< Lattice pitch knob: hexagonal lattice cell packing density, 2.5..7.
uniform float driveAmpP;     ///< Drive amp knob: periodic laser driving field intensity, 0.6..2.2.
uniform float gapWidthP;     ///< Gap width knob: Floquet topological bandgap width, 0.4..1.8.
uniform float edgeGlowP;     ///< Edge glow knob: chiral boundary current luminance gain, 0.8..2.5.

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

    // Hexagonal Honeycomb Floquet lattice
    float pitch = ( latticePitchP > 0.01 ? latticePitchP : 4.2 );
    vec2  p = uv * pitch;

    vec2 r_hex = vec2( p.x * 1.7320508 + p.y, p.y * 2.0 ) / 3.0;
    vec2 cell = floor( r_hex );
    vec2 f = fract( r_hex ) - 0.5;

    // Time-periodic circular optical drive: A(t) = A_0 * (cos(Omega*t), sin(Omega*t))
    float a0 = ( driveAmpP > 0.01 ? driveAmpP : 1.2 );
    float drive_angle = t * 4.0 + audioPhase;
    vec2  drive_field = vec2( cos( drive_angle ), sin( drive_angle ) ) * ( 0.15 * a0 );

    // Peierls phase substitution on hopping integrals: theta_ij = int A . dr
    float peierls = dot( f, drive_field ) * 12.0;

    // Chiral Floquet edge modes running along sample boundary (r = 0.65)
    float r = length( uv );
    float boundary_dist = abs( r - 0.65 );
    float edge_mode = exp( -boundary_dist * 16.0 / max( gapWidthP > 0.01 ? gapWidthP : 1.0, 0.1 ) );

    // Quasienergy chiral dispersion wave: epsilon(k) = v_F * k_parallel
    float theta = atan( uv.y, uv.x );
    float chiral_wave = sin( theta * 12.0 - t * 6.0 + peierls ) * 0.5 + 0.5;

    // Band inversion flash on kick
    float topo_flash = exp( -boundary_dist * 25.0 ) * ( 1.0 + 4.0 * audioKick )
                       * ( edgeGlowP > 0.01 ? edgeGlowP : 1.3 );

    // Honeycomb node lattice sites
    float node_site = exp( -dot( f, f ) * 25.0 );

    // Palette assignment
    float pal_angle = fract( theta * 0.159 + r * 0.3 + audioCentroid );
    vec3  col_edge = imgPalette( pal_angle );
    vec3  col_bulk = imgPalette( fract( pal_angle + 0.5 ) ) * 1.4;

    // Background photo sampling
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.25;

    vec3 col = bg;
    col += col_bulk * node_site * ( 0.8 + 0.4 * audioSwell );
    col += col_edge * edge_mode * ( 0.6 + 0.4 * chiral_wave ) * 2.2;
    col += vec3( 0.95, 0.95, 1.0 ) * topo_flash * 2.0;
    col += col_edge * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    col /= 1.0 + 0.55 * max( col.r, max( col.g, col.b ) ); // peak knee: tame local glare, keep midtones
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
