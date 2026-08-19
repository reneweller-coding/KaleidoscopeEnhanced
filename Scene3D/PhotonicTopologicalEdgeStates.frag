#version 330 core
out vec4 fragColor;
/**
 * @file PhotonicTopologicalEdgeStates.frag
 * @brief PHOTONIC TOPOLOGICAL EDGE STATES: 3D ribbon lattice of coupled optical waveguides.
 * Demonstrates robust, backscattering-immune topological edge currents routing light pulses
 * around defects, with core laser pulses and iridescent photo texturing.
 *   audioAdvance -> drives edge current photon propagation velocity
 *   audioKick    -> flashes high-energy laser pulse injection bursts
 *   audioSwell   -> thickens waveguide ribbon width & cladding glow
 *   audioCentroid-> shifts topological edge band spectrum
 *
 * Per-activation variety:
 *   ribbonWidthP float waveguide ribbon thickness          (0.02..0.1)
 *   edgeSpeedP   float topological pulse propagation speed (0.8..3.0)
 *   glowP        float waveguide cladding luminance         (0.8..2.5)
 */

in vec2 vUV;
in float vSide;
in float vRibbonID;
in vec3 vCol;
in float vPulse;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioValence;
uniform float audioChromaHue;

uniform float glowP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

void main()
{
    // Waveguide core profile across ribbon side (-1 to +1)
    float coreFalloff = 1.0 - abs(vSide);
    float coreGlow = pow(coreFalloff, 2.5);
    float edgeRim = exp(-abs(abs(vSide) - 0.9) * 15.0);
    
    // Sample background photo mapped along waveguide ribbon length
    vec2 photoUv = fract(vec2(vUV.x * 2.0, vUV.y));
    vec3 photoSample = img(photoUv);
    
    // Combine vertex color, photo, and laser pulse
    vec3 col = vCol * (0.6 + 0.4 * photoSample);
    col += vCol * coreGlow * (glowP > 0.01 ? glowP : 1.2) * (0.8 + 0.4 * audioSwell);
    col += vec3(0.9, 0.95, 1.0) * vPulse * 2.5;
    col += vCol * edgeRim * 1.5;
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
