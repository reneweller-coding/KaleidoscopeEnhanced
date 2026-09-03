#version 330 core
/**
 * @file GalaxyMergerNBody.vert
 * @brief Vertex stage for GalaxyMergerNBody.comp/.frag: tilts the merging
 * pair toward the camera, turns it slowly on the music's pace and colours
 * each star by its galaxy (two palette families) and its speed (attrB.x:
 * the tidal streams run hot).
 */
layout(location = 0) in vec4 attrA;   // xyz = position, w = star id
layout(location = 1) in vec4 attrB;   // x = speed, y = kind (-1 sky, 2 core, 0/1 galaxy), zw = uv

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float hueP;

out vec4 vColor;
out vec2 vTexCoord;
out float vDepth;
out float vKind;
out float vSpeed;

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
    vSpeed = attrB.x;
    vKind = kind;

    // Two stellar populations: one warm, one blue-white; speed heats both.
    vec3 warm = vec3(1.0, 0.78, 0.55), cool = vec3(0.6, 0.75, 1.0);
    vec3 col = (kind < 0.5) ? warm : cool;
    col = mix(col, vec3(1.0, 0.95, 0.9), clamp(attrB.x * 0.5, 0.0, 0.6));
    if (kind < 0.0 || kind > 1.5) col = vec3(1.0);       // sky / core: the frag paints them
    float hue = (hueP > 0.001) ? hueP : 0.0;
    if (hue > 0.001) col = hueRot(col, 0.35 * sin(hue));
    vColor = vec4(col * (0.8 + 0.4 * audioLevel), 1.0);

    // The pair turns slowly and is tilted so both discs read; the sky quad
    // stays put.
    vec3 vp = pos;
    if (kind >= 0.0)
    {
        float a = sceneAdvance * 0.05 + sceneTime * 0.01;
        float c = cos(a), s = sin(a);
        vp = vec3(c * vp.x + s * vp.z, vp.y, -s * vp.x + c * vp.z);
        float t = 0.5;
        vp = vec3(vp.x, cos(t) * vp.y - sin(t) * vp.z, sin(t) * vp.y + cos(t) * vp.z);
        vp.z += 6.4 - 0.4 * audioSwell;
    }
    else vp.z = 16.0;
    vDepth = vp.z;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
