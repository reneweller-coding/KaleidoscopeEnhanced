#version 430 core
// CrystallineCavernTessellation.vert
// attrA.xy = corner uv (0..1), attrA.w = cell ID; attrB = per-cell seeds
in vec4 attrA;
in vec4 attrB;

out vec3 vControlPos;
out vec2 vControlUV;

void main() {
    vControlPos = attrA.xyz;
    vControlUV = attrA.xy;
}
