#version 330 core
out vec4 fragColor;

in vec4  vCol;
in float vSide;
in float vLength;

/**
 * @file QuantumHallEdgeCurrents.frag
 * @brief Shades the 20 chiral edge-current ribbons of the Quantum Hall
 * scene: a soft-edged glowing strip per ribbon, blended with a scrolling
 * sample of the live slideshow photo and brightened toward its edges.
 *
 * This fragment stage reads no audio uniforms directly — all of the audio
 * reactivity (cyclotron skipping-orbit radius from audioBass, kick phase
 * jumps from audioKick, chiral pulse timing, hue rotation from
 * audioChromaHue/audioSwell) is computed per-vertex in
 * QuantumHallEdgeCurrents.vert and arrives here already baked into vCol;
 * this shader only uses vSide for the cross-ribbon edge glow and vLength to
 * scroll the photo sample lengthwise along the ribbon.
 */

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float time;

void main() {
    vec2 uv = vec2(vSide * 0.5 + 0.5, fract(vLength * 4.0 + time * 0.2));
    vec3 photo = (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;

    float edge = smoothstep(0.7, 0.98, abs(vSide));
    vec3 col = mix(vCol.rgb * 0.55, photo * 1.35, 0.65);
    col += edge * vCol.rgb * 1.6;

    fragColor = vec4(col, 1.0);
}
