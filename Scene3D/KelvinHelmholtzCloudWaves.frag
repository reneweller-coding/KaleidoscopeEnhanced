#version 330 core
out vec4 fragColor;

in vec4 vCol;
in vec2 vUV;
in vec3 vNormal;
in float vBillow;

/**
 * @file KelvinHelmholtzCloudWaves.frag
 * @brief Shades a 220x120 heightfield of rolling cloud billows shaped by
 * Kelvin-Helmholtz shear instability, lit as a sunset sky (dusk indigo
 * troughs, amber crests, white cloud caps).
 *
 * The billow geometry, palette mixing and audio response (audioBass
 * swelling the wave height, audioKick puffing the crests, audioChromaHue
 * and hueP rotating the sky hue, audioLevel scaling brightness) are all
 * computed upstream in KelvinHelmholtzCloudWaves.vert; this stage blends
 * the baked vCol with the current photo texture and adds a specular
 * sun-glint plus a highlight on freshly-breaking crests (vBillow).
 */

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

void main() {
    vec3 photo = (interpolation * texture(tex0, vUV) + (1.0 - interpolation) * texture(tex1, vUV)).rgb;

    vec3 lightDir = normalize(vec3(0.5, 0.7, -0.4));
    vec3 n = normalize(vNormal);
    float diff = max(dot(n, lightDir), 0.0);

    vec3 col = mix(vCol.rgb, photo * 1.25, 0.45);
    col = col * (0.4 + 0.6 * diff) + vBillow * vec3(1.0, 0.8, 0.4) * 0.8;

    fragColor = vec4(col, 1.0);
}
