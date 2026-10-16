#version 330 core
/*****************************************************************************\
 *                              LichtenbergLightningWipe.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TRANSITION LICHTENBERG LIGHTNING WIPE: High-voltage electrical dielectric breakdown.
 *
 *  Luminous fractal Lichtenberg discharge trees branch violently across the glass plate, conducting electrical arcs
 *  that ionize and cross-fade between scenes.
 *
 *    interpolation -> sweeps dielectric breakdown wave front across the viewport
 *    audioKick     -> triggers full-screen high-voltage lightning discharge arcs
 *    audioHigh     -> sharpens micro-fractal streamer tip branches
 *
 *  Per-activation variety:
 *    branchP  float Lichtenberg fractal branch density   (0.5..2.2)
 *    voltageP float electrical arc ionization intensity  (0.5..2.0)
 *    speedP   float animation speed multiplier           (0.5..2.0)
 *    hueP     float plasma ionization hue offset         (0..6.28)
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

uniform float branchP;  ///< Branching knob, 0..1.
uniform float voltageP; ///< Voltage knob: electrical arc ionization intensity, 0.5..2.
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

/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    p = fract( p * vec2( 534.34, 835.21 ) );
    p += dot( p, p + 62.32 );
    return fract( p.x * p.y );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float brn = ( branchP > 0.0 ) ? branchP : 1.0;
    float vlt = ( voltageP > 0.0 ) ? voltageP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.0483 * spd; // clock rate measured down to about 1.2/255 of change per frame (PresetEditor
                                   // --transprofile); it spun many times that and read as frantic
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    // Fractal lightning tree branching (DLA / Lichtenberg structure)
    float arc_pattern = 0.0;
    vec2  cur_p = p * 4.0 * brn;

    for ( int i = 0; i < 4; ++i )
    {
        float noise_val = sin( cur_p.y * 3.0 + t * 4.0 ) + cos( cur_p.x * 3.0 - t * 3.0 );
        float dist_to_line = abs( cur_p.x + noise_val * 0.3 );
        float arc = exp( -dist_to_line * 30.0 );
        arc_pattern = max( arc_pattern, arc * ( 1.0 / float( i + 1 ) ) );

        cur_p = cur_p * 2.0 + vec2( sin( t ), cos( t ) );
    }

    // Breakdown sweep front
    float sweep_front = mix( -1.2, 1.2, t_prog );
    float dist_to_sweep = p.x - sweep_front;

    // Ionization plasma displacement
    vec2 plasma_disp = vec2( arc_pattern, sin( p.y * 20.0 + t * 5.0 ) ) * 0.03 * mid_transition
                       * ( 1.0 + audioSwell * 0.6 );

    vec4 c1 = texture( tex1, fract( uv + plasma_disp ) );
    vec4 c0 = texture( tex0, fract( uv - plasma_disp ) );

    float wipe_mask = smoothstep( -0.04, 0.04, dist_to_sweep );
    vec4  col = mix( c0, c1, wipe_mask );

    // High-voltage ozone blue-violet ionization arc
    vec3  arc_color = mix( vec3( 0.2, 0.8, 1.0 ), vec3( 0.8, 0.3, 1.0 ), sin( p.y * 10.0 ) * 0.5 + 0.5 );
    float discharge_glow = ( arc_pattern + exp( -abs( dist_to_sweep ) * 20.0 ) ) * mid_transition * vlt;
    col.rgb += discharge_glow * arc_color * ( 1.6 + audioKick * 1.17 + audioHigh * 1.5 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
