#version 330 core
out vec4 fragColor;
/**
 * @file PhotonicChiralMetamaterialGyroidHelix.frag
 * @brief PHOTONIC CHIRAL METAMATERIAL GYROID HELIX: 3D chiral metamaterial micro-helix array.
 * A 5 x 4 frustum lattice of helical metallic nano-springs, each tumbling on its own axis pair,
 * exhibits giant circular dichroism and optical activity, selectively
 * transmitting left vs right circularly polarized light with chiral plasmonic photo texturing.
 *   audioAdvance -> screws the micro-helices, drifts the lattice & rotates polarization angle
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
    // The quad is wider than the metal ribbon: |s| < 0.22 is the ribbon
    // itself, everything outside it is the plasmonic near-field bloom that
    // lets one helix light its own patch of the picture.
    // Thresholds retuned for the 4.5x quad (was 2.8x) so the metal stays the
    // same apparent width while the bloom reaches much further.
    float s    = abs(vSide);
    float core = pow(max(0.0, 1.0 - s / 0.22), 2.2);
    float edge = exp(-abs(s - 0.185) * 34.0);
    float halo = exp(-s * 1.5) * 0.20;

    vec3 photo = img(vUV);

    vec3 col = vCol * (0.6 + 0.4 * photo) * core * 1.3;
    col += vec3(0.95, 0.95, 1.0) * vChiralPulse * (chiralGlowP > 0.01 ? chiralGlowP : 1.4)
         * 2.2 * (core + 0.30 * halo);
    col += vCol * edge * 1.4;
    col += vCol * halo * (0.85 + 0.55 * audioSwell);
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3) * (core + halo);

    // Additive geometry: cap the tinted vec3, then soft-knee it
    col = min(col, vec3(1.5));
    col /= 1.0 + 0.45 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
