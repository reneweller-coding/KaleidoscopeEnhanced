#version 330 core
out vec4 fragColor;
// FireflyField.frag — soft glowing point (additive blending).
in vec4 vCol;

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 9.0);
    fragColor = vec4(vCol.rgb * a * 1.8, 1.0);
}
