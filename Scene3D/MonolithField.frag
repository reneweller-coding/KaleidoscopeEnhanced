#version 120
// MonolithField.frag — near-black slab faces; the EDGES are the glyphs:
// segmented luminous runes running up the corners.
varying vec4 vCol;
varying vec3 vCorner;

void main()
{
    vec3 a = abs(vCorner) * 2.0;
    float e1 = smoothstep(0.82, 0.99, a.x);
    float e2 = smoothstep(0.82, 0.99, a.y);
    float e3 = smoothstep(0.82, 0.99, a.z);
    float edge = clamp(e1 * e3 + e1 * e2 + e2 * e3, 0.0, 1.0);

    // Glyph segmentation: dashes along the vertical edges.
    float dash = step(0.35, fract(vCorner.y * 9.0));
    gl_FragColor = vec4(vCol.rgb * (0.10 + 1.7 * edge * dash), 1.0);
}
