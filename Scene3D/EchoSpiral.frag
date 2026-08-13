#version 330 core
out vec4 fragColor;
// EchoSpiral.frag — wide soft band with a luminous centre line.
in vec4  vCol;
in float vSide;

void main()
{
    float d    = abs(vSide);
    float core = exp(-d * d * 8.0);
    float halo = exp(-d * d * 1.8) * 0.35;
    fragColor = vec4(vCol.rgb * (core + halo), 1.0);
}
