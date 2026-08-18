#version 330 core
out vec4 fragColor;
// Frag-side music pulse (added by the deaf-scene pass: reactivity
// measured ~0 -- the vert-side coupling barely moved any pixels).
uniform float audioLevel;
uniform float audioKick;
// CymaticsPlate.frag — small hard-ish sand grain sprite (additive): a tight
// core with a faint halo, so converged nodal lines read as crisp bright
// figures instead of a soft blur.
in vec4 vCol;

/**
 * @file CymaticsPlate.frag
 * @brief Point-sprite shader for the Chladni-figure sand grains: a small,
 * fairly hard-edged additive dot (tight core plus a faint halo) so grains
 * that have converged onto a nodal line read as crisp bright figures rather
 * than a soft blur.
 *
 * audioLevel and audioKick both boost the sprite's overall brightness; the
 * grain's own colour (vCol) and its position on the vibrating plate are
 * computed upstream in this scene's vertex/compute stage.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    float a  = exp(-r2 * 26.0) + 0.25 * exp(-r2 * 7.0);
    fragColor = vec4(vCol.rgb * a * (1.55 + 0.55 * audioLevel + 0.75 * audioKick), 1.0);
}
