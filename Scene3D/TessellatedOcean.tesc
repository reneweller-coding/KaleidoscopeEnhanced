#version 400 core
/**
 * @file TessellatedOcean.tesc
 * @brief Tessellation control for TessellatedOcean: the level is adaptive by
 * distance AND by the treble -- a loud, bright mix ripples the sea finer, a
 * dull one leaves it smooth.  The treble term rides a SLOW blend (its own
 * slew lives in the host's swell; here the raw high band is mixed at a
 * quarter with the swell) and fractional_odd_spacing makes every level
 * change continuous, so the mesh never pops.  Edge levels come from the
 * edge midpoints alone so neighbouring patches agree and the surface never
 * cracks.
 */
layout(vertices = 4) out;

in  vec2 vUV[];
in  vec4 vSeed[];
out vec2 tcUV[];
out vec4 tcSeed[];

const vec2 EXTENT = vec2(220.0, 320.0);
uniform float camHP;
uniform float detailP;
uniform float audioHigh;
uniform float audioSwell;

vec3 flatAt(vec2 uv)
{
    return vec3((uv.x - 0.5) * EXTENT.x, 0.0, uv.y * EXTENT.y + 2.0);
}

float levelFor(vec2 uvA, vec2 uvB)
{
    vec3 mid = flatAt(mix(uvA, uvB, 0.5));
    float d = distance(mid, vec3(0.0, camHP, 0.0));
    // Fineness: the treble (a quarter) and the swell (three quarters) so the
    // level breathes over seconds, not per frame.
    float fine = 0.6 + 0.8 * (0.25 * clamp(audioHigh * 2.0, 0.0, 1.0) + 0.75 * clamp(audioSwell, 0.0, 1.0));
    return clamp(190.0 * detailP * fine / max(d, 2.0), 1.0, 26.0);
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
