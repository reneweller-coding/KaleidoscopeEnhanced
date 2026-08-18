#version 330 core
out vec4 fragColor;
// LaserArena.frag — razor core with a soft glow falloff across the beam.
in vec4  vCol;
in float vSide;

/**
 * @file LaserArena.frag
 * @brief Shades one laser-beam ribbon of the club-style laser show built
 * in LaserArena.vert: a razor-thin bright core with a soft glow halo
 * across the beam width.
 *
 * All colour (per-beam hue cycling, the audioBeatPhase strobe,
 * audioKick punch, and the DROP-triggered vertical snap) is computed
 * upstream in the vertex stage and arrives baked in vCol; this stage
 * only shapes the cross-beam falloff from vSide into core+halo
 * intensity.
 */

void main()
{
    float d    = abs(vSide);
    float core = exp(-d * d * 18.0);
    float halo = exp(-d * d * 3.5) * 0.35;
    fragColor = vec4(vCol.rgb * (core + halo), 1.0);
}
