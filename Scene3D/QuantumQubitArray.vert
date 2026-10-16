#version 330 core
/**
 * @file QuantumQubitArray.vert
 * @brief attrA.xyz = unit-cube corner (-0.5..0.5), attrA.w = cube ID, attrB = seeds
 * (Scene3DShader.cpp GEOM_CUBES) — normal looked up from gl_VertexID % 36 / 6.
 */
in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

const vec3 CubeFaceNormals[6] = vec3[6](
    vec3( 0.0, 0.0, -1.0 ), vec3( 0.0, 0.0, 1.0 ),
    vec3( -1.0, 0.0, 0.0 ), vec3( 1.0, 0.0, 0.0 ),
    vec3( 0.0, 1.0, 0.0 ), vec3( 0.0, -1.0, 0.0 ) );

uniform mat4  projM;             ///< Projection matrix.
uniform float eyeOff;            ///< Stereo eye offset (0 in mono).
uniform float time;              ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioPhase;        ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;      ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                 ///< backwards).
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;         ///< Bass band level, 0..1.
uniform float audioMid;          ///< Mid band level, 0..1.
uniform float audioHigh;         ///< High band level, 0..1.
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioSpectrum[32]; ///< Spectrum bands, 0..1.

out vec3  vPos;    ///< Position (from the vertex stage).
out vec3  vNormal; ///< Surface normal (from the vertex stage).
out vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vQubitState;
out float vEnergy;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float cube_id = attrA.w;
    float grid_x = mod( cube_id, 70.0 );
    float grid_z = floor( cube_id / 70.0 );

    vec2  grid_uv = ( vec2( grid_x, grid_z ) - vec2( 35.0 ) ) / 35.0;
    float dist = length( grid_uv );

    // Spectrum band assignment
    int   band_idx = int( clamp( dist * 31.0, 0.0, 31.0 ) );
    float band_val = audioSpectrum[band_idx];

    // Qubit superposition state & Bloch sphere angle theta
    float theta = ( sin( grid_x * 0.4 + time * 2.0 ) * cos( grid_z * 0.4 - audioAdvance * 0.5 ) ) * 0.55;
    float phi = ( grid_uv.x * 3.0 + grid_uv.y * 3.0 + audioPhase );

    // Gate flip transient on kick
    float gate_flip = exp( -abs( dist - fract( time * 0.9 ) * 1.4 ) * 6.0 ) * audioKick * 0.8;

    // Tower height
    float height = ( 0.2 + band_val * 1.2 + abs( sin( theta ) ) * 0.5 + gate_flip * 0.6 ) * ( 0.7 + 0.5 * audioBass );

    // Local qubit cube rotation (Bloch sphere rotation around Y and X)
    vec3  local_p = attrA.xyz;
    float rot_a = theta + gate_flip;
    float c_a = cos( rot_a ), s_a = sin( rot_a );
    local_p.yz = vec2( local_p.y * c_a - local_p.z * s_a, local_p.y * s_a + local_p.z * c_a );

    // Scale cube into rectangular monolith
    local_p *= vec3( 0.055, 0.06 + height * 0.18, 0.055 );

    vec3 cube_center = vec3( grid_uv.x * 5.6, height * 0.5 - 1.0, grid_uv.y * 5.6 );
    vec3 pos = cube_center + local_p;

    vPos = pos;
    vNormal = CubeFaceNormals[int( mod( float( gl_VertexID ), 36.0 ) ) / 6];
    vUV = grid_uv * 0.5 + 0.5;
    vQubitState = sin( theta * 2.0 );
    vEnergy = band_val + gate_flip;

    // Stereoscopic 3D camera projection
    // Closer than before: at 9.5 units the array filled half the frame (reported).
    vec3 vp = pos;
    vp.y -= 1.1;
    float tilt_angle = -0.78;
    float cos_t = cos( tilt_angle ), sin_t = sin( tilt_angle );
    vec3  rotated_vp = vec3( vp.x, vp.y * cos_t - vp.z * sin_t, vp.y * sin_t + vp.z * cos_t );

    rotated_vp.z += 4.4;
    rotated_vp.x -= eyeOff;

    gl_Position = projM * vec4( rotated_vp.x, rotated_vp.y, -rotated_vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
