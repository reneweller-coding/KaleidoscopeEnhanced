#version 330 core
/*****************************************************************************\
 *                              Assembly.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage for Assembly.geom/.frag: pass-through into the geometry stage, which is where the pieces are
 *  placed.
 *
 *  Nothing is transformed here on purpose. Assembly works on CHUNKS, and a chunk
 *  only exists once three vertices are visible together -- the geometry stage is
 *  the first place that is true.
 *
 *  @author René Weller
 */

in vec4 attrA; ///< mesh: xyz = object-space position, w = U.  shell: xyz = world-space position on the shell.
in vec4 attrB; ///< mesh: xyz = object-space normal,   w = V.  shell: xyz = outward direction.

uniform int meshVertexCount; ///< Vertices of the scene's mesh.

out vec3  gPos;    ///< Positions of the four magnets.
out vec3  gNormal; ///< Normal (from the geometry stage).
out vec2  gUV;     ///< UV (from the geometry stage).
out float gBg;     ///< Bg (from the geometry stage).

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    gPos = attrA.xyz;
    gNormal = attrB.xyz;
    gUV = vec2( attrA.w, attrB.w );
    gBg = ( gl_VertexID >= meshVertexCount ) ? 1.0 : 0.0;
}
