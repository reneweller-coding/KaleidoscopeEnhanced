#version 330 core
out vec4 fragColor;
/**
 * @file QuantumTachyonWarpTunnel.frag
 * @brief QUANTUM TACHYON WARP TUNNEL: Superluminal tachyon warp tunnel with Cherenkov
 * radiation shock cones, relativistic optical headlight beaming, hyper-speed star streaks,
 * and high-energy spacetime compression pulses.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives extreme superluminal warp flight progression
 *   audioKick    -> flashes Cherenkov shockwave cones & hyperdrive burst
 *   audioCentroid-> sharpens radial tachyon streak resolution & color temperature
 *   audioSubBass -> expands warp tunnel diameter breathing
 *   audioChromaHue-> steers the Cherenkov blue-to-hyperviolet spectrum
 */

uniform vec2  resolution;
uniform float time;
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

// Per-activation variety
uniform float speedP;
uniform float warpP;
uniform float streaksP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t) {
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float wrp = (warpP > 0.01) ? warpP : 1.2;
    float strk = (streaksP > 0.01) ? streaksP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.45 * spd;

    float r = max(0.01, length(uv));
    float a = atan(uv.y, uv.x);

    // Relativistic headlight compression towards center: r -> r^(1/gamma)
    float gamma = 1.6 + 0.5 * audioLevel;
    float rRel = pow(r, 1.0 / gamma);

    // Warp tunnel cylindrical coordinates: (angle a, depth z = 1/r)
    float zTunnel = (1.0 / rRel) * wrp - t * 4.0;

    // Cherenkov radiation shock cone rings
    float cherenkovCone = abs(sin(zTunnel * 1.5 + t * 2.0));
    float coneGlow = exp(-cherenkovCone * 8.0) * glw;

    // High-speed radial tachyon light streaks
    float streaks = abs(sin(a * (24.0 * strk) + sin(zTunnel * 0.5) * 3.0));
    float streakGlow = smoothstep(0.85, 1.0, streaks) * (1.0 + 2.0 * audioHigh);

    // Sample distorted background photo
    vec2 sampleUV = fract(vec2(a / 6.2831853 + 0.5, zTunnel * 0.15));
    vec3 texCol = img(sampleUV);

    // Cherenkov electric-blue / violet / magenta palette
    vec3 palBase = imgPalette(zTunnel * 0.1 + 0.2);
    vec3 col = mix(texCol, palBase, 0.45);

    // Add glowing Cherenkov shock rings & tachyon streaks
    vec3 cherenkovTint = vec3(0.2, 1.3, 1.9) * coneGlow * (1.0 + 2.5 * audioKick);
    vec3 streakTint = vec3(1.5, 1.4, 1.9) * streakGlow * (0.8 + 1.5 * audioKick);

    col += cherenkovTint + streakTint;

    // Center hyperdrive singularity flare
    float centerFlare = exp(-r * 12.0) * (2.0 + 4.0 * audioKick);
    col += vec3(1.6, 1.7, 2.0) * centerFlare;

    // Vignette & gamma
    col = pow(col, vec3(0.88));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
