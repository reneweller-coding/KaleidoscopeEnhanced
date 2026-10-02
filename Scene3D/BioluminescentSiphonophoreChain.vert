#version 330 core
/**
 * @file BioluminescentSiphonophoreChain.vert
 * @brief Vertex stage companion to BioluminescentSiphonophoreChain.frag -- see that file's header for
 * this scene's description.
 */
layout(location = 0) in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
layout(location = 1) in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).

out vec3 vWorldPos;   ///< World position (from the vertex stage).
out vec3 vNormal;   ///< Surface normal (from the vertex stage).
out float vChainPhase;
out vec2 vQuadUV;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vec3 pos = attrA.xyz;

    // Quad-local coordinate in [-1,1], rebuilt from the corner code the
    // generator packed into attrA.w (gl_PointCoord is undefined for triangles).
    float cc = attrA.w;
    vQuadUV = vec2((cc == 0.0 || cc == 3.0) ? -1.0 : 1.0,
                   (cc <  2.0)              ? -1.0 : 1.0);
    vWorldPos = pos;
    vNormal = attrB.xyz;
    vChainPhase = attrB.w;

    // Camera transform: projM expects NEGATIVE view-space z (clip-w = -z_view),
    // so push the scene away along +z and negate.  eyeOff is the stereo shift.
    // kCam MUST match the constant of the same name in the generator, which
    // lays the bloom out in frustum coordinates against it.
    const float kCam = 7.0;
    vec3 vp = pos;
    vp.z += kCam;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    // A long stem on a loud preset can swing its far end through the near
    // plane; cull that vertex rather than let the divide smear a triangle
    // across the whole frame.
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
