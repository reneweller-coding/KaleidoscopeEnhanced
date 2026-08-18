#version 430 core
/**
 * @file CrystallineCavernTessellation.tesc
 * @brief Tessellation-control stage companion to CrystallineCavernTessellation.frag -- see that file's header for
 * this scene's description.
 */
layout(vertices = 4) out;

in vec3 vControlPos[];
in vec2 vControlUV[];

out vec3 tcPos[];
out vec2 tcUV[];

uniform float audioSwell;
uniform float audioMid;

void main() {
    tcPos[gl_InvocationID] = vControlPos[gl_InvocationID];
    tcUV[gl_InvocationID] = vControlUV[gl_InvocationID];

    if (gl_InvocationID == 0) {
        float tessLevel = 16.0 + 12.0 * audioMid + 8.0 * audioSwell;
        gl_TessLevelOuter[0] = tessLevel;
        gl_TessLevelOuter[1] = tessLevel;
        gl_TessLevelOuter[2] = tessLevel;
        gl_TessLevelOuter[3] = tessLevel;

        gl_TessLevelInner[0] = tessLevel;
        gl_TessLevelInner[1] = tessLevel;
    }
}
