#version 330 core
out vec4 fragColor;
/**
 * @file QuasiPeriodicDanzerTiling.frag
 * @brief QUASI PERIODIC DANZER TILING: 6D-to-3D cut-and-project icosahedral Danzer
 * quasicrystal tiling. Golden ratio (phi = 1.618) fractal star needles, never-repeating
 * aperiodic lattice nodes, and glowing holographic crystal diffraction facets.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous drift of 6D hyperspace cut-and-project plane
 *   audioKick    -> flashes icosahedral quasicrystal vertex nodes & shockwave burst
 *   audioCentroid-> modulates aperiodic needle sharpness & fine grid resolution
 *   audioSubBass -> expands quasicrystal lattice scale breathing
 *   audioChromaHue-> rotates the luminous icosahedral rainbow palette
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
uniform float scaleP;
uniform float starP;
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

// Overall level of the photo currently bound, from a fixed 5-tap grid. The
// quasicrystal's cell colour is entirely photo-derived and the library spans
// near-black to near-white, so a bright photo left the vertex nodes no
// headroom. The probe rides the tex0/tex1 crossfade so the gain can never
// pop, and one number for the whole frame rescales exposure without touching
// local contrast.
float photoLevel() {
    vec3 s = img(vec2(0.25, 0.25)) + img(vec2(0.75, 0.25))
           + img(vec2(0.25, 0.75)) + img(vec2(0.75, 0.75))
           + img(vec2(0.50, 0.50));
    return dot(s * 0.2, vec3(0.299, 0.587, 0.114));
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float sc = (scaleP > 0.01) ? scaleP : 1.0;
    float str = (starP > 0.01) ? starP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.30 * spd + audioAdvance * 0.24 * spd;   // Zeit-Basis:
    // audioAdvance allein steht bei ruhiger Musik still ("wirkt wie ein Bild").

    // Golden ratio constant
    const float PHI = 1.6180339887;

    // 6 Basis vectors projected onto 2D from icosahedral 6D hyper-space
    // Sub-bass breathes the lattice: dividing the projection scale enlarges
    // every quasicrystal cell on screen (the cut-plane drift, which lives in
    // `offset`, is left alone so the aperiodic pattern keeps flowing evenly).
    vec2 p = uv * (8.0 * sc) / (1.0 + 0.35 * audioSubBass);

    float fieldSum = 0.0;
    float minDist = 1e4;

    // Project 6 symmetric directions (2pi / 6 * k + golden shift)
    for (int i = 0; i < 6; i++) {
        float angle = float(i) * (3.14159265 / 3.0) + t * 0.15;
        vec2 dir = vec2(cos(angle), sin(angle));

        // 6D Cut plane translation offset
        float offset = sin(t * 0.4 + float(i) * PHI);

        float proj = dot(p, dir) + offset;
        float wave = cos(proj * str);
        fieldSum += wave;

        float dGrid = abs(fract(proj * 0.5) - 0.5);
        minDist = min(minDist, dGrid);
    }

    // Quasicrystal aperiodic potential
    float potential = fieldSum / 6.0;

    // Luminous aperiodic lattice nodes. minDist is the minimum of six
    // |fract(x)-0.5| terms, so its density piles up hard against zero (mean
    // ~0.07): with the old 18.0 falloff the glow still averaged ~0.4 across
    // the WHOLE frame and, tinted, clipped roughly half the pixels to white
    // grout. A falloff matched to that scale keeps the lattice as thin lit
    // seams -- bright where they land, black in between.
    float nodeGlow = exp(-minDist * (60.0 + 30.0 * audioCentroid)) * glw;
    float peakStar = pow(max(0.0, potential), 6.0) * (1.0 + 3.0 * audioKick);

    // Sample distorted background photo
    vec2 sampleUV = fract(uv * 0.4 + vec2(potential * 0.08) + 0.5);
    vec3 texCol = img(sampleUV);

    // Quasicrystal palette
    vec3 palA = imgPalette(potential * 0.4 + t * 0.05);
    vec3 palB = imgPalette(potential * 0.4 + 0.5);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(fieldSum * 2.0));

    col = mix(col, texCol, 0.35 + 0.15 * audioValence);

    // Hold the crystal cells to a fixed dark level so the diffraction facets
    // read as light against the lattice, whatever photo happens to be bound.
    col *= clamp(0.20 / max(0.05, photoLevel()), 0.20, 2.4);

    // Add glowing aperiodic stars & vertex nodes. Both tints exceed 1.0 per
    // channel on their own, so the TINTED vectors are capped -- peakStar in
    // particular reaches 1.0 on a kick and its tinted result ran to ~6.
    vec3 starTint = min(vec3(1.4, 1.2, 1.8) * nodeGlow * (1.0 + 2.0 * audioKick), vec3(1.2));
    vec3 peakTint = min(vec3(1.6, 1.5, 1.9) * peakStar, vec3(1.4));
    col += starTint + peakTint;

    col = pow(col, vec3(0.88));
    vec3 _catTone = clamp(col, 0.0, 1.0);
    _catTone /= 1.0 + 0.33 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
