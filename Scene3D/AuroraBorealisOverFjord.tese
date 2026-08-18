#version 430 core
/**
 * @file AuroraBorealisOverFjord.tese
 * @brief Tessellation-evaluation stage companion to AuroraBorealisOverFjord.frag -- see that file's header for
 * this scene's description.
 */
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
out float teSky;

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

    float t = time * 0.3 + audioAdvance * 0.2;
    // FLIGHT down the fjord: the terrain streams toward the camera.
    float flight = time * 0.10 + audioAdvance * 0.05;

    // The far band of the patch domain (uv.y > 0.78) folds UP into an aurora
    // curtain wall — a cyclorama sky, since the grid is the only geometry.
    float skyBand = smoothstep(0.78, 0.80, uv.y);
    float tvy = min(uv.y, 0.78) / 0.78;              // terrain-local 0..1

    // Fjord landscape: mountain ridges on the sides, water canal in the centre
    float canalDist = abs(uv.x - 0.5);
    float mountainMask = smoothstep(0.12, 0.45, canalDist);

    vec2 p = vec2(uv.x, tvy + flight) * vec2(8.0, 12.0);
    float mountainH = (noise(p) * 0.6 + noise(p * 2.0) * 0.3 + noise(p * 4.0) * 0.1) * 3.5 * mountainMask;

    float waterRipples = sin((tvy + flight) * 30.0 - t * 4.0) * 0.03 * (1.0 - mountainMask) * (0.8 + 0.6 * audioBass);

    float height = mountainH + waterRipples - 1.2;
    vec3 posT = vec3((uv.x - 0.5) * 8.0, height, (tvy - 0.5) * 10.0);

    // Aurora curtain wall at the far end, rising into the sky
    float wallY = (uv.y - 0.78) / 0.22;
    vec3 posS = vec3((uv.x - 0.5) * 14.0, wallY * 9.0 - 1.0, 5.4 + wallY * 1.5);

    vec3 pos = mix(posT, posS, skyBand);

    // Aurora intensity: drifting curtain bands (kick makes them surge softly)
    float bands = noise(vec2(uv.x * 5.0 + flight * 0.35, wallY * 1.2 + t * 0.15));
    float aurora = (0.35 + 0.65 * bands) * (1.0 + audioKick * 0.7);

    tePos = pos;
    teNormal = vec3(0.0, 1.0, 0.0);
    teUV = uv;
    teAurora = aurora;
    teSky = skyBand;

    // Camera: slightly above the water, gently pitched down the fjord
    vec3 vp = pos;
    vp.y -= 0.35 + 0.10 * sin(time * 0.30);
    float ct = cos(-0.06), st = sin(-0.06);
    vp = vec3(vp.x, vp.y * ct - vp.z * st, vp.y * st + vp.z * ct);
    vp.z += 7.0;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
