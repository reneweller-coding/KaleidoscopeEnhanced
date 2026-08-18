#version 330 core
out vec4 fragColor;
/**
 * @file Push.frag
 * @brief Push: the incoming scene shoves the old one out to the left,
 * film-splice style.
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

const float PI = 3.14159265358979;

vec4 blend4(vec4 a, vec4 b, float w) { return mix(a, b, clamp(w, 0.0, 1.0)); }

void main()
{
    vec2  p   = gl_FragCoord.xy / resolution;
    float d   = 1.0 - interpolation;          // transition progress 0..1
    float mid = sin(PI * d);                  // 0 at both ends, 1 mid-transition
    vec2  p0 = p, p1 = p;                     // sample coords old / new
    float w1 = d;                             // weight of the NEW scene
    float dark = 1.0;                         // optional dip factor

    float xs = p.x + d;
    p0 = vec2(clamp(xs,       0.0, 1.0), p.y);
    p1 = vec2(clamp(xs - 1.0, 0.0, 1.0), p.y);
    // Seam softness windowed by mid: a soft seam sitting exactly on the
    // frame edge at d=0/d=1 would otherwise leak the other scene there.
    float e = 0.015 * mid + 1e-4;
    w1 = smoothstep(1.0 - e, 1.0 + e, xs);

    vec4 c0 = texture(tex0, p0);
    vec4 c1 = texture(tex1, p1);
    fragColor = blend4(c0, c1, w1) * dark;
}
