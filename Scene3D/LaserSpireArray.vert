#version 330 core
/**
 * @file LaserSpireArray.vert
 * @brief Vertex stage companion to LaserSpireArray.frag -- see that file's header for
 * this scene's description.
 */
// LaserSpireArray.vert — feed 3D point cloud seeds to Geometry Shader
// to extrude into tall 3D hexagonal laser spires / obelisks.
in vec4 attrA;
in vec4 attrB;

out vec3  vObjPos;
out vec4  vSeeds;
out float vSpireIndex;

void main() {
    vObjPos = attrA.xyz;
    vSeeds = attrB;
    vSpireIndex = attrA.w;
    gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
}
