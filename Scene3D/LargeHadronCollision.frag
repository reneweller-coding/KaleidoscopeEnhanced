#version 330 core
in vec3 vPos;
in float vEnergy;
in float vSpecies;

out vec4 fragColor;

/**
 * @file LargeHadronCollision.frag
 * @brief Shades one particle-track point from a continuous stream of
 * simulated collision debris, coloured by species: gold quark/gluon
 * jets, cyan muon/Cherenkov tracks, magenta Higgs-decay cascades.
 *
 * vEnergy (per-point brightness, freshest tracks brightest, baked in
 * LargeHadronCollision.vert from audioKick-boosted burst speed and an
 * evolving helical Lorentz trajectory) scales the additive output; the
 * species colour is tinted toward the current photo palette by vSpecies
 * via the house palTint/imgPalette helpers (audioChromaHue-keyed).
 * energyP and glowP are user presets; a soft-knee compression keeps
 * thousands of overlapping additive tracks from summing to pure white.
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
uniform float energyP;
uniform float hueP;
uniform float audioChromaHue;
uniform float audioValence;

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
    float glw = (glowP    > 0.0) ? glowP    : 1.0;
    float enp = (energyP  > 0.0) ? energyP  : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 circ = gl_PointCoord - vec2(0.5);
    float r = length(circ);
    if (r > 0.5) discard;

    float alpha = smoothstep(0.5, 0.05, r);

    // Particle species color (quarks=gold, muons=cyan, electrons=magenta)
    vec3 specColor = vec3(0.0);
    if (vSpecies < 0.33) {
        specColor = vec3(1.0, 0.8, 0.2); // Quarks / Gluons
    } else if (vSpecies < 0.66) {
        specColor = vec3(0.1, 0.9, 1.0); // Muons / Cherenkov
    } else {
        specColor = vec3(1.0, 0.2, 0.7); // Higgs decay cascades
    }

    // A breath of the photo palette on top of the species identity.
    specColor = palTint(specColor, vSpecies, 0.20);

    // Lower gain + soft compression: thousands of additive tracks summed the
    // old x2.0 into pure white (metric scan: saturation 0.01) -- the species
    // colours only survive if a single fragment stays below clip.
    vec3 col = specColor * min(vEnergy, 1.6) * enp * glw * 0.45;
    col = col / (1.0 + 0.45 * max(col.r, max(col.g, col.b)));

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, alpha * vEnergy);
}
