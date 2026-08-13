#version 330 core
out vec4 fragColor;
// SpiralArray.frag — soft glow sprite (additive): dim helix wire, radiant
// pitch nodes, white-hot comet at the tonal center of effect.
in vec4 vCol;

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    float a  = exp(-r2 * 13.0) + 0.3 * exp(-r2 * 4.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
