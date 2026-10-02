#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).

in vec4 vCol;   ///< Colour (from the vertex stage).
in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in float vInterference;

/**
 * @file MoireHyperInterference.frag
 * @brief Shades the 220x120 heightfield of optical Moire superlattice
 * fringes built in MoireHyperInterference.vert: the baked interference
 * palette blended with the current photo, a fixed-light specular
 * highlight, and an amber glow where the two gratings' beat pattern
 * (vInterference) is strongest.
 *
 * All audio response (grating rotation speed, beat-frequency depth,
 * kick elevation, hue rotation) is computed upstream in the vertex
 * stage and arrives baked in vCol/vInterference; this fragment stage
 * itself reads no audio uniforms directly.
 */

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vec3 photo = (interpolation * texture(tex0, vUV) + (1.0 - interpolation) * texture(tex1, vUV)).rgb;

    vec3 lightDir = normalize(vec3(0.4, 0.9, -0.5));
    vec3 n = normalize(vNormal);
    float spec = pow(max(dot(reflect(-lightDir, n), vec3(0, 0, 1)), 0.0), 24.0);

    vec3 col = mix(vCol.rgb * 0.45, photo * 1.3, 0.6);
    col += vInterference * vec3(1.0, 0.9, 0.3) * 1.2;
    col += spec * vec3(1.0, 1.0, 1.0);

    fragColor = vec4(col, 1.0);
}
