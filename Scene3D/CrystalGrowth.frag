#version 120
// CrystalGrowth.frag — faceted gem faces with luminous edges (depth-tested);
// a drop blows the edges out into a blinding sparkle.
uniform float audioDrop;
varying vec4 vCol;
varying vec3 vCorner;

void main()
{
    vec3 a = abs(vCorner) * 2.0;
    float e1 = smoothstep(0.78, 0.99, a.x);
    float e2 = smoothstep(0.78, 0.99, a.y);
    float e3 = smoothstep(0.78, 0.99, a.z);
    float edge = clamp(e1 * e2 + e2 * e3 + e1 * e3, 0.0, 1.0);
    vec3 col = vCol.rgb * (0.16 + (1.6 + 2.0 * audioDrop) * edge);
    gl_FragColor = vec4(col, 1.0);
}
