#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).

in vec4 vCol;   ///< Colour (from the vertex stage).
in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec3 vWorldPos;   ///< World position (from the vertex stage).

/**
 * @file CrystalMonoliths.frag
 * @brief Lighting for orbiting obsidian and prismatic-glass monolith slabs:
 * maps a slideshow photo through the crystal as refracted light, adds a
 * bright rim glow at each facet's border, and a sharp specular highlight
 * off a fixed key light.
 *
 * The monoliths' motion and base colour (orbit radius/speed, kick expansion,
 * hue) are computed upstream in CrystalMonoliths.vert from audioAdvance,
 * audioKick and audioSwell and passed in through vCol; this fragment stage
 * only re-lights that colour with the current photo (tex0/tex1, cross-faded
 * by interpolation) and a glass-like specular/edge treatment.
 */

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    // Glass refraction photo mapping
    vec3 photo = (interpolation * texture(tex0, vUV) + (1.0 - interpolation) * texture(tex1, vUV)).rgb;

    // Prismatic facet border glow
    vec2 edge = smoothstep(0.42, 0.49, abs(vUV - 0.5));
    float edgeGlow = max(edge.x, edge.y);

    // Specular glass reflection
    vec3 n = normalize(vNormal);
    vec3 lightDir = normalize(vec3(0.5, 0.9, -0.6));
    vec3 viewDir = normalize(-vWorldPos);
    vec3 refl = reflect(-lightDir, n);
    float spec = pow(max(dot(viewDir, refl), 0.0), 32.0);

    vec3 col = mix(vCol.rgb * 0.4, photo * 1.5, 0.7);
    col += edgeGlow * vCol.rgb * 2.0;
    col += spec * vec3(1.0, 1.0, 1.0);

    fragColor = vec4(col, 1.0);
}
