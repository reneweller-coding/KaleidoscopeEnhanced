#version 330 core
out vec4 fragColor;
/**
 * @file DielectricResonatorMetagrating.frag
 * @brief DIELECTRIC RESONATOR METAGRATING: 2D array of resonant high-refractive-index silicon
 * dielectric nanopillars. High-Q electric and magnetic Mie dipole resonances, polarimetric phase
 * retardation, diffraction beam splitting, and photo-derived optical texturing.
 *   audioAdvance -> navigates dielectric polarimetric phase wavefront translation
 *   audioKick    -> flashes high-Q Mie dipole resonance optical transmission bursts
 *   audioSwell   -> thickens silicon nanopillar cross-section & dielectric field glow
 *   audioCentroid-> shifts Mie resonance optical transmission wavelength spectra
 *
 * Per-activation variety:
 *   mieGlowP  float Mie dipole resonance field luminance (0.8..2.5)
 *   specularP float silicon facet specular reflectivity  (0.8..2.2)
 */

in vec2 vUV;
in vec3 vNormal;
in vec3 vCol;
in float vMieResonance;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float mieGlowP;
uniform float specularP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    vec3 lightDir = normalize(vec3(0.5, 0.6, 0.7));
    float diff = max(0.0, dot(vNormal, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0))), 24.0) * (specularP > 0.01 ? specularP : 1.2);

    vec2 p = vUV * 2.0 - 1.0;
    float edgeGlow = exp(-abs(max(abs(p.x), abs(p.y)) - 0.88) * 16.0);

    vec3 photo = img(vUV);

    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.4 + 0.6 * diff);
    col += vec3(0.95, 0.95, 1.0) * spec * (1.0 + 3.0 * audioKick);
    col += vCol * vMieResonance * (mieGlowP > 0.01 ? mieGlowP : 1.3) * 1.5;
    col += vCol * edgeGlow * 1.4;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    col *= 2.66;   // measured-dark lift (visual pass)
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
