#version 330 core
/**
 * @file Hologram.vert
 * @brief Vertex stage companion to Hologram.geom/.frag -- see the .frag
 * header for this scene's description. A PASS-THROUGH stage: the wireframe
 * needs each vertex to know which CORNER of its triangle it is, and that is
 * not a vertex property (a vertex is shared between triangles) -- it only
 * exists once the whole triangle is in view. Placement and projection
 * therefore happen in Hologram.geom.
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
