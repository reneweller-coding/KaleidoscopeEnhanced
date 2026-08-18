#version 330 core
out vec4 fragColor;
// DragonFlight.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file DragonFlight.frag
 * @brief Point-sprite shader shared by every particle of the flying dragon
 * (body scales, wing membranes, fire breath and sky embers): a soft additive
 * glow dot with Gaussian falloff.
 *
 * All of this scene's audio reactivity -- the beat-locked wingbeat
 * (audioBeatPhase), the fire breath's intensity on audioDrop/audioKick, body
 * shimmer from audioBass/audioSwell, and hue drift from audioChromaHue -- is
 * computed per-particle upstream in DragonFlight.vert and arrives here
 * already baked into vCol; this stage only shapes it into a glowing point.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
