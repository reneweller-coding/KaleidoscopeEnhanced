#version 330 core
/**
 * @file Dissolve.vert
 * @brief Pass-through into Dissolve.geom, which turns each triangle into a
 * particle. Nothing is placed here: a particle is one per TRIANGLE, and the
 * geometry stage is the first place a whole triangle exists.
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
