#version 330 core
/**
 * @file Dissolve.vert
 * @brief Pass-through into Dissolve.geom, which turns each triangle into a
 * particle. Nothing is placed here: a particle is one per TRIANGLE, and the
 * geometry stage is the first place a whole triangle exists.
 */

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform int meshVertexCount;   ///< Vertices of the scene's mesh.

out vec3  gPos;
out vec3  gNormal;
out vec2  gUV;
out float gBg;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    gPos    = attrA.xyz;
    gNormal = attrB.xyz;
    gUV     = vec2(attrA.w, attrB.w);
    gBg     = (gl_VertexID >= meshVertexCount) ? 1.0 : 0.0;
}
