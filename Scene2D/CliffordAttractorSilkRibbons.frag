#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file CliffordAttractorSilkRibbons.frag
 * @brief CLIFFORD ATTRACTOR SILK RIBBONS: Hyper-dense trigonometric Clifford / De Jong
 * attractor density maps with silky flowing ribbon sheets, dynamic parameter morphing,
 * and high-luminance glowing caustics.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous Clifford parameter modulation & ribbon flow
 *   audioKick    -> flashes attractor density caustic peaks & shockwave ripple
 *   audioCentroid-> modulates trigonometric frequency parameters (a, b)
 *   audioSubBass -> expands silk ribbon fold amplitude
 *   audioChromaHue-> rotates the flowing iridescent silk spectrum
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
uniform float densityP;   ///< Density knob, 0..1.
uniform float silkP;
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
    float dens = (densityP > 0.01) ? densityP : 1.0;
    float slk = (silkP > 0.01) ? silkP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.28 * spd + audioAdvance * 0.22 * spd;   // Zeit-Basis:
    // audioAdvance allein steht bei ruhiger Musik still ("wirkt wie ein Bild").

    // Clifford attractor parameters modulated smoothly across time
    // audioPhase statt Centroid: der Centroid zittert pro Frame und liess die
    // Attraktor-Form zucken statt fliessen.
    float a = -1.4 + 0.4 * sin(t * 0.3) + 0.08 * sin(audioPhase * 0.5);
    float b = 1.6 + 0.3 * cos(t * 0.25);
    // c/d scale the cosine terms, i.e. how far each Clifford step folds the
    // sheet back on itself; sub-bass swells that fold depth. Bounded well
    // under the |x|,|y| <= 1+c limit so the attractor stays finite.
    float foldAmp = 1.0 + 0.35 * audioSubBass;
    float c = (1.0 + 0.3 * sin(t * 0.4 + audioPhase * 0.3)) * foldAmp;
    float d = (0.7 + 0.3 * cos(t * 0.35)) * foldAmp;

    // Screen coordinate frame with gentle rotation
    float rotA = t * 0.15 + audioPhase * 0.1;
    float cs = cos(rotA), sn = sin(rotA);
    vec2 p = mat2(cs, -sn, sn, cs) * uv * (2.8 * dens);

    // Multi-point Clifford attractor evaluation from local coordinate seeds
    float minDist = 1e5;
    float densityAcc = 0.0;

    vec2 pIter = p;
    for (int i = 0; i < 28; i++) {
        // Clifford map equation
        float xNext = sin(a * pIter.y) + c * cos(a * pIter.x);
        float yNext = sin(b * pIter.x) + d * cos(b * pIter.y);
        pIter = vec2(xNext, yNext);

        float dCur = length(p - pIter);
        minDist = min(minDist, dCur);
        densityAcc += exp(-dCur * (8.0 * slk));
    }

    // Sample texture mapped on attractor coordinate
    vec2 sampleUV = fract(pIter * 0.3 + 0.5);
    vec3 texCol = img(sampleUV);

    // Luminous silk ribbon caustics
    float silkGlow = exp(-minDist * (12.0 + 8.0 * audioCentroid)) * glw;

    // Palette mixing
    vec3 palA = imgPalette(densityAcc * 0.1 + t * 0.05);
    vec3 palB = imgPalette(densityAcc * 0.1 + 0.5);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(densityAcc * 0.8 + t));

    col = mix(col, texCol, 0.35 + 0.15 * audioValence);

    // Add glowing silk ribbon sheets and kick flashes
    vec3 silkTint = vec3(1.3, 1.1, 1.7) * (silkGlow + densityAcc * 0.08) * (1.0 + 2.5 * audioKick);
    col += silkTint;

    col = pow(col, vec3(0.88));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
