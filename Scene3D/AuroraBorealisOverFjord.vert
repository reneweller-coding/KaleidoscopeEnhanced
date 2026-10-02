#version 430 core
/**
 * @file AuroraBorealisOverFjord.vert
 * @brief Vertex stage companion to AuroraBorealisOverFjord.frag -- see that file's header for
 * this scene's description.
 */
// attrA.xy = corner uv (0..1), attrA.w = cell id; attrB = per-cell seeds
// (see Scene3DShader.cpp GEOM_PATCHES) — the only real per-vertex data.
in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

out vec3 vControlPos;
out vec2 vControlUV;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vControlPos = attrA.xyz;
    vControlUV = attrA.xy;
}
