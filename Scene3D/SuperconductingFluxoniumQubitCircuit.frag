#version 330 core
out vec4 fragColor;
/**
 * @file SuperconductingFluxoniumQubitCircuit.frag
 * @brief SUPERCONDUCTING FLUXONIUM QUBIT CIRCUIT: Fluxonium superconducting quantum circuit.
 * Small Josephson junction shunted by a high-inductance array of larger Josephson junctions
 * (superinductance). Quantum phase slips, microwave gate pulses, and niobium metallic photo texturing.
 * A whole DIE of them: five qubit loops spread across the chip in frustum coordinates, wired
 * together by twenty meandering coplanar-waveguide readout traces that cross the full frame.
 *   audioAdvance -> navigates external magnetic flux bias evolution & qubit rotation
 *   audioKick    -> flashes microwave quantum gate transitions & phase-slip bursts
 *   audioSwell   -> widens microstrip waveguide ribbon width & persistent current glow
 *   audioCentroid-> shifts Fluxonium 0-1 transition energy color spectra
 *
 * Per-activation variety:
 *   ribbonWidthP float coplanar waveguide ribbon width       (0.02..0.1)
 *   qubitGlowP   float microwave quantum pulse luminance     (0.8..2.5)
 */

in vec2 vUV;
in float vSide;
in float vRibbonID;
in vec3 vCol;
in float vQubitPulse;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float qubitGlowP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    float core = pow(1.0 - abs(vSide), 2.2);
    float edge = exp(-abs(abs(vSide) - 0.9) * 14.0);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * core * 1.3;
    // The microwave pulse is the brightest thing here and the kick drives it
    // to 4x; with twenty z-layers of the same loop ADDING on top of each
    // other it would burn a white bead into the ring.  Cap the additive term.
    float qg = (qubitGlowP > 0.01 ? qubitGlowP : 1.4);
    col += vec3(0.95, 0.95, 1.0) * min(vQubitPulse * qg * 1.8, 1.9);
    col += vCol * edge * 1.5;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // additive pass dim: ribbons render GL_ONE/GL_ONE without depth --
    // overlapping layers ADD, so each fragment must stay well below 1.
    col *= 0.45;

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
