#version 120
// WaveRibbon.frag — glowing line: bright core, soft halo.
varying vec4  vCol;
varying float vSide;

void main()
{
    float d    = abs(vSide);
    float core = exp(-d * d * 14.0);
    float halo = exp(-d * d * 2.5) * 0.30;
    gl_FragColor = vec4(vCol.rgb * (core + halo), 1.0);
}
