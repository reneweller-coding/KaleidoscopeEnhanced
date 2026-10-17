#version 330 core
/*****************************************************************************\
 *                              WormholeSpaceFold.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TRANSITION WORMHOLE SPACE FOLD: Traversable Morris-Thorne wormhole transition.
 *
 *  The camera plunges through a traversable Lorentzian wormhole throat that smoothly folds the geometry of Universe
 *  1 (tex1) into Universe 2 (tex0).
 *
 *    interpolation -> navigates camera through the wormhole throat tunnel
 *    audioKick     -> flashes exotic matter throat stabilization rings
 *
 *  Per-activation variety:
 *    throatP float wormhole throat radius scale   (0.5..2.2)
 *    curveP  float spacetime curvature distortion (0.5..2.0)
 *    speedP  float traversal velocity multiplier  (0.5..2.0)
 *    hueP    float throat chromatic hue offset    (0..6.28)
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

uniform float throatP; ///< Throat knob: wormhole throat radius scale, 0.5..2.2.
uniform float curveP;  ///< Curve knob: spacetime curvature distortion (0.5..2.0).
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
    float thr = ( throatP > 0.0 ) ? throatP : 1.0;
    float crv = ( curveP > 0.0 ) ? curveP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.0209 * spd; // clock rate measured down to about 1.2/255 of change per frame (PresetEditor
                                   // --transprofile); it spun many times that and read as frantic
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    float r = length( p );
    float angle = atan( p.y, p.x );

    // Morris-Thorne throat coordinate: l = -infty (Universe 1) to +infty (Universe 2)
    float l = mix( -2.5, 2.5, t_prog );
    float throat_radius = 0.33 * thr; // constant: an envelope on a scale re-lays the whole pattern (speed
                                      // pass 14.09.2026)

    // Radius function: r(l) = sqrt(r_0^2 + l^2)
    float metric_r = sqrt( throat_radius * throat_radius + l * l );

    // Spacetime curvature deflection
    float deflection = ( throat_radius / max( r, 0.05 ) ) * mid_transition * crv;
    // The time-driven swirl term must be windowed by the envelope too — an
    // ungated t*0.4 rotated the WHOLE frame at both fade endpoints.
    vec2 p_warp = rot2D( deflection * 1.5 + t * 0.4 * mid_transition ) * ( p * ( 1.0 + deflection * 0.8 ) );
    vec2 warp_uv = ( p_warp * resolution.y + 0.5 * resolution ) / resolution;

    vec4 c1 = texture( tex1, fract( warp_uv ) );
    vec4 c0 = texture( tex0, fract( warp_uv ) );

    // Dual universe boundary wipe
    float throat_wipe = smoothstep( -0.2, 0.2, l + ( r - 0.4 ) );
    vec4  col = mix( c1, c0, throat_wipe );

    // Exotic matter throat glowing ring
    float throat_glow = exp( -abs( r - throat_radius ) * 20.0 ) * mid_transition;
    col.rgb += throat_glow * vec3( 0.4, 0.95, 1.0 ) * ( 1.5 + audioKick * 1.0 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
