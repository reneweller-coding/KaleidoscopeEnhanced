#version 330 core
out vec4 fragColor;

in vec3 vWorldPos;
in vec2 vTexCoord;
in float vMetaPhase;

/**
 * @file DielectricMetasurfaceHologram.frag
 * @brief Lighting for a metasurface hologram made of nanopillar meta-atoms:
 * discards outside each pillar's circular aperture, mixes a slideshow photo
 * with a cyan/violet laser-diffraction colour that oscillates per meta-atom
 * (vMetaPhase), and glows brightest at each pillar's centre, fading into
 * distance fog.
 *
 * audioPhase drives the per-meta-atom colour oscillation, audioKick
 * brightens the pillar glow, and audioChromaHue plus hueP both rotate the
 * final hue.
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

uniform float metaP;
uniform float phaseP;
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

    // Photo texture mapping onto hologram meta-atoms
    vec3 photo = img(fract(vTexCoord));

    // Hologram laser diffraction cyan & electric violet palette
    vec3 laserCyan   = vec3(0.1, 0.9, 1.0);
    vec3 laserViolet = vec3(0.8, 0.2, 1.0);
    vec3 metaColor = mix(laserCyan, laserViolet, sin(vMetaPhase * 12.56 + audioPhase) * 0.5 + 0.5);

    // Nanopillar circular aperture profile
    vec2 p = vTexCoord * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float pillarGlow = exp(-r * 3.0);

    vec3 col = mix(photo, metaColor, 0.5) * pillarGlow;
    col += pillarGlow * vec3(1.0, 0.98, 0.9) * (1.0 + audioKick * 2.5);

    // Distance fog
    float dist = length(vWorldPos);
    col = mix(col, vec3(0.02, 0.03, 0.06), 1.0 - exp(-dist * 0.15));

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col * 1.9, 1.0);
}
