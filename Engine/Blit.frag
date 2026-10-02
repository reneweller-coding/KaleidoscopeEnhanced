#version 330 core
/**
 * @file Blit.frag
 * @brief Copies the bound source texture to the framebuffer unchanged, one texel to one pixel.
 *
 * Fragment shader half of the plain textured-quad blit used by
 * FilterShader::blitTexture, replacing the old fixed-function textured-quad
 * path. Reads the `tex` sampler at the interpolated UV from the paired
 * vertex shader (standard.vert) and writes it straight to `fragColor` with
 * no color-space, tonemap, or filtering changes.
 */
// Blit.frag — 1:1 texture copy for the core pipeline (replaces the old
// fixed-function textured quad in FilterShader::blitTexture).
uniform sampler2D tex;
in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec4 fragColor;   ///< The pixel's colour (output).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    fragColor = texture(tex, vUV);
}
