#version 330 core
out vec4 fragColor;
/**
 * @file Swirl.frag
 * @brief Whirlpool swirl: the frame twists around the centre mid-transition
 * while the scenes cross-fade.
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
    float aspect = resolution.x / resolution.y;
    vec2  cc  = p - 0.5;                      // centred, aspect-corrected
    cc.x *= aspect;
    float r   = length(cc) / 0.95;
    vec2  p0 = p, p1 = p;                     // sample coords old / new
    float w1 = d;                             // weight of the NEW scene
    float dark = 1.0;                         // optional dip factor

    float ang = mid * 2.2 * smoothstep(1.0, 0.0, r);
    float cs = cos(ang), sn = sin(ang);
    vec2 sc = mat2(cs, -sn, sn, cs) * cc;
    sc.x /= aspect;
    p0 = clamp(sc + 0.5, 0.0, 1.0);
    p1 = p0;

    vec4 c0 = texture(tex0, p0);
    vec4 c1 = texture(tex1, p1);
    fragColor = blend4(c0, c1, w1) * dark;
}
