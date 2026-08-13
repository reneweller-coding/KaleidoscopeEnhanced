#version 330 core
out vec4 fragColor;
// RibbonTunnel.frag — soft-edged glowing ribbon (additive blending).
in vec4  vCol;
in float vSide;

void main()
{
    float glow = exp(-vSide * vSide * 3.0);
    fragColor = vec4(vCol.rgb * glow, 1.0);
}
