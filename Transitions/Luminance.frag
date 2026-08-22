#version 330 core
out vec4 fragColor;
/**
 * @file Luminance.frag
 * @brief Luminance-ordered dissolve: dark areas give way to the new scene
 * first, highlights last.
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

    vec4 c0 = texture(tex0, p);
    vec4 c1 = texture(tex1, p);
    float key = dot(c0.rgb, vec3(0.299, 0.587, 0.114)) * 0.7
              + dot(c1.rgb, vec3(0.299, 0.587, 0.114)) * 0.3;
    float w = smoothstep(key - 0.25, key + 0.25, d * 1.5 - 0.25);
    fragColor = blend4(c0, c1, w);
}
