#version 330 core
out vec4 fragColor;
/**
 * @file Chromatic.frag
 * @brief Chromatic dissolve: red, green and blue cross over to the new
 * scene at slightly different times.
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

void main()
{
    vec2  p   = gl_FragCoord.xy / resolution;
    float d   = 1.0 - interpolation;          // transition progress 0..1

    vec4 c0 = texture(tex0, p);
    vec4 c1 = texture(tex1, p);
    float wR = clamp(d * 1.3,        0.0, 1.0);
    float wG = clamp(d * 1.3 - 0.15, 0.0, 1.0);
    float wB = clamp(d * 1.3 - 0.30, 0.0, 1.0);
    fragColor = vec4(mix(c0.r, c1.r, wR),
                        mix(c0.g, c1.g, wG),
                        mix(c0.b, c1.b, wB), 1.0);
}
