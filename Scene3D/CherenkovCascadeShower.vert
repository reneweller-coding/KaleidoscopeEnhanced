#version 330 core
/*****************************************************************************\
 *                              CherenkovCascadeShower.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to CherenkovCascadeShower.frag -- see that file's header for this scene's description.
 *
 *  Audio Reactivity:
 *    audioAdvance  -> shower generation cycle (pre-integrated, jump-free)
 *    audioKick     -> shockwave explosion + particle size surge
 *    audioHigh     -> overall Cherenkov emission gain
 *    audioChromaHue-> rotates the cyan/ultraviolet track palette
 *    audioSpread   -> spatial spread of the cascade cone (narrow spectrum =
 *                     collimated pencil beam, broadband = wide fan)
 *    audioRoughness-> dissonance scatters tracks off their clean Lorentz helices
 *    audioHat      -> hi-hats/cymbals spark a subset of tracks bigger + white
 *
 *  @author René Weller
 */
// CherenkovCascadeShower.vert — 60,000 relativistic particle collision tracks
// in heavy water with glowing cyan Cherenkov radiation and magnetic deflection.
//   attrA.x = particle ID, attrA.y = seed, attrA.zw = track params

in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioSpread;    ///< narrow spectrum = collimated, wide = fanned out
uniform float audioRoughness; ///< sensory dissonance -> track scatter
uniform float audioHat;       ///< hi-hat / cymbal onset envelope

uniform float cascadeP; ///< Cascade knob, 0.5..2.
uniform float fieldP;   ///< Field knob, 0.5..2.
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;     ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

out vec4 vCol; ///< Colour (from the vertex stage).
out vec2 vUV;  ///< Texture coordinate 0..1 over the screen (from the vertex stage).

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
    float pi = attrA.x; // particle index 0..59999
    vec4  seeds = attrB;

    float csc = ( cascadeP > 0.0 ) ? cascadeP : 1.0;
    float fld = ( fieldP > 0.0 ) ? fieldP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    // Shower generation cycle
    float cycle = fract( seeds.x + time * 0.4 * spd + audioAdvance * 0.2 );
    float s_dist = cycle * 12.0 * csc;

    // Cone opening angle — the SPECTRAL spread sets the shower's spatial
    // spread: a narrow, pure spectrum collimates the cascade into a tight
    // pencil beam, a rich broadband one fans it out across the tank.
    float cone_angle = seeds.y * 6.2831853;
    float spread = ( 0.25 + 0.5 * seeds.z ) * cycle * ( 0.75 + 0.55 * audioSpread );

    // Magnetic field Lorentz curvature (helical spiral track)
    float charge = ( seeds.w > 0.5 ) ? 1.0 : -1.0;
    float lorentz_angle = cone_angle + cycle * 4.0 * fld * charge;

    vec3 world_p = vec3(
        cos( lorentz_angle ) * spread * 6.0,
        sin( lorentz_angle ) * spread * 6.0,
        s_dist - 6.0 );

    // Dissonant clusters scatter the tracks off their clean helical paths —
    // consonant harmony lets every particle ride its Lorentz spiral cleanly.
    float jitter = audioRoughness * 0.55;
    world_p.xy += vec2( sin( seeds.x * 91.7 + cycle * 17.0 ),
                        cos( seeds.y * 73.3 + cycle * 13.0 ) )
                  * jitter * spread * 3.0;

    // Kick shockwave explosion
    world_p += normalize( world_p + vec3( 0.001 ) ) * audioKick * 2.0 * exp( -cycle * 3.0 );

    // Camera space
    vec3 cam_pos = vec3( 0.0, 0.0, -10.0 );
    vec3 rel_p = world_p - cam_pos;
    rel_p.x -= eyeOff;

    gl_Position = projM * vec4( rel_p.x, rel_p.y, -rel_p.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Point size attenuation — hi-hats/cymbals spark a scattered SUBSET of the
    // tracks into brief bright grains (bounded, so the frame cannot flood).
    float hat_spark = min( audioHat, 1.0 ) * step( 0.62, seeds.z ) * ( 1.0 - cycle );
    gl_PointSize = ( 7.0 + 12.0 * audioKick * ( 1.0 - cycle ) + 4.5 * hat_spark )
                   * ( 1.0 / max( gl_Position.w * 0.1, 0.5 ) );

    vUV = vec2( seeds.x, seeds.y );

    // Pure Cherenkov cyan / ultraviolet electric color
    vec3 cherenkov_cyan = vec3( 0.05, 0.85, 1.0 );
    vec3 cherenkov_white = vec3( 0.9, 0.98, 1.0 );
    vec3 col = mix( cherenkov_cyan, cherenkov_white, exp( -cycle * 4.0 ) );
    // Cymbal hits also flash those sparked tracks toward pure white.
    col = mix( col, cherenkov_white, hat_spark * 0.35 );

    if ( audioChromaHue != 0.0 )
        col = hueRot( col, audioChromaHue );
    if ( hue > 0.001 )
        col = hueRot( col, hue );

    vCol = vec4( col * ( 1.0 + audioHigh * 1.2 ), 1.0 - cycle );
}
