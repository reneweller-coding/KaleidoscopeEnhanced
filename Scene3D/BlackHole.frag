#version 330 core
out vec4 fragColor;
// BlackHole.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file BlackHole.frag
 * @brief Shades a single soft point sprite (accretion-disk particle or
 * infalling matter around a black hole) as a Gaussian glow, additively
 * blended into the frame.
 *
 * This fragment stage carries no audio uniforms of its own -- vCol (the
 * per-particle colour, already audio-modulated per vertex, e.g. by orbital
 * speed or beat-driven brightness) is the only input, so the scene's
 * reactivity to the music lives entirely in the companion vertex shader.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    // Deliberately still a dark scene (a black hole IS the point), but the
    // accretion dust was nearly invisible: wider sprite falloff + a mild
    // gain make the disc readable without lighting up the void.
    float a = exp(-dot(d, d) * 6.0);
    fragColor = vec4(vCol.rgb * a * 1.8, 1.0);
}
