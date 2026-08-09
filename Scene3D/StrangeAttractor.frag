#version 120
// StrangeAttractor.frag — soft additive glow sprite; the attractor's
// strands sum into ribbons of light.
varying vec4 vCol;

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    float a  = exp(-r2 * 12.0) + 0.25 * exp(-r2 * 4.0);
    gl_FragColor = vec4(vCol.rgb * a, 1.0);
}
