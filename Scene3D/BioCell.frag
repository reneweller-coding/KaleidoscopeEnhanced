#version 330 core
out vec4 fragColor;
// Frag-side music pulse (added by the deaf-scene pass: reactivity
// measured ~0 -- the vert-side coupling barely moved any pixels).
uniform float audioLevel;
uniform float audioKick;
// BioCell.frag — soft organic point (additive blending).
in vec4 vCol;

/**
 * @file BioCell.frag
 * @brief Shades a single soft, organic point sprite (a biological cell or
 * particle) as a Gaussian glow, additively blended into the frame.
 *
 * audioLevel and audioKick both add directly to the glow's brightness
 * multiplier, so the whole swarm of cells pulses brighter with the overall
 * loudness and on every kick; per the comment above, this frag-side pulse
 * was found to barely move any pixels in practice, so most of the scene's
 * audio reactivity actually lives in the companion vertex shader's per-point
 * motion (vCol already carries the base per-vertex colour).
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 9.0);
    fragColor = vec4(vCol.rgb * a * (2.2 + 0.8 * audioLevel + 0.9 * audioKick), 1.0);
}
