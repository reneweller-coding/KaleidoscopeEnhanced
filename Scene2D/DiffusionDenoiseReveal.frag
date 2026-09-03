#version 330 core
out vec4 fragColor;
/**
 * @file DiffusionDenoiseReveal.frag
 * @brief DIFFUSION DENOISE REVEAL: a diffusion model sampling, as a
 * picture.  Each phrase begins as pure Gaussian noise and, step by step,
 * the photo emerges from it (the noise level falls with the phrase
 * position; the blend is smooth), the way a generated image resolves; at
 * the phrase end the image is re-noised with a soft crossfade and the next
 * phrase resolves it again.  The drop finishes the reveal at once.  A
 * faint grid of the latent patches shows through; the kick lights the
 * patch edges; the treble adds the high-frequency detail last, as the
 * real thing does.  Camera still.
 *
 * Audio Reactivity:
 *   audioPhrasePos -> noise level (smooth reveal per phrase)
 *   audioDrop      -> instant full reveal (the drop)
 *   audioHigh      -> fine detail (light)
 *   audioKick      -> patch-grid flash (light)
 *   audioLevel     -> brightness
 *
 * Per-activation variety: grainP, patchP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioPhrasePos;
uniform float audioDrop;
uniform float audioHigh;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float grainP;
uniform float patchP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// Approximately Gaussian noise from a sum of uniforms, per cell and seed.
float gauss(vec2 cell, float seed)
{
    return (hash21(cell + seed) + hash21(cell + seed + 7.1) + hash21(cell + seed + 13.7) + hash21(cell + seed + 21.3) - 2.0) * 0.9;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);
    vec2 uv = gl_FragCoord.xy / resolution;

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float grain = 180.0 + 220.0 * clamp(grainP, 0.0, 1.0);
    float patches = 8.0 + 8.0 * clamp(patchP, 0.0, 1.0);
    float pos = clamp(audioPhrasePos, 0.0, 1.0);
    float drop = clamp(audioDrop, 0.0, 1.0);
    // Noise level: 1 at the phrase start, falling to 0; re-noised at the end
    // with a soft ramp so the wrap is a crossfade, not a cut; the drop
    // pushes it to 0.
    float sigma = (1.0 - smoothstep(0.0, 0.85, pos)) * (1.0 - smoothstep(0.85, 1.0, pos)) + smoothstep(0.85, 1.0, pos) * smoothstep(1.0, 0.85, pos) * 0.0;
    sigma = mix(sigma, 1.0, smoothstep(0.9, 1.0, pos));      // ramp back up at the very end
    sigma *= 1.0 - drop;
    // The image resolves coarse to fine: at high sigma only the coarse mip
    // survives; the fine detail arrives last (and with the treble).
    float lod = sigma * 5.0;
    vec3 coarse = (interpolation * textureLod(tex0, uv, lod) + (1.0 - interpolation) * textureLod(tex1, uv, lod)).rgb;
    vec3 fine = img(uv);
    float detail = (1.0 - sigma) * (0.8 + 0.2 * clamp(audioHigh * 2.0, 0.0, 1.0));
    vec3 image = mix(coarse, fine, detail);
    image = mix(image, image * imgPalette(hue * 0.159 + 0.5) * 1.5, 0.15);
    // Noise: per-pixel Gaussian, the seed drifting slowly so it shimmers
    // but does not strobe.
    vec2 cell = floor(uv * vec2(grain * aspect, grain));
    float seed = floor(sceneAdvance * 2.0) * 0.37;
    float seedF = fract(sceneAdvance * 2.0);
    vec3 n0 = vec3(gauss(cell, seed), gauss(cell + 31.0, seed), gauss(cell + 57.0, seed));
    vec3 n1 = vec3(gauss(cell, seed + 0.37), gauss(cell + 31.0, seed + 0.37), gauss(cell + 57.0, seed + 0.37));
    vec3 noise = mix(n0, n1, smoothstep(0.0, 1.0, seedF)) * 0.5 + 0.5;
    noise = mix(vec3(dot(noise, vec3(0.333))), noise, 0.6);
    // The diffusion blend: sqrt(1 - s^2) image + s noise (variance-preserving).
    float s = sigma;
    vec3 col = image * sqrt(max(1.0 - s * s, 0.0)) + noise * s;
    // The latent patch grid, faint, flashing on the kick.
    vec2 pg = abs(fract(uv * vec2(patches * aspect, patches)) - 0.5);
    float grid = smoothstep(0.02, 0.0, min(pg.x, pg.y) - 0.48);
    col += imgPalette(hue * 0.159 + 0.9) * grid * (0.03 + 0.4 * audioKick) * (0.3 + 0.7 * sigma);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
