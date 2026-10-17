#version 330 core
/*****************************************************************************\
 *                              ChiralNematicBeetleCuticle.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  CHIRAL NEMATIC BEETLE CUTICLE: Biomimetic jewel scarab beetle cuticle (Chrysina resplendens).
 *
 *  Helical cholesteric liquid-crystal chitin nanofibril multilayers generate circular polarization, angle-dependent
 *  Bragg structural color, hexagonal cellular micro-faceting, and metallic iridescence.
 *
 *    audioAdvance -> rotates cholesteric helical director pitch & viewing angle
 *    audioPhase   -> shifts chiral nematic polarization phase
 *    audioKick    -> flashes specular metallic facet glints & Bragg resonance peaks
 *    audioSwell   -> enriches structural iridescence color saturation & depth
 *    audioCentroid-> modulates micro-cellular hexagon facet curvature
 *
 *  Per-activation variety:
 *    pitchP   float cholesteric helical pitch wavelength     (0.5..2.2)
 *    hexP     float hexagonal cellular micro-facet scale     (2.0..8.0)
 *    iridP    float Bragg structural interference intensity  (0.8..2.5)
 *    metalP   float specular metallic sheen reflection       (0.5..2.0)
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

uniform float pitchP; ///< Pitch knob, 0..1.
uniform float hexP;   ///< Hex knob: hexagonal cellular micro-facet scale, 2..8.
uniform float iridP;  ///< Irid knob: Bragg structural interference intensity, 0.8..2.5.
uniform float metalP; ///< Metal knob: specular metallic sheen reflection, 0.5..2.

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

/**  Hexagonal cell grid generator
 *
 * @param p  The point. (in)
 *
 * @return
 *   Offset from the cell centre (xy) and the cell id (zw).
 **/
vec4 hexGrid( vec2 p )
{
    vec2 s = vec2( 1.0, 1.7320508 );
    vec2 a = mod( p, s ) - s * 0.5;
    vec2 b = mod( p - s * 0.5, s ) - s * 0.5;
    vec2 h = dot( a, a ) < dot( b, b ) ? a : b;
    vec2 id = p - h;
    return vec4( h, id );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  uv = ( gl_FragCoord.xy - 0.5 * resolution ) / min( resolution.x, resolution.y );
    float t = time * 0.35 + audioAdvance * 0.3;

    // Hexagonal micro-cellular facet coordinates
    float hex_scale = ( hexP > 0.01 ? hexP : 4.5 );
    vec4  hg = hexGrid( uv * hex_scale + vec2( sin( t * 0.2 ), cos( t * 0.15 ) ) * 0.3 );
    vec2  cell_local = hg.xy;
    vec2  cell_id = hg.zw;

    // Dome facet curvature inside each hexagonal cell
    float cell_r = length( cell_local );
    float cell_dome = sqrt( max( 0.001, 1.0 - cell_r * cell_r * 4.0 ) );
    vec3  facet_normal = normalize( vec3( cell_local * 2.0, cell_dome ) );

    // Macro curvature of beetle body
    vec3 macro_normal = normalize( vec3( uv * 1.5, sqrt( max( 0.001, 1.0 - dot( uv, uv ) * 0.8 ) ) ) );
    vec3 normal = normalize( mix( macro_normal, facet_normal, 0.45 + 0.2 * audioCentroid ) );

    // Viewing direction & Bragg reflection angle
    vec3  view_dir = vec3( 0.0, 0.0, 1.0 );
    float cos_theta = clamp( dot( normal, view_dir ), 0.0, 1.0 );

    // Cholesteric pitch Bragg resonance: lambda = 2 * n_avg * P * cos(theta)
    float pitch = ( pitchP > 0.01 ? pitchP : 1.0 );
    float bragg_phase = ( pitch * 3.0 / max( cos_theta, 0.1 ) + audioPhase * 0.5 - t * 0.8 );

    // Structural color via photo palette mapped to Bragg reflection spectrum
    float pal_coord = fract( bragg_phase * 0.159 + length( cell_id ) * 0.05 );
    vec3  structural_color = imgPalette( pal_coord ) * ( iridP > 0.01 ? iridP : 1.5 );

    // Specular metallic sheen & facet highlights
    vec3  light_dir = normalize( vec3( cos( t * 0.6 ), sin( t * 0.6 ), 0.8 ) );
    vec3  half_vec = normalize( light_dir + view_dir );
    float spec = pow( max( 0.0, dot( normal, half_vec ) ), 28.0 ) * ( metalP > 0.01 ? metalP : 1.2 );
    float kick_glint = pow( max( 0.0, dot( normal, half_vec ) ), 80.0 ) * ( 1.0 + 4.0 * audioKick );

    // Hexagonal cell boundary lines
    float hex_edge = smoothstep( 0.42, 0.48, cell_r * 2.0 );

    // Background photo reflection
    vec2 bg_uv = fract( reflect( -view_dir, normal ).xy * 0.4 + 0.5 );
    vec3 bg_refl = img( bg_uv ) * 0.35;

    vec3 col = bg_refl;
    col += structural_color * cos_theta * ( 0.8 + 0.4 * audioSwell );
    col += vec3( 1.0, 0.95, 0.8 ) * spec * 1.2;
    col += structural_color * kick_glint * 2.0;
    col -= vec3( 0.15 ) * hex_edge; // Dark etched boundary grooves
    col += imgPalette( audioCentroid ) * ( audioKick * 0.3 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
