#version 400 core
/**
 * @file EuropaChaosTerrain.tesc
 * @brief Tessellation control for EuropaChaosTerrain: adaptive by distance
 * (the near rafts finest), a little finer with the swell; fractional_odd_
 * spacing keeps level changes continuous.  Edge levels from the edge
 * midpoints so neighbouring patches agree.
 */
/// Layout qualifiers of this stage (work-group size, or the primitive in or out).
layout(vertices = 4) out;

in  vec2 vUV[];   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in  vec4 vSeed[];   ///< Per-instance random seed (from the vertex stage).
out vec2 tcUV[];
out vec4 tcSeed[];

const vec2 EXTENT = vec2(160.0, 220.0);
uniform float camHP;   ///< Camera height knob, 0..1.
uniform float detailP;   ///< Detail knob, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

/// @brief The flat (unlit) colour at a coordinate.
vec3 flatAt(vec2 uv)
{
    return vec3((uv.x - 0.5) * EXTENT.x, 0.0, uv.y * EXTENT.y + 3.0);
}

/// @brief Brightness level between two coordinates.
float levelFor(vec2 uvA, vec2 uvB)
{
    vec3 mid = flatAt(mix(uvA, uvB, 0.5));
    float d = distance(mid, vec3(0.0, camHP, 0.0));
    float fine = 0.8 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    return clamp(170.0 * detailP * fine / max(d, 2.0), 1.0, 24.0);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
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
