#version 330 core
in vec3 vPos;
in float vPulse;
in float vLevel;

out vec4 fragColor;
/**
 * @file MyceliumNeuralPulse.frag
 * @brief MYCELIUM NEURAL PULSE: an underground hyphae network - teal resting
 * threads through which photo-palette-coloured action potentials flash,
 * camera orbiting the thicket.
 *   audioKick/Onset -> pulse firing    audioAdvance -> orbit
 *   pulseP/glowP    -> firing rate and brightness
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
uniform float pulseP;
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
    float glw = (glowP  > 0.0) ? glowP  : 1.0;
    float pls = (pulseP > 0.0) ? pulseP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    // Resting mycelium hyphae bioluminescent green/cyan color
    vec3 baseColor = palTint(mix(vec3(0.1, 0.5, 0.3), vec3(0.2, 0.7, 0.8), vLevel), 0.30 * vLevel, 0.25);

    // Bio-electric action potential: flash colour drawn from the PHOTO
    // palette so the network is never a monotone white/green thicket
    vec3 pulseColor = imgPalette(0.22) * 1.5;

    vec3 col = mix(baseColor, pulseColor, vPulse * pls);
    col *= (0.5 + 0.9 * vPulse) * glw;
    col /= 1.0 + 0.32 * max(col.r, max(col.g, col.b));

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
