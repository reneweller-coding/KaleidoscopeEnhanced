#version 330 core
out vec4 fragColor;
// SpiralArray.frag — soft glow sprite (additive): dim helix wire, radiant
// pitch nodes, white-hot comet at the tonal center of effect.
in vec4 vCol;

/**
 * @file SpiralArray.frag
 * @brief Additive glow-sprite shader for the DNA-double-helix particle scene:
 * renders each strand bead, base-pair rung, or ambient plasma point as a
 * soft two-lobe radial falloff -- a dim wire glow with a brighter, tighter
 * core at its centre.
 *
 * No audio uniforms are read here; all reactivity (the beat pulse climbing
 * the helix, kick-driven breathing, the drop's "unzip" split, and
 * chroma-lit base-pair rungs) is computed per-point in the companion vertex
 * shader and arrives already baked into vCol.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    float a  = exp(-r2 * 13.0) + 0.3 * exp(-r2 * 4.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
