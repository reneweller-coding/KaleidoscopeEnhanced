#version 330 core
out vec4 fragColor;
/**
 * @file SuperconductingLevitationMeissnerPinch.frag
 * @brief SUPERCONDUCTING LEVITATION MEISSNER PINCH: Stable magnetic levitation via Meissner-Ochsenfeld
 * effect and flux pinning over a high-Tc YBCO superconducting disc. Expelled magnetic flux lines,
 * fluxon vortex pinning channels, metallic mirror sheen, and cryogenic photo texturing.
 *   audioAdvance -> navigates magnetic flux pinning creep & levitating magnet precession
 *   audioKick    -> flashes magnetic flux expulsion compression & quantum pinning bursts
 *   audioSwell   -> widens magnetic levitation gap distance & superconducting diamagnetic glow
 *   audioCentroid-> shifts YBCO superconducting transition & diamagnetic color spectra
 *
 * Per-activation variety:
 *   diskScaleP float superconductor disk scale             (0.8..2.2)
 *   specularP  float permanent magnet facet specular gain  (0.8..2.5)
 */

in vec2 vUV;
in vec3 vNormal;
in vec3 vCol;
in float vMeissnerGlow;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float specularP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    vec3 lightDir = normalize(vec3(0.5, 0.6, 0.7));
    float diff = max(0.0, dot(vNormal, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0))), 24.0) * (specularP > 0.01 ? specularP : 1.2);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.4 + 0.6 * diff);
    col += vec3(0.95, 0.95, 1.0) * spec * (1.0 + 3.0 * audioKick);
    col += vec3(0.2, 0.85, 1.0) * vMeissnerGlow * 2.2;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
