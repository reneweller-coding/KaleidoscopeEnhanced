#version 330 core
out vec4 fragColor;
// OscilloRings.frag — glowing line: bright core, soft halo.
in vec4  vCol;
in float vSide;

/**
 * @file OscilloRings.frag
 * @brief Renders one segment of the 20 nested oscilloscope rings as a
 * glowing line with a bright core and a soft halo.
 *
 * Reads no audio uniforms directly. The paired OscilloRings.vert bends
 * each ring's radius by its own spectrum band (audioSpectrum), wraps the
 * real waveform (audioWave) around the innermost rings, breathes the base
 * radius with audioBass, and colours the whole set via audioChromaHue and
 * audioSwell; this shader turns the resulting vCol and the vSide
 * cross-ring offset into the core-plus-halo glow.
 */

void main()
{
    float d    = abs(vSide);
    float core = exp(-d * d * 14.0);
    float halo = exp(-d * d * 2.5) * 0.30;
    fragColor = vec4(vCol.rgb * (core + halo), 1.0);
}
