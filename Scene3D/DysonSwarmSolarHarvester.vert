#version 330 core
/**
 * @file DysonSwarmSolarHarvester.vert
 * @brief Vertex stage companion to DysonSwarmSolarHarvester.frag -- see that file's header for
 * this scene's description.
 */
// attrA.xy = quad-local corner uv (0..1), attrA.w = quad id, attrB = seeds
// (Scene3DShader.cpp GEOM_QUADS)
in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;        ///< Projection matrix.
uniform float eyeOff;       ///< Stereo eye offset (0 in mono).
uniform float time;         ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                            ///< backwards).
uniform float audioKick;    ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;    ///< Bass band level, 0..1.
uniform float audioMid;     ///< Mid band level, 0..1.
uniform float audioHigh;    ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

out vec3  vPos;        ///< Position (from the vertex stage).
out vec2  vUV;         ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vRingIdx;    ///< Ring idx (from the vertex stage).
out float vLaserRelay; ///< Laser relay (from the vertex stage).

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
    p *= p + 83.45;
    p *= p + p;
    return fract( p );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float quad_id = attrA.w;
    float seed = hash11( quad_id );

    // 16 concentric orbital inclination rings
    float ring = floor( quad_id / 180.0 );
    float sat_idx = mod( quad_id, 180.0 );

    float orbital_radius = 1.8 + ring * 0.18;
    float orbital_speed = 0.5 / sqrt( orbital_radius );
    float inclination = ( ring - 8.0 ) * 0.15;

    float t = time * 0.3 * orbital_speed + audioAdvance * 0.1;
    float true_anomaly = ( sat_idx / 180.0 ) * 6.2831853 + t;

    // Orbital 3D coordinates
    vec3 orb_pos = vec3( orbital_radius * cos( true_anomaly ),
                         sin( inclination ) * orbital_radius * sin( true_anomaly ),
                         cos( inclination ) * orbital_radius * sin( true_anomaly ) );

    // Satellite face pointing towards central star (0,0,0)
    vec3 to_center = normalize( -orb_pos );
    vec3 tangent = normalize( cross( to_center, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3 bitangent = cross( to_center, tangent );

    // Mirror quad local size
    vec2  offset = attrA.xy - vec2( 0.5 );
    float mirror_scale = 0.08 + 0.02 * sin( quad_id * 0.2 );

    vec3 pos = orb_pos + ( offset.x * tangent + offset.y * bitangent ) * mirror_scale;

    // Laser relay pulses firing between swarm satellites on beat kicks
    float relay = ( 0.5 + 0.5 * sin( sat_idx * 0.5 + time * 6.0 ) ) * ( 1.0 + audioKick * 3.0 );

    vPos = pos;
    vUV = attrA.xy;
    vRingIdx = ring / 16.0;
    vLaserRelay = relay;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    vp.z += 5.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
