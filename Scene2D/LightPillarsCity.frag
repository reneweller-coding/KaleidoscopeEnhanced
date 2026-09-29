#version 330 core
out vec4 fragColor;
/**
 * @file LightPillarsCity.frag
 * @brief LIGHT PILLARS CITY: a winter night so cold that ice crystals hang
 * flat in the air, and every streetlight, sign and floodlight of a small
 * northern city throws a tall column of light straight up into the dark
 * sky -- sodium orange, white, green, the odd magenta -- dozens of pillars
 * of different heights and strengths standing over the snowy rooftops.
 * Snow lies on the roofs and the ground; a few flakes glitter in the air.
 * Each pillar belongs to one pitch class: the harmony lights them.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> the pillars' brightness, each by its pitch class (light)
 *   audioSwell      -> the crystal haze (slow)
 *   audioHigh       -> glitter of the crystals in the air (light)
 *   audioLevel      -> brightness
 *   sceneTime / sceneAdvance -> the slow shimmer of the pillars (continuous)
 *
 * Per-activation variety: pillarsP (how many), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioSwell;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float pillarsP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec3 lampColour(float h)
{
    if (h < 0.5) return vec3(1.0, 0.62, 0.25);        // sodium
    if (h < 0.75) return vec3(0.9, 0.95, 1.0);        // white LED
    if (h < 0.88) return vec3(0.35, 1.0, 0.5);        // green (pharmacy / greenhouse)
    return vec3(1.0, 0.35, 0.8);                      // magenta sign
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;
    int nP = 26 + int(clamp(pillarsP, 0.0, 1.0) * 20.0);

    // Deep cold night sky, a faint bluish haze of crystals low down.
    vec3 col = mix(vec3(0.03, 0.045, 0.09), vec3(0.005, 0.01, 0.03), smoothstep(-0.2, 0.5, p.y));
    col += vec3(0.05, 0.07, 0.12) * exp(-(p.y + 0.2) * 3.0) * (0.6 + 0.6 * swell);
    {
        vec2 g = p * 80.0;
        vec2 gi = floor(g), gf = fract(g);
        vec2 c = 0.25 + 0.5 * vec2(hash21(gi + 1.0), hash21(gi + 2.0));
        col += vec3(0.8, 0.85, 1.0) * smoothstep(0.1, 0.0, length(gf - c)) * step(0.985, hash21(gi)) * smoothstep(0.0, 0.3, p.y) * 0.5;
    }

    float roofY = -0.18;
    // The pillars: vertical columns rising from sources along the skyline,
    // brightest near the source and fading with height; the columns shimmer.
    vec3 pil = vec3(0.0);
    for (int k = 0; k < 46; ++k) {
        if (k >= nP) break;
        float fk = float(k);
        float x = (hash11(fk * 1.31) - 0.5) * aspect * 1.05;
        float depth = hash11(fk * 2.77);                      // 0 near .. 1 far
        float baseY = roofY - 0.02 + 0.06 * depth;
        float hgt = 0.35 + 0.45 * hash11(fk * 3.9);
        float w = mix(0.012, 0.004, depth);
        vec3 lc = lampColour(hash11(fk * 5.3));
        lc = mix(lc, imgPalette(hash11(fk * 7.1) + hue * 0.159) * 1.2, 0.12);
        float e = clamp(audioChroma[k % 12] * 1.5, 0.0, 1.0);
        float dx = abs(p.x - x);
        float up = p.y - baseY;
        float col_ = exp(-dx * dx / (w * w)) * step(0.0, up) * exp(-up / hgt * 1.3);
        col_ *= 0.8 + 0.2 * sin(up * 40.0 - T * 1.5 + fk);       // shimmer
        col_ += exp(-dx * dx / (w * w * 16.0)) * step(0.0, up) * exp(-up / hgt * 2.5) * 0.15;
        float strength = (0.35 + 0.9 * e) * mix(1.0, 0.5, depth);
        pil += lc * col_ * strength;
        // The source: a small bright lamp at the base.
        pil += lc * exp(-dot(p - vec2(x, baseY), p - vec2(x, baseY)) * 60000.0) * 2.0;
    }
    col += pil;

    // The town: rows of roofs with snow, windows lit warm.
    for (int r = 0; r < 3; ++r) {
        float fr = float(r);
        float scale = 14.0 - 4.0 * fr;
        float bx = p.x * scale + fr * 17.0;
        float bi = floor(bx), bf = fract(bx);
        float h = roofY - 0.03 - 0.07 * fr + 0.05 * hash11(bi + fr * 31.0);
        // Pitched roofs.
        float roof = h + (0.5 - abs(bf - 0.5)) * 0.06 * (0.6 + 0.5 * hash11(bi * 3.0 + fr));
        if (p.y < roof) {
            vec3 wall = vec3(0.02, 0.025, 0.04);
            // Windows: small warm rectangles, some lit.
            vec2 wq = vec2(bf * 4.0, (p.y - h) * scale * 3.0);
            vec2 wi = floor(wq), wf = fract(wq);
            float win = step(0.3, wf.x) * step(wf.x, 0.7) * step(0.3, wf.y) * step(wf.y, 0.75) * step(0.55, hash21(wi + bi * 7.0 + fr));
            wall += vec3(1.0, 0.7, 0.35) * win * 0.5 * step(p.y, h - 0.005);
            // Snow on the roof slopes, lit by the pillars' glow.
            float snow = smoothstep(0.012, 0.0, roof - p.y) * step(h, p.y);
            wall = mix(wall, vec3(0.55, 0.6, 0.75) * (0.5 + 0.5 * swell) + pil * 0.3, snow);
            col = wall;
        }
    }
    // Snowy ground in front.
    if (p.y < -0.42) {
        col = vec3(0.12, 0.14, 0.2) * (0.8 + 0.3 * noise2(p * 30.0)) + pil * 0.08;
    }

    // Ice crystals glittering in the air.
    vec2 g = (p + vec2(T * 0.004, -T * 0.006)) * 55.0;
    vec2 gi = floor(g), gf = fract(g);
    vec2 c = 0.25 + 0.5 * vec2(hash21(gi + 5.0), hash21(gi + 9.0));
    float tw = 0.5 + 0.5 * sin(T * 3.0 + hash21(gi) * 30.0);
    col += vec3(0.9, 0.95, 1.0) * smoothstep(0.1, 0.0, length(gf - c)) * step(0.97, hash21(gi + 3.0)) * tw * (0.2 + 0.8 * clamp(audioHigh * 2.0, 0.0, 1.0));

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
