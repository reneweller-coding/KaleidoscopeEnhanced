#version 330 core
out vec4 fragColor;

in vec4  vCol;
in float vSide;
in float vLength;

/**
 * @file HopfTorusCliffordKlein.frag
 * @brief Shades one strand of a Hopf-torus / Clifford-torus tube lattice:
 * blends its per-vertex color (vCol) with a slideshow photo that scrolls
 * along the strand's length (vLength, animated by time), with a bright rim
 * along the strand's cross-section edge (vSide).
 *
 * This fragment shader declares no audio uniforms directly; any audio
 * reactivity arrives already baked into the per-vertex vCol supplied by
 * the companion vertex shader.
 */

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float time;

void main() {
    vec2 uv = vec2(vSide * 0.5 + 0.5, fract(vLength * 3.0 + time * 0.15));
    vec3 photo = (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;

    float edge = smoothstep(0.65, 0.98, abs(vSide));
    vec3 col = mix(vCol.rgb * 0.5, photo * 1.4, 0.65);
    col += edge * vCol.rgb * 1.8;

    fragColor = vec4(col, 1.0);
}
