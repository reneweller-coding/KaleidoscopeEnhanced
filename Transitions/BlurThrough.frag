#version 330 core
out vec4 fragColor;
/**
 * @file BlurThrough.frag
 * @brief Blur-through: both scenes melt through a soft-focus dip and
 * resolve into the new one.
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

    vec2 px = (4.0 + 10.0 * mid) / resolution;
    vec4 a = ( texture(tex0, p)
             + texture(tex0, p + vec2( px.x,  px.y))
             + texture(tex0, p + vec2(-px.x,  px.y))
             + texture(tex0, p + vec2( px.x, -px.y))
             + texture(tex0, p + vec2(-px.x, -px.y)) ) * 0.2;
    vec4 b = ( texture(tex1, p)
             + texture(tex1, p + vec2( px.x,  px.y))
             + texture(tex1, p + vec2(-px.x,  px.y))
             + texture(tex1, p + vec2( px.x, -px.y))
             + texture(tex1, p + vec2(-px.x, -px.y)) ) * 0.2;
    vec4 sharp = blend4(texture(tex0, p), texture(tex1, p), d);
    fragColor = mix(sharp, blend4(a, b, d), mid);
}
