#version 330 core
out vec4 fragColor;
/**
 * @file ChiralNematicLiquidCrystal.frag
 * @brief CHIRAL NEMATIC LIQUID CRYSTAL: Cholesteric liquid crystal texture with helical
 * molecular director field twisting, Bragg diffraction selective color reflection,
 * fingerprint texture disclinations, and thermo-chromatic audio waves.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous helical director pitch rotation & domain advection
 *   audioKick    -> flashes Bragg reflection selective wavelength peaks & defect lines
 *   audioCentroid-> modulates helical pitch length & fingerprint fringe spacing
 *   audioSubBass -> expands liquid crystal domain texture elasticity
 *   audioChromaHue-> steers the iridescent Bragg diffraction rainbow spectrum
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
uniform float pitchFreqP;
uniform float defectDensityP;
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
    float pFreq = (pitchFreqP > 0.01) ? pitchFreqP : 1.0;
    float dDens = (defectDensityP > 0.01) ? defectDensityP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.32 * spd;

    // Helical director twisting phase field (fingerprint texture with disclinations)
    float basePitch = (12.0 + 8.0 * audioCentroid) * pFreq;

    // Topological defect dislocation line at center
    float aDefect = atan(uv.y, uv.x);
    float rDefect = length(uv);

    float helicalPhase = rDefect * basePitch + aDefect * 2.0 * dDens - t * 3.0;

    // Second crossed helical director wave
    float crossPitch = sin(uv.x * basePitch * 0.8 + t * 2.0) * cos(uv.y * basePitch * 0.8 - t * 2.0);
    // Elastic distortion amplitude of the domain texture -- sub-bass lets the
    // crossed director wave deform the fingerprint pattern further, i.e. a
    // softer (more elastic) crystal, without touching the pitch itself.
    helicalPhase += crossPitch * 1.5 * (1.0 + 0.5 * audioSubBass);

    // Bragg diffraction selective color reflection formula: lambda = 2 * n * p * cos(theta)
    vec3 braggColor = vec3(
        sin(helicalPhase),
        sin(helicalPhase + 2.094),
        sin(helicalPhase + 4.188)
    ) * 0.5 + 0.5;

    // Disclination defect line glow
    float defectLine = abs(sin(helicalPhase));
    float lineGlow = smoothstep(0.85, 1.0, defectLine) * glw;

    // Sample distorted background photo
    vec2 sampleUV = fract(uv * 0.4 + vec2(sin(helicalPhase), cos(helicalPhase)) * 0.04 + 0.5);
    vec3 texCol = img(sampleUV);

    // Liquid crystal palette
    vec3 palBase = imgPalette(rDefect * 0.5 + t * 0.05);
    vec3 lcBase = mix(texCol * 0.3, palBase, 0.45);

    // Add iridescent Bragg diffraction & defect flashes
    vec3 braggTint = braggColor * (0.8 + 0.6 * defectLine) * (1.0 + 2.5 * audioKick);
    vec3 defectTint = vec3(1.4, 1.3, 1.8) * lineGlow * (1.0 + 2.0 * audioKick);

    vec3 finalCol = lcBase + braggTint * 0.7 + defectTint * 0.4;

    // Center topological disclination core bloom
    float coreBloom = exp(-rDefect * 6.0) * (0.8 + 1.8 * audioKick);
    finalCol += imgPalette(0.85) * coreBloom;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
