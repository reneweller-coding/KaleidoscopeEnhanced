#version 330 core
/**
 * @file CyberVoxelTerraform.vert
 * @brief Vertex stage companion to CyberVoxelTerraform.frag -- see that file's header for
 * this scene's description.
 */
// attrA.xyz = unit-cube corner (-0.5..0.5), attrA.w = cube id, attrB = seeds
// (Scene3DShader.cpp GEOM_CUBES) — no per-face normal is supplied, so it is
// looked up from which 6-vertex face group (gl_VertexID % 36) this vertex
// belongs to, matching the CPU-side face winding order (-Z,+Z,-X,+X,+Y,-Y).
in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

/// Normals of the six cube faces.
const vec3 CubeFaceNormals[6] = vec3[6](
    vec3( 0.0, 0.0, -1.0 ), vec3( 0.0, 0.0, 1.0 ),
    vec3( -1.0, 0.0, 0.0 ), vec3( 1.0, 0.0, 0.0 ),
    vec3( 0.0, 1.0, 0.0 ), vec3( 0.0, -1.0, 0.0 ) );

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

out vec3  vPos;    ///< Position (from the vertex stage).
out vec3  vNormal; ///< Surface normal (from the vertex stage).
out vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vHeight; ///< Height (from the vertex stage).

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    // 70x70 grid coordinates
    float cube_id = attrA.w;
    float grid_x = mod( cube_id, 70.0 );
    float grid_z = floor( cube_id / 70.0 );

    vec2  grid_uv = ( vec2( grid_x, grid_z ) - vec2( 35.0 ) ) / 35.0;
    float dist = length( grid_uv );

    // Audio-reactive cyber voxel elevation
    float t = time * 0.4 + audioAdvance * 0.2;
    float ripple = sin( dist * 12.0 - t * 3.0 ) * cos( dist * 6.0 + t );
    float pyramid = max( 1.0 - max( abs( grid_uv.x ), abs( grid_uv.y ) ) * 1.4, 0.0 );

    // Kick shockwave ripple
    float shockwave = exp( -abs( dist - fract( time * 0.8 ) * 1.5 ) * 8.0 ) * audioKick * 2.0;

    float height = ( pyramid * 1.8 + ripple * 0.6 + shockwave ) * ( 0.8 + 0.6 * audioBass );

    // Position of cube instance
    vec3 cube_center = vec3( grid_uv.x * 5.0, height - 1.2, grid_uv.y * 5.0 );

    // Local vertex of the cube (scaled)
    vec3 local_pos = attrA.xyz * vec3( 0.06, 0.06 + height * 0.15, 0.06 );
    vec3 pos = cube_center + local_pos;

    vPos = pos;
    vNormal = CubeFaceNormals[int( mod( float( gl_VertexID ), 36.0 ) ) / 6];
    vUV = grid_uv * 0.5 + 0.5;
    vHeight = height;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    // Camera tilted down towards voxel landscape
    float tilt_angle = 0.45;
    float cos_t = cos( tilt_angle ), sin_t = sin( tilt_angle );
    vec3  rotated_vp = vec3( vp.x, vp.y * cos_t - vp.z * sin_t, vp.y * sin_t + vp.z * cos_t );

    rotated_vp.z += 6.5;
    rotated_vp.x -= eyeOff;

    gl_Position = projM * vec4( rotated_vp.x, rotated_vp.y, -rotated_vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
