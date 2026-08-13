#version 330 core
// BloomSculpt.vert — pass the patch corner through; the sphere is built and
// displaced per generated vertex in the evaluation shader.

in vec4 attrA;      // xy = global (u,v) of the patch corner
in vec4 attrB;

out vec2 vUV;
out vec4 vSeed;

void main()
{
    vUV   = attrA.xy;
    vSeed = attrB;
    gl_Position = vec4(attrA.xy, 0.0, 1.0);   // unused; the TES rebuilds it
}
