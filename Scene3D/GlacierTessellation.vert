#version 400 core
/**
 * @file GlacierTessellation.vert
 * @brief Vertex stage companion to GlacierTessellation.frag -- see that file's header for
 * this scene's description.
 */
// GlacierTessellation.vert — pass quad patch control points to Tessellation Control stage
in vec4 attrA;
in vec4 attrB;

out vec2 vUV;
out vec4 vSeed;

void main() {
    vUV = attrA.xy;
    vSeed = attrB;
}
