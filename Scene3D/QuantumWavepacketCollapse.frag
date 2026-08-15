#version 330 core
in vec3 vPos;
in float vProb;
in float vPhase;

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
uniform float collapseP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    vec2 circ = gl_PointCoord - vec2(0.5);
    float r = length(circ);
    if (r > 0.5) discard;

    float alpha = smoothstep(0.5, 0.05, r);

    // Quantum phase chromatic mapping (complex phase angle to color)
    vec3 phaseColor = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + vPhase + audioPhase);

    // Probability density intensity modulation
    vec3 col = phaseColor * (0.8 + 1.2 * vProb) * (1.0 + audioKick * 2.5) * glw;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, alpha);
}
