#version 330 core
/**
 * @file MirrorShatterExplosion.vert
 * @brief Vertex stage companion to MirrorShatterExplosion.frag/.geom -- see the .geom file's
 * header for this scene's description. Pure pass-through: all placement, the kaleidoscope
 * mirror-wedge symmetry and the beat-synced explosion happen in the geometry stage, which is
 * where the actual triangle shards get built (Tools/SHADER_AUTHORING.md's `.geom` convention --
 * camera/projection math lives entirely in the geometry stage's emitVert() helper, not here).
 */

in vec4 attrA;   // .w = point index
in vec4 attrB;   // 4 random seeds in [0,1)

out vec3  vObjPos;
out vec4  vSeeds;
out float vIndex;

void main() {
    vObjPos = attrA.xyz;
    vSeeds  = attrB;
    vIndex  = attrA.w;
    gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
}
