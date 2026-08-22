#version 330 core
out vec4 fragColor;

in vec4  vCol;
in float vLife;

/**
 * @file ParticleTunnelFlight.frag
 * @brief Renders one particle of the mirror-kaleidoscope tunnel-flight point cloud as a tight-
 * cored glow sprite.
 *
 * Reads no audio uniforms directly: position, kaleidoscope fold, kick shockwave flash and colour
 * are all computed in the paired ParticleTunnelFlight.vert and arrive here as vCol and vLife
 * (0..~1.5, brightens the glow on a kick shockwave). A soft-knee tone-map compresses hot additive
 * overlap instead of clipping the whole frame to white.
 */

void main() {
    vec2 pc = gl_PointCoord - 0.5;
    float r2 = dot(pc, pc);
    if (r2 > 0.25) discard;

    // Tight core, short tail -- broad tails are pure overdraw on 60k additive
    // sprites and wash the palette toward white (see Tools/SHADER_AUTHORING.md V8c).
    // Sparser overlap than a dense volumetric point cloud (points are spread
    // along a tunnel tube, not filling a solid volume), so a higher per-point
    // gain than NeuroSynapseNetwork's stays safely under V8c's overexposure risk.
    float glow = exp(-r2 * 17.0) + exp(-r2 * 5.0) * 0.22;
    glow *= (1.0 + vLife * 1.4);

    // Measured luma 0.006 -- the V8c overexposure correction went ~10x
    // too far on this sparse tunnel. 1.2 still sits well under the
    // additive-burn regime (knee + cap follow).
    vec3 col = vCol.rgb * glow * 8.5;
    vec3 _catTone = col * 0.85;
    _catTone /= 1.0 + 0.20 * max(_catTone.r, max(_catTone.g, _catTone.b));   // softer knee: gain alone stopped registering
    fragColor = vec4(_catTone, 1.0);
}
