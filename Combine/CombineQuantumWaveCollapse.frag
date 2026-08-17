#version 330 core
out vec4 fragColor;
// CombineQuantumWaveCollapse.frag
// -----------------------------------------------------------------------
// COMBINE QUANTUM WAVE COLLAPSE: Quantum state superposition & wavefunction
// collapse transition. Complex probability wavepackets interference patterns
// collapse abruptly from superposition into the definite incoming state.
//   interpolation -> sweeps quantum superposition to eigenstate measurement
//   audioKick     -> triggers wavefunction collapse flash
//   audioBass     -> undulates de Broglie wavelength & interference fringe spacing
//
// Per-activation variety:
//   waveP     float matter wave frequency & interference density (0.5..2.2)
//   collapseP float wavefunction collapse sharpness              (0.5..2.0)
//   speedP    float quantum phase velocity multiplier            (0.5..2.0)
//   hueP      float quantum probability phase hue offset         (0..6.28)
// -----------------------------------------------------------------------

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

uniform float waveP;
uniform float collapseP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float wav = (waveP     > 0.0) ? waveP     : 1.0;
    float clp = (collapseP > 0.0) ? collapseP : 1.0;
    float spd = (speedP    > 0.0) ? speedP    : 1.0;
    float hue = (hueP      > 0.0) ? hueP      : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.45 * spd + audioAdvance * 0.22;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Dual-state wavefunction superposition: psi = psi_1 + psi_2
    float psi1 = sin(length(p - vec2(0.3, 0.0)) * 25.0 * wav - t * 4.0);
    float psi2 = sin(length(p + vec2(0.3, 0.0)) * 25.0 * wav - t * 4.0);

    // Probability density: |psi|^2 = (psi1 + psi2)^2
    float probDensity = (psi1 + psi2) * 0.5;
    float interference = probDensity * probDensity;

    // Measurement collapse progression
    float collapseThreshold = smoothstep(0.0, 1.0, pow(tProg, clp));
    float measuredState = step(collapseThreshold, interference);

    // Quantum phase coordinate displacement
    vec2 phaseDisp = vec2(psi1, psi2) * 0.03 * midTransition;

    vec4 c1 = texture(tex1, fract(uv + phaseDisp));
    vec4 c0 = texture(tex0, fract(uv - phaseDisp));

    vec4 col = mix(c1, c0, tProg);

    // Glowing quantum phase rings
    vec3 phaseColor = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + interference * 6.28 + audioPhase);
    col.rgb += interference * phaseColor * midTransition * (1.2 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
