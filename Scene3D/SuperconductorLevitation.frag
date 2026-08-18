#version 330 core
out vec4 fragColor;

in vec4 vCol;
in vec3 vNormal;
in vec3 vWorldPos;
in vec2 vUV;

/**
 * @file SuperconductorLevitation.frag
 * @brief Lights the 70x70 field of levitating superconductor tiles from
 * SuperconductorLevitation.vert as metallic plates: a directional key light
 * plus specular highlight, a glowing grid-edge trim per tile, and the
 * current slideshow photo reflected faintly across each tile's top face.
 *
 * This fragment stage itself reads no audio uniforms; the tiles' levitation
 * height, tilt, and per-tile colour (audioSpectrum band level, audioKick
 * magnetic shockwave, audioChromaHue/hueP rotation) are all computed in the
 * companion vertex shader and arrive pre-baked in vCol, so here audio only
 * shows through as whatever normal/position that vertex work already
 * produced.
 */

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float time;

void main() {
    // Lighting for metallic superconductor tiles
    vec3 lightDir = normalize(vec3(0.6, 0.9, -0.4));
    vec3 n = normalize(vNormal);
    float diff = max(dot(n, lightDir), 0.0) * 0.7 + 0.3;

    // Specular highlight
    vec3 viewDir = normalize(-vWorldPos);
    vec3 refl = reflect(-lightDir, n);
    float spec = pow(max(dot(viewDir, refl), 0.0), 32.0) * 0.8;

    // Grid edge trim on tile
    vec2 edge = smoothstep(0.42, 0.48, abs(vUV - 0.5));
    float edgeGlow = max(edge.x, edge.y);

    // Sample texture on top face
    vec3 photo = (interpolation * texture(tex0, vUV) + (1.0 - interpolation) * texture(tex1, vUV)).rgb;

    vec3 col = vCol.rgb * diff + spec * vec3(1.0, 1.0, 1.0);
    col += photo * 0.3 * step(0.8, n.y);
    col += edgeGlow * vCol.rgb * 1.5;

    fragColor = vec4(col, 1.0);
}
