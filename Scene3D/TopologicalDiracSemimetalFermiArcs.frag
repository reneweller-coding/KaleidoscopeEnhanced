#version 330 core
out vec4 fragColor;
/**
 * @file TopologicalDiracSemimetalFermiArcs.frag
 * @brief TOPOLOGICAL DIRAC SEMIMETAL FERMI ARCS: Open disjoint Fermi surface arcs in Dirac and
 * Weyl semimetals (TaAs / Cd3As2). Non-closed contours on opposite crystal surfaces connect
 * projections of bulk Weyl nodes of opposite chirality with chiral anomaly current texturing.
 *   audioAdvance -> navigates Fermi arc surface state dispersion & Weyl node pumping
 *   audioKick    -> flashes chiral anomaly quantum Adler-Bell-Jackiw charge pumping bursts
 *   audioSwell   -> widens Fermi arc ribbon width & topological surface state glow
 *   audioCentroid-> shifts Berry curvature monopole emission spectra
 *
 * Per-activation variety:
 *   ribbonWidthP float Fermi arc surface state ribbon width  (0.02..0.1)
 *   weylGlowP    float Weyl node chiral current luminance    (0.8..2.5)
 */

in vec2 vUV;
in float vSide;
in float vRibbonID;
in vec3 vCol;
in float vWeylPulse;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float weylGlowP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    float core = pow(1.0 - abs(vSide), 2.2);
    float edge = exp(-abs(abs(vSide) - 0.9) * 14.0);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * core * 1.3;
    col += vec3(0.95, 0.95, 1.0) * vWeylPulse * (weylGlowP > 0.01 ? weylGlowP : 1.4) * 2.2;
    col += vCol * edge * 1.5;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
