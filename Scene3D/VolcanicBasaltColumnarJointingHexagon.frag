#version 330 core
out vec4 fragColor;
/**
 * @file VolcanicBasaltColumnarJointingHexagon.frag
 * @brief VOLCANIC BASALT COLUMNAR JOINTING HEXAGON: Hexagonal columnar jointed basalt terraces
 * (Giant's Causeway / Fingal's Cave). Thermal contraction cracking during slow basaltic lava cooling
 * creates stepped polygonal stone prisms with volcanic fracture magma glow and basalt photo texturing.
 *   audioAdvance -> navigates lava cooling thermal stress fracture propagation & terrace drift
 *   audioKick    -> flashes subsurface molten magma crack decompression bursts
 *   audioSwell   -> thickens basalt column prism cross-section & magma glow radiance
 *   audioCentroid-> shifts basalt mineral (plagioclase/pyroxene/olivine) color spectra
 *
 * Per-activation variety:
 *   columnHeightP float stepped basalt column height contrast (0.4..1.8)
 *   specularP     float basalt stone facet specular gain       (0.8..2.5)
 */

in vec3 vNormal;
in vec3 vCol;
in float vBasaltGlow;

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
    
    vec2 photoUv = fract(vNormal.xy * 0.5 + 0.5);
    vec3 photo = img(photoUv);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.4 + 0.6 * diff);
    col += vec3(0.95, 0.95, 1.0) * spec * (1.0 + 3.0 * audioKick);
    col += vec3(1.0, 0.45, 0.1) * vBasaltGlow * 2.2;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
