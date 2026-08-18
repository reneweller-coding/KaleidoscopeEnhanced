#version 330 core
in vec3 vPos;
in vec2 vUV;
in float vRadiation;
in float vBeamID;

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
uniform float radP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float rdp = (radP  > 0.0) ? radP  : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    float edge = smoothstep(0.5, 0.1, abs(vUV.y - 0.5));

    // High energy X-ray to EUV synchrotron radiation spectrum.  The hot end
    // is GOLDEN now, not near-white -- white x high gain bleached the whole
    // ring (metric scan: saturation 0.06).
    vec3 beamColor = mix(vec3(0.1, 0.5, 1.0), vec3(1.0, 0.72, 0.30), vRadiation);
    vec3 col = beamColor * (0.5 + 0.9 * vRadiation * rdp) * edge * glw;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, edge * 0.9);
}
