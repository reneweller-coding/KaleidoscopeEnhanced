#version 120
// CubeWave.frag — dark faces, neon edges (Tron look).  Depth-tested opaque.
varying vec4 vCol;
varying vec3 vCorner;

void main()
{
    vec3 a = abs(vCorner) * 2.0;                 // 0..1 toward each face
    float e1 = smoothstep(0.86, 0.99, a.x);
    float e2 = smoothstep(0.86, 0.99, a.y);
    float e3 = smoothstep(0.86, 0.99, a.z);
    float edge = clamp(e1 * e2 + e2 * e3 + e1 * e3, 0.0, 1.0);
    vec3 col = vCol.rgb * (0.10 + 1.6 * edge);
    gl_FragColor = vec4(col, 1.0);
}
