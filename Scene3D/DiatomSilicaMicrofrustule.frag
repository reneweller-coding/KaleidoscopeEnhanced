#version 330 core
out vec4 fragColor;

in vec3 vWorldPos;
in vec2 vTexCoord;
in float vDiatomIndex;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

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

uniform float diatomP;
uniform float poreP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Diatom circular shell boundary
    vec2 p = vTexCoord * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;

    // Hexagonal silica micropores: sin(k_x * x) * sin(k_y * y)
    float pores = sin(p.x * 25.0) * sin(p.y * 25.0);
    float poreMask = smoothstep(-0.2, 0.5, pores);

    // Photo texture mapping onto diatom valve
    vec3 photo = img(fract(vTexCoord));

    // Transparent silica glass & structural iridescence palette
    vec3 glassIrid = 0.5 + 0.5 * cos(vec3(0.0, 1.8, 3.6) + vDiatomIndex * 6.28 + r * 4.0 + audioPhase);

    // Edge rim glow
    float rimGlow = smoothstep(0.7, 0.98, r);

    vec3 col = mix(photo, glassIrid, 0.45) * (0.6 + 0.4 * poreMask);
    col += rimGlow * vec3(0.3, 0.95, 1.0) * (1.0 + audioKick * 2.5);

    // Distance fog
    float dist = length(vWorldPos);
    col = mix(col, vec3(0.01, 0.03, 0.07), 1.0 - exp(-dist * 0.15));

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 0.85);
}
