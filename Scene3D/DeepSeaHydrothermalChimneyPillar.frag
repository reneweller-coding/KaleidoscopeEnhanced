#version 330 core
out vec4 fragColor;
/**
 * @file DeepSeaHydrothermalChimneyPillar.frag
 * @brief DEEP SEA HYDROTHERMAL CHIMNEY PILLAR: Abyssal black smoker mineral chimney tower.
 * 400C mineral-laden superheated hydrothermal fluid vents into near-freezing ocean water,
 * precipitating anhydrite, chalcopyrite, and pyrite crystals with deep-sea photo texturing.
 *   audioAdvance -> drives hydrothermal fluid convective ascent & gas plume eruption
 *   audioKick    -> flashes superheated hydrothermal steam cavitation bursts
 *   audioSwell   -> widens mineral chimney tower girth & sulfide precipitate density
 *   audioCentroid-> shifts mineral sulfide (chalcopyrite/pyrite/sulfur) color spectra
 *
 * Per-activation variety:
 *   pillarScaleP float hydrothermal chimney pillar diameter   (0.8..2.2)
 *   ventGlowP    float superheated hydrothermal vent luminance(0.8..2.5)
 *   specularP    float mineral crystal facet sheen gain       (0.8..2.5)
 */

in vec2 vUV;
in vec3 vNormal;
in vec3 vCol;
in float vSmokerGlow;

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
    col += vec3(1.0, 0.55, 0.1) * vSmokerGlow * 2.2;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
