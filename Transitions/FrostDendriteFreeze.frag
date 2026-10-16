#version 330 core
/*****************************************************************************\
 *                              FrostDendriteFreeze.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TRANSITION FROST DENDRITE FREEZE: Hexagonal dendritic ice crystal freeze & melt.
 *
 *  Feathery ice frostwork branches rapidly across the viewport, freezing the outgoing scene into crystalline frost
 *  and melting away into the incoming scene.
 *
 *    interpolation -> sweeps freezing crystallization to melting thaw
 *    audioKick     -> flashes sharp dendritic ice needle growth
 *    audioSwell    -> sharpens the frost facets (slow)
 *
 *  Per-activation variety:
 *    frostP  float frost crystal density & scale  (0.5..2.2)
 *    branchP float dendritic branch branching     (0.5..2.0)
 *    speedP  float animation speed multiplier     (0.5..2.0)
 *    hueP    float ice crystal shimmer hue offset (0..6.28)
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

uniform float frostP;  ///< Frost knob: frost crystal density & scale, 0.5..2.2.
uniform float branchP; ///< Branching knob, 0..1.
uniform float speedP;  ///< Speed knob, 0..1.
uniform float hueP;    ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    float frs = ( frostP > 0.0 ) ? frostP : 1.0;
    float brn = ( branchP > 0.0 ) ? branchP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.4 * spd; // clock only: audioAdvance integrates transients and sped the motion up on every surge
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    // 6-fold hexagonal ice dendrite growth
    float angle6 = 6.2831853 / 6.0;
    float a = atan( p.y, p.x );
    float r = length( p );
    a = mod( a, angle6 ) - angle6 * 0.5;
    vec2 hex_coord = vec2( cos( a ), sin( a ) ) * r * 15.0 * frs;

    // Dendritic side branchings.  audioHigh sharpens the crystalline facet
    // lines by steepening both dendrite falloffs; the peak value is unchanged,
    // only the edge crispness.  mid_transition is zero at both fade endpoints,
    // so the pattern there is exactly the un-driven one — and frost_pattern is
    // only ever consumed through mid_transition-gated terms anyway.
    float facet_sharp = 1.0 + audioSwell * 0.8 * mid_transition;
    float main_spine = abs( hex_coord.y );
    float side_branches = abs( sin( hex_coord.x * 2.0 * brn - hex_coord.y * 3.0 ) );
    float frost_pattern = exp( -main_spine * 8.0 * facet_sharp ) + exp( -side_branches * 6.0 * facet_sharp ) * 0.6;

    // Crystal refraction warp
    vec2 frost_warp = vec2( cos( a * 6.0 ), sin( a * 6.0 ) ) * 0.02 * frost_pattern * mid_transition;

    vec4 c1 = texture( tex1, fract( uv + frost_warp ) );
    vec4 c0 = texture( tex0, fract( uv - frost_warp ) );

    vec4 col = mix( c1, c0, t_prog );

    // Crystalline frost white/cyan glow
    vec3 frost_white = vec3( 0.85, 0.95, 1.0 );
    col.rgb += frost_pattern * frost_white * mid_transition * 0.7 * ( 1.0 + audioKick * 0.83 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
