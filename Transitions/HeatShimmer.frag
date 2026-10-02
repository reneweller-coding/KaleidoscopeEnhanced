#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file HeatShimmer.frag
 * @brief Heat-shimmer morph: turbulent haze dissolves one scene into the
 * other.
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

/// Smooth 2D value noise.
float noise2T(vec2 q)
{
    vec2 i = floor(q), f = fract(q);
    f = f * f * (3.0 - 2.0 * f);
    float a = hashT(i), b = hashT(i + vec2(1.0, 0.0));
    float c = hashT(i + vec2(0.0, 1.0)), e = hashT(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, e, f.x), f.y);
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
    float mid = sin(PI * d);                  // 0 at both ends, 1 mid-transition
    // mid follows the progress only: a rotation, zoom or push that breathes with
    // the music is what the no-shake rule forbids, however slow the envelope.
    vec2  p0 = p, p1 = p;                     // sample coords old / new
    float w1 = d;                             // weight of the NEW scene
    float dark = 1.0;                         // optional dip factor

    float amp = mid * 0.055;
    vec2 q = p * 5.0;
    vec2 w = vec2(noise2T(q + vec2(0.0, d * 2.0)) - 0.5,
                  noise2T(q + vec2(3.7, -d * 2.0)) - 0.5);
    p0 = clamp(p + w * amp, 0.0, 1.0);
    p1 = p0;

    vec4 c0 = texture(tex0, p0);
    vec4 c1 = texture(tex1, p1);
    fragColor = blend4(c0, c1, w1) * dark;
}
