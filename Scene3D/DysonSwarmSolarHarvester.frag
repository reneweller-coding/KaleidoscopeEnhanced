#version 330 core
in vec3 vPos;
in vec2 vUV;
in float vRingIdx;
in float vLaserRelay;

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
uniform float relayP;
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
    float glw = (glowP  > 0.0) ? glowP  : 1.0;
    float rlp = (relayP > 0.0) ? relayP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    // Geometric collector hexagonal boundary
    vec2 p = abs(vUV - vec2(0.5));
    float hex = max(p.x * 0.866025 + p.y * 0.5, p.y);
    if (hex > 0.46) discard;

    float edge = smoothstep(0.40, 0.46, hex);

    // Reflected photo mapped on mirror facets
    vec3 photo = img(vUV);

    // Solar collector gold & electric blue photovoltaic cells
    vec3 pvColor = mix(vec3(0.05, 0.2, 0.5), vec3(1.0, 0.8, 0.2), vRingIdx);

    // High energy laser beam relay pulses
    vec3 relayLaser = vec3(0.2, 0.9, 1.0) * vLaserRelay * rlp;

    vec3 col = mix(pvColor, photo, 0.4) * (0.8 + 0.4 * audioSwell) + edge * vec3(1.0, 0.9, 0.5) * 1.5 + relayLaser;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col * glw, 0.95);
}
