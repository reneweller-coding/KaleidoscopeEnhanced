#version 400 core
/**
 * @file BloomSculpt.tesc
 * @brief Tessellation-control stage companion to BloomSculpt.frag -- see that file's header for
 * this scene's description.
 */
// BloomSculpt.tesc — uniform-ish subdivision with a polar taper.
// -----------------------------------------------------------------------
// On a sphere the patches near the poles cover a tiny sliver of surface but
// the same slice of parameter space, so subdividing them as hard as the
// equator wastes most of the triangles.  The level therefore falls off with
// sin(polar angle) — and, as always, each EDGE takes its level from its own
// midpoint so neighbouring patches agree and the shell does not crack.
// -----------------------------------------------------------------------
layout(vertices = 4) out;

in  vec2 vUV[];
in  vec4 vSeed[];
out vec2 tcUV[];
out vec4 tcSeed[];

uniform float detailP;      // preset: subdivision quality

float levelFor(vec2 uvA, vec2 uvB)
{
    vec2 m = mix(uvA, uvB, 0.5);
    float polar = sin(m.y * 3.14159265);          // 0 at the poles, 1 at the equator
    return clamp(3.0 + 14.0 * detailP * polar, 1.0, 20.0);
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
