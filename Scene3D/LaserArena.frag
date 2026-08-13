#version 330 core
out vec4 fragColor;
// LaserArena.frag — razor core with a soft glow falloff across the beam.
in vec4  vCol;
in float vSide;

void main()
{
    float d    = abs(vSide);
    float core = exp(-d * d * 18.0);
    float halo = exp(-d * d * 3.5) * 0.35;
    fragColor = vec4(vCol.rgb * (core + halo), 1.0);
}
