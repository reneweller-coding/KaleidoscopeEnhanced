#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
// SilkPhoto.frag — the photo itself, recognisable, with cloth shading and a
// silky key-coloured sheen wandering across the folds.
uniform sampler2D tex0;   ///< The current photo.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioDrop;   ///< Drop envelope: high after a detected drop, decaying.

in vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vShade;

/**
 * @file SilkPhoto.frag
 * @brief Renders the current slideshow photo mapped straight onto a
 * wind-rippled silk banner (the ripple mesh comes from SilkPhoto.vert),
 * shaded by the fold slope vShade and overlaid with a silky diagonal sheen
 * that wanders across the fabric over time.
 *
 * audioChromaHue rotates the sheen's colour via hueRot; audioSwell scales
 * how strongly the sheen highlight shows; audioDrop punches up the overall
 * brightness on a drop. The banner's wind sway, kick ripple and fold shading
 * itself are driven by audioLevel, audioSwell, audioKick and audioBass in
 * SilkPhoto.vert.
 */

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 col = texture(tex0, vec2(vUV.x, 1.0 - vUV.y)).rgb;

    col *= vShade;

    // Silk sheen: a soft diagonal highlight strolling over the fabric.
    float sheen = exp(-abs(fract(vUV.x * 0.9 - vUV.y * 0.4 - time * 0.07)
                           - 0.5) * 9.0);
    col += hueRot(vec3(0.30, 0.28, 0.35), audioChromaHue) * sheen
         * (0.5 + 0.6 * audioSwell);

    col *= 1.0 + 0.8 * audioDrop;

    fragColor = vec4(col * 1.15, 1.0);
}
