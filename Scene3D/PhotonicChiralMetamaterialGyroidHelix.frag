#version 330 core
out vec4 fragColor;
/**
 * @file PhotonicChiralMetamaterialGyroidHelix.frag
 * @brief PHOTONIC CHIRAL METAMATERIAL GYROID HELIX: 3D chiral metamaterial micro-helix array.
 * Helical metallic nano-springs exhibit giant circular dichroism and optical activity, selectively
 * transmitting left vs right circularly polarized light with chiral plasmonic photo texturing.
 *   audioAdvance -> rotates chiral micro-helices & optical polarization rotation angle
 *   audioKick    -> flashes circular dichroism resonance & plasmonic hot spot bursts
 *   audioSwell   -> widens micro-helix ribbon diameter & optical activity path length
 *   audioCentroid-> shifts chiral photonic bandgap wavelength spectra
 *
 * Per-activation variety:
 *   ribbonWidthP float micro-helix ribbon width          (0.02..0.1)
 *   chiralGlowP  float circular dichroism pulse luminance(0.8..2.5)
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

uniform float chiralGlowP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    float core = pow(1.0 - abs(vSide), 2.2);
    float edge = exp(-abs(abs(vSide) - 0.9) * 14.0);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * core * 1.3;
    col += vec3(0.95, 0.95, 1.0) * vChiralPulse * (chiralGlowP > 0.01 ? chiralGlowP : 1.4) * 2.2;
    col += vCol * edge * 1.5;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
