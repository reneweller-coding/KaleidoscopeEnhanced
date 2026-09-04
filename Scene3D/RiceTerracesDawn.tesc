#version 400 core
/**
 * @file RiceTerracesDawn.tesc
 * @brief Tessellation control for RiceTerracesDawn: adaptive by distance,
 * finer with the swell.  EXTENT must match the evaluation stage exactly,
 * or the patches tear along their seams.
 */
layout(vertices = 4) out;

in  vec2 vUV[];
in  vec4 vSeed[];
out vec2 tcUV[];
out vec4 tcSeed[];

const vec2 EXTENT = vec2(285.0, 230.0);
uniform float camHP;
uniform float detailP;
uniform float audioSwell;

vec3 flatAt(vec2 uv)
{
    return vec3((uv.x - 0.5) * EXTENT.x, 0.0, uv.y * EXTENT.y + 3.0);
}

float levelFor(vec2 uvA, vec2 uvB)
{
    vec3 mid = flatAt(mix(uvA, uvB, 0.5));
    float d = distance(mid, vec3(0.0, camHP, 0.0));
    float fine = 0.85 + 0.35 * clamp(audioSwell, 0.0, 1.0);
    return clamp(200.0 * detailP * fine / max(d, 2.0), 1.0, 26.0);
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
