#version 330 core
out vec4 fragColor;
/**
 * @file DrainVortex.frag
 * @brief Drain vortex: the old scene magnifies and spirals away like water
 * down a drain.
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
    float aspect = resolution.x / resolution.y;
    vec2  cc  = p - 0.5;                      // centred, aspect-corrected
    cc.x *= aspect;
    float r   = length(cc) / 0.95;
    vec2  p0 = p, p1 = p;                     // sample coords old / new
    float w1 = d;                             // weight of the NEW scene
    float dark = 1.0;                         // optional dip factor

    float ang = d * d * 3.0 * (1.5 - min(r, 1.0));
    float cs = cos(ang), sn = sin(ang);
    vec2 sc = mat2(cs, -sn, sn, cs) * cc;
    sc /= (1.0 + 1.2 * d * d);            // magnifies as it goes
    sc.x /= aspect;
    p0 = clamp(sc + 0.5, 0.0, 1.0);
    w1 = smoothstep(0.25, 0.9, d);

    vec4 c0 = texture(tex0, p0);
    vec4 c1 = texture(tex1, p1);
    fragColor = blend4(c0, c1, w1) * dark;
}
