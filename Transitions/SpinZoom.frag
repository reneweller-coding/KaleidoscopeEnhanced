#version 330 core
out vec4 fragColor;
/**
 * @file SpinZoom.frag
 * @brief Spin-zoom cross-fade: the old scene twists away while the new one
 * untwists in.
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
    float aspect = resolution.x / resolution.y;
    vec2  cc  = p - 0.5;                      // centred, aspect-corrected
    cc.x *= aspect;
    vec2  p0 = p, p1 = p;                     // sample coords old / new
    float w1 = d;                             // weight of the NEW scene
    float dark = 1.0;                         // optional dip factor

    float a0 =  d * 0.55;                 // old twists away
    float a1 = -(1.0 - d) * 0.55;         // new untwists in
    float z0 = 1.0 + 0.55 * d;
    float z1 = 1.0 + 0.55 * (1.0 - d);
    vec2 s0 = mat2(cos(a0), -sin(a0), sin(a0), cos(a0)) * cc;
    vec2 s1 = mat2(cos(a1), -sin(a1), sin(a1), cos(a1)) * cc;
    s0.x /= aspect;  s1.x /= aspect;
    p0 = clamp(s0 / z0 + 0.5, 0.0, 1.0);
    p1 = clamp(s1 / z1 + 0.5, 0.0, 1.0);

    vec4 c0 = texture(tex0, p0);
    vec4 c1 = texture(tex1, p1);
    fragColor = blend4(c0, c1, w1) * dark;
}
