#version 330 core
out vec4 fragColor;
// WarpStars.frag — soft star sprite (additive blending).
in vec4 vCol;

/**
 * @file WarpStars.frag
 * @brief Additive glow-sprite shader for the warp-speed starfield: renders
 * each streaking star point as a soft, tightly-focused point of light.
 *
 * No audio uniforms are read here; audioAdvance acting as the flight
 * throttle, the audioDrop/audioKick-triggered hyperjump flash, and the
 * key-following star tint are all computed in the companion vertex shader
 * (WarpStars.vert) and arrive pre-baked in vCol.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 12.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
