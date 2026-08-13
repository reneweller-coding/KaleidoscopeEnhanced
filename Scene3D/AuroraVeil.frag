#version 330 core
out vec4 fragColor;
// AuroraVeil.frag — translucent curtain: bright lower hem, airy top.
in vec4  vCol;
in float vSide;

void main()
{
    float hem  = exp(-(vSide + 1.0) * (vSide + 1.0) * 1.4);
    float body = exp(-vSide * vSide * 0.9) * 0.16;
    fragColor = vec4(vCol.rgb * (hem + body), 1.0);
}
