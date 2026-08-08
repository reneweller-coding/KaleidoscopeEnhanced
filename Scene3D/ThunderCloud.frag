#version 120
// ThunderCloud.frag — extra-soft point for the cloud/flash look.
varying vec4 vCol;

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 8.0);
    gl_FragColor = vec4(vCol.rgb * a, 1.0);
}
