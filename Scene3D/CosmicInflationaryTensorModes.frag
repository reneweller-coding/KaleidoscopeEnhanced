#version 330 core
out vec4 fragColor;
/**
 * @file CosmicInflationaryTensorModes.frag
 * @brief COSMIC INFLATIONARY TENSOR MODES: 220x120 heightfield grid of primordial gravitational
 * wave tensor fluctuations from the inflationary epoch. Plus (+) and cross (x) polarization metric
 * strains stretch and squeeze spacetime grid lines with cosmic microwave background photo texturing.
 *   audioAdvance -> propagates cosmological tensor gravitational wave perturbations
 *   audioKick    -> flashes quantum metric fluctuation horizon re-entry bursts
 *   audioSwell   -> widens inflationary spacetime metric tensor strain amplitude
 *   audioCentroid-> shifts tensor mode quadrupolar temperature anisotropy spectra
 *
 * Per-activation variety:
 *   tensorScaleP float gravitational wave metric strain amplitude(0.6..2.2)
 *   specularP    float spacetime metric grid specular highlight  (0.8..2.5)
 */

in vec2 vUV;
in vec3 vNormal;
in vec3 vCol;
in float vGravWavePhase;

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
    
    // Spacetime coordinate grid lines
    vec2 p = vUV * 22.0;
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
