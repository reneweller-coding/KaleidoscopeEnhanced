#version 330 core
/**
 * @file DysonSwarmConstruction.vert
 * @brief Vertex stage for DysonSwarmConstruction.comp/.frag: places the swarm
 * around its star and colours each panel by how squarely it faces the star
 * (attrB.x) and whether it is docked (attrB.y = arc fraction).  sceneProgress
 * is read here so the host sees the scene as staged (drop regie).
 */
layout(location = 0) in vec4 attrA;   // xyz = position, w = panel id
layout(location = 1) in vec4 attrB;   // x = lit, y = kind (-1 sky, 2 star, else docked fraction), zw = uv

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float sceneProgress;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float hueP;

out vec4 vColor;
out vec2 vTexCoord;
out float vDepth;
out float vKind;
out float vLit;

vec3 hueRot(vec3 c, float a)
{
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

void main()
{
    vec3 pos = attrA.xyz;
    float kind = attrB.y;
    vTexCoord = attrB.zw;
    vLit = attrB.x;
    vKind = kind;

    // Panels: dark metal, the star-facing edge catching light; in flight
    // (kind < 1) a warm thruster tint.
    vec3 metal = vec3(0.32, 0.36, 0.42);
    vec3 col = metal * (0.25 + 0.9 * attrB.x) * (0.85 + 0.3 * audioLevel);
    if (kind >= 0.0 && kind < 1.0) col = mix(vec3(0.9, 0.5, 0.25), col, kind);
    if (kind < 0.0 || kind > 1.5) col = vec3(1.0);       // sky / star: the frag paints them
    float hue = (hueP > 0.001) ? hueP : 0.0;
    if (hue > 0.001) col = hueRot(col, 0.15 * sin(hue));
    vColor = vec4(col, 1.0);

    vec3 vp = pos;
    vp.z += (kind < 0.0) ? 5.2 : 5.2 - 0.3 * audioSwell;   // builds bring the camera in; the sky stays
    vDepth = vp.z;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
