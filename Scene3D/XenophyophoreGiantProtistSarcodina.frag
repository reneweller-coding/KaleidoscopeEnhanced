#version 330 core
out vec4 fragColor;
/**
 * @file XenophyophoreGiantProtistSarcodina.frag
 * @brief XENOPHYOPHORE GIANT PROTIST SARCODINA: Hadal zone giant single-celled xenophyophore
 * (Syringammina fragilissima). Complex branching networks of agglutinated sediment granellare tubes,
 * streaming translucent reticulopodia plasma strands, bioelectric waves, and photo texturing.
 *   audioAdvance -> drives protoplasmic cytoplasmic streaming velocity
 *   audioKick    -> flashes bioelectric membrane depolarization waves
 *   audioSwell   -> thickens plasma vein translucency & sediment glow
 *   audioCentroid-> shifts organic bioluminescent nutrient flow spectra
 *
 * Per-activation variety:
 *   branchScaleP float reticulopodia network expansion scale (0.8..2.2)
 *   ribbonWidthP float protoplasmic vein thickness           (0.02..0.1)
 *   glowP        float bioelectric plasma tube luminance     (0.8..2.5)
 */

in vec2 vUV;
in float vSide;
in float vRibbonID;
in vec3 vCol;
in float vBioPulse;

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
    float core = pow(1.0 - abs(vSide), 2.2);
    float edge = exp(-abs(abs(vSide) - 0.9) * 14.0);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * core * (glowP > 0.01 ? glowP : 1.2);
    col += vec3(0.95, 1.0, 0.9) * vBioPulse * core * 2.0;
    col += vCol * edge * 1.6;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression.  The network is drawn ADDITIVELY with no depth
    // test, and the reticulate mesh crosses itself far more often than the old
    // twenty-spoke star did, so the knee has to bite a little harder to keep
    // the crossings off the clip.
    col /= 1.0 + 0.48 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
