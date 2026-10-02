#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file GyroidalInterferenceKaleido.frag
 * @brief GYROIDAL INTERFERENCE KALEIDO: Dual counter-rotating triply periodic
 * minimal surface (TPMS) Gyroid lattices creating dynamic moiré mandalas,
 * phase-slip wave interference, and glowing non-Euclidean fluid channels.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous Gyroid phase translation & rotation
 *   audioKick    -> flashes Gyroid nodal surfaces & phase-slip shockwaves
 *   audioCentroid-> modulates Gyroid spatial frequency & fine moiré rings
 *   audioSubBass -> expands Gyroid channel thickness breathing
 *   audioChromaHue-> rotates the luminous TPMS interference spectrum
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
uniform float scaleP;   ///< Scale knob.
uniform float thicknessP;
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

/// 3D Gyroid minimal surface evaluation: sin(x)*cos(y) + sin(y)*cos(z) + sin(z)*cos(x)
float sdGyroid(vec3 p, float thickness, float t) {
    vec3 q = p + vec3(0.0, 0.0, t);
    float g = dot(sin(q), cos(q.zxy));
    return abs(g) - thickness;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float sc = (scaleP > 0.01) ? scaleP : 1.0;
    float thk = (thicknessP > 0.01) ? thicknessP : 0.3;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.180 * spd + audioAdvance * 0.180 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Dual counter-rotating coordinate frames for moiré interference
    float rot1 = t * 0.2 + audioPhase * 0.1;
    float rot2 = -t * 0.18 + audioSwell * 0.4;

    float cs1 = cos(rot1), sn1 = sin(rot1);
    float cs2 = cos(rot2), sn2 = sin(rot2);

    vec2 p1 = mat2(cs1, -sn1, sn1, cs1) * uv * (8.0 * sc);
    vec2 p2 = mat2(cs2, -sn2, sn2, cs2) * uv * (8.0 * sc);

    // Evaluate Gyroid surface 1 and surface 2. Sub-bass swells the TPMS wall
    // thickness itself, so the fluid channels carved between the two sheets
    // visibly breathe wider on drones instead of just glowing harder.
    float thkB = thk * (1.0 + 0.4 * audioSubBass);
    float g1 = sdGyroid(vec3(p1, t * 0.5), thkB, t);
    float g2 = sdGyroid(vec3(p2, -t * 0.5), thkB, -t);

    // Moiré interference field between both gyroids
    float moire = g1 * g2;
    float dMoire = abs(moire);

    // Sample texture mapped across warped gyroid coordinates
    vec2 sampleUV = fract(p1 * 0.1 + vec2(g1 * 0.1, g2 * 0.1) + 0.5);
    vec3 texCol = img(sampleUV);

    // Glowing interference nodal bands
    float bandGlow = exp(-dMoire * (15.0 + 10.0 * audioCentroid)) * glw;
    float nodeFlash = smoothstep(0.04, 0.0, abs(g1) + abs(g2)) * (1.0 + 3.0 * audioKick);

    // Color palette mixing across gyroid phase fields
    vec3 palA = imgPalette(g1 * 0.3 + t * 0.05);
    vec3 palB = imgPalette(g2 * 0.3 + 0.5);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(g1 * 4.0 - g2 * 4.0));

    col = mix(col, texCol, 0.35 + 0.15 * audioValence);

    // Add glowing moiré bands and kick flashes
    vec3 bandTint = vec3(1.3, 1.1, 1.8) * bandGlow * (1.0 + 2.5 * audioKick);
    col += bandTint + vec3(1.5, 1.4, 1.9) * nodeFlash;

    // Center lotus bloom
    float centerBloom = exp(-length(uv) * 4.0) * (0.6 + 1.2 * audioLevel);
    col += imgPalette(0.85) * centerBloom;

    col = pow(col, vec3(0.88));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
