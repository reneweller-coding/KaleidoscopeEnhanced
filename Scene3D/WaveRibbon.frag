#version 330 core
out vec4 fragColor;
// WaveRibbon.frag — glowing line: bright core, soft halo.
in vec4  vCol;
in float vSide;

void main()
{
    float d    = abs(vSide);
    float core = exp(-d * d * 14.0);
    float halo = exp(-d * d * 2.5) * 0.30;
    fragColor = vec4(vCol.rgb * (core + halo), 1.0);
}
