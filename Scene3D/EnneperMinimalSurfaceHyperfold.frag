#version 330 core
out vec4 fragColor;
/**
 * @file EnneperMinimalSurfaceHyperfold.frag
 * @brief ENNEPER MINIMAL SURFACE HYPERFOLD: 220x120 parametric grid of a higher-order
 * self-intersecting Enneper minimal surface. Gaussian curvature shading, double-sided
 * specular glints, and photo texturing mapped along isothermal coordinate patches.
 *   audioAdvance -> rotates isometric parameter domain through 3D space
 *   audioKick    -> flashes Gaussian curvature focal point highlights
 *   audioSwell   -> widens self-intersecting hyperfold blade amplitude
 *   audioCentroid-> shifts minimal surface harmonic color spectra
 *
 * Per-activation variety:
 *   enneperScaleP float parameter domain scale              (0.8..2.2)
 *   hyperfoldP    float higher-order harmonic folding       (0.5..2.0)
 *   specularP     float double-sided metallic specular gain (0.8..2.5)
 */

in vec2 vUV;
in vec3 vNormal;
in vec3 vCol;
in float vCurvature;

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
    vec3 lightDir = normalize(vec3(0.5, 0.7, 0.6));
    float diff = max(0.0, abs(dot(vNormal, lightDir)));
    float spec = pow(max(0.0, abs(dot(vNormal, vec3(0.0, 0.0, 1.0)))), 22.0) * (specularP > 0.01 ? specularP : 1.2);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.5 + 0.5 * diff);
    col += vCol * vCurvature * 2.0 * (0.8 + 0.4 * audioSwell);
    col += vec3(0.95, 0.95, 1.0) * spec * (1.0 + 3.0 * audioKick);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
