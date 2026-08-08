#version 120
// CymaticsPlate.frag — small hard-ish sand grain sprite (additive): a tight
// core with a faint halo, so converged nodal lines read as crisp bright
// figures instead of a soft blur.
varying vec4 vCol;

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    float a  = exp(-r2 * 26.0) + 0.25 * exp(-r2 * 7.0);
    gl_FragColor = vec4(vCol.rgb * a, 1.0);
}
