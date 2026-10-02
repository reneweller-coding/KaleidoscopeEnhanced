#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).

in vec4 vCol;   ///< Colour (from the vertex stage).
in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
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

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vec3 photo = (interpolation * texture(tex0, vUV) + (1.0 - interpolation) * texture(tex1, vUV)).rgb;

    vec3 lightDir = normalize(vec3(0.5, 0.7, -0.4));
    vec3 n = normalize(vNormal);
    float diff = max(dot(n, lightDir), 0.0);

    vec3 col = mix(vCol.rgb, photo * 1.25, 0.45);
    col = col * (0.4 + 0.6 * diff) + vBillow * vec3(1.0, 0.8, 0.4) * 0.8;

    fragColor = vec4(col, 1.0);
}
