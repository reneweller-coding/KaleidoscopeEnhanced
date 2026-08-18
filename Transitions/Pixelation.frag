#version 330 core
out vec4 fragColor;
/**
 * @file Pixelation.frag
 * @brief Pixelation morph: the frame coarsens into blocks, swaps scenes,
 * and sharpens back.
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
    vec2  p0 = p, p1 = p;                     // sample coords old / new
    float w1 = d;                             // weight of the NEW scene
    float dark = 1.0;                         // optional dip factor

    // Starts near-identity (900 cells) and EASES into the blocks - the
    // old 220-cell start popped visible blockiness in at d=0 and out
    // again at d=1 (a hard step at both ends of the fade).
    float cells = mix(900.0, 16.0, mid);
    vec2  grid  = vec2(cells, cells / aspect);
    vec2  pq    = (floor(p * grid) + 0.5) / grid;
    vec2  pm    = mix(p, pq, smoothstep(0.0, 0.12, mid));
    p0 = pm; p1 = pm;

    vec4 c0 = texture(tex0, p0);
    vec4 c1 = texture(tex1, p1);
    fragColor = blend4(c0, c1, w1) * dark;
}
