#version 330 core
out vec4 fragColor;
// StrangeAttractor.frag — soft additive glow sprite; the attractor's
// strands sum into ribbons of light.
in vec4 vCol;

/**
 * @file StrangeAttractor.frag
 * @brief Additive glow-sprite shader for the chaotic-attractor particle
 * trails (Lorenz, Thomas, Aizawa or Halvorsen, chosen per activation in the
 * vertex stage): renders each trajectory point as a soft point sprite whose
 * strands sum into glowing ribbons of light.
 *
 * No audio uniforms are read here; audio reactivity (the attractor's
 * breathing parameters, travel speed along each trajectory, and
 * velocity-to-colour mapping via the photo-arc palette) is computed entirely
 * in the companion vertex shader and arrives already baked into vCol.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    float a  = exp(-r2 * 12.0) + 0.25 * exp(-r2 * 4.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
