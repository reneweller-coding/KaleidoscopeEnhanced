#version 430 core
layout(quads, fractional_odd_spacing, ccw) in;

in vec3 tcPos[];
in vec2 tcUV[];

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioSwell;

out vec3 tePos;
out vec3 teNormal;
out vec2 teUV;
out float teAurora;

float hash21(vec2 p) {
    p = fract(p * vec2(173.89, 412.34));
    p += dot(p, p + 39.21);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
    float u = gl_TessCoord.x;
    float v = gl_TessCoord.y;

    vec2 uv = mix(mix(tcUV[0], tcUV[1], u), mix(tcUV[3], tcUV[2], u), v);

    // Fjord landscape geometry: Mountain ridges on sides (abs(uv.x - 0.5) > 0.15), water canal in center
    float canalDist = abs(uv.x - 0.5);
    float mountainMask = smoothstep(0.12, 0.45, canalDist);

    // Mountain height displacement
    vec2 p = uv * vec2(8.0, 12.0);
    float mountainH = (noise(p) * 0.6 + noise(p * 2.0) * 0.3 + noise(p * 4.0) * 0.1) * 3.5 * mountainMask;

    // Fjord reflective water surface in the center with audio-driven gentle ripples
    float t = time * 0.3 + audioAdvance * 0.2;
    float waterRipples = sin(uv.y * 30.0 - t * 4.0) * 0.03 * (1.0 - mountainMask) * (0.8 + 0.6 * audioBass);

    float height = mountainH + waterRipples - 1.2;

    vec3 pos = vec3((uv.x - 0.5) * 8.0, height, (uv.y - 0.5) * 10.0);

    // Aurora intensity over the fjord
    float aurora = (sin(uv.x * 6.0 + t * 2.0) * 0.5 + 0.5) * (1.0 + audioKick * 2.0);

    tePos = pos;
    teNormal = vec3(0.0, 1.0, 0.0);
    teUV = uv;
    teAurora = aurora;

    // Stereoscopic 3D camera projection looking down the fjord
    vec3 vp = pos;
    vp.z += 7.0;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
