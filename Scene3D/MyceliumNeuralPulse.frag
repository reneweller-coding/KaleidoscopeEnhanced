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
 *
 * Audio Reactivity:
 *   audioKick      -> action-potential firing (.comp generator)
 *   audioAdvance   -> camera orbit + photo-palette arc drift
 *   audioChromaHue -> musical key picks the photo-palette arc
 *   audioValence   -> saturation of the palette (bleak = greyer)
 *   audioMode      -> resting-thread colour temperature: minor harmony gives
 *                     a cold blue-teal mycelium, major a warm green-gold one
 *                     (the two ends are luminance-matched, so this is a hue
 *                     shift and not a brightness change)
 *   audioLowMid    -> harmonic breath of the whole mat (see .vert)
 *   audioRoughness -> dissonance tangles the strands (see .vert)
 *   pulseP/glowP   -> firing rate and brightness
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
uniform float audioMode;

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

    // Resting mycelium hyphae bioluminescent colour.  The key's MODE sets the
    // colony's temperature: minor -> a cold blue-teal bioluminescence, major
    // -> a warm green-gold one.  Both ends are luminance-matched against the
    // original teal ramp, so this reads purely as warmth, never as exposure.
    float mmaj = clamp(audioMode, 0.0, 1.0);
    vec3 restCold = mix(vec3(0.08, 0.38, 0.45), vec3(0.12, 0.55, 0.85), vLevel);
    vec3 restWarm = mix(vec3(0.14, 0.58, 0.24), vec3(0.34, 0.78, 0.55), vLevel);
    vec3 baseColor = palTint(mix(restCold, restWarm, mmaj), 0.30 * vLevel, 0.25);

    // Bio-electric action potential: flash colour drawn from the PHOTO
    // palette so the network is never a monotone white/green thicket
    vec3 pulseColor = imgPalette(0.22) * 1.5;

    vec3 col = mix(baseColor, pulseColor, vPulse * pls);
    col *= (0.5 + 0.9 * vPulse) * glw;
    col /= 1.0 + 0.32 * max(col.r, max(col.g, col.b));

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
