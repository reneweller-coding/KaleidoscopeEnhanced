#version 330 core
out vec4 fragColor;
// AuroraVeil.frag — translucent curtain: bright lower hem, airy top.
in vec4  vCol;
in float vSide;

/**
 * @file AuroraVeil.frag
 * @brief Shades one strip of a translucent aurora curtain: a bright glowing
 * hem where vSide approaches -1 and a soft, dim body across the rest of the
 * strip, using two Gaussian falloffs over the cross-curtain coordinate.
 *
 * No audio uniforms appear in this fragment stage -- vCol (the strip's
 * colour, already audio-modulated per vertex, e.g. by the beat/kick) and
 * vSide (the cross-curtain position) are the only inputs, so the curtain's
 * reactivity to the music is driven entirely by the companion vertex shader.
 */

void main()
{
    float hem  = exp(-(vSide + 1.0) * (vSide + 1.0) * 1.4);
    float body = exp(-vSide * vSide * 0.9) * 0.16;
    fragColor = vec4(vCol.rgb * (hem + body), 1.0);
}
