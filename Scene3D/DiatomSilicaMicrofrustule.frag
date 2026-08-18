#version 330 core
out vec4 fragColor;

in vec3 vWorldPos;
in vec2 vTexCoord;
in float vDiatomIndex;

/**
 * @file DiatomSilicaMicrofrustule.frag
 * @brief Lighting for a diatom's circular silica shell (valve): discards
 * outside the disc, overlays a hexagonal micropore lattice, blends a
 * slideshow photo with an iridescent structural-colour palette, and adds a
 * bright rim glow at the shell's edge, fading into distance fog.
 *
 * audioPhase offsets the iridescent colour arc, audioKick brightens the rim
 * glow, and audioChromaHue (guarded by hueP) rotates the final hue; the
 * iridescent palette itself (imgPalette) tracks the musical key via
 * audioAdvance with audioValence shaping saturation.
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

uniform float diatomP;
uniform float poreP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Diatom circular shell boundary
    vec2 p = vTexCoord * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;

    // Hexagonal silica micropores: sin(k_x * x) * sin(k_y * y)
    float pores = sin(p.x * 25.0) * sin(p.y * 25.0);
    float poreMask = smoothstep(-0.2, 0.5, pores);

    // Photo texture mapping onto diatom valve
    vec3 photo = img(fract(vTexCoord));

    // Transparent silica glass & structural iridescence palette
    vec3 glassIrid = imgPalette(vDiatomIndex + (r * 4.0 + audioPhase) * 0.159);

    // Edge rim glow
    float rimGlow = smoothstep(0.7, 0.98, r);

    vec3 col = mix(photo, glassIrid, 0.45) * (0.6 + 0.4 * poreMask);
    col += rimGlow * vec3(0.3, 0.95, 1.0) * (1.0 + audioKick * 2.5);

    // Distance fog
    float dist = length(vWorldPos);
    col = mix(col, vec3(0.01, 0.03, 0.07), 1.0 - exp(-dist * 0.15));

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 0.85);
}
