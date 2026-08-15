#version 330 core
in vec3 vPos;
in vec2 vUV;
in float vFiberID;
in float vEnergy;

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
    float glw = (glowP  > 0.0) ? glowP  : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    // Edge fading along ribbon cross-section
    float crossEdge = smoothstep(0.5, 0.1, abs(vUV.y - 0.5));

    // Hopf fiber chromatic spectrum
    vec3 fiberColor = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + vFiberID * 6.28 + audioPhase);

    // Light pulses traveling along Villarceau circle fibers
    float speedPulse = 0.5 + 0.5 * sin(vUV.x * 30.0 - time * 10.0);
    fiberColor = mix(fiberColor, vec3(1.0, 0.9, 0.7), speedPulse * 0.6);

    vec3 col = fiberColor * vEnergy * crossEdge * glw;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, crossEdge * 0.9);
}
