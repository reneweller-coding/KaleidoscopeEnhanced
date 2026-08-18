#version 330 core
out vec4 fragColor;
// HarmonicStrings.frag — thin bright string with a soft glow.
in vec4  vCol;
in float vSide;

/**
 * @file HarmonicStrings.frag
 * @brief Shades a vibrating string as a thin bright core line with a soft
 * halo: distance from the string's center (vSide) drives two Gaussian
 * falloffs, a tight one for the core and a wider, dimmer one for the glow.
 *
 * This fragment shader declares no audio uniforms directly; its color
 * (vCol) is computed per-vertex by the companion vertex shader, so any
 * audio reactivity arrives already baked into that per-vertex color.
 */

void main()
{
    float d    = abs(vSide);
    float core = exp(-d * d * 20.0);
    float halo = exp(-d * d * 3.0) * 0.25;
    fragColor = vec4(vCol.rgb * (core + halo), 1.0);
}
