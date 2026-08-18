#version 330 core
out vec4 fragColor;
// CometRide.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file CometRide.frag
 * @brief Shades a single soft point sprite -- ice/dust particle in a comet's
 * tail during a first-person ride alongside it -- as a bright Gaussian glow,
 * additively blended into the frame.
 *
 * This fragment stage carries no audio uniforms of its own -- vCol (the
 * per-particle colour, already audio-modulated per vertex, e.g. by ride
 * speed or beat-driven brightness) is the only input, so the scene's
 * reactivity to the music lives entirely in the companion vertex shader.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    fragColor = vec4(vCol.rgb * a * 2.2, 1.0);
}
