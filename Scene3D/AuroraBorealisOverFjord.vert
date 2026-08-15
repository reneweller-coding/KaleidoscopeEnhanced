#version 430 core
layout(location = 0) in vec3 inPos;
layout(location = 1) in vec3 inNormal;
layout(location = 2) in vec2 inTexCoord;

out vec3 vControlPos;
out vec2 vControlUV;

void main() {
    vControlPos = inPos;
    vControlUV = inTexCoord;
}
