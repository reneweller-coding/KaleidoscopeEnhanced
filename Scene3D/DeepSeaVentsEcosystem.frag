#version 330 core
in vec3 vPos;
in float vSpecies;
in float vBioGlow;

out vec4 fragColor;

/**
 * @file DeepSeaVentsEcosystem.frag
 * @brief Lighting for a hydrothermal-vent ecosystem's particles: colours each
 * one by species (vSpecies) -- sulfur-mineral smoker particles, bioluminescent
 * siphonophores, or tube-worm plume tips -- tinted toward the house photo
 * palette and brightened by its own bio-glow value (vBioGlow).
 *
 * audioKick pumps the overall brightness of every organism, and hueP applies
 * a final preset hue rotation; the photo palette itself follows the musical
 * key via audioChromaHue/audioAdvance inside imgPalette, with audioValence
 * shaping its saturation.
 *
 * Audio Reactivity:
 *   audioKick      -> brightness pump on every organism
 *   audioChromaHue -> rotates the photo palette arc with the musical key
 *   audioValence   -> saturation of that palette
 *   audioAdvance   -> slow palette drift (pre-integrated)
 *   audioMode      -> water temperature: a minor key sinks the whole vent
 *                     field into cold abyssal blue, a major key lets the
 *                     sulfur golds and hemoglobin reds burn through
 *   (audioLowMid / audioRoughness shape the plume upstream in the .vert.)
 */

uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioSwell;

uniform float glowP;
uniform float hueP;
uniform float audioChromaHue;
uniform float audioValence;
uniform float audioMode;   // 0 = minor / cold, 1 = major / warm (slow ~3 s)

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


// House tint: bend a colour toward the photo palette while keeping its
// luminance -- the identity look survives, only the hue follows the photos.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    // Deep sea organism colors based on species
    vec3 col = vec3(0.0);
    if (vSpecies < 0.35) {
        // Hydrothermal smoker mineral sulfur particles (orange/gold)
        col = palTint(mix(vec3(1.0, 0.4, 0.05), vec3(1.0, 0.9, 0.2), vBioGlow), 0.10, 0.22);
    } else if (vSpecies < 0.7) {
        // Bioluminescent siphonophore organisms (electric cyan/azure)
        col = palTint(mix(vec3(0.0, 0.6, 1.0), vec3(0.2, 1.0, 0.8), vBioGlow), 0.45, 0.22);
    } else {
        // Deep-sea tube worm hemoglobin plume tips (crimson/magenta)
        col = palTint(mix(vec3(0.9, 0.05, 0.3), vec3(1.0, 0.3, 0.8), vBioGlow), 0.80, 0.22);
    }

    // WATER TEMPERATURE: a minor key sinks the whole vent field into cold
    // abyssal blue-green; a major key lets the sulfur golds and hemoglobin
    // reds burn back through.  Luminance-preserving, so exposure is untouched.
    vec3 abyssal = vec3(dot(col, vec3(0.30, 0.42, 0.28))) * vec3(0.45, 0.80, 1.15);
    col = mix(abyssal, col, 0.62 + 0.38 * clamp(audioMode, 0.0, 1.0));

    col *= (0.8 + 0.6 * vBioGlow) * (1.0 + audioKick * 2.5) * glw;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
