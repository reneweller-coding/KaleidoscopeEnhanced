#version 120
// EchoSpiral.frag — wide soft band with a luminous centre line.
varying vec4  vCol;
varying float vSide;

void main()
{
    float d    = abs(vSide);
    float core = exp(-d * d * 8.0);
    float halo = exp(-d * d * 1.8) * 0.35;
    gl_FragColor = vec4(vCol.rgb * (core + halo), 1.0);
}
