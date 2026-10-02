#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file QuasicrystalPenroseKaleido.frag
 * @brief QUASICRYSTAL PENROSE KALEIDO: 5D-to-2D De-Bruijn aperiodic quasicrystal
 * projection with golden-ratio phi symmetries, 10-fold non-repeating diffraction
 * planes, and dynamic multi-frequency interference ribbons.
 *
 * Audio Reactivity:
 *   audioAdvance -> translates through 5D hyper-plane cut space
 *   audioKick    -> flashes aperiodic Bragg diffraction nodes
 *   audioCentroid-> modulates wave grid frequency & interference sharpness
 *   audioSubBass -> expands phi-ratio radial scale pulsation
 *   audioChromaHue-> rotates the diffraction rainbow spectrum
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioFlux;   ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

// Per-activation variety
uniform float speedP;   ///< Speed knob, 0..1.
uniform float phiScaleP;
uniform float symmetryP;
uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t) {
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float phiSc = (phiScaleP > 0.01) ? phiScaleP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;
    float symN = (symmetryP > 1.0) ? symmetryP : 5.0; // 5 or 7 or 10

    float t = time * 0.132 * spd + audioAdvance * 0.132 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Golden ratio scale factor
    float phi = 1.6180339887;
    float scale = (14.0 * phiSc) * (1.0 + 0.15 * sin(audioSwell * 2.0));
    vec2 p = uv * scale;

    // De-Bruijn 5D wave sum method for aperiodic quasicrystal
    float quasiSum = 0.0;
    float quasiPhase = 0.0;
    vec2 grad = vec2(0.0);

    int nWaves = int(clamp(symN, 5.0, 10.0));
    float dAngle = 3.14159265 / float(nWaves);

    for (int i = 0; i < 10; i++) {
        if (i >= nWaves) break;
        float ang = float(i) * dAngle + t * 0.15;
        vec2 dir = vec2(cos(ang), sin(ang));

        // 5D hyper-plane shift parameterized by audio and time
        float shift = sin(t * 0.5 + float(i) * 1.2566) * (1.2 + 0.3 * audioSwell);
        float phase = dot(p, dir) + shift;

        float wave = cos(phase);
        quasiSum += wave;
        quasiPhase += sin(phase);
        grad += -sin(phase) * dir;
    }

    // Normalized quasicrystal field
    quasiSum /= float(nWaves);
    float field = quasiSum * 0.5 + 0.5;

    // Aperiodic Bragg diffraction node detection (where gradient is near zero and amplitude high)
    float node = exp(-dot(grad, grad) * 0.15) * smoothstep(0.4, 0.9, quasiSum) * glw;

    // Golden-ratio recursive coordinate mapping for image sampling
    vec2 mappedUV = fract(p * 0.05 + grad * 0.08 + 0.5);
    vec3 texCol = img(mappedUV);

    // Multilayered psychedelic coloring
    vec3 palBase = imgPalette(field + quasiPhase * 0.1);
    vec3 palGlow = imgPalette(field * 2.0 + 0.3);

    vec3 col = mix(palBase, palGlow, field);
    col = mix(col, texCol, 0.35 + 0.2 * audioValence);

    // Glowing Bragg nodes
    col += vec3(1.4, 1.1, 1.8) * node * (1.0 + 3.0 * audioKick);

    // Interference fringes (sharp iridescent lines)
    float fringe = abs(sin(field * 20.0 + t * 2.0));
    col += imgPalette(0.7) * smoothstep(0.85, 1.0, fringe) * 0.4 * (1.0 + audioCentroid);

    // Subtle edge fade & gamma
    col = pow(col, vec3(0.88));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
