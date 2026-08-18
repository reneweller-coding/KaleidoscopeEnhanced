#version 330 core
out vec4 fragColor;

in vec3 vWorldPos;
in float vVortexPhase;

/**
 * @file AbrikosovFluxLatticeVortices.frag
 * @brief Point-sprite lattice of superconducting flux vortices, each a soft
 * circular glow blending a cyan/violet vortex palette with the slideshow
 * photo sampled from the vortex's own world position.
 *
 * audioPhase drives the cyan-to-violet oscillation of each vortex's colour;
 * audioKick punches up a hot, palette-tinted core on every hit; audioChromaHue
 * and the hueP preset both rotate the final hue. Vertex-side uniforms
 * (audioSubBass, audioBass, audioFlux, etc.) shape the lattice's own motion in
 * the companion .vert. The fragment ends with a soft-knee tone-mapping step
 * so loud audio compresses instead of clipping to white.
 */

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float fluxP;
uniform float kelvinP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Point sprite circular Gaussian profile
    vec2 pt = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(pt, pt);
    if (r2 > 1.0) discard;
    float spriteGlow = exp(-r2 * 4.0);

    // Photo texture mapping from world coords
    vec2 photoUV = fract(vWorldPos.xy * 0.3 + 0.5);
    vec3 photo = img(photoUV);

    // Quantized flux vortex cyan & violet palette
    vec3 fluxCyan   = vec3(0.1, 0.9, 1.0);
    vec3 fluxViolet = vec3(0.7, 0.2, 1.0);
    vec3 vortexColor = mix(fluxCyan, fluxViolet, sin(vVortexPhase * 12.56 + audioPhase) * 0.5 + 0.5);

    vec3 col = mix(photo, vortexColor, 0.6) * spriteGlow;
    // Hot core TINTED by the palette (white additive term drowned the
    // cyan/violet; metric scan: saturation 0.11).
    col += spriteGlow * mix(vortexColor, vec3(1.0, 0.98, 0.9), 0.35)
                     * (0.45 + audioKick * 1.8);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.55;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, spriteGlow);
}
