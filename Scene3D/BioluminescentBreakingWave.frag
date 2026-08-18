#version 330 core
out vec4 fragColor;
/**
 * @file BioluminescentBreakingWave.frag
 * @brief BIOLUMINESCENT BREAKING WAVE: rolling Gerstner swell seen from above the
 * surf line; the crests break into glowing dinoflagellate foam CELLS (not a
 * full-width neon bar), dark troughs carry the photo tint.
 *   audioBass -> swell height    audioKick -> breaker splash + glow surge
 *   audioHigh -> cross-chop      audioAdvance -> wave phase (jump-free)
 */

in vec4 vCol;
in vec2 vUV;
in vec3 vNormal;
in float vBioGlow;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

void main() {
    vec3 photo = (interpolation * texture(tex0, vUV) + (1.0 - interpolation) * texture(tex1, vUV)).rgb;

    // Specular water reflection
    vec3 lightDir = normalize(vec3(0.3, 0.9, -0.4));
    vec3 n = normalize(vNormal);
    float spec = pow(max(dot(reflect(-lightDir, n), vec3(0, 0, 1)), 0.0), 32.0);

    vec3 col = mix(vCol.rgb, photo * 1.2, 0.45);
    col += pow(vBioGlow, 1.8) * vec3(0.1, 0.95, 1.0) * 1.0;
    col += spec * vec3(0.9, 0.95, 1.0);

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.5;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
