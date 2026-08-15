#version 430 core
// attrA.xy = corner uv (0..1), attrA.w = cell id; attrB = per-cell seeds
// (see Scene3DShader.cpp GEOM_PATCHES) — the only real per-vertex data.
in vec4 attrA;
in vec4 attrB;

out vec3 vControlPos;
out vec2 vControlUV;

void main() {
    vControlPos = attrA.xyz;
    vControlUV = attrA.xy;
}
