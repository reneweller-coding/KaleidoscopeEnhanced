#version 330 core
out vec4 fragColor;
/**
 * @file GhostExposure.frag
 * @brief Ghost multi-exposure: layered ghost copies of both scenes drift
 * apart and resolve into the new one.
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
    vec2  cu  = p - 0.5;                      // centred, raw uv space

    vec2 z1 = cu / (1.0 + 0.045 * mid) + 0.5;
    vec2 z2 = cu / (1.0 + 0.090 * mid) + 0.5;
    vec4 a = ( texture(tex0, p) + texture(tex0, z1)
             + texture(tex0, z2) ) / 3.0;
    vec4 b = ( texture(tex1, p) + texture(tex1, z1)
             + texture(tex1, z2) ) / 3.0;
    fragColor = blend4(a, b, d);
}
