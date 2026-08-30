#version 330 core
out vec4 fragColor;
/**
 * @file BuddhabrotCosmicGhost.frag
 * @brief BUDDHABROT COSMIC GHOST: Inverse orbit-density projection of escaping
 * Mandelbrot trajectories forming a luminous, meditating cosmic ghost figure
 * with multi-spectral exposure channels, nebula halos, and spiritual resonance.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous orbit trajectory integration & ghost rotation
 *   audioKick    -> flashes interior third-eye chakra & expands astral aura
 *   audioCentroid-> modulates fine orbit filament density & exposure sharpness
 *   audioSubBass -> expands meditating astral ghost respiration
 *   audioChromaHue-> rotates the luminous cosmic ghost palette
 */

uniform vec2  resolution;
uniform float time;
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

// Per-activation variety
uniform float speedP;
uniform float densityP;
uniform float auraP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t) {
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float dens = (densityP > 0.01) ? densityP : 1.0;
    float ar = (auraP > 0.01) ? auraP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.150 * spd + audioAdvance * 0.150 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Center coordinate for meditating Buddhabrot: center around c = (-0.5, 0.0)
    // Rotate 90 degrees so Buddha sits upright
    vec2 c = vec2(-uv.y * 1.6 - 0.45, uv.x * 1.6);
    c /= (1.0 + 0.15 * sin(audioSwell * 2.5) + 0.1 * audioSubBass);

    // Multi-spectral orbit density sampling across 3 exposure depths (R, G, B channels)
    vec3 orbitDensity = vec3(0.0);

    vec2 z = c;
    for (int i = 0; i < 32; i++) {
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
        float r2 = dot(z, z);

        // Distance from current pixel to orbit point
        vec2 orbitPixel = vec2(z.y / 1.6, -(z.x + 0.45) / 1.6);
        float d = length(uv - orbitPixel);

        // Tonal brightness tightens every exposure kernel at once: thinner, finer
        // filaments -- and because it only steepens the decay it can never raise
        // the accumulated exposure above what the darker setting already gave.
        float expo = dens * (1.0 + 0.45 * audioCentroid);
        // Channel R: long orbits (deep inner details)
        if (i >= 18) orbitDensity.r += exp(-d * (35.0 * expo));
        // Channel G: medium orbits (body of Buddha)
        if (i >= 8)  orbitDensity.g += exp(-d * (25.0 * expo));
        // Channel B: short orbits (halo and aura)
        orbitDensity.b += exp(-d * (15.0 * expo));

        if (r2 > 16.0) break;
    }

    // Sample slideshow texture on ghost coordinate
    vec2 sampleUV = fract(uv * 0.4 + 0.5);
    vec3 texCol = img(sampleUV);

    // Astral palette mixing
    vec3 palA = imgPalette(length(orbitDensity) * 0.2 + t * 0.05);
    vec3 palB = imgPalette(length(orbitDensity) * 0.2 + 0.5);
    vec3 ghostCol = mix(palA, palB, 0.5 + 0.5 * sin(orbitDensity.g * 2.0));

    ghostCol = mix(ghostCol, texCol, 0.35 + 0.15 * audioValence);

    // Add glowing multi-channel astral light
    vec3 astralLight = vec3(
        orbitDensity.r * 1.4,
        orbitDensity.g * 1.1,
        orbitDensity.b * 1.6
    ) * glw * (1.0 + 2.5 * audioKick) * ar;

    ghostCol += astralLight;

    // Third-eye chakra bloom (located at top center)
    vec2 chakraPos = vec2(0.0, 0.35);
    float chakraBloom = exp(-length(uv - chakraPos) * 8.0) * (1.2 + 3.0 * audioKick);
    ghostCol += vec3(1.8, 1.6, 1.2) * chakraBloom;

    ghostCol = pow(ghostCol, vec3(0.88));
    ghostCol /= 1.0 + 0.55 * max(ghostCol.r, max(ghostCol.g, ghostCol.b));   // peak knee: tame local glare, keep midtones
    fragColor = vec4(clamp(ghostCol, 0.0, 1.0), 1.0);
}
