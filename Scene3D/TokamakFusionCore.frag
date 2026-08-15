#version 330 core
in vec3 vPos;
in float vHeat;
in float vStrand;

out vec4 fragColor;

uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioSwell;

uniform float heatP;
uniform float glowP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float ht  = (heatP > 0.0) ? heatP : 1.0;
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    // Ultra-high temperature plasma thermal radiation spectrum
    vec3 coreColor = mix(vec3(0.1, 0.4, 1.0), vec3(1.0, 0.2, 0.8), vStrand);
    coreColor = mix(coreColor, vec3(1.0, 0.95, 0.7), pow(vHeat, 2.0) * ht);

    float intensity = (0.8 + 0.6 * vHeat) * (1.0 + audioKick * 2.5) * glw;
    vec3 col = coreColor * intensity;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
