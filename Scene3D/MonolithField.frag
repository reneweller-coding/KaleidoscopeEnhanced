#version 330 core
out vec4 fragColor;
// Frag-side music pulse (added by the deaf-scene pass: reactivity
// measured ~0 -- the vert-side coupling barely moved any pixels).
uniform float audioLevel;
uniform float audioKick;
// MonolithField.frag — near-black slab faces; the EDGES are the glyphs:
// segmented luminous runes running up the corners.
in vec4 vCol;
in vec3 vCorner;

void main()
{
    vec3 a = abs(vCorner) * 2.0;
    float e1 = smoothstep(0.82, 0.99, a.x);
    float e2 = smoothstep(0.82, 0.99, a.y);
    float e3 = smoothstep(0.82, 0.99, a.z);
    float edge = clamp(e1 * e3 + e1 * e2 + e2 * e3, 0.0, 1.0);

    // Glyph segmentation: dashes along the vertical edges.
    float dash = step(0.35, fract(vCorner.y * 9.0));
    fragColor = vec4(vCol.rgb * (0.10 + 1.7 * edge * dash) * (0.85 + 0.30 * audioLevel + 0.35 * audioKick), 1.0);
}
