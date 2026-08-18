#version 330 core
out vec4 fragColor;
// NebulaCloud.frag — extra-soft point for gaseous look.
in vec4 vCol;

/**
 * @file NebulaCloud.frag
 * @brief Renders one particle of the gas-nebula point cloud as a soft, wide
 * additive glow sprite.
 *
 * This shader reads no audio uniforms itself; the cloud's rotation, its
 * emission/reflection colour mix, embedded hot stars, and its overall
 * brightness (driven by audioSwell, audioLevel and audioCentroid in the
 * paired NebulaCloud.vert) are all baked into the incoming vCol per
 * particle. The wide falloff exponent (7, versus roughly 10-12 on sharper
 * sprites elsewhere) is what gives this cloud its extra-diffuse, gaseous
 * look.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 7.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
