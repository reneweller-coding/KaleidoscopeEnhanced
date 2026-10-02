#version 330 core
/**
 * @file CrystalShatterBurst.vert
 * @brief Vertex stage companion to CrystalShatterBurst.frag -- see that file's header for
 * this scene's description.
 */
// CrystalShatterBurst.vert — feeds cube / mesh triangles to Geometry Shader
in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

out vec3  vObjPos;
out vec4  vSeeds;
out float vCubeIndex;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vObjPos = attrA.xyz;
    vSeeds = attrB;
    vCubeIndex = attrA.w;
    gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
}
