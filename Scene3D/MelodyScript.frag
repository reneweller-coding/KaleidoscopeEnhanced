#version 330 core
out vec4 fragColor;
// MelodyScript.frag — additive ribbon ink (colour fully baked in the vert).
in vec4 vCol;

/**
 * @file MelodyScript.frag
 * @brief Additive ink shader for the scrolling melody-handwriting scene:
 * outputs each ribbon vertex's colour unchanged.
 *
 * All drawing — the pitch trace, octave grid, playhead and onset sparkle
 * ticks, and their audio response (audioMelody history, audioDeltaPitch,
 * audioOnset, audioSwell, audioChromaHue, audioDrop, audioLevel) — is
 * computed upstream in MelodyScript.vert and arrives fully baked in vCol;
 * this stage is a pass-through so the additive blend can build up the
 * ink's glow.
 */

void main()
{
    fragColor = vec4(vCol.rgb, 1.0);
}
