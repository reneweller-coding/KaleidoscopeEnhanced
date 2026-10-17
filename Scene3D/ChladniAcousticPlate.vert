#version 330 core
/*****************************************************************************\
 *                              ChladniAcousticPlate.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to ChladniAcousticPlate.frag -- see that file's header for this scene's description.
 *
 *  Audio Reactivity:
 *    audioAdvance   -> slow walk through the Chladni mode numbers (jump-free)
 *    audioBass      -> bounce height
 *    audioKick      -> grains jump off the plate and briefly stop settling
 *    audioZCR       -> grain scatter: hiss keeps the sand skittering, a held
 *                      tone lets it settle into razor-sharp nodal lines
 *    audioHarmChange-> a chord change re-tunes the plate; the sand is thrown
 *                      off the lines and has to settle all over again
 *
 *  @author René Weller
 */
layout( location = 0 ) in vec3 inPos;    ///< Pos (vertex attribute).
layout( location = 1 ) in vec3 inNormal; ///< Normal (vertex attribute).

uniform mat4  projM;           ///< Projection matrix.
uniform float eyeOff;          ///< Stereo eye offset (0 in mono).
uniform float time;            ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioPhase;      ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;    ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                               ///< backwards).
uniform float audioKick;       ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;       ///< Bass band level, 0..1.
uniform float audioMid;        ///< Mid band level, 0..1.
uniform float audioHigh;       ///< High band level, 0..1.
uniform float audioSwell;      ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioZCR;        ///< signal noisiness -> grain scatter
uniform float audioHarmChange; ///< spikes on chord / key changes

out vec3  vPos;         ///< Position (from the vertex stage).
out float vNodalDist;   ///< Nodal dist (from the vertex stage).
out float vPlateEnergy; ///< Plate energy (from the vertex stage).

/**  Pseudo-random number 0..1 from a float.
 *
 * @param p  The input value. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash11( float p )
{
    p = fract( p * 0.1031 );
    p *= p + 113.17;
    p *= p + p;
    return fract( p );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float id = float( gl_VertexID );
    float seed_x = hash11( id );
    float seed_y = hash11( id + 5000.0 );

    // Initial random position on square plate [-1, 1]
    vec2 p = vec2( seed_x * 2.0 - 1.0, seed_y * 2.0 - 1.0 );

    // The mode numbers GLIDE: a triangle wave over the music's advance, so the figure morphs from one mode into the
    // next and back without a wrap.  Until 17.10.2026 they were floor(mod(...)) of the mid and bass envelopes as
    // well -- the figure could jump several times a second, a strobe of whole patterns.
    float m = 3.0 + 4.0 * abs( fract( audioAdvance * 0.5 / 8.0 ) * 2.0 - 1.0 ); // 3..7
    float n = 2.0 + 3.0 * abs( fract( audioAdvance * 0.3 / 6.0 + 0.25 ) * 2.0 - 1.0 );               // 2..5

    float pi = 3.14159265;
    // Chladni vibration amplitude function
    float w = sin( n * pi * p.x * 0.5 ) * sin( m * pi * p.y * 0.5 )
              - sin( m * pi * p.x * 0.5 ) * sin( n * pi * p.y * 0.5 );

    // Gradient of vibration field: particles drift down the gradient towards w = 0 (nodal lines)
    float eps = 0.01;
    float w_x = ( sin( n * pi * ( p.x + eps ) * 0.5 ) * sin( m * pi * p.y * 0.5 )
                  - sin( m * pi * ( p.x + eps ) * 0.5 ) * sin( n * pi * p.y * 0.5 ) - w )
                / eps;
    float w_y = ( sin( n * pi * p.x * 0.5 ) * sin( m * pi * ( p.y + eps ) * 0.5 )
                  - sin( m * pi * p.x * 0.5 ) * sin( n * pi * ( p.y + eps ) * 0.5 ) - w )
                / eps;
    vec2  grad_w = vec2( w_x, w_y );

    // Dynamic displacement towards nodal lines.  A chord / key change re-tunes
    // the plate: the grains lose their grip on the lines and have to settle
    // all over again as the new harmony holds.
    float retune = clamp( audioHarmChange, 0.0, 1.0 );
    float drift = 0.4 * ( 1.0 - 0.5 * audioKick ) * ( 1.0 - 0.55 * retune );
    vec2  nodal_pos = p - grad_w * w * drift;

    // Broadband hiss keeps the sand skittering across the plate; a pure held
    // tone lets it collapse onto razor-sharp nodal lines.  The wobble rides
    // audioPhase (pre-integrated) so the scatter drifts instead of snapping.
    float scatter = clamp( audioZCR, 0.0, 1.0 ) * 0.22 + retune * 0.10;
    nodal_pos += vec2( sin( audioPhase * 3.0 + seed_x * 40.0 ),
                       cos( audioPhase * 2.6 + seed_y * 40.0 ) )
                 * scatter;

    // Bounce height on beat kicks
    float bounce = abs( w ) * ( 0.2 + 0.8 * audioKick ) * ( 0.8 + 0.4 * audioBass );

    vec3 pos = vec3( nodal_pos.x * 3.0, bounce - 0.8, nodal_pos.y * 3.0 );

    vPos = pos;
    vNodalDist = abs( w );
    vPlateEnergy = ( 1.0 - abs( w ) ) * ( 1.0 + audioKick * 2.0 );

    // Stereoscopic 3D camera projection with downward plate angle
    vec3  vp = pos;
    float tilt = 0.45;
    float cos_t = cos( tilt ), sin_t = sin( tilt );
    vec3  rotated_vp = vec3( vp.x, vp.y * cos_t - vp.z * sin_t, vp.y * sin_t + vp.z * cos_t );

    rotated_vp.z += 5.2;
    rotated_vp.x -= eyeOff;

    gl_Position = projM * vec4( rotated_vp.x, rotated_vp.y, -rotated_vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    gl_PointSize = clamp( ( 5.0 + 5.5 * vPlateEnergy ) * ( 9.5 / rotated_vp.z ), 2.0, 34.0 ); // sprite sweep
}
