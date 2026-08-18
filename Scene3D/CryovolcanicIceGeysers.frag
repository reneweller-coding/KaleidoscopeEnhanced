#version 330 core
out vec4 fragColor;

in vec4 vColor;
in vec2 vTexCoord;

/**
 * @file CryovolcanicIceGeysers.frag
 * @brief Fragment shader for the cryovolcanic ice-geyser plume particles:
 * blends the incoming per-particle colour with a slideshow photo sample and
 * adds a soft glow toward the centre of each plume ribbon.
 *
 * The plume colouring itself (icy cyan/white/sun-gold mix, audioChromaHue and
 * hueP hue rotation, audioLevel brightness) is computed upstream in
 * CryovolcanicIceGeysers.vert and passed in via vColor; this stage only
 * re-textures it with the current photo (tex0/tex1, cross-faded by
 * interpolation) and shapes the edge falloff.
 */

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

void main() {
    vec3 photo = (interpolation * texture(tex0, vTexCoord) + (1.0 - interpolation) * texture(tex1, vTexCoord)).rgb;
    float edge = exp(-abs(vTexCoord.x - 0.5) * 6.0);

    vec3 col = mix(vColor.rgb * 0.5, photo * 1.3, 0.6);
    col += edge * vColor.rgb * 1.6;

    fragColor = vec4(col, 1.0);
}
