#version 330 core
out vec4 fragColor;

in vec3 vWorldPos;
in vec2 vTexCoord;
in float vQubitIndex;

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

uniform float qubitP;
uniform float meanderP;
uniform float widthP;
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

    // Photo texture mapping along coplanar waveguide
    vec3 photo = img(fract(vTexCoord));

    // Microwave photon packet propagation
    float photonPacket = pow(abs(sin(vTexCoord.x * 2.0 - time * 6.0)), 12.0);

    // Superconducting niobium gold & cyan palette
    vec3 nbCyan = vec3(0.1, 0.9, 1.0);
    vec3 goldPad = vec3(1.0, 0.85, 0.3);
    vec3 qubitColor = mix(nbCyan, goldPad, sin(vQubitIndex * 6.28 + audioPhase) * 0.5 + 0.5);

    vec3 col = mix(photo, qubitColor, 0.45);
    col += photonPacket * vec3(1.0, 0.98, 0.9) * (1.5 + audioKick * 3.0);

    // Edge glow
    float edge = pow(abs(vTexCoord.y - 0.5) * 2.0, 3.0);
    col += edge * nbCyan * (1.0 + audioHigh * 1.5);

    // Distance fog
    float dist = length(vWorldPos);
    col = mix(col, vec3(0.02, 0.03, 0.06), 1.0 - exp(-dist * 0.15));

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
