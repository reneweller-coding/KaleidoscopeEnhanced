#version 330 core
out vec4 fragColor;
/**
 * @file Jelly.frag
 * @brief Jelly wobble: the whole frame wobbles like gelatine while the
 * scenes blend.
 *
 * Scene TRANSITION shader (Transitions/): blends the outgoing scene
 * (tex0) into the incoming one (tex1) over one cross-fade.
 * interpolation: 1 = old scene fully visible .. 0 = new scene.
 * Extracted from the former FxPlain.frag 28-style library.
 */
uniform vec2 resolution;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioBeat;    // engine beat pulse: the wipe surges with the music
uniform float audioLevel;   // AGC-smoothed loudness: deepens the mid-transition effect


const float PI = 3.14159265358979;

vec4 blend4(vec4 a, vec4 b, float w) { return mix(a, b, clamp(w, 0.0, 1.0)); }

void main()
{
    vec2  p   = gl_FragCoord.xy / resolution;
    float d   = 1.0 - interpolation;          // transition progress 0..1
    // Beat surge, endpoint-safe: sin(PI*d) is 0 at d=0 and d=1,
    // so the contract (exact A at 0, exact B at 1) cannot break.
    d = clamp(d + 0.05 * sin(PI * d) * audioBeat, 0.0, 1.0);
    float mid = sin(PI * d);                  // 0 at both ends, 1 mid-transition
    mid *= 1.0 + 0.35 * audioLevel;   // loud music deepens the effect
    vec2  p0 = p, p1 = p;                     // sample coords old / new
    float w1 = d;                             // weight of the NEW scene
    float dark = 1.0;                         // optional dip factor

    vec2 w = vec2(sin(p.y * 9.0 + d * 6.0), sin(p.x * 8.0 - d * 5.0));
    p0 = clamp(p + w * 0.035 * mid, 0.0, 1.0);
    p1 = p0;

    vec4 c0 = texture(tex0, p0);
    vec4 c1 = texture(tex1, p1);
    fragColor = blend4(c0, c1, w1) * dark;
}
