#version 400 core
/**
 * @file SpectroCanyon.tesc
 * @brief Tessellation-control stage companion to SpectroCanyon.frag -- see that file's header for
 * this scene's description.
 */
// SpectroCanyon.tesc — spend triangles where the canyon is close.
// Each edge takes its level from its OWN midpoint, so two patches sharing an
// edge always agree and the walls do not split along the seams.
layout(vertices = 4) out;

in  vec2 vUV[];
in  vec4 vSeed[];
out vec2 tcUV[];
out vec4 tcSeed[];

uniform float detailP;

const vec2 EXTENT = vec2(78.0, 260.0);

float levelFor(vec2 uvA, vec2 uvB)
{
    vec2 m = mix(uvA, uvB, 0.5);
    float d = m.y * EXTENT.y + 3.0;
    return clamp(210.0 * detailP / d, 1.0, 22.0);
}

void main()
{
    tcUV[gl_InvocationID]   = vUV[gl_InvocationID];
    tcSeed[gl_InvocationID] = vSeed[gl_InvocationID];

    if (gl_InvocationID == 0)
    {
        gl_TessLevelOuter[0] = levelFor(vUV[3], vUV[0]);
        gl_TessLevelOuter[1] = levelFor(vUV[0], vUV[1]);
        gl_TessLevelOuter[2] = levelFor(vUV[1], vUV[2]);
        gl_TessLevelOuter[3] = levelFor(vUV[2], vUV[3]);
        gl_TessLevelInner[0] = 0.5 * (gl_TessLevelOuter[1] + gl_TessLevelOuter[3]);
        gl_TessLevelInner[1] = 0.5 * (gl_TessLevelOuter[0] + gl_TessLevelOuter[2]);
    }
}
