#version 400 core
/**
 * @file GlacierTessellation.tesc
 * @brief Tessellation-control stage companion to GlacierTessellation.frag -- see that file's header for
 * this scene's description.
 */
// GlacierTessellation.tesc — Distance-adaptive GPU Hardware Tessellation
layout(vertices = 4) out;

in  vec2 vUV[];   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in  vec4 vSeed[];   ///< Per-instance random seed (from the vertex stage).
out vec2 tcUV[];
out vec4 tcSeed[];

const vec2 EXTENT = vec2(240.0, 320.0);
uniform float camHP;   ///< Camera height knob, 0..1.
uniform float detailP;   ///< Detail knob, 0..1.

/// @brief The flat (unlit) colour at a coordinate.
vec3 flatAt(vec2 uv) {
    return vec3((uv.x - 0.5) * EXTENT.x, 0.0, uv.y * EXTENT.y + 2.0);
}

/// @brief Brightness level between two coordinates.
float levelFor(vec2 uvA, vec2 uvB) {
    vec3 mid = flatAt(mix(uvA, uvB, 0.5));
    float h = (camHP > 0.0) ? camHP : 8.0;
    float det = (detailP > 0.0) ? detailP : 1.0;
    float d = distance(mid, vec3(0.0, h, 0.0));
    return clamp(220.0 * det / max(d, 2.0), 1.0, 24.0);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    tcUV[gl_InvocationID]   = vUV[gl_InvocationID];
    tcSeed[gl_InvocationID] = vSeed[gl_InvocationID];

    if (gl_InvocationID == 0) {
        gl_TessLevelOuter[0] = levelFor(vUV[3], vUV[0]);
        gl_TessLevelOuter[1] = levelFor(vUV[0], vUV[1]);
        gl_TessLevelOuter[2] = levelFor(vUV[1], vUV[2]);
        gl_TessLevelOuter[3] = levelFor(vUV[2], vUV[3]);

        gl_TessLevelInner[0] = 0.5 * (gl_TessLevelOuter[1] + gl_TessLevelOuter[3]);
        gl_TessLevelInner[1] = 0.5 * (gl_TessLevelOuter[0] + gl_TessLevelOuter[2]);
    }
}
