#version 330 core
out vec4 fragColor;
// Planet4D.frag — soft glow sprite with a bright core (additive): node
// clouds read as radiant planets, edge grains as thin light filaments.
in vec4 vCol;

/**
 * @file Planet4D.frag
 * @brief Renders one grain of the 4D harmony visualisation (pitch classes
 * on a Clifford torus, stereographically projected to 3D) as a soft glow
 * sprite with a bright core and a broad secondary halo.
 *
 * Reads no audio uniforms directly. The paired Planet4D.vert places the
 * 12 pitch-class node clouds, their 36 interval edges and the surrounding
 * dust field the structure hangs in, brightening
 * each node by its live audioChroma[] energy, lighting an edge only when
 * both of its notes sound, sending a pulse along the edges on
 * audioDownbeat, and scaling brightness with audioSwell/audioKick/
 * audioDrop; this shader only shapes the resulting vCol into the
 * two-term glow.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    float a  = exp(-r2 * 14.0) + 0.35 * exp(-r2 * 4.5);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
