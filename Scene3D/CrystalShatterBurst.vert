#version 330 core
/**
 * @file CrystalShatterBurst.vert
 * @brief Vertex stage companion to CrystalShatterBurst.frag -- see that file's header for
 * this scene's description.
 */
// CrystalShatterBurst.vert — feeds cube / mesh triangles to Geometry Shader
in vec4 attrA;
in vec4 attrB;

out vec3  vObjPos;
out vec4  vSeeds;
out float vCubeIndex;

void main() {
    vObjPos = attrA.xyz;
    vSeeds = attrB;
    vCubeIndex = attrA.w;
    gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
}
