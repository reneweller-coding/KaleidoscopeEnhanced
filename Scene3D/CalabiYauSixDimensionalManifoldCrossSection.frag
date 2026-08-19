#version 330 core
out vec4 fragColor;
/**
 * @file CalabiYauSixDimensionalManifoldCrossSection.frag
 * @brief CALABI-YAU SIX-DIMENSIONAL MANIFOLD CROSS SECTION: 220x120 heightfield grid of a 3D
 * projection of a 6-dimensional Ricci-flat Calabi-Yau compactification manifold (quintic threefold).
 * Toric folds, complex Käler metric modulations, glass specular sheen, and string-theory photo texturing.
 *   audioAdvance -> navigates complex structure moduli space deformation & rotation
 *   audioKick    -> flashes singular conifold transition & mirror symmetry bursts
 *   audioSwell   -> expands Calabi-Yau compactification radius & Kähler volume form
 *   audioCentroid-> shifts Ricci-flat metric curvature invariant color spectra
 *
 * Per-activation variety:
 *   calabiScaleP float Calabi-Yau manifold 3D scale           (0.8..2.2)
 *   specularP    float complex manifold facet specular gain  (0.8..2.5)
 */

in vec2 vUV;
in vec3 vNormal;
in vec3 vCol;
in float vCalabiPhase;

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
    
    // Complex coordinate grid lines
    vec2 p = vUV * 18.0;
    float gridLine = exp(-abs(fract(p.x) - 0.5) * 16.0) + exp(-abs(fract(p.y) - 0.5) * 16.0);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.4 + 0.6 * diff);
    col += vec3(0.95, 0.95, 1.0) * spec * (1.0 + 3.0 * audioKick);
    col += vCol * gridLine * 0.8;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
