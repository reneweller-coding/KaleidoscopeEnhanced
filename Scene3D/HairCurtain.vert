#version 330 core
/**
 * @file HairCurtain.vert
 * @brief Vertex stage companion to HairCurtain.frag -- see that file's header for
 * this scene's description.
 */
// HairCurtain.vert — one vertex per strand: fix where it hangs from.
// The strand itself is grown in the geometry shader.

in vec4 attrA;      // w = strand index
in vec4 attrB;      // four hashes

out vec3  gRoot;
out vec3  gLean;        // the direction the strand leaves its root in
out vec4  gRnd;
out float gIndex;

uniform float sceneSeed;

const float SPAN_Z = 5.5;       // depth: several layers of strands
const float CROWN_R = 7.0;      // radius of the surface the hair falls over

void main()
{
    float idx = attrA.w;
    vec4 h = fract(attrB + sceneSeed * vec4(0.271, 0.613, 0.129, 0.845));

    // Strands are pushed toward the camera the same way GrassField pushes its
    // blades: a uniform depth spread wastes most of them behind the layers we
    // can already see.
    float z = 1.6 + SPAN_Z * h.x * h.x;

    // Roots sit on an ARC, not on a straight line, and each strand leaves its
    // root along the surface normal there.  That is the whole reason this scene
    // works: hair's anisotropic highlight is a band of directions, so a curtain
    // of exactly parallel strands has the same angle everywhere and shows no
    // band at all.  Falling over a curved crown fans the fibre directions, and
    // the sheen appears as an arc across the curtain.
    float a = (h.y - 0.5) * 1.75;
    vec3 centre = vec3(0.0, 5.2 - CROWN_R, 0.0);
    gRoot = centre + CROWN_R * vec3(sin(a), cos(a), 0.0) + vec3(0.0, 0.6 * h.z, z);

    // Outward at the root, tipping steeply downward — gravity wins fast.
    gLean  = normalize(vec3(sin(a) * 1.15, cos(a) * 0.25 - 1.0, 0.12 * (h.w - 0.5)));
    gRnd   = h;
    gIndex = idx;
    gl_Position = vec4(gRoot, 1.0);
}
