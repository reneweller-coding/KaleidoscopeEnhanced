#version 330 core
out vec4 fragColor;
// ConcertCrowd.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file ConcertCrowd.frag
 * @brief Shades a single soft point sprite -- one member of a crowd of
 * concert-goers or their raised phone-light/glow -- as a Gaussian glow,
 * additively blended into the frame.
 *
 * This fragment stage carries no audio uniforms of its own -- vCol (the
 * per-person colour, already audio-modulated per vertex, e.g. cheering
 * brightness on the beat) is the only input, so the crowd's reactivity to
 * the music lives entirely in the companion vertex shader.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 9.0);
    fragColor = vec4(vCol.rgb * a * 1.7, 1.0);
}
