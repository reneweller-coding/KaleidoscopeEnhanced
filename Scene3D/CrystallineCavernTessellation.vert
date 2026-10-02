#version 430 core
/**
 * @file CrystallineCavernTessellation.vert
 * @brief attrA.xy = corner uv (0..1), attrA.w = cell ID; attrB = per-cell seeds
 */
in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

out vec3 vControlPos;
out vec2 vControlUV;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vControlPos = attrA.xyz;
    vControlUV = attrA.xy;
}
