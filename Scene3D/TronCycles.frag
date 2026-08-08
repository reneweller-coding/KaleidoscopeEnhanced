#version 120
// TronCycles.frag — solid light wall with a blazing top edge.
varying vec4  vCol;
varying float vSide;

void main()
{
    float body = 0.45 + 0.25 * (vSide * 0.5 + 0.5);
    float edge = exp(-pow(1.0 - vSide, 2.0) * 6.0) * 0.9;   // top rim
    gl_FragColor = vec4(vCol.rgb * (body + edge), 1.0);
}
