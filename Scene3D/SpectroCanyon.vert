#version 330 core
/**
 * @file SpectroCanyon.vert
 * @brief Vertex stage companion to SpectroCanyon.frag -- see that file's header for
 * this scene's description.
 */
// SpectroCanyon.vert — pass the patch corner through; the canyon is read out
// of the spectrogram in the evaluation shader.

in vec4 attrA;
in vec4 attrB;

out vec2 vUV;
out vec4 vSeed;

void main()
{
    vUV   = attrA.xy;
    vSeed = attrB;
    gl_Position = vec4(attrA.xy, 0.0, 1.0);
}
