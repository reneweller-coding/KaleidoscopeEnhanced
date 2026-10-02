#version 330 core
/**
 * @file SoapFilmMembrane.vert
 * @brief Vertex stage for SoapFilmMembrane: passes the patch corner through;
 * placement happens in the evaluation stage after the displacement.
 */
in vec4 attrA;      ///< xy = global (u,v) of this patch corner, w = patch index
in vec4 attrB;      ///< per-patch hashes

out vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec4 vSeed;   ///< Per-instance random seed (from the vertex stage).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vUV   = attrA.xy;
    vSeed = attrB;
    gl_Position = vec4(attrA.xy, 0.0, 1.0);
}
