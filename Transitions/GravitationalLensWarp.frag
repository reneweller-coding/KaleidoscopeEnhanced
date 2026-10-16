#version 330 core
/*****************************************************************************\
 *                              GravitationalLensWarp.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TRANSITION GRAVITATIONAL LENS WARP: Relativistic black-hole gravitational lensing.
 *
 *  A dark matter singularity opens at the center of the frame, bending spacetime, forming Einstein rings,
 *  swallowing the outgoing scene and expanding the new one.
 *
 *    interpolation -> sweeps Schwarzschild radius from 0 to maximum and back
 *    audioKick     -> flashes bright photon sphere ring emission
 *    audioSwell    -> drives gravitational deflection depth
 *
 *  Per-activation variety:
 *    lensP  float gravitational lensing strength (0.5..2.2)
 *    massP  float black hole mass & ring radius  (0.5..2.0)
 *    speedP float frame dragging rotation speed  (0.5..2.0)
 *    hueP   float photon ring hue offset         (0..6.28)
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

uniform float lensP;  ///< Lens knob, 0..1.
uniform float massP;  ///< Mass knob: black hole mass & ring radius, 0.5..2.
uniform float speedP; ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    float lns = ( lensP > 0.0 ) ? lensP : 1.0;
    float mss = ( massP > 0.0 ) ? massP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.061 * spd; // clock rate measured down to about 1.2/255 of change per frame (PresetEditor
                                  // --transprofile); it spun many times that and read as frantic
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    float r = length( p );
    float r_schwarzschild = 0.25 * mid_transition * mss;
    float r_photon_ring = r_schwarzschild * 1.5;

    // Relativistic gravitational deflection: r' = r - r_s^2 / r.
    // audioBass drives the deflection depth.  r_s is itself scaled by
    // mid_transition, so the deflection is exactly zero at both fade endpoints —
    // and warp_uv is blended in by mid_transition there on top of that.
    float deflection = ( r_schwarzschild * r_schwarzschild ) / max( r * r, 0.001 ) * lns * ( 1.0 + audioSwell * 0.7 );
    vec2  p_lensed = p * ( 1.0 - deflection * 0.7 );
    p_lensed = rot2D( deflection * 1.2 + t * 0.3 ) * p_lensed;

    vec2 warp_uv = ( p_lensed * resolution.y + 0.5 * resolution ) / resolution;

    vec4 c1 = texture( tex1, fract( mix( uv, warp_uv, mid_transition ) ) );
    vec4 c0 = texture( tex0, fract( mix( warp_uv, uv, 1.0 - mid_transition ) ) );

    vec4 col = mix( c1, c0, t_prog );

    // Glowing Einstein photon ring
    float photon_ring = exp( -abs( r - r_photon_ring ) * 35.0 ) * mid_transition;
    col.rgb += photon_ring * vec3( 0.2, 0.9, 1.0 ) * ( 1.5 + audioKick * 1.0 );

    // Central event horizon shadow
    float shadow = smoothstep( r_schwarzschild * 0.7, r_schwarzschild * 1.1, r );
    col.rgb *= mix( 1.0, shadow, mid_transition );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
