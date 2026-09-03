#version 330 core
out vec4 fragColor;
/**
 * @file SilenceSnowfallHush.frag
 * @brief SILENCE SNOWFALL HUSH: a quiet street at night (the photo), snow
 * falling as round flakes on the scene clock.  When the music is quiet
 * the snow settles: the cover grows, the picture whitens and cools, the
 * street lamps get their halos; loud passages melt it again -- all of it
 * on the swell, slow, never on a beat.  The kick is only a faint flicker
 * of the lamps.  Camera fixed on the street.
 *
 * Audio Reactivity:
 *   audioSwell   -> snow cover and flake density (slow, inverted: quiet = snow)
 *   sceneAdvance -> the flakes fall (continuous)
 *   audioKick    -> lamp flicker (light, faint)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: flakeP, lampsP, hueP.
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
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float flakeP;
uniform float lampsP;
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
float noise(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; ++i) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float flakeSize = 0.7 + 0.6 * clamp(flakeP, 0.0, 1.0);
    float lamps = 2.0 + floor(clamp(lampsP, 0.0, 1.0) * 3.0);
    float quiet = 1.0 - clamp(audioSwell, 0.0, 1.0);                    // the hush
    float cover = smoothstep(0.1, 0.9, quiet);
    float fall = sceneAdvance * 0.35 + sceneTime * 0.07;

    // The street: the photo at night, cooled and desaturated as the hush deepens.
    vec3 photo = img(uv);
    float lum = dot(photo, vec3(0.299, 0.587, 0.114));
    vec3 street = mix(photo, vec3(lum), 0.3 + 0.5 * cover) * mix(vec3(0.9, 0.85, 0.8), vec3(0.75, 0.85, 1.05), cover);
    street *= 0.35 + 0.25 * (1.0 - cover);
    // Snow cover: settles on the bright upward-facing parts (a luminance
    // test stands in for horizontal surfaces) and in a noise pattern that
    // grows with the cover.
    float n = fbm(p * 6.0 + vec2(3.1, 7.7));
    float up = smoothstep(0.35, 0.65, lum);
    float snowMask = smoothstep(0.0, 0.5, cover * (0.5 + 0.5 * n) + up * cover * 0.6 - 0.25);
    vec3 snowCol = vec3(0.92, 0.94, 1.0) * (0.5 + 0.5 * n);
    vec3 col = mix(street, snowCol * (0.6 + 0.4 * cover), snowMask * 0.85);
    // Street lamps: warm halos in the upper half, brighter in the hush (snow scatters light), a faint flicker on the kick.
    for (int i = 0; i < 5; ++i)
    {
        if (float(i) >= lamps) break;
        float fi = float(i);
        vec2 lp = vec2((hash11(fi * 3.7 + 1.0) - 0.5) * aspect * 0.9, 0.05 + 0.3 * hash11(fi * 5.1 + 2.0));
        float d = length(p - lp);
        vec3 lc = mix(vec3(1.0, 0.8, 0.5), imgPalette(hue * 0.159 + fi * 0.2) * 1.3, 0.35);
        float flick = 1.0 - 0.08 * audioKick * step(0.5, hash11(fi * 9.3));
        col += lc * (smoothstep(0.02, 0.008, d) * 1.5 + exp(-d * 6.0) * (0.15 + 0.45 * cover)) * flick;
        // The post.
        col = mix(col, vec3(0.05), smoothstep(0.006, 0.003, abs(p.x - lp.x)) * step(p.y, lp.y - 0.02) * step(-0.5, p.y) * 0.8);
    }
    // The flakes: three layers of round jittered dots falling on the clock,
    // drifting sideways slowly; their density is the hush.
    for (int layer = 0; layer < 3; ++layer)
    {
        float fl = float(layer);
        float scale = 14.0 + fl * 10.0;
        float speed = 0.6 - fl * 0.12;
        vec2 g = vec2(p.x + sin(fall * 0.7 + fl) * 0.05, p.y + fall * speed) * scale + fl * 31.0;
        vec2 c = floor(g);
        vec2 f = fract(g) - 0.5;
        vec2 jit = vec2(hash21(c + 1.3), hash21(c + 5.9)) - 0.5;
        float r = length(f - jit * 0.7);
        float sz = (0.16 - fl * 0.03) * flakeSize;
        float flake = smoothstep(sz, sz * 0.4, r);
        float present = smoothstep(1.0 - 0.7 * cover - 0.05, 1.0 - 0.7 * cover + 0.05, hash21(c + 9.1));
        col += vec3(0.95, 0.97, 1.0) * flake * present * (0.7 - fl * 0.15);
    }
    // The hush: a soft vignette and a cool bloom as the cover grows.
    col *= 0.85 + 0.15 * (1.0 - length(p) * 0.7);
    col += vec3(0.05, 0.07, 0.1) * cover;
    col *= 0.8 + 0.4 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
