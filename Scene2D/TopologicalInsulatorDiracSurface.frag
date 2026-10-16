#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file TopologicalInsulatorDiracSurface.frag
 * @brief TOPOLOGICAL INSULATOR DIRAC SURFACE: 3D topological insulator crystal
 * with insulating bulk and protected conducting 2D Dirac surface states.
 * Spin-momentum locking (k x sigma), suppressed backscattering,
 * helical current loops, and continuous photo texture reflections.
 *   audioAdvance -> rotates spin-momentum locked Dirac surface currents
 *   audioKick    -> flashes protected topological edge state transitions
 *   audioBass    -> pulses bulk bandgap and surface Dirac cone height
 *   audioCentroid-> shifts electronic spin polarization vector colors
 *
 * Per-activation variety:
 *   surfaceP float crystal facet lattice density         (0.5..2.2)
 *   spinP    float spin-momentum locking helical pitch    (0.5..2.0)
 *   speedP   float surface current drift velocity         (0.5..2.0)
 *   hueP     float topological state hue offset           (0..6.28)
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

uniform float surfaceP; ///< Surface knob: crystal facet lattice density, 0.5..2.2.
uniform float spinP;    ///< Spin knob, 0..1.
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;     ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  2D rotation matrix.
 *
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The rotation matrix.
 **/
mat2 rot2D( float a )
{
    float c = cos( a ), s = sin( a );
    return mat2( c, -s, s, c );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float srf = ( surfaceP > 0.0 ) ? surfaceP : 1.0;
    float spn = ( spinP > 0.0 ) ? spinP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.35 * spd + audioAdvance * 0.18;

    // Crystal facet surface projection
    vec2 p = uv * 5.5 * srf;
    p = rot2D( t * 0.2 ) * p;

    // Spin-momentum locking: spin sigma is orthogonal to momentum k
    float r = length( p );
    float angle = atan( p.y, p.x );
    float helical_current = sin( angle * 6.0 + r * 4.0 * spn - t * 4.0 );

    // Dirac surface cone state: E(k) = v_F * |k|
    float dirac_cone = exp( -abs( r - 1.8 ) * 4.0 ) * ( 1.0 + 0.3 * audioBass );

    // Suppressed backscattering topological protection lines
    float edge_states = sin( p.x * 3.0 + p.y * 3.0 + helical_current * 2.0 );
    float edge_lines = smoothstep( 0.6, 0.95, abs( edge_states ) );

    // Photo texture mapping onto topological crystal facet
    vec2 photo_uv = st + vec2( cos( angle ), sin( angle ) ) * 0.03 * ( 1.0 + audioKick * 0.8 );
    vec3 photo = img( fract( photo_uv ) );

    // Helical spin palette (quantum bismuth selenide teal, gold, crimson)
    vec3 spin_up = vec3( 0.0, 0.85, 0.95 );
    vec3 spin_down = vec3( 0.95, 0.2, 0.4 );
    vec3 bulk_gold = vec3( 1.0, 0.9, 0.4 );

    vec3 spin_color = mix( spin_up, spin_down, helical_current * 0.5 + 0.5 );

    // Combine visualizer
    vec3 col = mix( photo * 0.85, spin_color, 0.45 + 0.2 * audioSwell );
    col += edge_lines * bulk_gold * ( 1.0 + audioHigh * 1.5 );
    col += dirac_cone * vec3( 0.2, 0.9, 1.0 ) * ( 1.2 + audioKick * 2.5 );

    if ( audioChromaHue != 0.0 )
        col = hueRot( col, audioChromaHue );
    if ( hue > 0.001 )
        col = hueRot( col, hue );

    // Vignette
    float vig = smoothstep( 1.35, 0.35, length( uv ) );
    col *= vig;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( col ) * 0.75;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
