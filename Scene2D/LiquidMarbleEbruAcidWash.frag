#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file LiquidMarbleEbruAcidWash.frag
 * @brief LIQUID MARBLE EBRU ACID WASH: Traditional Turkish Ebru water marbling
 * peacock comb displacement algorithms supercharged with psychedelic acid wash feedback,
 * melting fluid swirls, and high-energy chromatic edge degradation.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous comb tine dragging & fluid marbling advection
 *   audioKick    -> flashes liquid acid color inversions & drop splatter shockwaves
 *   audioCentroid-> modulates comb tine spacing & fine filament ripple resolution
 *   audioSubBass -> expands fluid viscosity curl amplitude
 *   audioChromaHue-> rotates the marbled oil-drop rainbow spectrum
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
uniform float combFreqP;
uniform float acidMeltP;
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

/// Overall level of the photo currently on the texture units, from a fixed
/// 5-tap grid. Every base colour here is photo-derived, so a bright photo left
/// the marble ridge filaments and the liquid specular no headroom at all. The
/// probe rides the tex0/tex1 crossfade, so the gain it feeds can never pop, and
/// being one number for the whole frame it rescales exposure without touching
/// local contrast.
float photoLevel() {
    vec3 s = img(vec2(0.25, 0.25)) + img(vec2(0.75, 0.25))
           + img(vec2(0.25, 0.75)) + img(vec2(0.75, 0.75))
           + img(vec2(0.50, 0.50));
    return dot(s * 0.2, vec3(0.299, 0.587, 0.114));
}

/// Ebru peacock comb displacement algorithm: displaces coordinate along sinusoidal tines
vec2 ebruComb(vec2 p, float t, float freq, float dir) {
    float tine = sin(p.x * freq + t * 2.0) * 0.25;
    p.y += tine * dir;
    return p;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float cFreq = (combFreqP > 0.01) ? combFreqP : 1.0;
    float mlt = (acidMeltP > 0.01) ? acidMeltP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Multi-pass Ebru comb displacements in orthogonal directions
    vec2 pMarb = uv;
    float baseFreq = (8.0 + 4.0 * audioCentroid) * cFreq;

    pMarb = ebruComb(pMarb, t, baseFreq, 1.0 + 0.5 * audioSubBass);
    pMarb.xy = pMarb.yx;
    pMarb = ebruComb(pMarb, -t * 0.8, baseFreq * 1.4, -1.0);
    pMarb.xy = pMarb.yx;

    // Acid melt feedback distortion
    pMarb += vec2(sin(pMarb.y * 6.0 + t), cos(pMarb.x * 6.0 - t)) * (0.08 * mlt);

    // Marble droplet rings (concentric drop injections)
    float dropRings = sin(length(pMarb) * 18.0 - t * 4.0);
    float ringGlow = smoothstep(0.85, 1.0, abs(dropRings)) * glw;

    // Sample distorted background photo
    vec2 sampleUV = fract(pMarb * 0.4 + 0.5);
    vec3 texCol = img(sampleUV);

    // Acid wash chromatic phase inversion (inverts on audio kick)
    float phase = length(pMarb) * 0.5 + t * 0.15 + audioKick * 0.5;
    vec3 palA = imgPalette(phase);
    vec3 palB = imgPalette(phase + 0.5);
    vec3 marbCol = mix(palA, palB, 0.5 + 0.5 * dropRings);

    marbCol = mix(marbCol, texCol, 0.35 + 0.15 * audioValence);

    // Hold the oil film back to a fixed exposure. The base is entirely
    // mix(imgPalette, photo), so a light photo pinned the whole bath near 1.0
    // and the ridges and sheen were clipped away on top of it.
    float expGain = clamp(0.28 / max(0.05, photoLevel()), 0.28, 2.4);
    marbCol *= expGain;

    // Add glowing marble ridge filaments & kick flash. The tint constants
    // exceed 1.0 per channel, so the TINTED vectors carry the caps -- bounding
    // only the scalars left them unbounded.
    vec3 ridgeTint = min(vec3(1.4, 1.1, 1.7) * ringGlow * (1.0 + 2.5 * audioKick), vec3(0.85));
    marbCol += ridgeTint;

    // Specular liquid reflection
    float spec = pow(clamp(1.0 - abs(dropRings) * 2.0, 0.0, 1.0), 4.0);
    marbCol += min(vec3(1.3, 1.3, 1.5) * spec * (0.5 + 1.0 * audioLevel), vec3(0.70));

    marbCol = pow(marbCol, vec3(0.88));
    vec3 _catTone = clamp(marbCol, 0.0, 1.0);
    _catTone /= 1.0 + 0.28 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
