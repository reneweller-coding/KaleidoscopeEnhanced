#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
// Harmonograph.frag — a drawn line, not a lit object.
// The wire is thinner than the shading would need to be interesting, so the
// colour carries the information instead: hue runs along the trace, so you can
// see where the pendulum started and where it has wound down to.

in vec3  vObj;   ///< Object-space position (from the vertex stage).
in vec3  vNormal;   ///< Surface normal (from the vertex stage).
in vec3  vView;   ///< View vector (from the vertex stage).
in float vAlong;      ///< 0 at the start of the trace, 1 at the end
in float vEnergy;

/**
 * @file Harmonograph.frag
 * @brief Shades the harmonograph's wire trace as a drawn line rather than a
 * lit object: hue sweeps three full turns along the trace (vAlong) so the
 * pendulum's start and its wound-down finish read as distinct colors, with
 * brightness carrying most of the shape information.
 *
 * audioLevel and the per-vertex vEnergy (the chroma-driven strength from
 * the companion compute pass) brighten the glow, audioHigh adds a sharp
 * white highlight core, audioKick brightens the trace's newest/widest end,
 * audioAmbient adds a flat tint, and audioBeat/audioSubBass pulse the
 * final brightness. Hue comes from the rotating photo-arc palette
 * (imgPalette) keyed by audioChromaHue with an audioAdvance drift and
 * audioValence-controlled saturation.
 */

uniform sampler2D tex0;   ///< The current photo.
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioBeat;   ///< Beat envelope, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioAmbient;   ///< How ambient (sustained, beatless) the music is, 0..1.

uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
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

/// @brief A hue as a colour (the house palette).
vec3 hue2rgb(float h)
{
    return imgPalette(h) * 1.35;   // photo-arc palette (house standard), was HSV rainbow
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 n = normalize(vNormal);
    vec3 V = normalize(vView);
    if (dot(n, V) < 0.0) n = -n;

    vec3 L = normalize(vec3(0.5, 0.7, -0.5));

    // Hue along the trace, so the drawing has a direction in time.
    // THREE turns of the wheel along the trace, not one.  The damping puts most
    // of the figure's visible area in the first fraction of the trace, so a
    // single turn spends nearly all its range on the tiny wound-down centre and
    // the big outer loops come out in one flat colour.
    float hue = fract(0.10 + 0.55 * hueP + 3.0 * vAlong + 0.06 * sin(audioChromaHue));
    vec3 tint = hue2rgb(hue);

    float face = clamp(dot(n, V), 0.0, 1.0);
    float core = pow(face, 1.7);

    // Mostly emissive, with just enough shading to give the wire roundness.
    float diff = max(dot(n, L), 0.0);
    vec3 col = tint * (0.20 + 0.35 * diff);
    col += tint * (0.5 + 1.0 * glowP) * (0.22 + 0.7 * core)
         * (0.45 + 0.8 * vEnergy + 0.5 * audioLevel);
    col += vec3(1.0) * pow(core, 8.0) * (0.4 + 1.4 * audioHigh);

    // The head of the trace burns brighter — the pendulum's first, widest
    // swings are where the figure's shape is set.
    col += tint * pow(max(1.0 - vAlong * 3.0, 0.0), 2.0)
         * (0.3 + 1.2 * audioKick);

    col += tint * 0.10 * audioAmbient;

    col *= 0.78 + 0.18 * audioBeat + 0.12 * audioSubBass;
    col = col / (1.0 + col * 0.42);
    fragColor = vec4(col, interpolation);
}
