#version 120
// HarmonicStrings.frag — thin bright string with a soft glow.
varying vec4  vCol;
varying float vSide;

void main()
{
    float d    = abs(vSide);
    float core = exp(-d * d * 20.0);
    float halo = exp(-d * d * 3.0) * 0.25;
    gl_FragColor = vec4(vCol.rgb * (core + halo), 1.0);
}
