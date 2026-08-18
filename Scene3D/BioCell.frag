#version 330 core
out vec4 fragColor;
// Frag-side music pulse (added by the deaf-scene pass: reactivity
// measured ~0 -- the vert-side coupling barely moved any pixels).
uniform float audioLevel;
uniform float audioKick;
// BioCell.frag — soft organic point (additive blending).
in vec4 vCol;

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 9.0);
    fragColor = vec4(vCol.rgb * a * (2.2 + 0.8 * audioLevel + 0.9 * audioKick), 1.0);
}
