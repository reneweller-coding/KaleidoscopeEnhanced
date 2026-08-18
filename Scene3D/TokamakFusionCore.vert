#version 330 core
/**
 * @file TokamakFusionCore.vert
 * @brief Vertex stage companion to TokamakFusionCore.frag -- see that file's header for
 * this scene's description.
 */
// attrA.xyz = world pos (baked by the compute generator), attrA.w = heat
// attrB.w   = specBand (Scene3DShader.cpp GEOM_INDIRECT, 8-float layout)
in vec4 attrA;
in vec4 attrB;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform float audioKick;

out vec3 vPos;
out float vHeat;
out float vStrand;

void main() {
    vec3 worldP = attrA.xyz;
    vPos = worldP;
    vHeat = attrA.w;
    vStrand = attrB.w;

    // Stereoscopic 3D camera projection
    vec3 vp = worldP;
    vp.z += 6.5; // Offset into camera frustum
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
