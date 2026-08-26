#version 330 core
/**
 * @file ShatterSculpture.vert
 * @brief Vertex stage companion to ShatterSculpture.geom/.frag -- see the
 * .frag header for this scene's description. This stage is a PASS-THROUGH:
 * it hands object-space data on unchanged, because the shatter needs each
 * triangle's centroid, and a centroid is not a property any single vertex
 * has -- it only exists once the whole triangle is in view, which is
 * exactly what the geometry stage gets. All placement and projection
 * therefore happens in ShatterSculpture.geom.
 */

in vec4 attrA;   // mesh: xyz = object-space position, w = U.  shell: xyz = world-space position on the shell.
in vec4 attrB;   // mesh: xyz = object-space normal,   w = V.  shell: xyz = outward direction (reused as "sky direction").

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
