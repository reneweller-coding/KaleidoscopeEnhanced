#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file HelicoidMinimalSurface.frag
 * @brief TRANSITION HELICOID MINIMAL SURFACE: Ruled helicoid minimal surface screw transition.
 * A continuous helical ramp surface (z = c * theta) rotates and screws the outgoing
 * scene along its ruled geodesics, seamlessly unfurling into the incoming scene.
 *   interpolation -> sweeps helicoid rotation & helical screw pitch
 *   audioKick     -> flashes helicoid minimal surface ruling lines
 *
 * Per-activation variety:
 *   pitchP float helical screw pitch & tightness  (0.5..2.2)
 *   screwP float rotation angular velocity ratio  (0.5..2.0)
 *   speedP float animation speed multiplier       (0.5..2.0)
 *   hueP   float minimal surface hue offset       (0..6.28)
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

uniform float pitchP; ///< Pitch knob, 0..1.
uniform float screwP; ///< Screw knob: rotation angular velocity ratio, 0.5..2.
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
    float ptc = ( pitchP > 0.0 ) ? pitchP : 1.0;
    float scr = ( screwP > 0.0 ) ? screwP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.1875 * spd; // clock rate measured down to about 1.2/255 of change per frame (PresetEditor
                                   // --transprofile); it spun many times that and read as frantic
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    float r = length( p );
    float theta = atan( p.y, p.x );

    // Helicoid minimal surface coordinate: z = c * theta + rotation.
    // audioBass undulates the helical pitch dz/dtheta.  It is applied to the
    // SPATIAL theta term only — never to the t term — so the screw rate stays
    // audio-independent (anti-flicker).  mid_transition returns the pitch to its
    // base value at both fade endpoints, where the ramp wipe is blended out.
    float pitch_mod = 1.0; // constant: an envelope on a scale re-lays the whole pattern (speed pass 14.09.2026)
    float helicoid_z = ( theta * pitch_mod + t_prog * 6.2831853 * scr + t * 0.8 ) / 3.14159265 * ptc;
    float ramp_phase = fract( helicoid_z );
    float ramp_dist = min( ramp_phase, 1.0 - ramp_phase );

    // Helical screw coordinate warp; audioBass breathes the radial extent of
    // the screw.  The angle already carries mid_transition and warp_uv is blended
    // in by mid_transition, so both endpoints are exact.
    float screw_radius = 0.9; // constant: an envelope on a scale re-lays the whole pattern (speed pass 14.09.2026)
    float warp_angle = ( 1.0 - smoothstep( 0.0, screw_radius, r ) ) * mid_transition * 3.14159265;
    vec2  p_warp = rot2D( warp_angle ) * p;
    vec2  warp_uv = ( p_warp * resolution.y + 0.5 * resolution ) / resolution;

    vec4 c1 = texture( tex1, fract( mix( uv, warp_uv, mid_transition ) ) );
    vec4 c0 = texture( tex0, fract( mix( warp_uv, uv, 1.0 - mid_transition ) ) );

    float wipe_mask = smoothstep( 0.4, 0.6, ramp_phase );
    vec4  col = mix( c1, c0, mix( t_prog, wipe_mask, mid_transition * 0.7 ) );

    // Glowing helicoid ruling lines
    float ruling_glow = exp( -ramp_dist * 20.0 ) * mid_transition;
    col.rgb += ruling_glow * vec3( 1.0, 0.85, 0.3 ) * ( 1.3 + audioKick * 1.0 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
