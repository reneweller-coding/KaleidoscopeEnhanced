#version 330 core
out vec4 fragColor;
/**
 * @file FluidChladniKaleidoResonance.frag
 * @brief FLUID CHLADNI KALEIDO RESONANCE: Acoustic standing wave modal nodal lines
 * coupled with viscous iridescent fluid marbling and kaleidoscopic rotational symmetry.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous fluid curl advection & modal transitions
 *   audioKick    -> excites higher-order vibration harmonics & nodal line shockwaves
 *   audioCentroid-> selects Chladni modal quantum numbers (m, n)
 *   audioSubBass -> drives viscous fluid ripple turbulence & amplitude
 *   audioChromaHue-> rotates the iridescent thin-film fluid palette
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
uniform float modeP;
uniform float viscosityP;
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

// 2D Curl noise field for viscous fluid advection
vec2 curlNoise(vec2 p, float t) {
    float n1 = sin(p.y * 3.5 + t * 0.8) + cos(p.x * 2.5 - t * 0.5);
    float n2 = cos(p.x * 3.5 + t * 0.7) - sin(p.y * 2.5 - t * 0.6);
    return vec2(n1, n2) * 0.2;
}

// Chladni 2D nodal function: a*sin(n*pi*x)*sin(m*pi*y) - b*sin(m*pi*x)*sin(n*pi*y)
float chladni2D(vec2 p, float n, float m, float ratio) {
    float pi = 3.14159265;
    float term1 = sin(n * pi * p.x) * sin(m * pi * p.y);
    float term2 = sin(m * pi * p.x) * sin(n * pi * p.y);
    return term1 - ratio * term2;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float visc = (viscosityP > 0.01) ? viscosityP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.28 * spd;

    // 8-Fold rotational symmetry fold for kaleidoscope
    float ang = atan(uv.y, uv.x);
    float rad = length(uv);
    float seg = 3.14159265 / 4.0;
    ang = mod(ang + seg * 0.5, seg) - seg * 0.5;
    ang = abs(ang);
    vec2 pSym = vec2(cos(ang), sin(ang)) * rad;

    // Viscous fluid advection over 3 iterative passes
    vec2 pFluid = pSym;
    for (int k = 0; k < 3; k++) {
        vec2 curl = curlNoise(pFluid * 2.5, t + float(k) * 1.5);
        pFluid += curl * (0.18 * visc + 0.12 * audioSubBass);
    }

    // Modal frequencies selected by audio centroid and per-activation mode
    float nMod = 2.0 + floor((modeP * 3.0 + audioCentroid * 4.0));
    float mMod = nMod + 1.0 + floor(audioFlux * 2.0);
    float modalRatio = 0.95 + 0.3 * sin(t * 0.7);

    // Compute acoustic vibration field
    float chladniVal = chladni2D(pFluid, nMod, mMod, modalRatio);
    float nodalDist = abs(chladniVal);

    // Glowing nodal lines (sand particles gathering at zero-amplitude vibration lines)
    float nodalGlow = exp(-nodalDist * (28.0 + 15.0 * audioCentroid)) * glw;

    // Sample warped texture along fluid marble stream
    vec2 sampleUV = fract(pFluid * 0.5 + 0.5);
    vec3 texCol = img(sampleUV);

    // Iridescent interference colors across Chladni gradients
    float phase = chladniVal * 4.0 + t * 2.0;
    vec3 palA = imgPalette(phase * 0.1);
    vec3 palB = imgPalette(phase * 0.1 + 0.5);
    vec3 fluidCol = mix(palA, palB, 0.5 + 0.5 * sin(phase));

    fluidCol = mix(fluidCol, texCol, 0.35 + 0.15 * audioValence);

    // Add neon nodal particle lines with kick flash
    vec3 neonNodal = vec3(1.3, 1.0, 1.7) * nodalGlow * (1.0 + 3.0 * audioKick);
    fluidCol += neonNodal;

    // Specular liquid ridge highlights
    float ridge = pow(clamp(1.0 - nodalDist * 4.0, 0.0, 1.0), 4.0);
    fluidCol += vec3(1.0, 1.1, 1.3) * ridge * 0.6 * audioLevel;

    // Contrast & vignette
    fluidCol = pow(fluidCol, vec3(0.86));
    float vig = 1.0 - smoothstep(0.85, 1.4, rad);
    fluidCol *= vig;

    fragColor = vec4(clamp(fluidCol, 0.0, 1.0), 1.0);
}
