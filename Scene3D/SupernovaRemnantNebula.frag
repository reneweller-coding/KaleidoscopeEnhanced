#version 330 core
out vec4 fragColor;

in vec4 vColor;
in vec2 vTexCoord;

/**
 * @file SupernovaRemnantNebula.frag
 * @brief Shades the supernova-remnant filament strands built in
 * SupernovaRemnantNebula.vert, blending the current slideshow photo (tex0/
 * tex1, cross-faded by interpolation) with each strand's emission-line
 * colour and brightening a filament-edge glow along its width.
 *
 * This fragment stage reads no audio uniforms directly: the emission-line
 * colour mix ([SII] red / [OIII] cyan / H-alpha pink), the central pulsar
 * flash (driven by audioKick and audioSubBass), and the audioChromaHue/hueP
 * colour rotation are all computed per-vertex and arrive pre-baked in
 * vColor.
 */

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

void main() {
    vec3 photo = (interpolation * texture(tex0, vTexCoord) + (1.0 - interpolation) * texture(tex1, vTexCoord)).rgb;
    float filamentEdge = exp(-abs(vTexCoord.x - 0.5) * 8.0);

    vec3 col = mix(vColor.rgb * 0.5, photo * 1.3, 0.6);
    col += filamentEdge * vColor.rgb * 1.5;

    fragColor = vec4(col, 1.0);
}
