#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
// PhotoVortex.frag — the image is dragged into the throat: texture rings
// stream inward, stretching as they fall; the throat glows on the drop.
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioDrop;   ///< Drop envelope: high after a detected drop, decaying.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

in vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vDepth;   ///< Depth (from the vertex stage).

/**
 * @file PhotoVortex.frag
 * @brief Shades the vortex throat: the current slideshow image is wound
 * into mirrored rings that stream inward and stretch as they fall toward
 * a glowing eye.
 *
 * tex0/tex1 are crossfaded by interpolation. audioAdvance drives the
 * inward streaming speed of the image rings; audioKick pulses the
 * throat's eye glow, audioDrop blazes it; audioChromaHue sets the eye's
 * hue.
 */

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
vec2 mfold(vec2 uv) { return abs(fract(uv * 0.5) * 2.0 - 1.0); }

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    // The image streams toward the throat (v runs with the music) and is
    // wound around the funnel; four mirrored sectors keep it seamless.
    float a = vUV.x * 4.0;
    a = abs(fract(a) * 2.0 - 1.0);
    vec2 uv = vec2(a * 1.4,
                   vUV.y * 4.5 + time * 0.35 + audioAdvance * 1.3);
    vec2 fuv = mfold(uv);
    vec3 col = mix(texture(tex1, fuv).rgb, texture(tex0, fuv).rgb, interpolation);

    // Darker toward the throat, with a glowing vortex eye that answers the
    // kick and blazes on a drop.
    col *= mix(1.0, 0.25, pow(vDepth, 1.7));
    float eye = pow(vDepth, 6.0);
    col += hueRot(vec3(0.9, 0.45, 0.15), audioChromaHue)
         * eye * (0.8 + 1.6 * audioKick + 3.0 * audioDrop);

    // Faint spiral streak lines.
    float streak = smoothstep(0.85, 1.0,
                              abs(fract(vUV.x * 24.0) - 0.5) * 2.0);
    col *= 1.0 - 0.25 * streak * (1.0 - vDepth);

    fragColor = vec4(col * 1.25, 1.0);
}
