#version 330 core
out vec4 fragColor;
/**
 * @file BioluminescentBreakingWave.frag
 * @brief BIOLUMINESCENT BREAKING WAVE: rolling Gerstner swell seen from above the
 * surf line; the crests break into glowing dinoflagellate foam CELLS (not a
 * full-width neon bar), dark troughs carry the photo tint.
 *
 * Audio Reactivity:
 *   audioBass      -> swell / crest height
 *   audioKick      -> breaker splash + bio-glow surge
 *   audioHigh      -> cross-chop ripple
 *   audioAdvance   -> wave phase (pre-integrated, jump-free)
 *   audioZCR       -> grain of the foam: hiss shatters the long foam rolls
 *                     into fine scattered cells, a pure tone leaves them whole
 *   audioLowMid    -> deep swell body lifting the whole water column
 *   audioSharpness -> crispness of the specular water glitter (dull = broad
 *                     sheen, cymbal-bright = tight hard sparkles)
 */

in vec4 vCol;
in vec2 vUV;
in vec3 vNormal;
in float vBioGlow;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioSharpness;   // Zwicker HF loudness: 0 = dull, 1 = cymbal-bright

void main() {
    vec3 photo = (interpolation * texture(tex0, vUV) + (1.0 - interpolation) * texture(tex1, vUV)).rgb;

    // Specular water reflection — Zwicker sharpness sets how CRISP the glitter
    // is: dull material spreads a broad soft sheen over the swell, bright
    // cymbal-rich material pulls it into tight hard sparkles.  Only the
    // exponent moves, so the highlight never gets brighter than it already is.
    vec3 lightDir = normalize(vec3(0.3, 0.9, -0.4));
    vec3 n = normalize(vNormal);
    float shrp = clamp(audioSharpness, 0.0, 1.0);
    float specPow  = mix(16.0, 64.0, shrp);
    float specGain = mix(0.55, 1.0, shrp);   // wide sheen stays dim, tight glint burns
    float spec = pow(max(dot(reflect(-lightDir, n), vec3(0, 0, 1)), 0.0), specPow) * specGain;

    vec3 col = mix(vCol.rgb, photo * 1.2, 0.45);
    col += pow(vBioGlow, 1.8) * vec3(0.1, 0.95, 1.0) * 1.0;
    col += spec * vec3(0.9, 0.95, 1.0);

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.5;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
