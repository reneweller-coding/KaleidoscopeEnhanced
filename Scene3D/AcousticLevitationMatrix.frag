#version 330 core
out vec4 fragColor;

in vec4 vCol;
in vec2 vUV;
in vec3 vNormal;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

/**
 * @file AcousticLevitationMatrix.frag
 * @brief Lit voxel cubes levitated in an acoustic standing-wave grid, each
 * face a blend of a per-vertex colour and the current slideshow photo with a
 * fixed-direction diffuse/specular highlight.
 *
 * This fragment shader carries no audio uniforms of its own -- reactivity
 * (how the cubes jump, cluster and resonate with the beat) lives entirely in
 * the companion vertex shader; here only the incoming vCol (already
 * audio-modulated per vertex) and vNormal/vUV feed the lighting and photo
 * blend.
 *
 * vCol.a carries the vertex stage's per-primitive brightness: 1.0 down to 0.42
 * for voxels fading into the depth of the trap, ~0.26 for the far transducer
 * panel wall that fills the space between them.
 */

void main() {
    vec3 photo = (interpolation * texture(tex0, vUV) + (1.0 - interpolation) * texture(tex1, vUV)).rgb;

    // Specular highlight on resonant voxel cube
    vec3 lightDir = normalize(vec3(0.5, 0.9, -0.4));
    vec3 n = normalize(vNormal);
    float diff = max(dot(n, lightDir), 0.0);
    float spec = pow(max(dot(reflect(-lightDir, n), vec3(0, 0, 1)), 0.0), 16.0);

    vec3 col = mix(vCol.rgb * 0.4, photo * 1.3, 0.7);
    col = col * (0.4 + 0.6 * diff) + spec * vec3(1.0, 0.98, 0.9);
    col *= vCol.a;

    // Highlight rolloff: a frame this much fuller must not clip to white.
    float m = max(col.r, max(col.g, col.b));
    col *= 1.0 / (1.0 + max(0.0, m - 0.78));

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
