#version 330 core
out vec4 fragColor;
// PolyDance.frag — dark faces, luminous edges (depth-tested).
in vec4 vCol;
in vec3 vCorner;

/**
 * @file PolyDance.frag
 * @brief Shades one cube of the nested platonic-shell constellation with
 * dark faces and luminous edges (depth-tested).
 *
 * Reads no audio uniforms directly. The paired PolyDance.vert places the
 * cubes on three counter-rotating Fibonacci-lattice spherical shells,
 * each shell's size and brightness keyed to its own register (audioBass/
 * audioMid/audioHigh), audioSwell adding a further brightness lift, and
 * audioChromaHue setting each shell's hue a musical third apart; this
 * shader turns the resulting vCol and the per-corner vCorner coordinate
 * into the edge-highlighted look.
 */

void main()
{
    vec3 a = abs(vCorner) * 2.0;
    float e1 = smoothstep(0.78, 0.99, a.x);
    float e2 = smoothstep(0.78, 0.99, a.y);
    float e3 = smoothstep(0.78, 0.99, a.z);
    float edge = clamp(e1 * e2 + e2 * e3 + e1 * e3, 0.0, 1.0);
    vec3 col = vCol.rgb * (0.20 + 1.6 * edge);
    fragColor = vec4(col, 1.0);
}
