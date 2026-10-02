#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
// WaveRibbon.frag — glowing line: bright core, soft halo.
in vec4  vCol;   ///< Colour (from the vertex stage).
in float vSide;   ///< Which side of a strip (from the vertex stage).

/**
 * @file WaveRibbon.frag
 * @brief Shades one of the 20 stacked oscilloscope-style wave lines (echoes
 * of the live waveform trailing back into space) as a glowing ribbon: a
 * tight bright core plus a soft wide halo across its width (vSide).
 *
 * No audio uniforms are read directly in this stage; the waveform shape
 * (blended from the live audioWave time-domain signal and a harmonic ghost
 * driven by audioSpectrum bands), its audioSwell-driven amplitude, and its
 * audioChromaHue-following hue sweep are all computed in the companion
 * vertex shader (WaveRibbon.vert) and arrive pre-baked in vCol.
 */

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float d    = abs(vSide);
    float core = exp(-d * d * 14.0);
    float halo = exp(-d * d * 2.5) * 0.30;
    fragColor = vec4(vCol.rgb * (core + halo), 1.0);
}
