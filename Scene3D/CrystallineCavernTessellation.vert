#version 430 core
/*****************************************************************************\
 *                              CrystallineCavernTessellation.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  attrA.xy = corner uv (0..1), attrA.w = cell ID; attrB = per-cell seeds
 *
 *  @author René Weller
 */
in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

out vec3 vControlPos; ///< Control pos (from the vertex stage).
out vec2 vControlUV;  ///< Control UV (from the vertex stage).

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vControlPos = attrA.xyz;
    vControlUV = attrA.xy;
}
