#version 330 core
/**
 * @file TravertineTerracePools.vert
 * @brief Vertex stage for TravertineTerracePools: passes the patch corner
 * through; the terraces are formed in the evaluation stage.
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
