#version 330 core
out vec4 fragColor;

in vec3  vCol;
in float vSide;

/**
 * @file WormholeMirrorWeave.frag
 * @brief Shades one ribbon segment of the mirror-symmetric wormhole from WormholeMirrorWeave.vert:
 * additive glow falling off across the ribbon's width (vSide), same order-independent unlit
 * treatment as the existing RibbonTunnel, so the woven, pinching throat reads as pure light rather
 * than lit geometry. Colour (photo-palette, kaleidoscope-wedge-tinted, kick flash) arrives
 * pre-computed from the vertex stage.
 */

void main() {
    float glow = exp(-vSide * vSide * 3.0);
    vec3 col = vCol * glow;

    vec3 _catTone = col * 0.8;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
