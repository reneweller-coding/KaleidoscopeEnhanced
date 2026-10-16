#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file CellularMitosis.frag
 * @brief TRANSITION CELLULAR MITOSIS: Biological cell division & cytokinesis transition.
 * A parent biological cell elongates, forms a pinching cleavage furrow, and
 * divides into daughter cells that separate and morph into the incoming scene.
 *   interpolation -> controls cell elongation, cleavage furrow & cytokinesis
 *   audioKick     -> flashes mitotic spindle fiber glowing microtubules
 *   audioSwell    -> undulates cell membrane elasticity & expansion
 *
 * Per-activation variety:
 *   mitosisP float cell membrane curvature & size     (0.5..2.2)
 *   cleaveP  float cytokinesis cleavage furrow depth (0.5..2.0)
 *   speedP   float animation speed multiplier        (0.5..2.0)
 *   hueP     float membrane glow hue offset          (0..6.28)
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< slow loudness swell: the only envelope allowed to shape geometry
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float mitosisP; ///< Mitosis knob: cell membrane curvature & size, 0.5..2.2.
uniform float cleaveP;  ///< Cleave knob: cytokinesis cleavage furrow depth (0.5..2.0).
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;     ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    float mts = ( mitosisP > 0.0 ) ? mitosisP : 1.0;
    float clv = ( cleaveP > 0.0 ) ? cleaveP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.4 * spd; // clock only: audioAdvance integrates transients and sped the motion up on every surge
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    // audioBass undulates membrane elasticity & expansion.  Both factors are
    // folded in through mid_transition, so at t_prog 0 and 1 they collapse to the
    // un-driven values; the daughter-cell geometry only ever reaches the frame
    // through pinch_disp and the membrane glow, which are mid_transition-gated.
    float bass_pulse = audioSwell * mid_transition;

    // Cleavage furrow: distance to dual daughter cell centers
    float sep = mix( 0.0, 0.5, t_prog ) * mts * ( 1.0 + bass_pulse * 0.35 );
    vec2  c_left = vec2( -sep, 0.0 );
    vec2  c_right = vec2( sep, 0.0 );

    float d1 = length( p - c_left );
    float d2 = length( p - c_right );

    // Metaball fusion of two cell membranes: 1/d1^2 + 1/d2^2 = threshold
    float meta = ( 0.12 / max( d1 * d1, 0.001 ) ) + ( 0.12 / max( d2 * d2, 0.001 ) );
    float elasticity = 0.2 * clv * ( 1.0 + bass_pulse * 0.7 );
    float cell_iso = smoothstep( 1.0 - elasticity, 1.0 + elasticity, meta );

    // Membrane pinch displacement
    vec2 pinch_disp = normalize( p + 1e-4 ) * ( 1.0 - cell_iso ) * 0.04 * mid_transition;

    vec4 c1 = texture( tex1, fract( uv + pinch_disp ) );
    vec4 c0 = texture( tex0, fract( uv - pinch_disp ) );

    vec4 col = mix( c1, c0, t_prog );

    // Glowing lipid bilayer cell membrane
    float membrane = exp( -abs( meta - 1.0 ) * 8.0 ) * mid_transition;
    col.rgb += membrane * vec3( 0.2, 0.9, 0.6 ) * ( 1.5 + audioKick * 1.0 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
