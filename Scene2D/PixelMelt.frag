#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file PixelMelt.frag
 * @brief The photo dissolving into pixel-sorted streaks that sweep through
 *        the frame in ragged horizontal bands and then re-form.
 *
 * Each screen row is assigned its own random melt phase, advanced by
 * audioAdvance, so the reveal moves through the image in bands rather than
 * switching all at once; a horizontal blur adds smear motion once a row is
 * mid-melt. audioBuildUp pushes the melted area outward in advance of a
 * drop, audioDrop and audioKick momentarily melt more of the frame at once,
 * audioHigh sparkles along the melt boundary, and audioBeat brightens the
 * whole result.
 */
// revealed by a moving mask so the picture MELTS into streaks and re-forms
// instead of just being permanently scrambled.

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D texSorted;     ///< <- requests the pixel-sort pass
uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioBeat;   ///< Beat envelope, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioDrop;   ///< Drop envelope: high after a detected drop, decaying.
uniform float audioBuildUp;   ///< Build-up toward a drop, 0..1.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioHigh;   ///< High band level, 0..1.

uniform float meltP;             ///< how much of the frame melts at rest
uniform float bandP;             ///< band structure of the mask

/// @brief Pseudo-random number 0..1 from a float.
float hash11(float p) { return fract(sin(p * 127.1) * 43758.5453); }

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    vec3 orig   = texture(tex0, uv).rgb;
    vec3 sorted = texture(texSorted, uv).rgb;

    // Per-row mask: each row melts at its own moment, so the effect sweeps
    // through the frame in ragged bands rather than switching all at once.
    float row = floor(gl_FragCoord.y / max(1.0, 2.0 + 6.0 * bandP));
    float phase = hash11(row) * 6.2831853;
    float wave = 0.5 + 0.5 * sin(audioAdvance * 0.55 + phase);

    // Build-ups push the melt outward, a drop melts everything at once.
    float amount = clamp(meltP * 0.55 + 0.45 * audioBuildUp + 1.2 * audioDrop
                         + 0.30 * audioKick, 0.0, 1.0);
    float m = smoothstep(1.0 - amount, 1.05 - amount, wave);

    vec3 col = mix(orig, sorted, m);

    // Where the melt is active, add the horizontal smear that makes sorted
    // pixels read as MOTION rather than as a static gradient.
    if (m > 0.01)
    {
        vec3 sm = vec3(0.0);
        for (int i = 1; i <= 4; ++i)
            sm += texture(texSorted, uv + vec2(float(i) * 0.0022, 0.0)).rgb;
        col = mix(col, max(col, sm * 0.25), m * 0.6);
    }

    // Treble sparkles along the melt boundary.
    float edge = m * (1.0 - m) * 4.0;
    col += vec3(0.9, 0.95, 1.0) * edge * audioHigh * 0.45;

    col *= 1.0 + 0.18 * audioBeat;
    fragColor = vec4(col, interpolation);
}
