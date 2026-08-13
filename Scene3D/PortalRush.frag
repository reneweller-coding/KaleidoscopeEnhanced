#version 330 core
out vec4 fragColor;
// PortalRush.frag — soft-edged glowing gate band (additive blending).
in vec4  vCol;
in float vSide;

void main()
{
    float glow = exp(-vSide * vSide * 3.0);
    fragColor = vec4(vCol.rgb * glow, 1.0);
}
