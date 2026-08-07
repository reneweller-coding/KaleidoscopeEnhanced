#version 120
// RibbonTunnel.frag — soft-edged glowing ribbon (additive blending).
varying vec4  vCol;
varying float vSide;

void main()
{
    float glow = exp(-vSide * vSide * 3.0);
    gl_FragColor = vec4(vCol.rgb * glow, 1.0);
}
