#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file Crossfade.frag
 * @brief The classic linear cross-fade between outgoing (tex0) and incoming
 * (tex1) scene.
 *
 * Scene TRANSITION shader (Transitions/): blends the outgoing scene
 * (tex0) into the incoming one (tex1) over one cross-fade.
 * interpolation: 1 = old scene fully visible .. 0 = new scene.
 * Extracted from the former FxPlain.frag 28-style library.
 */
uniform vec2 resolution;   ///< Size of the render target in pixels.
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

const float PI = 3.14159265358979;   ///< Pi.

/// @brief Mixes two RGBA values with a clamped weight.
vec4 blend4(vec4 a, vec4 b, float w) { return mix(a, b, clamp(w, 0.0, 1.0)); }

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2  p   = gl_FragCoord.xy / resolution;
    float d   = 1.0 - interpolation;          // transition progress 0..1

    fragColor = blend4(texture(tex0, p), texture(tex1, p), d);
}
