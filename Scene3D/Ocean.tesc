#version 400 core
// Ocean.tesc — adaptive tessellation by distance.
// -----------------------------------------------------------------------
// This is the point of the whole stage: patches near the camera are split
// into many triangles, patches near the horizon into almost none.  A fixed
// mesh dense enough for the foreground would be millions of wasted vertices
// at the back; one coarse enough for the back has visibly faceted waves in
// front.
//
// The four OUTER levels must agree between neighbouring patches or the
// surface cracks along the seam, so each edge's level is derived from that
// EDGE's midpoint alone — never from the patch centre, which differs on the
// two sides of a shared edge.
// -----------------------------------------------------------------------
layout(vertices = 4) out;

in  vec2 vUV[];
in  vec4 vSeed[];
out vec2 tcUV[];
out vec4 tcSeed[];

// The sheet's world size.  Shared by the control and evaluation stages —
// if these ever disagree, the two stages place the same patch in different
// spots and the surface tears along every seam.
const vec2 EXTENT = vec2(220.0, 320.0);
uniform float camHP;       // preset: camera height above the water
uniform float detailP;     // preset: tessellation quality

// Same flat mapping the evaluation shader starts from: z runs AHEAD of the
// camera, matching the engine's -z projection convention.
vec3 flatAt(vec2 uv)
{
    return vec3((uv.x - 0.5) * EXTENT.x, 0.0, uv.y * EXTENT.y + 2.0);
}

float levelFor(vec2 uvA, vec2 uvB)
{
    vec3 mid = flatAt(mix(uvA, uvB, 0.5));
    float d = distance(mid, vec3(0.0, camHP, 0.0));
    return clamp(190.0 * detailP / max(d, 2.0), 1.0, 22.0);
}

void main()
{
    tcUV[gl_InvocationID]   = vUV[gl_InvocationID];
    tcSeed[gl_InvocationID] = vSeed[gl_InvocationID];

    if (gl_InvocationID == 0)
    {
        // Quad-domain edge order: 0 = v3-v0, 1 = v0-v1, 2 = v1-v2, 3 = v2-v3
        gl_TessLevelOuter[0] = levelFor(vUV[3], vUV[0]);
        gl_TessLevelOuter[1] = levelFor(vUV[0], vUV[1]);
        gl_TessLevelOuter[2] = levelFor(vUV[1], vUV[2]);
        gl_TessLevelOuter[3] = levelFor(vUV[2], vUV[3]);

        gl_TessLevelInner[0] = 0.5 * (gl_TessLevelOuter[1] + gl_TessLevelOuter[3]);
        gl_TessLevelInner[1] = 0.5 * (gl_TessLevelOuter[0] + gl_TessLevelOuter[2]);
    }
}
