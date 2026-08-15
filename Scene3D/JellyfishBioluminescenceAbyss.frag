#version 330 core
in vec3 vPos;
in float vTentacle;
in float vBioGlow;

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

uniform float glowP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    // Translucent pelagic jellyfish cyan & electric violet luminescence
    vec3 bellCol = mix(vec3(0.0, 0.7, 1.0), vec3(0.8, 0.2, 1.0), vTentacle);
    vec3 pulseCol = vec3(1.0, 0.9, 0.7);

    vec3 col = mix(bellCol, pulseCol, vBioGlow * 0.7);
    col *= (0.7 + 1.5 * vBioGlow) * glw;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 0.85);
}
