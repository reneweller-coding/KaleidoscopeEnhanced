#version 330 core
out vec4 fragColor;
// NebulaCloud.frag — extra-soft point for gaseous look.
in vec4 vCol;

/**
 * @file NebulaCloud.frag
 * @brief Renders one particle of the gas-nebula point cloud as a soft, wide
 * additive glow sprite.
 *
 * This shader reads no audio uniforms itself; every audio mapping lives in
 * the paired NebulaCloud.vert and arrives baked into vCol / the point size.
 *
 * Audio Reactivity (all applied in NebulaCloud.vert):
 *   audioChromaHue -> hue of both nebula colour families
 *   audioSwell     -> overall glow of the gas
 *   audioLevel     -> overall glow of the gas
 *   audioCentroid  -> brightness lift with spectral centre of mass
 *   audioFlatness  -> knot condensation (tight clumps vs diffuse fog)
 *   audioRolloff   -> vertical extent (flat disc vs tall column)
 *   audioMode      -> emission (major, warm) vs reflection (minor, cold) mix
 *
 * The wide falloff exponent (7, versus roughly 10-12 on sharper
 * sprites elsewhere) is what gives this cloud its extra-diffuse, gaseous
 * look.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 7.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
