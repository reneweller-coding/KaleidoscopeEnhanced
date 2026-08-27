#version 330 core
/**
 * @file Condensation.vert
 * @brief Pass-through into Condensation.geom, which builds the volume. See that
 * file for the scene.
 */

in vec4 attrA;
in vec4 attrB;

uniform int meshVertexCount;

out vec3  gPos;
out vec3  gNormal;
out vec2  gUV;
out float gBg;

void main()
{
    gPos    = attrA.xyz;
    gNormal = attrB.xyz;
    gUV     = vec2(attrA.w, attrB.w);
    gBg     = (gl_VertexID >= meshVertexCount) ? 1.0 : 0.0;
}
