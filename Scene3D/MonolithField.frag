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
in float vFlat;

/**
 * @file MonolithField.frag
 * @brief Shades the near-black monolith slabs and drifting shards built in
 * MonolithField.vert -- their faces stay almost unlit while segmented
 * luminous glyph dashes trace the vertical edges -- plus the two plain
 * solids that carry the frame around them: the ground slabs of the plain
 * itself and the sky-dust haze above the horizon.
 *
 * vCorner (the vertex's local cube-corner position) picks out the
 * edges and their dashed glyph segmentation; vFlat marks the ground and
 * sky solids, which take no glyphs at all; vCol carries the
 * per-object colour and brightness already computed in the vertex stage
 * from its own spectrum band, the downbeat choir pulse and the drop
 * levitation. This stage's own audioLevel/audioKick uniforms were added
 * afterward to give the glyphs a small extra pulse, since the vert-side
 * coupling alone barely moved any pixels.
 */

void main()
{
    float pulse = 0.85 + 0.30 * audioLevel + 0.35 * audioKick;

    if (vFlat > 0.5)
    {
        // Ground slabs and sky dust: plain solids, no glyphs.
        fragColor = vec4(clamp(vCol.rgb * pulse, 0.0, 1.0), 1.0);
        return;
    }

    vec3 a = abs(vCorner) * 2.0;
    float e1 = smoothstep(0.82, 0.99, a.x);
    float e2 = smoothstep(0.82, 0.99, a.y);
    float e3 = smoothstep(0.82, 0.99, a.z);
    float edge = clamp(e1 * e3 + e1 * e2 + e2 * e3, 0.0, 1.0);

    // Glyph segmentation: dashes along the vertical edges.
    float dash = step(0.35, fract(vCorner.y * 9.0));
    // The face floor was 0.10, which left a slab reading as a hole in the
    // picture rather than as a dark solid standing in front of the sky.  It is
    // still far below the glyphs, so the identity ("near-black slabs, luminous
    // runes") is unchanged.
    float face = 0.22 + 0.10 * (0.5 - vCorner.y);
    fragColor = vec4(clamp(vCol.rgb * (face + 1.7 * edge * dash) * pulse,
                           0.0, 1.0), 1.0);
}
