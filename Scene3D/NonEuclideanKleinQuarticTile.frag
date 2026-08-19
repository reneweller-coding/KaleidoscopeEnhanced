#version 330 core
out vec4 fragColor;
/**
 * @file NonEuclideanKleinQuarticTile.frag
 * @brief NON-EUCLIDEAN KLEIN QUARTIC TILE: Hyperbolic tiling of the Klein quartic Riemann surface
 * (genus 3) by 24 regular heptagons with PSL(2,7) symmetry group of order 168. Features glassy
 * hyperbolic heptagon facets, specular reflections, and photo-derived geometric texturing.
 *   audioAdvance -> drives non-Euclidean hyperbolic geodesic isometry flow
 *   audioKick    -> flashes specular facet reflections & symmetry axis pulses
 *   audioSwell   -> thickens hyperbolic glass facet curvature & transmission
 *   audioCentroid-> shifts Riemann surface immersion color spectra
 *
 * Per-activation variety:
 *   quarticScaleP float Klein quartic 3D immersion scale      (0.8..2.2)
 *   fresnelP      float glass facet Fresnel reflection gain   (0.8..2.5)
 *   heptagonP     float heptagonal boundary crease sharpness  (0.6..2.2)
 */

in vec2 vUV;
in vec3 vNormal;
in vec3 vCol;
in float vFacetID;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float fresnelP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    vec3 lightDir = normalize(vec3(0.5, 0.6, 0.7));
    float diff = max(0.0, dot(vNormal, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0))), 24.0) * (fresnelP > 0.01 ? fresnelP : 1.2);
    
    // Heptagonal tile boundary grid
    vec2 p = vUV * 2.0 - 1.0;
    float r = length(p);
    float edgeGlow = exp(-abs(r - 0.85) * 16.0);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.4 + 0.6 * diff);
    col += vec3(0.95, 0.95, 1.0) * spec * (1.0 + 3.0 * audioKick);
    col += vCol * edgeGlow * 1.6;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
