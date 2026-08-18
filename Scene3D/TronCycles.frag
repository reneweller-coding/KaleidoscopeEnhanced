#version 330 core
out vec4 fragColor;
// Frag-side music pulse (added by the deaf-scene pass: reactivity
// measured ~0 -- the vert-side coupling barely moved any pixels).
uniform float audioLevel;
uniform float audioKick;
// TronCycles.frag — solid light wall with a blazing top edge.
in vec4  vCol;
in float vSide;

void main()
{
    float body = 0.45 + 0.25 * (vSide * 0.5 + 0.5);
    float edge = exp(-pow(1.0 - vSide, 2.0) * 6.0) * 0.9;   // top rim
    fragColor = vec4(vCol.rgb * (body + edge) * (0.85 + 0.30 * audioLevel + 0.35 * audioKick), 1.0);
}
