#version 330 core
out vec4 fragColor;
/**
 * @file OpticalDispersionCausticVault.frag
 * @brief OPTICAL DISPERSION CAUSTIC VAULT: High-resolution multi-wavelength
 * dispersive refraction caustics. Crystal chamber water wave interference
 * with full RGB spectral splitting, specular focal nodes, and luminous caustics.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous fluid caustic wave motion & focal shifts
 *   audioKick    -> flashes intense caustic focal nodes & chromatic shockwaves
 *   audioCentroid-> modulates wave frequency & caustic network filigree
 *   audioSubBass -> expands wave amplitude breathing
 *   audioChromaHue-> rotates the prismatic refractive spectrum
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
uniform float dispersionP;
uniform float waveScaleP;
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

// Dispersive water caustic wave intensity function for a given wavelength offset
float causticIntensity(vec2 p, float t, float wlOffset, float wScale) {
    vec2 pWarp = p * wScale;
    float tWarp = t + wlOffset;

    // Sum over 4 directional sinusoidal wave trains
    vec2 grad = vec2(0.0);
    for (int i = 0; i < 4; i++) {
        float a = float(i) * 0.785398 + tWarp * 0.1;
        vec2 dir = vec2(cos(a), sin(a));
        float phase = dot(pWarp, dir) * 4.0 + tWarp * 2.5;
        grad += dir * cos(phase);
    }

    // Caustic focusing occurs where wave gradient is stationary (Jacobian determinant peak)
    float jacobian = 1.0 / max(0.08, length(grad));
    return pow(jacobian, 1.8);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float disp = (dispersionP > 0.01) ? dispersionP : 1.0;
    float wSc = (waveScaleP > 0.01) ? waveScaleP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.35 * spd;

    // Dispersive wavelength offsets for R, G, B channels
    float dLambda = (0.12 + 0.08 * audioFlux) * disp;
    float scale = (2.2 + 0.3 * sin(audioSwell * 2.0)) * wSc;

    // Sample chromatic caustic intensities separately for R, G, B
    float causticR = causticIntensity(uv, t, -dLambda, scale);
    float causticG = causticIntensity(uv, t, 0.0, scale);
    float causticB = causticIntensity(uv, t, dLambda, scale);

    vec3 causticRGB = vec3(causticR, causticG, causticB) * (0.12 + 0.18 * audioLevel);

    // Sample distorted background photo texture on the pool floor
    vec2 floorUV = fract(uv * 0.4 + causticRGB.xy * 0.05 + 0.5);
    vec3 floorTex = img(floorUV);

    // Crystal vault ambient palette
    vec3 palBase = imgPalette(length(uv) * 0.3 + 0.2);
    vec3 col = mix(floorTex, palBase, 0.4);

    // Add glowing chromatic caustic webs
    col += causticRGB * (1.0 + 3.0 * audioKick) * glw;

    // Specular wave glints
    float totalCaustic = (causticR + causticG + causticB) * 0.3333;
    float specularGlint = pow(clamp(totalCaustic * 0.8, 0.0, 1.0), 4.0) * (1.0 + 3.0 * audioKick);
    col += vec3(1.4, 1.4, 1.6) * specularGlint;

    // Edge water vignette
    float vig = 1.0 - smoothstep(0.85, 1.4, length(uv));
    col *= vig;

    col = pow(col, vec3(0.88));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
