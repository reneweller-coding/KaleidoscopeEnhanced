#version 330 core
out vec4 fragColor;
/**
 * @file KaleidoSpin.frag
 * @brief Spinning 8-mirror kaleido fold: an 8-fold rosette that also
 * rotates carries the frame through the blend.
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

vec2 kaleidoT(vec2 c, float sides)
{
    float a   = atan(c.y, c.x);
    float r   = length(c);
    float seg = PI / sides;
    a = mod(a + PI, 2.0 * seg) - seg;
    a = abs(a);
    return vec2(cos(a), sin(a)) * r;
}

vec4 blend4(vec4 a, vec4 b, float w) { return mix(a, b, clamp(w, 0.0, 1.0)); }

void main()
{
    vec2  p   = gl_FragCoord.xy / resolution;
    float d   = 1.0 - interpolation;          // transition progress 0..1
    float mid = sin(PI * d);                  // 0 at both ends, 1 mid-transition
    float aspect = resolution.x / resolution.y;
    vec2  cc  = p - 0.5;                      // centred, aspect-corrected
    cc.x *= aspect;
    vec2  p0 = p, p1 = p;                     // sample coords old / new
    float w1 = d;                             // weight of the NEW scene
    float dark = 1.0;                         // optional dip factor

    float a = d * 1.2;
    vec2 rc = mat2(cos(a), -sin(a), sin(a), cos(a)) * cc;
    vec2 f = kaleidoT(rc, 8.0);
    f.x /= aspect;
    vec2 pf = mix(p, clamp(f + 0.5, 0.0, 1.0), mid * 0.9);
    p0 = pf; p1 = pf;

    vec4 c0 = texture(tex0, p0);
    vec4 c1 = texture(tex1, p1);
    fragColor = blend4(c0, c1, w1) * dark;
}
