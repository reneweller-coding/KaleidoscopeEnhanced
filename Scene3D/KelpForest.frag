#version 330 core
out vec4 fragColor;
// KelpForest.frag — soft blade: bright midrib, translucent edges.
in vec4  vCol;
in float vSide;

void main()
{
    float d    = abs(vSide);
    float body = exp(-d * d * 2.2);
    float rib  = exp(-d * d * 30.0) * 0.5;
    fragColor = vec4(vCol.rgb * (body + rib), 1.0);
}
