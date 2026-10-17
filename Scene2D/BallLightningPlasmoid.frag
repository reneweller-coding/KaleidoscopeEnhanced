#version 330 core
/*****************************************************************************\
 *                              BallLightningPlasmoid.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  BALL LIGHTNING PLASMOID: Volumetric autonomous ball lightning plasmoid with magnetically self-confined toroidal
 *  plasma core.
 *
 *  Helical discharge filaments, atmospheric dielectric air breakdown arcs, high-frequency ionization glow, and
 *  audio-reactive electrical detonation bursts.
 *
 *    audioAdvance -> rotates toroidal plasma core vortex currents
 *    audioKick    -> fires explosive high-voltage electrical discharge arcs
 *    audioBass    -> pulses plasmoid confinement radius & magnetic pinch
 *    audioCentroid-> shifts ionization color temperature (electric cyan/violet)
 *
 *  Per-activation variety:
 *    plasmoidP float plasmoid core radius & glow density  (0.5..2.2)
 *    arcP      float electrical discharge branching scale (0.5..2.0)
 *    speedP    float plasma vortex circulation velocity   (0.5..2.0)
 *    hueP      float plasma discharge hue offset          (0..6.28)
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
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float plasmoidP; ///< Plasmoid knob: plasmoid core radius & glow density, 0.5..2.2.
uniform float arcP;      ///< Arc knob: electrical discharge branching scale (0.5..2.0).
uniform float speedP;    ///< Speed knob, 0..1.
uniform float hueP;      ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  2D Noise helper
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    p = fract( p * vec2( 623.34, 915.21 ) );
    p += dot( p, p + 61.32 );
    return fract( p.x * p.y );
}

/**  Smooth 2D value noise, 0..1.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value.
 **/
float noise2D( vec2 p )
{
    vec2 i = floor( p );
    vec2 f = fract( p );
    vec2 u = f * f * ( 3.0 - 2.0 * f );
    return mix(
        mix( hash21( i + vec2( 0.0, 0.0 ) ), hash21( i + vec2( 1.0, 0.0 ) ), u.x ),
        mix( hash21( i + vec2( 0.0, 1.0 ) ), hash21( i + vec2( 1.0, 1.0 ) ), u.x ),
        u.y );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float pls = ( plasmoidP > 0.0 ) ? plasmoidP : 1.0;
    float arc = ( arcP > 0.0 ) ? arcP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.45 * spd + audioAdvance * 0.22;

    float r = length( uv );
    float angle = atan( uv.y, uv.x );

    // Toroidal plasma core radius
    float plasmoid_radius = ( 0.32 + 0.08 * sin( t * 1.5 ) + 0.12 * audioBass ) * pls;
    float core_dist = abs( r - plasmoid_radius );

    // Helical internal magnetic vortex filaments
    float helix = sin( angle * 8.0 + r * 15.0 - t * 6.0 );
    float core_plasma = exp( -core_dist * 18.0 ) * ( 1.0 + helix * 0.5 );

    // Dielectric air breakdown discharge arcs branching outward
    vec2  arc_coord = uv * 14.0 * arc + vec2( t * 3.0, -t * 2.0 );
    float arc_noise = noise2D( arc_coord ) + 0.5 * noise2D( arc_coord * 2.0 );
    float discharge_arc = exp( -abs( sin( angle * 12.0 + arc_noise * 4.0 - t * 4.0 ) ) * 25.0 )
                          * smoothstep( plasmoid_radius, 0.8, r );
    float arc_flash = discharge_arc * ( audioKick * 4.0 + audioHigh * 2.0 );

    // Atmospheric ionization halo glow
    float halo = exp( -r * 3.5 ) * ( 0.8 + 0.4 * audioSwell );

    // Photo texture mapping onto turbulent plasma envelope
    vec2 photo_uv = st + vec2( sin( angle * 4.0 + t ), cos( angle * 4.0 - t ) ) * 0.04 * ( 1.0 + audioKick * 0.8 );
    vec3 photo = img( fract( photo_uv ) );

    // Ball lightning electric palette (electric cyan, neon violet-blue, blinding white-yellow)
    vec3 plasma_cyan = vec3( 0.1, 0.9, 1.0 );
    vec3 plasma_violet = vec3( 0.6, 0.2, 1.0 );
    vec3 core_white = vec3( 1.0, 0.98, 0.9 );

    vec3 plasmoid_color = mix( plasma_cyan, plasma_violet, helix * 0.5 + 0.5 );

    // Combine visualizer
    vec3 col = photo * ( 0.75 + 0.25 * audioLevel );
    col += halo * plasma_violet * 0.6;
    col += core_plasma * plasmoid_color * 1.5;
    col += arc_flash * core_white * 2.5;
    col += exp( -r * 20.0 ) * core_white * ( 1.0 + audioKick * 3.0 );

    if ( audioChromaHue != 0.0 )
        col = hueRot( col, audioChromaHue );
    if ( hue > 0.001 )
        col = hueRot( col, hue );

    // Vignette
    float vig = smoothstep( 1.35, 0.35, r );
    col *= vig;

    fragColor = vec4( col, 1.0 );
}
