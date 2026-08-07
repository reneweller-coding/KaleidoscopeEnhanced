#version 120
// PortalRush.frag — soft-edged glowing gate band (additive blending).
varying vec4  vCol;
varying float vSide;

void main()
{
    float glow = exp(-vSide * vSide * 3.0);
    gl_FragColor = vec4(vCol.rgb * glow, 1.0);
}
