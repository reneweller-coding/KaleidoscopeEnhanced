#version 330 core
out vec4 fragColor;
/**
 * @file LuttingerLiquidSpinChargeSeparation.frag
 * @brief LUTTINGER LIQUID SPIN-CHARGE SEPARATION: 1D quantum wire Tomonaga-Luttinger liquid.
 * Electrons split into independent holon (charge) and spinon (spin) density waves propagating
 * at different velocities along 3D ribbon channels with photo-palette interference.
 *   audioAdvance -> drives spinon/holon collective wave velocities
 *   audioKick    -> flashes electron injection quantum tunnel pulses
 *   audioSwell   -> widens 1D wire cross-section & wave amplitude
 *   audioCentroid-> shifts spin/charge color branch separation
 *
 * Per-activation variety:
 *   ribbonWidthP float quantum wire ribbon thickness       (0.02..0.1)
 *   speedRatioP  float holon-to-spinon velocity ratio      (1.2..3.0)
 *   glowP        float quantum wave excitation luminance   (0.8..2.5)
 */

in vec2 vUV;
in float vSide;
in float vRibbonID;
in vec3 vCol;
in float vHolon;
in float vSpinon;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float glowP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    float core = pow(1.0 - abs(vSide), 2.5);
    float edge = exp(-abs(abs(vSide) - 0.9) * 15.0);
    
    // Wave interference between holon and spinon modes
    float pulse = (vHolon * 0.7 + vSpinon * 0.5) * (1.0 + 2.5 * audioKick);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * core * (glowP > 0.01 ? glowP : 1.2);
    col += vec3(0.9, 0.95, 1.0) * pulse * core;
    col += vCol * edge * 1.5;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
