#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file SlidingDoors.frag
 * @brief Sliding doors: the old scene splits at the centre and both halves
 * slide apart to reveal the new one.
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
    // No beat surge any more: pushing the progress forward on every beat
    // made the geometry jump in time with the music (speed pass 14.09.2026).
    vec2  p0 = p, p1 = p;                     // sample coords old / new
    float w1 = d;                             // weight of the NEW scene
    float dark = 1.0;                         // optional dip factor

    float shift = d * 0.54;
    p0 = vec2(clamp(p.x + ((p.x < 0.5) ? shift : -shift), 0.0, 1.0), p.y);
    // The gap eases in - without the window the soft edge shows a centre
    // stripe of the new scene the moment the transition starts.
    w1 = (1.0 - smoothstep(shift - 0.02, shift + 0.02, abs(p.x - 0.5)))
       * smoothstep(0.0, 0.06, d);

    vec4 c0 = texture(tex0, p0);
    vec4 c1 = texture(tex1, p1);
    fragColor = blend4(c0, c1, w1) * dark;
}
