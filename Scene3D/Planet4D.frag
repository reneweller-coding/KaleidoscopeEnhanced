#version 330 core
out vec4 fragColor;
// Planet4D.frag — soft glow sprite with a bright core (additive): node
// clouds read as radiant planets, edge grains as thin light filaments.
in vec4 vCol;

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    float a  = exp(-r2 * 14.0) + 0.35 * exp(-r2 * 4.5);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
