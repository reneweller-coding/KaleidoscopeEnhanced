#version 330 core
out vec4 fragColor;
// Frag-side music pulse (added by the deaf-scene pass: reactivity
// measured ~0 -- the vert-side coupling barely moved any pixels).
uniform float audioLevel;
uniform float audioKick;
// MeteorStorm.frag — soft glowing point (additive blending).
in vec4 vCol;

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    fragColor = vec4(vCol.rgb * a * (0.85 + 0.30 * audioLevel + 0.35 * audioKick), 1.0);
}
