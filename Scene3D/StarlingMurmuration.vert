#version 330 core
/**
 * @file StarlingMurmuration.vert
 * @brief Vertex stage for StarlingMurmuration.comp/.frag: places the flock over a
 * dusk horizon and colours each bird by its depth in the flock -- the dense
 * core reads dark, the fringe catches the sky.  Audio here is only tint and
 * brightness; the motion lives in the generator.
 */
layout(location = 0) in vec4 attrA;   // xyz = position, w = bird id
layout(location = 1) in vec4 attrB;   // x = seed, y = density in flock, zw = uv

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioValence;
uniform float hueP;

out vec4 vColor;
out vec2 vTexCoord;
out float vDepth;
out float vKind;

vec3 hueRot(vec3 c, float a)
{
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

void main()
{
    vec3 pos = attrA.xyz;
    float density = attrB.y;
    vTexCoord = attrB.zw;

    // Birds are dark against the sky; the fringe of the flock is lit by it.
    vec3 body = vec3(0.14, 0.13, 0.18);
    vec3 fringe = vec3(0.75, 0.7, 0.8);
    vec3 col = mix(fringe, body, clamp(density, 0.0, 1.0)) * (0.8 + 0.4 * audioLevel);
    if (density < 0.0) col = vec3(1.0);          // sky quad: the frag paints it
    float hue = (hueP > 0.001) ? hueP : 0.0;
    if (hue > 0.001) col = hueRot(col, 0.1 * sin(hue));
    vColor = vec4(col, 1.0);

    // Camera: the flock hangs in front of us, slightly below eye level.
    vec3 vp = pos;
    vp.y -= 0.2;
    vp.z += (density < 0.0) ? 4.2 : 4.2 - 0.4 * audioSwell;   // builds bring the flock closer; the sky stays
    vDepth = vp.z;
    vKind = (density < 0.0) ? 1.0 : 0.0;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
