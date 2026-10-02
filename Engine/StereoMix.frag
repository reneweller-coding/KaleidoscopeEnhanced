#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file StereoMix.frag
 * @brief Plain per-pixel cross-mix used ONLY for TRUE-STEREO 3D<->3D scene
 * cross-fades: both inputs are eye-packed SBS/TB frames, so the blend must
 * never move a pixel (any warp would fold content across the eye boundary).
 * interpolation = 1 -> texA (the active scene), 0 -> texB (the incoming one)
 * — the same weighting every combine style honours at its endpoints.
 */
uniform sampler2D texA;
uniform sampler2D texB;
uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec3 a = texture(texA, uv).rgb;
    vec3 b = texture(texB, uv).rgb;
    fragColor = vec4(mix(b, a, interpolation), 1.0);
}
