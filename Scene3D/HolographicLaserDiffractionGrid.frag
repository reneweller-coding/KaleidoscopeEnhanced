#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).

in vec4 vCol;   ///< Colour (from the vertex stage).
in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec3 vWorldPos;   ///< World position (from the vertex stage).

/**
 * @file HolographicLaserDiffractionGrid.frag
 * @brief Shades a holographic diffraction-grating surface: a sine-wave
 * interference grating in UV space picks out bright fringe lines, blended
 * with the current slideshow photo, plus a sharp specular "laser" glint
 * from a fixed light direction.
 *
 * This fragment shader declares no audio uniforms directly; its base color
 * and fringe tint (vCol) are computed per-vertex by the companion vertex
 * shader, so any audio reactivity arrives already baked into that
 * per-vertex color.
 */

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vec3 photo = (interpolation * texture(tex0, vUV) + (1.0 - interpolation) * texture(tex1, vUV)).rgb;

    // Holographic diffraction grating line pattern
    vec2 p = vUV * 25.0;
    float grating = sin(p.x) * sin(p.y);
    float fringe = smoothstep(0.6, 0.95, abs(grating));

    // Specular laser glint
    vec3 n = normalize(vNormal);
    vec3 lightDir = normalize(vec3(0.3, 0.8, -0.5));
    vec3 viewDir = normalize(-vWorldPos);
    float spec = pow(max(dot(viewDir, reflect(-lightDir, n)), 0.0), 32.0);

    vec3 col = mix(vCol.rgb * 0.45, photo * 1.4, 0.65);
    col += fringe * vCol.rgb * 1.6;
    col += spec * vec3(1.0, 1.0, 1.0);

    fragColor = vec4(col, 1.0);
}
