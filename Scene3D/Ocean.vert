#version 330 core
/**
 * @file Ocean.vert
 * @brief Vertex stage companion to Ocean.frag -- see that file's header for
 * this scene's description.
 */
// Ocean.vert — pass the patch corner through to the tessellation stage.
// With a tessellation pipeline the vertex shader does almost nothing: the
// real placement happens per generated vertex in the evaluation shader, so
// projecting here would be wasted (and wrong — it must happen AFTER the
// displacement).

in vec4 attrA;      ///< xy = global (u,v) of this patch corner, w = patch index
in vec4 attrB;      ///< per-patch hashes

out vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec4 vSeed;   ///< Per-instance random seed (from the vertex stage).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vUV   = attrA.xy;
    vSeed = attrB;
    gl_Position = vec4(attrA.xy, 0.0, 1.0);   // unused; TES rebuilds it
}
