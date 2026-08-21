#version 330 core
/**
 * @file Accumulate.frag
 * @brief Scaled texture copy, used for the recorder's motion-blur accumulation.
 *
 * Two passes share this one shader, differing only in `scale` and blend state:
 *
 *   ACCUMULATE  additive blending, scale = 1.0
 *               Every rendered frame is summed into an RGBA16F buffer. Float
 *               is not optional here: at 120 Hz into a 30 fps recording, four
 *               frames are summed, and an 8-bit target would clip anything
 *               above a quarter brightness into flat white.
 *
 *   RESOLVE     no blending, scale = 1/N
 *               Divides the sum by however many frames actually went in, into
 *               an 8-bit target the readback then reads. N is the measured
 *               count, not the nominal one, so a dropped or extra render frame
 *               changes the exposure of nothing.
 *
 * The result is a true temporal box filter over the capture interval, which is
 * what a camera shutter does -- and it costs no extra rendering, because those
 * frames were being drawn and thrown away already.
 */
uniform sampler2D tex;
uniform float     scale;

in  vec2 vUV;
out vec4 fragColor;

void main()
{
    fragColor = texture(tex, vUV) * scale;
}
