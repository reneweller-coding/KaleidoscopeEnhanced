#version 330 core
out vec4 fragColor;
/**
 * @file SuperbloomOpening.frag
 * @brief SUPERBLOOM OPENING: a desert valley carpeted in wildflowers that
 * open with the light.  Each flower is a ring of round petals about a
 * centre of the photo; the petals unfold smoothly with the swell (the sun),
 * colours from the chroma classes (a class per patch of ground), bees
 * (round) visit on the scene clock, the kick is a gust that ripples the
 * carpet as light, the treble the pollen glitter.  Camera fixed low over
 * the field.
 *
 * Audio Reactivity:
 *   audioSwell      -> petals opening (slow)
 *   audioChroma[12] -> flower colour brightness by patch (light)
 *   sceneAdvance    -> bees, sway (continuous)
 *   audioKick       -> gust ripple (light)
 *   audioHigh       -> pollen glitter (light)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: densP, sizeP, hueP.
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
uniform float audioChroma[12];
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float densP;
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
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float dens = 9.0 + 6.0 * clamp(densP, 0.0, 1.0);
    float sizeF = 0.7 + 0.5 * clamp(sizeP, 0.0, 1.0);
    float open = clamp(audioSwell, 0.0, 1.0);
    float sun = 0.6 + 0.6 * open;
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;
    float horizon = 0.25;

    // Sky and far hills: the photo top, warm.
    vec3 sky = img(vec2(p.x / aspect + 0.5, 0.7 + (p.y - horizon) * 0.5)) * mix(vec3(0.8, 0.9, 1.0), imgPalette(hue * 0.159 + 0.6), 0.25) * sun;
    vec3 col = sky;
    if (p.y < horizon)
    {
        // The field in perspective: rows recede toward the horizon.
        float d = horizon - p.y;
        float persp = 1.0 / max(d * 3.0, 0.15);
        vec2 f = vec2(p.x * persp * 2.0, persp * 1.5 + 0.0);
        // Ground: dry desert soil from the photo, greening with the bloom.
        vec3 soil = (img(fract(f * 0.15)) * 0.35 + 0.45) * mix(vec3(0.9, 0.75, 0.5), imgPalette(hue * 0.159 + 0.1), 0.25) * sun;   // little photo share: the tiling must not show
        soil = mix(soil, soil * vec3(0.7, 1.0, 0.6), open * 0.5);
        col = soil;
        // Flowers: a jittered grid in field space; each a ring of round
        // petals that open with the sun; the patch (coarse cell) picks the
        // chroma class; near flowers larger.
        vec2 gu = f * dens * 0.35; vec2 cell = floor(gu); vec2 ff = fract(gu) - 0.5;
        vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
        vec2 fq = ff - off * 0.6;
        int k = int(mod(floor(cell.x * 0.31 + cell.y * 0.47) * 5.0, 12.0));
        float e = clamp(audioChroma[k] * 1.5, 0.0, 1.0);
        vec3 petalCol = (mix(imgPalette(hue * 0.159 + float(k) / 12.0) * 1.6, vec3(1.0, 0.85, 0.3), 0.25) + 0.3) * (0.7 + 0.6 * e);
        float scale = 0.3 * sizeF;
        float spread = 0.6 + 0.4 * smoothstep(0.0, 1.0, open);           // petals unfold outward (never fully closed)
        float sway = 0.03 * sin(clock * 1.5 + cell.x + cell.y);      // the gust is light only (V7d)
        fq += vec2(sway, 0.0);
        float petals = 0.0;
        for (int i = 0; i < 6; ++i)
        {
            float a = float(i) / 6.0 * 6.2831853 + hash21(cell) * 6.28;
            vec2 pc = vec2(cos(a), sin(a)) * scale * spread;
            petals = max(petals, smoothstep(scale * 0.55, scale * 0.35, length(fq - pc)));
        }
        float centre = smoothstep(scale * 0.3, scale * 0.2, length(fq));
        float has = step(0.15, hash21(cell + 1.1));
        vec3 centreCol = img(fract(cell * 0.07)) * 1.2 * vec3(1.0, 0.9, 0.5);
        col = mix(col, petalCol * (0.7 + 0.3 * (1.0 - length(fq) / scale)) * sun, petals * has);
        col = mix(col, centreCol * sun, centre * has);
        // Pollen glitter on the treble.
        col += vec3(1.0, 0.95, 0.6) * centre * has * hi * 0.6;
        // Bees: round dots moving on the clock over the near field.
        for (int b = 0; b < 4; ++b)
        {
            float fb = float(b);
            vec2 bp = vec2((fract(clock * (0.08 + 0.05 * hash11(fb * 3.1)) + hash11(fb * 5.3)) - 0.5) * aspect * 1.2, horizon - 0.15 - 0.3 * hash11(fb * 7.7) + 0.02 * sin(clock * 5.0 + fb));
            float bee = smoothstep(0.012, 0.006, length(p - bp));
            col = mix(col, vec3(0.9, 0.7, 0.1), bee);
            col = mix(col, vec3(0.1), bee * step(0.5, fract((p.x - bp.x) * 150.0)));
        }
        // Distance haze.
        col = mix(col, sky, smoothstep(0.0, 0.2, d) * 0.0 + smoothstep(0.25, 0.0, d) * 0.35);
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
