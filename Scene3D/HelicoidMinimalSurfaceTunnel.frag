#version 330 core
out vec4 fragColor;
/**
 * @file HelicoidMinimalSurfaceTunnel.frag
 * @brief HELICOID MINIMAL SURFACE TUNNEL: 220x120 heightfield grid of an infinite double-helical
 * minimal surface (the only ruled minimal surface besides the plane). Ruled spiral ramps,
 * zero mean curvature lighting, specular sheen, and photo texturing.
 *   audioAdvance -> drives continuous helical winding & camera spiral advance
 *   audioKick    -> flashes ruled line reflection glints & caustic highlights
 *   audioSwell   -> widens minimal surface tunnel radius & ramp breadth
 *   audioCentroid-> shifts ruled spiral minimal surface color spectra
 *
 * Per-activation variety:
 *   helicoidPitchP float helical ramp screw pitch           (0.3..1.2)
 *   specularP      float minimal surface specular reflection (0.8..2.5)
 */

in vec2 vUV;
in vec3 vNormal;
in vec3 vCol;
in float vHelicoidAngle;

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
    
    // Ruled surface line markings along radius
    vec2 p = vUV * 2.0 - 1.0;
    float ruledLine = exp(-abs(fract(p.x * 12.0) - 0.5) * 12.0);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.4 + 0.6 * diff);
    col += vec3(0.95, 0.95, 1.0) * spec * (1.0 + 3.0 * audioKick);
    col += vCol * ruledLine * 0.8;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
