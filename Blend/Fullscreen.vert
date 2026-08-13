#version 330 core
// Fullscreen.vert — the ONE vertex shader behind every fullscreen pass in
// the core-profile pipeline: a single clip-space triangle generated from
// gl_VertexID (no VBO, just an empty VAO + glDrawArrays(GL_TRIANGLES,0,3)).
// Fragment shaders derive their coordinates from gl_FragCoord as before;
// vUV (0..1 over the screen) is provided for the few passes that want it.

out vec2 vUV;

void main()
{
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    vUV = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
