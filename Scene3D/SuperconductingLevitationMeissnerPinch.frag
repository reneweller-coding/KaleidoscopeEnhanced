#version 330 core
out vec4 fragColor;
/**
 * @file SuperconductingLevitationMeissnerPinch.frag
 * @brief SUPERCONDUCTING LEVITATION MEISSNER PINCH: an ARRAY of eight levitation cells -- stable
 * magnetic levitation via the Meissner-Ochsenfeld effect and flux pinning over high-Tc YBCO discs,
 * each on a wide cryostat cold plate whose rim meets its neighbours', so the bed spans the frame.
 * Expelled magnetic flux lines, fluxon vortex pinning channels, metallic mirror sheen, and cryogenic
 * photo texturing.
 *   audioAdvance -> navigates magnetic flux pinning creep & levitating magnet precession
 *   audioKick    -> flashes magnetic flux expulsion compression & quantum pinning bursts
 *   audioSwell   -> widens magnetic levitation gap distance & superconducting diamagnetic glow
 *   audioCentroid-> shifts YBCO superconducting transition & diamagnetic color spectra
 *
 * Per-activation variety:
 *   diskScaleP float superconductor disk scale, remapped to a narrow band now
 *              that eight assemblies share the frame       (0.8..2.2)
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
    
    // Fluxon vortex pinning channels: an Abrikosov lattice creeping across the
    // superconductor's face. Constant coefficients on `time` (anti-flicker safe),
    // ~0.3 Hz, and it is the fine surface detail the header promises but that the
    // shading never actually drew.
    float fx = sin(vUV.x * 44.0 + time * 0.9) * sin(vUV.y * 26.0 - time * 0.7);
    float fluxon = 0.72 + 0.28 * fx;

    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.4 + 0.6 * diff) * fluxon;
    col += vec3(0.95, 0.95, 1.0) * min(spec * (1.0 + 3.0 * audioKick), 1.6);
    col += min(vec3(0.2, 0.85, 1.0) * vMeissnerGlow * 2.2, vec3(0.35, 1.10, 1.30));
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
