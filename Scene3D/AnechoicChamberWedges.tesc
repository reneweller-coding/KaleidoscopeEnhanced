#version 400 core
/**
 * @file AnechoicChamberWedges.tesc
 * @brief Tessellation control for AnechoicChamberWedges: a high, nearly
 * uniform level -- the wedges are sharp pyramids and need the resolution
 * everywhere; a little finer with the swell.  Edge levels from the edge
 * midpoints so neighbouring patches agree.
 */
layout(vertices = 4) out;

in  vec2 vUV[];
in  vec4 vSeed[];
out vec2 tcUV[];
out vec4 tcSeed[];

uniform float detailP;
uniform float audioSwell;

float levelFor(vec2 uvA, vec2 uvB)
{
    vec2 mid = mix(uvA, uvB, 0.5);
    float d = length(mid - 0.5);
    float fine = 0.85 + 0.3 * clamp(audioSwell, 0.0, 1.0);
    return clamp(22.0 * detailP * fine / (1.0 + d * 0.6), 4.0, 32.0);
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
