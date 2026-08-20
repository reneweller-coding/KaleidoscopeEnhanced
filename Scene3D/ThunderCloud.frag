#version 330 core
out vec4 fragColor;
// ThunderCloud.frag — extra-soft point for the cloud/flash look.
in vec4 vCol;

/**
 * @file ThunderCloud.frag
 * @brief Additive glow-sprite shader for the thunderstorm point cloud
 * (billowing cloud mass, jagged lightning bolts, falling rain, and the far
 * overcast sky behind them): renders each point with an extra-soft, wide
 * Gaussian falloff suited to cloud and flash glow.
 *
 * No audio uniforms are read here; the storm's reactivity -- snare-triggered
 * lightning strikes, kick/drop-driven flash intensity, cloud billows lit from
 * within by "their" bolt, and the distant sheet lightning flickering across
 * the far sky -- is entirely computed in the companion vertex shader
 * (ThunderCloud.vert) and arrives pre-baked in vCol.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 8.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
