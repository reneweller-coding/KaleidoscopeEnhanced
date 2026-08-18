#version 330 core
out vec4 fragColor;
// EchoSpiral.frag — wide soft band with a luminous centre line.
in vec4  vCol;
in float vSide;

/**
 * @file EchoSpiral.frag
 * @brief Lighting for the whipping comet-ribbon trails: a wide soft glow
 * band across the ribbon's width with a brighter luminous core down the
 * centre line, plus a soft-knee tone map so a hot audio moment compresses
 * smoothly instead of clipping the whole frame to white.
 *
 * The trail's colour and brightness (vCol) are computed upstream in
 * EchoSpiral.vert, where audioKick cracks the whip with extra speed,
 * audioSwell and audioDrop scatter the orbit and boost brightness, and
 * audioChromaHue sets each comet's hue; this fragment stage only shapes that
 * colour into the glowing ribbon cross-section via vSide.
 */

void main()
{
    float d    = abs(vSide);
    float core = exp(-d * d * 8.0);
    float halo = exp(-d * d * 1.8) * 0.35;
    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (vCol.rgb * (core + halo)) * 0.6;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
