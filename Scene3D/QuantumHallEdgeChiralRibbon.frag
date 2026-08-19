#version 330 core
out vec4 fragColor;
/**
 * @file QuantumHallEdgeChiralRibbon.frag
 * @brief QUANTUM HALL EDGE CHIRAL RIBBON: Topologically protected 1D chiral edge channels
 * in the integer and fractional Quantum Hall effects. Dissipationless skipping orbits,
 * quantized Hall conductance plates, ballistic wavepacket pulses, and photo texturing.
 *   audioAdvance -> accelerates chiral electron skipping orbit velocity along boundary
 *   audioKick    -> flashes quantized Hall conductance plateau transition bursts
 *   audioSwell   -> widens magnetic length & edge channel ribbon thickness
 *   audioCentroid-> shifts Landau level edge state emission spectra
 *
 * Per-activation variety:
 *   ribbonWidthP float chiral edge state channel thickness    (0.02..0.1)
 *   edgeGlowP    float ballistic electron wavepacket luminance(0.8..2.5)
 */

in vec2 vUV;
in float vSide;
in float vRibbonID;
in vec3 vCol;
in float vChiralPulse;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float edgeGlowP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    float core = pow(1.0 - abs(vSide), 2.2);
    float edge = exp(-abs(abs(vSide) - 0.9) * 14.0);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * core * 1.3;
    col += vec3(0.95, 0.95, 1.0) * vChiralPulse * (edgeGlowP > 0.01 ? edgeGlowP : 1.4) * 2.2;
    col += vCol * edge * 1.5;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
