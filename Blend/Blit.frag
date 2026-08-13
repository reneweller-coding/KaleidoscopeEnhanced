#version 330 core
// Blit.frag — 1:1 texture copy for the core pipeline (replaces the old
// fixed-function textured quad in FilterShader::blitTexture).
uniform sampler2D tex;
in vec2 vUV;
out vec4 fragColor;

void main()
{
    fragColor = texture(tex, vUV);
}
