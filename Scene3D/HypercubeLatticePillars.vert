#version 330 core
// HypercubeLatticePillars.vert
// -----------------------------------------------------------------------
// 4,900 cubes (geom="cubes") arranged into monolithic architectural towers
// rising in concentric rings with sci-fi neon edge lighting and dynamic
// audio-reactive height extrusions.
// -----------------------------------------------------------------------

layout(location = 0) in vec4 attrA; // xyz = local cube vertex [-0.5, 0.5], w = cube ID [0..4899]
layout(location = 1) in vec4 attrB; // seeds

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float heightP;
uniform float twistP;
uniform float speedP;
uniform float hueP;

out vec3 vNormal;
out vec2 vTexCoord;
out vec4 vColor;
out float vHeight;

const vec3 CUBE_NORMALS[6] = vec3[6](
    vec3( 0.0,  0.0,  1.0),
    vec3( 0.0,  0.0, -1.0),
    vec3( 1.0,  0.0,  0.0),
    vec3(-1.0,  0.0,  0.0),
    vec3( 0.0,  1.0,  0.0),
    vec3( 0.0, -1.0,  0.0)
);

void main() {
    float hgt = (heightP > 0.0) ? heightP : 1.0;
    float tws = (twistP  > 0.0) ? twistP  : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;

    float id = attrA.w;
    vec3 localPos = attrA.xyz;

    float t = time * 0.35 * spd + audioAdvance * 0.2;

    // 70x70 grid layout
    float gridDim = 70.0;
    float gx = mod(id, gridDim) - gridDim * 0.5;
    float gy = floor(id / gridDim) - gridDim * 0.5;
    vec2 gridPos = vec2(gx, gy) * 0.12;

    float distFromCenter = length(gridPos);
    float angle = atan(gridPos.y, gridPos.x);

    // Monolithic tower height displacement (concentric cyber rings)
    float ringWave = sin(distFromCenter * 5.0 - t * 3.0 + audioPhase);
    float pillarHeight = (0.3 + 0.9 * max(ringWave, 0.0) + 0.6 * audioBass) * hgt;
    
    // Kick height surge
    pillarHeight += exp(-distFromCenter * 2.0) * audioKick * 1.5;
    vHeight = pillarHeight;

    // Scale cube into rectangular monolithic tower
    vec3 towerScale = vec3(0.09, 0.09, pillarHeight);
    vec3 posInTower = localPos * towerScale;

    // Pillar twisting along Z
    float twistAngle = posInTower.z * 0.8 * tws + angle * 0.2;
    float ct = cos(twistAngle), st = sin(twistAngle);
    posInTower.xy = vec2(posInTower.x * ct - posInTower.y * st, posInTower.x * st + posInTower.y * ct);

    vec3 pos = vec3(gridPos.x + posInTower.x, gridPos.y + posInTower.y, posInTower.z - 0.5);

    // Cube normal lookup from vertex ID
    int faceIdx = (gl_VertexID % 36) / 6;
    vec3 n = CUBE_NORMALS[faceIdx];
    n.xy = vec2(n.x * ct - n.y * st, n.x * st + n.y * ct);
    vNormal = normalize(n);

    vTexCoord = localPos.xy + vec2(0.5);

    // Cyberpunk neon colors: Cyan, Magenta, Amber
    vec3 neonCyan = vec3(0.0, 0.9, 1.0);
    vec3 neonMagenta = vec3(1.0, 0.05, 0.6);
    vec3 neonAmber = vec3(1.0, 0.7, 0.1);

    vec3 col = mix(neonCyan, neonMagenta, sin(distFromCenter * 3.0 + t) * 0.5 + 0.5);
    col = mix(col, neonAmber, smoothstep(1.0, 2.0, pillarHeight));
    vColor = vec4(col, 1.0);

    // Stereo 3D camera projection
    vec3 vp = pos;
    vp.z += 6.5;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
