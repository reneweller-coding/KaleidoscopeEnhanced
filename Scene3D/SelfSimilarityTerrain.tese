#version 400 core
/**
 * @file SelfSimilarityTerrain.tese
 * @brief Tessellation evaluation for SelfSimilarityTerrain: the self-
 * similarity matrix as a landscape.  The (u,v) plane is the matrix -- both
 * axes are time, the recent end nearest the camera -- and the height is
 * the similarity, so repeats stand as ridges parallel to the diagonal and
 * the diagonal itself is the main range.  The whole terrain flows toward
 * the camera with the matrix head (continuous), so new music rises at the
 * far end and comes forward.  Projection after displacement; no camera
 * motion.
 */
layout(quads, fractional_odd_spacing, ccw) in;

in  vec2 tcUV[];
in  vec4 tcSeed[];

out vec3  vWorld;
out vec2  vSurfUV;
out vec3  vNormal;
out float vSim;
out float vDist;

uniform mat4  projM;
uniform float eyeOff;
const vec2 EXTENT = vec2(120.0, 160.0);

uniform sampler2D texSSM;      // 256x256 similarity (ring in both axes)
uniform float ssmHead;         // ring head as 0..1 texture coordinate
uniform float ssmFill;         // 0..1 how much history exists yet
uniform float camHP;
uniform float heightP;

float sim(vec2 uv)
{
    // uv: x across = time a (0 old .. 1 new), y along = time b; the nearest
    // edge (uv.y = 0) is now.  Both axes read backward from the head.
    float span = 0.9 * max(ssmFill, 0.08);
    vec2 ages = vec2((1.0 - uv.x) * span, uv.y * span);
    return texture(texSSM, fract(vec2(ssmHead) - ages)).r;
}

void main()
{
    vec2 uvA = mix(tcUV[0], tcUV[1], gl_TessCoord.x);
    vec2 uvB = mix(tcUV[3], tcUV[2], gl_TessCoord.x);
    vec2 uv  = mix(uvA, uvB, gl_TessCoord.y);
    float hScale = 9.0 * (heightP > 0.05 ? heightP : 1.0);
    float s = sim(uv);
    float h = s * s * hScale;
    // The far end rises so the horizon is filled.
    h += pow(smoothstep(0.7, 1.0, uv.y), 1.5) * 25.0;
    float e = 1.0 / 256.0;
    float hx = (pow(sim(uv + vec2(e, 0.0)), 2.0) - pow(sim(uv - vec2(e, 0.0)), 2.0)) * hScale;
    float hy = (pow(sim(uv + vec2(0.0, e)), 2.0) - pow(sim(uv - vec2(0.0, e)), 2.0)) * hScale;
    vec3 n = normalize(vec3(-hx / (2.0 * e * EXTENT.x), 1.0, -hy / (2.0 * e * EXTENT.y)));
    vec3 p = vec3((uv.x - 0.5) * EXTENT.x, h, uv.y * EXTENT.y + 3.0);
    vWorld = p; vSurfUV = uv; vNormal = n; vSim = s; vDist = p.z;
    vec3 vp = vec3(p.x, p.y - camHP, p.z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
