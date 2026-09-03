#version 330 core
/**
 * @file TessellatedOcean.vert
 * @brief Vertex stage companion to TessellatedOcean.frag -- passes the patch
 * corner through; placement happens in the evaluation stage after the
 * displacement.
 */
in vec4 attrA;      // xy = global (u,v) of this patch corner, w = patch index
in vec4 attrB;      // per-patch hashes

out vec2 vUV;
out vec4 vSeed;

void main()
{
    vUV   = attrA.xy;
    vSeed = attrB;
    gl_Position = vec4(attrA.xy, 0.0, 1.0);
}
