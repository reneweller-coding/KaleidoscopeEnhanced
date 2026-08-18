#version 330 core
out vec4 fragColor;
// LanternRise.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file LanternRise.frag
 * @brief Additive point-sprite shader for hundreds of rising sky
 * lanterns, rendering each point (paper shell or flame core) as a soft
 * radial glow.
 *
 * All colour, including the audioSwell/audioKick/audioChromaHue/
 * audioLevel response, is computed upstream in LanternRise.vert and
 * arrives fully baked in vCol; this stage only applies the Gaussian
 * falloff from the point centre for additive blending.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    fragColor = vec4(vCol.rgb * a * 1.9, 1.0);
}
