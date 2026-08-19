#version 330 core
out vec4 fragColor;
/**
 * @file BacteriophageIcosahedralCapsidInjection.frag
 * @brief BACTERIOPHAGE ICOSAHEDRAL CAPSID INJECTION: T4 Bacteriophage viral injection nanomachine.
 * Icosahedral protein capsid, contractile tail sheath, baseplate spikes, and high-pressure viral
 * DNA genome injection pulse into a host bacterium with cryo-EM photo texturing.
 *   audioAdvance -> navigates viral tail sheath contraction & DNA translocation drift
 *   audioKick    -> flashes high-pressure viral DNA genome ejection & baseplate perforation
 *   audioSwell   -> widens icosahedral capsid diameter & protein capsomer luminescence
 *   audioCentroid-> shifts viral protein / nucleic acid fluorescence spectra
 *
 * Per-activation variety:
 *   phageScaleP float T4 phage macromolecular complex scale (0.8..2.2)
 *   specularP   float protein capsomer facet specular gain  (0.8..2.5)
 */

in vec2 vUV;
in vec3 vNormal;
in vec3 vCol;
in float vInjectGlow;

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
    col += vec3(0.3, 1.0, 0.7) * vInjectGlow * 2.2;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
