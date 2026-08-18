#version 330 core
out vec4 fragColor;
/**
 * @file DoubleExposure.frag
 * @brief Double exposure: a dreamy screen-blend peak at mid-transition
 * layers both scenes.
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

    vec4 c0 = texture(tex0, p);
    vec4 c1 = texture(tex1, p);
    vec4 scr = 1.0 - (1.0 - c0) * (1.0 - c1);
    fragColor = mix(blend4(c0, c1, d), scr, 0.65 * mid);
}
