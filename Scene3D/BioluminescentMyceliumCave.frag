#version 330 core
out vec4 fragColor;

in vec4 vColor;
in vec2 vTexCoord;

/**
 * @file BioluminescentMyceliumCave.frag
 * @brief Shades a glowing fungal-thread filament in a mycelium cave: blends
 * a per-vertex bioluminescent colour with the slideshow photo, then adds a
 * brightened seam of light running along the filament's own axis.
 *
 * This fragment stage reads no audio uniforms directly -- vColor arrives
 * already audio-modulated per vertex by the companion vertex shader (the
 * filament network's pulse/growth reactivity lives there), and vTexCoord
 * both maps the photo texture and drives the exponential edge glow along the
 * strand via filamentEdge.
 */

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

void main() {
    vec3 photo = (interpolation * texture(tex0, vTexCoord) + (1.0 - interpolation) * texture(tex1, vTexCoord)).rgb;
    float filamentEdge = exp(-abs(vTexCoord.x - 0.5) * 6.0);

    vec3 col = mix(vColor.rgb * 0.5, photo * 1.35, 0.6);
    col += filamentEdge * vColor.rgb * 1.6;

    fragColor = vec4(col, 1.0);
}
