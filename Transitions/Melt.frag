#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file Melt.frag
 * @brief Melt: the old scene drips downward like wax in noise-driven
 * columns while the new one appears behind.
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

/// @brief Pseudo-random number 0..1 from a 2D point.
float hashT(vec2 p2)
{
    return fract(sin(dot(p2, vec2(127.1, 311.7))) * 43758.5453);
}

/// Smooth 1D value noise (for the melt columns).
float noise1T(float x)
{
    float i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(hashT(vec2(i, 7.0)), hashT(vec2(i + 1.0, 7.0)), f);
}

/// @brief Mixes two RGBA values with a clamped weight.
vec4 blend4(vec4 a, vec4 b, float w) { return mix(a, b, clamp(w, 0.0, 1.0)); }

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2  p   = gl_FragCoord.xy / resolution;
    float d   = 1.0 - interpolation;          // transition progress 0..1
    // No beat surge any more: pushing the progress forward on every beat
    // made the geometry jump in time with the music (speed pass 14.09.2026).
    vec2  p0 = p, p1 = p;                     // sample coords old / new
    float w1 = d;                             // weight of the NEW scene
    float dark = 1.0;                         // optional dip factor

    float n    = noise1T(p.x * 7.0);
    float drop = d * d * (0.55 + 0.75 * n);
    p0 = vec2(p.x, clamp(p.y + drop, 0.0, 1.0));
    w1 = smoothstep(0.15, 0.85, d);

    vec4 c0 = texture(tex0, p0);
    vec4 c1 = texture(tex1, p1);
    fragColor = blend4(c0, c1, w1) * dark;
}
