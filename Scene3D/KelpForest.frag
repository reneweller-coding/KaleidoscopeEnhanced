#version 120
// KelpForest.frag — soft blade: bright midrib, translucent edges.
varying vec4  vCol;
varying float vSide;

void main()
{
    float d    = abs(vSide);
    float body = exp(-d * d * 2.2);
    float rib  = exp(-d * d * 30.0) * 0.5;
    gl_FragColor = vec4(vCol.rgb * (body + rib), 1.0);
}
