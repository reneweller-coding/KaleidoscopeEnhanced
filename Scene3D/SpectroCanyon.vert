#version 330 core
/**
 * @file SpectroCanyon.vert
 * @brief Vertex stage companion to SpectroCanyon.frag -- see that file's header for
 * this scene's description.
 */
// SpectroCanyon.vert — pass the patch corner through; the canyon is read out
// of the spectrogram in the evaluation shader.

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

out vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec4 vSeed;   ///< Per-instance random seed (from the vertex stage).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vUV   = attrA.xy;
    vSeed = attrB;
    gl_Position = vec4(attrA.xy, 0.0, 1.0);
}
