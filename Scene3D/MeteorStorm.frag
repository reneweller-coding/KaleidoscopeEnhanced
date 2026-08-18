#version 330 core
out vec4 fragColor;
// Frag-side music pulse (added by the deaf-scene pass: reactivity
// measured ~0 -- the vert-side coupling barely moved any pixels).
uniform float audioLevel;
uniform float audioKick;
// MeteorStorm.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file MeteorStorm.frag
 * @brief Additive point-sprite shader for the meteor shower / static star
 * dome, rendering each point (a meteor's head, one of its trail
 * particles, or a background star) as a soft radial glow.
 *
 * Colour, including the per-meteor cycle timing and the
 * audioOnset/audioSwell/audioChromaHue/audioDrop response that shapes
 * flight and brightness, is computed upstream in MeteorStorm.vert and
 * arrives baked in vCol; this stage's own audioLevel/audioKick uniforms
 * were added afterward to give every point a small extra pulse, since the
 * vert-side coupling alone barely moved any pixels.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    fragColor = vec4(vCol.rgb * a * (0.85 + 0.30 * audioLevel + 0.35 * audioKick), 1.0);
}
