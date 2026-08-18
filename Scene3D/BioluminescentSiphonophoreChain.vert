#version 330 core
/**
 * @file BioluminescentSiphonophoreChain.vert
 * @brief Vertex stage companion to BioluminescentSiphonophoreChain.frag -- see that file's header for
 * this scene's description.
 */
layout(location = 0) in vec4 attrA;
layout(location = 1) in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float audioKick;

out vec3 vWorldPos;
out vec3 vNormal;
out float vChainPhase;
out vec2 vQuadUV;

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
    vec3 vp = pos;
    vp.z += 7.0;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

}
