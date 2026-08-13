#version 330 core
out vec4 fragColor;
// HelixTower.frag — soft glowing point (additive blending).
in vec4 vCol;

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
