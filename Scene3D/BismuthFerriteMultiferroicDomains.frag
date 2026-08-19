#version 330 core
out vec4 fragColor;
/**
 * @file BismuthFerriteMultiferroicDomains.frag
 * @brief BISMUTH FERRITE MULTIFERROIC DOMAINS: 3D quad terraces of multiferroic domain walls
 * in BiFeO3. Displays cross-coupled ferroelectric polarization terraces, conductive domain wall
 * channels, metallic ceramic reflections, and photo texturing.
 *   audioAdvance -> switches ferroelectric domain wall polarization states
 *   audioKick    -> flashes conductive domain wall nano-channel current pulses
 *   audioSwell   -> thickens multiferroic terrace step height & ceramic sheen
 *   audioCentroid-> shifts polarization domain color spectra
 *
 * Per-activation variety:
 *   stepHeightP  float domain terrace step elevation        (0.04..0.18)
 *   channelGlowP float conductive domain wall edge luminance (0.8..2.5)
 *   specularP    float perovskite ceramic specular sheen     (0.8..2.2)
 */

in vec2 vUV;
in vec3 vNormal;
in vec3 vCol;
in float vDomainType;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float channelGlowP;
uniform float specularP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    // Quad edge conductive channel detection
    vec2 edgeUv = abs(vUV * 2.0 - 1.0);
    float edgeDist = max(edgeUv.x, edgeUv.y);
    float channelGlow = smoothstep(0.82, 0.98, edgeDist) * (channelGlowP > 0.01 ? channelGlowP : 1.2);
    
    vec3 lightDir = normalize(vec3(0.4, 0.6, 0.7));
    float diff = max(0.0, dot(vNormal, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0))), 24.0) * (specularP > 0.01 ? specularP : 1.2);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.5 + 0.5 * diff);
    col += vec3(0.9, 0.95, 1.0) * channelGlow * (1.0 + 3.0 * audioKick);
    col += vec3(1.0, 0.95, 0.8) * spec;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
