#version 330 core
out vec4 fragColor;
// CosmicBoidsVortex.frag — Soft glowing 3D energy particle (additive blending).
in vec4 vCol;

/**
 * @file CosmicBoidsVortex.frag
 * @brief Fragment shader for the boid-swarm vortex's particles: renders each
 * point sprite as a soft radial glow (Gaussian falloff, discarded outside a
 * circular mask) for additive blending into thousands of overlapping points.
 *
 * All audio reactivity for this scene lives upstream in
 * CosmicBoidsVortex.vert, which sets the incoming vCol per particle:
 * audioKick drives a radial explosion impulse, audioAdvance the vortex spin
 * and Z-drift, audioSwell the vortex radius, audioChromaHue the colour
 * spectrum, and audioLevel the particle alpha. This fragment stage simply
 * shapes that colour into a glowing dot.
 */

void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float alpha = exp(-r2 * 12.0);
    fragColor = vec4(vCol.rgb * alpha, vCol.a * alpha);
}
