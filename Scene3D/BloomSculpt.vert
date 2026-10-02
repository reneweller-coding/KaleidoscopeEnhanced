#version 330 core
/**
 * @file BloomSculpt.vert
 * @brief Vertex stage companion to BloomSculpt.frag -- see that file's header for
 * this scene's description.
 */
// BloomSculpt.vert — pass the patch corner through; the sphere is built and
// displaced per generated vertex in the evaluation shader.

in vec4 attrA;      ///< xy = global (u,v) of the patch corner
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

out vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec4 vSeed;   ///< Per-instance random seed (from the vertex stage).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vUV   = attrA.xy;
    vSeed = attrB;
    gl_Position = vec4(attrA.xy, 0.0, 1.0);   // unused; the TES rebuilds it
}
