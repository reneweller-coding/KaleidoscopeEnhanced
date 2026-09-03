#version 400 core
/**
 * @file PermafrostPolygons.tesc
 * @brief Tessellation control for PermafrostPolygons: adaptive by distance,
 * a little finer with the swell; fractional_odd_spacing keeps level changes
 * continuous; edge levels from the edge midpoints.
 */
layout(vertices = 4) out;

in  vec2 vUV[];
in  vec4 vSeed[];
out vec2 tcUV[];
out vec4 tcSeed[];

const vec2 EXTENT = vec2(160.0, 220.0);
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
    float fine = 0.8 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    return clamp(170.0 * detailP * fine / max(d, 2.0), 1.0, 24.0);
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
