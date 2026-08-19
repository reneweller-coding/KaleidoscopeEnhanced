#version 330 core
out vec4 fragColor;
/**
 * @file KelvinWakeShipWavePattern.frag
 * @brief KELVIN WAKE SHIP WAVE PATTERN: 220x120 heightfield grid of the classical hydrodynamic
 * Kelvin ship wake pattern. Divergent and transverse wave systems bounded by the universal
 * 19.47-degree Mach wedge, foamy crest highlights, specular ocean sheen, and photo texturing.
 *   audioAdvance -> propels ship wake propagation & hydrodynamic phase velocity
 *   audioKick    -> flashes wave crest foam cavitation & whitecap glints
 *   audioSwell   -> enriches wave amplitude & ocean surface caustic depth
 *   audioCentroid-> shifts water transmission & atmospheric reflection spectra
 *
 * Per-activation variety:
 *   waveScaleP float Kelvin wave train spatial frequency     (0.6..2.2)
 *   foamGlowP  float wave crest whitecap foam luminance     (0.8..2.5)
 *   specularP  float water surface specular highlight gain   (0.8..2.5)
 */

in vec2 vUV;
in vec3 vNormal;
in vec3 vCol;
in float vCrestGlow;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float foamGlowP;
uniform float specularP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    vec3 lightDir = normalize(vec3(0.3, 0.6, 0.7));
    float diff = max(0.0, dot(vNormal, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0))), 28.0) * (specularP > 0.01 ? specularP : 1.3);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.4 + 0.6 * diff);
    col += vec3(0.95, 0.95, 1.0) * spec * (1.0 + 3.0 * audioKick);
    col += vec3(0.85, 0.95, 1.0) * vCrestGlow * (foamGlowP > 0.01 ? foamGlowP : 1.3) * 1.8;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
