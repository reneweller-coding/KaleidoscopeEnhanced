#version 330 core
out vec4 fragColor;
/**
 * @file GranularCloudSynth.frag
 * @brief GRANULAR CLOUD SYNTH: a cloud of grains scattered over the
 * scrolling spectrogram -- each grain a round snippet of the photo at its
 * pitch height (the band on the y axis), drifting left with the history on
 * the scene clock, its brightness the energy of its band; the density of
 * the cloud rises with the swell (grains fade in by a smooth threshold),
 * the treble is the grain sparkle, the kick a pulse of the grain rims.
 * Camera fixed on the cloud.
 *
 * Audio Reactivity:
 *   texSpectro        -> the waterfall behind the grains (history)
 *   audioSpectrum[32] -> grain brightness by band (light)
 *   audioSwell        -> grain density (slow, smooth threshold)
 *   audioHigh         -> sparkle (light)
 *   audioKick         -> rim pulse (light)
 *   sceneAdvance      -> drift (continuous)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: grainP (size), spreadP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform sampler2D texSpectro;
uniform float spectroHead;
uniform float spectroFill;
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioHigh;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float grainP;
uniform float spreadP;
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

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float grainSize = 0.03 + 0.03 * clamp(grainP, 0.0, 1.0);
    float spread = 0.4 + 0.6 * clamp(spreadP, 0.0, 1.0);
    float density = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float drift = sceneAdvance * 0.12 + sceneTime * 0.025;

    // The waterfall behind: the spectrogram history, newest at the right,
    // bands upward, in the palette; dark and soft.
    float age = 1.0 - uv.x;                                            // right edge = now
    float band = uv.y;
    float e = texture(texSpectro, vec2(band * (31.0 / 32.0) + 0.5 / 32.0, fract(spectroHead - age * 0.6))).r;
    vec3 col = imgPalette(hue * 0.159 + band * 0.5) * clamp(e * 1.4, 0.0, 1.0) * 0.7;
    col += img(uv) * 0.05;
    col *= 0.6 + 0.4 * (1.0 - age);
    // Faint band lines.
    col += vec3(0.04) * pow(0.5 + 0.5 * cos(uv.y * 32.0 * 6.2831853), 30.0);
    // The grains: three layers of jittered cells drifting left, each grain
    // a round photo disc; a grain exists where its hash is under the
    // density (smooth threshold), its brightness the band energy at its y.
    for (int layer = 0; layer < 3; ++layer)
    {
        float fl = float(layer);
        float scale = 7.0 + fl * 4.0;
        vec2 g = vec2(p.x * spread + drift * (0.6 + fl * 0.35), p.y) * scale + fl * 17.3;
        vec2 c = floor(g);
        vec2 f = fract(g) - 0.5;
        float h = hash21(c + fl * 3.7);
        vec2 jit = vec2(hash21(c + 1.3), hash21(c + 5.9)) - 0.5;
        vec2 q = f - jit * 0.7;
        float r = length(q) / scale;                                   // metric radius
        float size = grainSize * (0.6 + 0.8 * hash21(c + 9.1)) * (1.0 - fl * 0.2);
        // Existence: a smooth window of the hash against the density.
        float exist = smoothstep(h - 0.15, h + 0.05, 0.35 + 0.65 * density);
        // The band at the grain centre (pitch on y), its energy.
        float gy = (c.y + 0.5 + jit.y * 0.7) / scale;
        int b = int(clamp((gy + 0.5) * 31.0, 0.0, 31.0));
        float en = clamp(audioSpectrum[b] * 1.6, 0.0, 1.0);
        // The photo snippet: a small window of the photo per grain.
        vec2 snip = vec2(hash21(c + 2.2), hash21(c + 7.7));
        vec3 face = img(clamp(snip + q / scale / size * 0.12, 0.0, 1.0)) * mix(vec3(1.0), imgPalette(hue * 0.159 + gy * 0.5 + 0.5), 0.5) * 1.5;
        float disc = smoothstep(size, size * 0.8, r);
        float bright = (0.5 + 0.9 * en) * exist;
        col = mix(col, face * bright + 0.02, disc * exist);
        // The rim: pulses on the kick; the sparkle on the treble.
        float rim = smoothstep(0.004, 0.0, abs(r - size)) * exist;
        col += imgPalette(hue * 0.159 + gy * 0.5 + 0.5) * rim * (0.25 + 0.9 * audioKick) * (0.3 + en);
        float sparkle = smoothstep(size * 0.35, 0.0, length(q / scale - vec2(size * 0.3, size * 0.3))) * exist;
        col += vec3(1.0) * sparkle * hi * 0.8 * step(0.6, hash21(c + 4.4));
        // A soft glow behind the loud grains.
        col += imgPalette(hue * 0.159 + gy * 0.5 + 0.5) * exp(-r / size * 2.5) * en * exist * 0.25;
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
