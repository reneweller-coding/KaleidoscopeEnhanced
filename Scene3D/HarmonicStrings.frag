#version 330 core
out vec4 fragColor;
// HarmonicStrings.frag — thin bright string with a soft glow.
in vec4  vCol;
in float vSide;

void main()
{
    float d    = abs(vSide);
    float core = exp(-d * d * 20.0);
    float halo = exp(-d * d * 3.0) * 0.25;
    fragColor = vec4(vCol.rgb * (core + halo), 1.0);
}
