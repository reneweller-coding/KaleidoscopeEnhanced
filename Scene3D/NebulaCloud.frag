#version 120
// NebulaCloud.frag — extra-soft point for gaseous look.
varying vec4 vCol;

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 7.0);
    gl_FragColor = vec4(vCol.rgb * a, 1.0);
}
