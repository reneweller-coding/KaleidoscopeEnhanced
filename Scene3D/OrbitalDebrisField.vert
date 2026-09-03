#version 330 core
/**
 * @file OrbitalDebrisField.vert
 * @brief Vertex stage for OrbitalDebrisField.comp/.frag: the camera sits at
 * the origin inside the stream, looking at the station; fragments are shaded
 * by their generator lighting (attrB.x) and kind (attrB.y: -1 sky, 3 planet
 * limb, 2 station, 0 debris).  No camera motion of any kind.
 */
layout(location = 0) in vec4 attrA;   // xyz = position, w = id
layout(location = 1) in vec4 attrB;   // x = lit, y = kind, zw = uv

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float audioLevel;
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

    vec3 metal = vec3(0.55, 0.57, 0.62);
    vec3 col = metal * (0.2 + 0.8 * min(attrB.x, 1.0)) * (0.85 + 0.3 * audioLevel);
    if (kind > 1.5 && kind < 2.5) col = vec3(0.35, 0.38, 0.45) * (0.5 + 0.8 * attrB.x);   // station hull
    if (kind < 0.0 || kind > 2.5) col = vec3(1.0);                                          // sky / planet: frag paints
    float hue = (hueP > 0.001) ? hueP : 0.0;
    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));
    vColor = vec4(col, 1.0);

    vec3 vp = pos;
    vDepth = vp.z;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
