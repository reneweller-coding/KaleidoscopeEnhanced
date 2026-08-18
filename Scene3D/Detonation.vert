#version 330 core
/**
 * @file Detonation.vert
 * @brief Vertex stage companion to Detonation.frag -- see that file's header for
 * this scene's description.
 */
// Detonation.vert — wrap the flat grid onto a sphere.  The shell is broken
// apart per triangle in the geometry shader, so nothing is displaced here.

in vec4 attrA;      // xy = grid (u,v)
in vec4 attrB;      // per-cell hashes

out vec3 gObj;
out vec4 gRnd;
out vec2 gUV;

const float PI = 3.14159265;

void main()
{
    float th  = attrA.x * 2.0 * PI;
    float phi = attrA.y * PI;
    gObj = vec3(sin(phi) * cos(th), cos(phi), sin(phi) * sin(th));
    gRnd = attrB;
    gUV  = attrA.xy;
    gl_Position = vec4(gObj, 1.0);
}
