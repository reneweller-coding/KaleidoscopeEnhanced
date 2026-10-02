#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file QuantumQubitArray.frag
 * @brief QUANTUM QUBIT ARRAY: a 70x70 quantum-processor die seen from above -
 * thousands of Josephson qubit plates whose Bloch rotations ripple across
 * the chip in waves, gold circuit substrate beneath.
 *   audioSpectrum -> plate heights by band    audioKick -> gate-flip wave
 *   audioBass -> overall lift    (state colours from the photo palette)
 */

in vec3 vPos;   ///< Position (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vQubitState;
in float vEnergy;

uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float neonP;
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


/// IMG-PALETTE (house standard): colours come from a rotating arc in the
/// CURRENT slideshow image, so every activation inherits a fresh palette from
/// the photos; the arc follows the musical key (audioChromaHue is circular-
/// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float neo = (neonP > 0.0) ? neonP : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    vec3 n = normalize(vNormal);
    vec3 lightDir = normalize(vec3(0.5, 0.9, -0.6));
    float diff = max(dot(n, lightDir), 0.0);

    // Silicon & gold substrate color
    vec3 basePhoto = img(fract(vUV * 2.0));
    vec3 gold = vec3(1.0, 0.78, 0.28);
    vec3 silicon = vec3(0.08, 0.10, 0.14);

    // Superconducting Josephson junction circuit lines on top face
    float circuitLine = 0.0;
    if (abs(n.y) > 0.8) {
        vec2 localUV = fract(vPos.xz * 18.0) - 0.5;
        float ring = abs(length(localUV) - 0.35);
        circuitLine = exp(-ring * 20.0);
    }

    // State coloring: the qubit state slides along the photo palette
    vec3 stateCol = imgPalette(0.30 * (vQubitState * 0.5 + 0.5));
    vec3 emission = (stateCol * (0.25 + 0.55 * vEnergy) + gold * circuitLine * 1.2) * glw * neo;

    // Specular highlight
    vec3 viewDir = normalize(vec3(0.0, 1.0, 2.0));
    vec3 ref = reflect(-lightDir, n);
    float spec = pow(max(dot(ref, viewDir), 0.0), 32.0);

    vec3 col = silicon * (diff * 0.7 + 0.2) + basePhoto * 0.25 + gold * spec * 0.8 + emission;
    col += stateCol * audioKick * smoothstep(0.8, 1.5, vEnergy) * 0.6; // Gate flash

    col = hueRot(col, hue);   // chromaHue handled inside imgPalette
    col /= 1.0 + 0.32 * max(col.r, max(col.g, col.b));
    col *= 3.20;   // measured-dark lift (visual pass)
    fragColor = vec4(col, 1.0);
}
