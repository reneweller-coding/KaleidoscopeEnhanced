#version 330 core
/*****************************************************************************\
 *                              CoralReefFluorescence.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to CoralReefFluorescence.frag -- see that file's header for this scene's description.
 *
 *  @author René Weller
 */
// attrA.xy = grid uv (0..1), attrB = per-cell seeds (Scene3DShader.cpp GEOM_GRID)
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

out vec3  vPos;          ///< Position (from the vertex stage).
out vec3  vNormal;       ///< Surface normal (from the vertex stage).
out vec2  vUV;           ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vFluorescence; ///< Fluorescence (from the vertex stage).

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 grid_uv = attrA.xy;
    vec2 p = grid_uv * 12.0;

    float t = time * 0.4 + audioAdvance * 0.2;

    // Multi-octave organic coral colony shapes (Brain coral + staghorn ridges)
    float ridge1 = sin( p.x * 2.0 + sin( p.y * 3.0 ) ) * cos( p.y * 2.0 );
    float ridge2 = sin( p.x * 4.0 - p.y * 4.0 + t ) * 0.4;
    float polyp = sin( p.x * 12.0 ) * cos( p.y * 12.0 ) * 0.15;

    // Rhythmic underwater ocean current sea fan sway
    float sway = sin( grid_uv.x * 6.0 + t * 2.0 ) * 0.3 * ( 0.8 + 0.5 * audioBass );

    float height = ( ridge1 + ridge2 + polyp + sway ) * ( 0.8 + 0.4 * audioSwell );

    vec3 pos = vec3( ( grid_uv.x - 0.5 ) * 6.0, height - 0.8, ( grid_uv.y - 0.5 ) * 5.0 );

    // Dynamic normal calculation
    float eps = 0.05;
    float h_l = sin( ( p.x - eps ) * 2.0 + sin( p.y * 3.0 ) ) * cos( p.y * 2.0 );
    float h_r = sin( ( p.x + eps ) * 2.0 + sin( p.y * 3.0 ) ) * cos( p.y * 2.0 );
    float h_d = sin( p.x * 2.0 + sin( ( p.y - eps ) * 3.0 ) ) * cos( ( p.y - eps ) * 2.0 );
    float h_u = sin( p.x * 2.0 + sin( ( p.y + eps ) * 3.0 ) ) * cos( ( p.y + eps ) * 2.0 );
    vec3  n = normalize( vec3( h_l - h_r, 2.0 * eps, h_d - h_u ) );

    // Ultraviolet fluorescence emission intensity
    float fluor = ( polyp * 3.0 + 0.5 ) * ( 1.0 + audioKick * 2.5 );

    vPos = pos;
    vNormal = n;
    vUV = grid_uv;
    vFluorescence = fluor;

    // Stereoscopic 3D camera projection with downward tilt
    vec3  vp = pos;
    float tilt = 0.45;
    float cos_t = cos( tilt ), sin_t = sin( tilt );
    vec3  rotated_vp = vec3( vp.x, vp.y * cos_t - vp.z * sin_t, vp.y * sin_t + vp.z * cos_t );

    rotated_vp.z += 5.2;
    rotated_vp.x -= eyeOff;

    gl_Position = projM * vec4( rotated_vp.x, rotated_vp.y, -rotated_vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
