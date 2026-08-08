#version 120
// LaserArena.frag — razor core with a soft glow falloff across the beam.
varying vec4  vCol;
varying float vSide;

void main()
{
    float d    = abs(vSide);
    float core = exp(-d * d * 18.0);
    float halo = exp(-d * d * 3.5) * 0.35;
    gl_FragColor = vec4(vCol.rgb * (core + halo), 1.0);
}
