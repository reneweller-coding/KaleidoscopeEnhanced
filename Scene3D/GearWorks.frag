#version 330 core
out vec4 fragColor;
// GearWorks.frag — brass faces with machined luminous edges (depth-tested).
in vec4 vCol;
in vec3 vCorner;

/**
 * @file GearWorks.frag
 * @brief Shades a gear-mechanism face as flat brass with machined,
 * luminous edges: distance from each cube corner (vCorner) picks out the
 * beveled edge lines and brightens them against a dim flat face.
 *
 * This fragment shader declares no audio uniforms directly; its color
 * (vCol) is computed per-vertex by the companion vertex shader, so any
 * audio reactivity arrives already baked into that per-vertex color.
 */

void main()
{
    vec3 a = abs(vCorner) * 2.0;
    float e1 = smoothstep(0.80, 0.99, a.x);
    float e2 = smoothstep(0.80, 0.99, a.y);
    float e3 = smoothstep(0.80, 0.99, a.z);
    float edge = clamp(e1 * e2 + e2 * e3 + e1 * e3, 0.0, 1.0);
    vec3 col = vCol.rgb * (0.30 + 1.3 * edge);
    fragColor = vec4(col, 1.0);
}
