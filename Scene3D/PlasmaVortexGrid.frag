#version 330 core
out vec4 fragColor;
/**
 * @file PlasmaVortexGrid.frag
 * @brief PLASMA VORTEX GRID: a glowing funnel grid swirled by a TRAVELING SPIRAL
 * WAVE (rigid base rotation + bounded radial wave - no mesh shear), the
 * camera banking around and into the funnel.
 *   audioKick -> shock tsunami    audioSubBass -> funnel depth
 *   audioSpectrum -> Bessel ripple heights
 */

in vec3 vWorld;
in vec2 vUV;
in vec4 vCol;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float time;

void main() {
    // Glowing laser grid lines across the heightfield
    vec2 gridUV = fract(vUV * vec2(220.0, 120.0));
    vec2 gridLines = smoothstep(0.08, 0.02, abs(gridUV - 0.5));
    float gridGlow = max(gridLines.x, gridLines.y);

    // Sample texture projected onto the whirlpool
    vec3 photo = (interpolation * texture(tex0, vUV) + (1.0 - interpolation) * texture(tex1, vUV)).rgb;

    vec3 col = vCol.rgb * (0.3 + 0.7 * gridGlow);
    col += photo * 0.4;
    col += gridGlow * vec3(1.0, 0.9, 0.7) * 1.5;

    // Atmospheric depth fade
    float dist = length(vWorld);
    col *= exp(-dist * 0.015);

    fragColor = vec4(col, 1.0);
}
