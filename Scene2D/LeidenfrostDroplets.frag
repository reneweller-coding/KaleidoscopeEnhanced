#version 330 core
out vec4 fragColor;
/**
 * @file LeidenfrostDroplets.frag
 * @brief LEIDENFROST DROPLETS: water on a plate far above its boiling
 * point -- the drops ride their own vapour and skitter about, frictionless,
 * for a long time.  Round droplets glide on smooth paths (sums of sines
 * on the scene clock), each shrinking over its life and reborn; a vapour
 * halo glows beneath each with the swell; the plate is the photo, red-hot
 * with the bass; the treble glints on the drops.  Camera fixed over the plate.
 *
 * Audio Reactivity:
 *   sceneAdvance -> skittering paths and life phases (continuous)
 *   audioSwell   -> vapour halo (slow)
 *   audioBass    -> plate heat glow (light)
 *   audioHigh    -> drop glints (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: countP, sizeP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioBass;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float countP;
uniform float sizeP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    int nDrops = 10 + int(clamp(countP, 0.0, 1.0) * 14.0);
    float baseSize = 0.03 + 0.03 * clamp(sizeP, 0.0, 1.0);
    float heat = clamp(audioBass, 0.0, 1.0);
    float vapour = 0.3 + 0.9 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.7 + sceneTime * 0.15;

    // The plate: the photo as brushed steel, glowing red-hot with the bass
    // from the centre outward.
    vec3 plate = img(gl_FragCoord.xy / resolution) * 0.7;
    plate = mix(plate, vec3(dot(plate, vec3(0.333))), 0.5) * 0.9;
    plate *= 0.85 + 0.15 * sin(p.y * 400.0);                       // brushing
    vec3 glow = mix(vec3(1.0, 0.25, 0.05), imgPalette(hue * 0.159 + 0.05), 0.3);
    float hot = exp(-length(p) * 1.5) * (0.25 + 0.9 * heat);
    vec3 col = plate + glow * hot;

    for (int i = 0; i < 24; ++i)
    {
        if (i >= nDrops) break;
        float fi = float(i);
        vec3 h = vec3(hash11(fi * 3.1), hash11(fi * 5.7), hash11(fi * 9.3));
        // Life: the drop shrinks over its phase and is reborn.
        float life = fract(clock * (0.08 + 0.06 * h.z) + h.x);
        float sz = baseSize * (1.2 - 0.9 * life) * (0.7 + 0.6 * h.y);
        // Path: a smooth wander -- sums of sines with incommensurate rates.
        vec2 c = vec2(0.45 * aspect * sin(clock * (0.31 + 0.2 * h.x) + h.y * 6.28) + 0.2 * sin(clock * 0.9 + fi),
                      0.42 * sin(clock * (0.27 + 0.22 * h.y) + h.z * 6.28) + 0.15 * cos(clock * 1.1 + fi * 2.0));
        float d = length(p - c);
        // Vapour halo under the drop.
        float halo = exp(-d / (sz * 2.5)) * vapour;
        col += vec3(0.8, 0.85, 0.9) * halo * 0.25;
        // The drop: a round lens -- the plate seen through it, magnified and
        // rimmed, with a highlight; glints with the treble.
        float disc = smoothstep(sz, sz * 0.9, d);
        vec2 lensUV = gl_FragCoord.xy / resolution + (p - c) * 0.6;
        vec3 through = img(clamp(lensUV, 0.0, 1.0)) * 0.9 + glow * hot * 0.5;
        float rim = smoothstep(sz * 0.7, sz, d);
        vec3 dropCol = mix(through, vec3(0.9, 0.95, 1.0), rim * 0.6);
        dropCol += vec3(1.0) * pow(max(1.0 - length(p - c - vec2(-0.3, 0.3) * sz) / (sz * 0.5), 0.0), 2.0) * (0.5 + 0.9 * clamp(audioHigh * 2.0, 0.0, 1.0));
        col = mix(col, dropCol, disc);
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
