#version 330 core
// Ocean.vert — pass the patch corner through to the tessellation stage.
// With a tessellation pipeline the vertex shader does almost nothing: the
// real placement happens per generated vertex in the evaluation shader, so
// projecting here would be wasted (and wrong — it must happen AFTER the
// displacement).

in vec4 attrA;      // xy = global (u,v) of this patch corner, w = patch index
in vec4 attrB;      // per-patch hashes

out vec2 vUV;
out vec4 vSeed;

void main()
{
    vUV   = attrA.xy;
    vSeed = attrB;
    gl_Position = vec4(attrA.xy, 0.0, 1.0);   // unused; TES rebuilds it
}
