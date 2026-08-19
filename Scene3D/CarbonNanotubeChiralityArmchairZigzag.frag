#version 330 core
out vec4 fragColor;
/**
 * @file CarbonNanotubeChiralityArmchairZigzag.frag
 * @brief CARBON NANOTUBE CHIRALITY ARMCHAIR ZIGZAG: Single-walled carbon nanotube (SWCNT)
 * lattice with tunable chiral vector (n,m). Armchair, zigzag, and chiral helicities with
 * ballistic 1D pi-electron conduction pulses, metallic sp2 luster, and photo texturing.
 *   audioAdvance -> drives ballistic pi-electron current drift & tube rotation
 *   audioKick    -> flashes 1D Van Hove singularity electronic transition bursts
 *   audioSwell   -> thickens carbon nanotube diameter & metallic conduction sheen
 *   audioCentroid-> shifts chiral nanotube optical absorption spectra
 *
 * Per-activation variety:
 *   ribbonWidthP float nanotube ribbon wall thickness        (0.02..0.1)
 *   conductGlowP float ballistic electron pulse luminance    (0.8..2.5)
 */

in vec2 vUV;
in float vSide;
in float vRibbonID;
in vec3 vCol;
in float vConductPulse;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float conductGlowP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    float core = pow(1.0 - abs(vSide), 2.2);
    float edge = exp(-abs(abs(vSide) - 0.9) * 14.0);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * core * 1.3;
    col += vec3(0.95, 0.95, 1.0) * vConductPulse * (conductGlowP > 0.01 ? conductGlowP : 1.4) * 2.2;
    col += vCol * edge * 1.5;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
