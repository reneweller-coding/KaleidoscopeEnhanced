#version 330 core
in vec3 vPos;   ///< Position (from the vertex stage).
in float vProb;
in float vPhase;

out vec4 fragColor;   ///< The pixel's colour (output).

/**
 * @file QuantumWavepacketCollapse.frag
 * @brief Additive point-sprite shader for a cloud of particles representing
 * a superposed 3D quantum eigenstate wavepacket that collapses toward a
 * shifting nodal centre on the beat.
 *
 * Each sprite is a soft circular blob (gl_PointCoord falloff, discarded
 * outside its radius). Its colour comes from imgPalette — a live sample of
 * the slideshow photo whose sampling angle is driven by the per-particle
 * phase angle vPhase plus audioPhase, and internally by audioChromaHue,
 * audioAdvance and audioValence — pushed past normal saturation because
 * thousands of additive sprites would otherwise pile up to plain white.
 * Brightness follows the particle's probability density vProb, boosted by
 * audioKick so the whole cloud flashes on the collapse transient; hueP
 * optionally rotates the final hue. The underlying collapse motion (mixing
 * each particle toward a moving singularity on a kick) is computed in
 * QuantumWavepacketCollapse.vert.
 */

uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float collapseP;
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.


uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

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

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    vec2 circ = gl_PointCoord - vec2(0.5);
    float r = length(circ);
    if (r > 0.5) discard;

    float alpha = smoothstep(0.5, 0.10, r);

    // Quantum phase chromatic mapping (complex phase angle to color).
    // Saturation is pushed past the house default because thousands of these
    // sprites accumulate additively — anything pale piles up to plain white.
    vec3 phaseColor = imgPalette((vPhase + audioPhase) * 0.159);
    phaseColor = mix(vec3(dot(phaseColor, vec3(0.333))), phaseColor, 1.5);

    // Probability density intensity modulation (kick gain kept moderate for
    // the same reason: the old *2.5 burned the whole cloud to white).
    vec3 col = phaseColor * (0.30 + 0.55 * vProb) * (1.0 + audioKick * 1.1) * glw;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, alpha);
}
