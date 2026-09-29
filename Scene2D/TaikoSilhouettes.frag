#version 330 core
out vec4 fragColor;
/**
 * @file TaikoSilhouettes.frag
 * @brief TAIKO SILHOUETTES: a taiko ensemble on a dark stage, backlit.  A row
 * of drummers stands before the drums -- the great odaiko in the middle on
 * its stand, smaller shime and chu-daiko to either side -- their bodies
 * black cut-outs against a deep red backdrop, raised arms holding the
 * bachi.  Haze hangs in the stage light.  The picture is still: the drum
 * strikes are pure light -- every kick lights the skins and throws a flash
 * of warm light through the haze from behind the drums, the bass warms
 * the backdrop, and the snare catches the rim lights.
 *
 * Audio Reactivity:
 *   audioKick   -> the drum skins flash and light the haze (light only)
 *   audioBass   -> the backdrop's glow (light)
 *   audioSnare  -> rim lights on the drummers (light)
 *   audioSwell  -> the haze (slow)
 *   audioLevel  -> brightness
 *
 * Per-activation variety: drummersP (how many), hueP (backdrop colour).
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioSnare;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float drummersP;
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
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}
float sdSeg(vec2 p, vec2 a, vec2 b)
{
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

// A drummer from behind the drum: legs apart, torso, head with a headband,
// both arms raised holding sticks.  Pose varies per drummer (fixed).
float drummer(vec2 q, float s, float pose)
{
    q /= s;
    float d = 1e9;
    // Hakama: wide pleated trousers, a trapezoid flaring to the floor.
    float hw = mix(0.34, 0.2, clamp(q.y / 0.5, 0.0, 1.0));
    d = min(d, max(abs(q.x) - hw, abs(q.y - 0.25) - 0.25));
    // Torso: broad shoulders tapering to the waist.
    float tw = mix(0.17, 0.24, clamp((q.y - 0.5) / 0.4, 0.0, 1.0));
    d = min(d, max(abs(q.x) - tw, abs(q.y - 0.72) - 0.22) - 0.02);
    // Hachimaki tails fluttering from the back of the head.
    d = min(d, sdSeg(q, vec2(0.1, 1.08), vec2(0.2, 1.02 + 0.04 * pose)) - 0.02);
    d = min(d, length(q - vec2(0.0, 1.06)) - 0.11);                         // head
    d = min(d, sdSeg(q, vec2(0.0, 0.9), vec2(0.0, 1.0)) - 0.06);            // neck
    // Arms: one high, one out; sticks continuing from the hands.
    vec2 sh1 = vec2(-0.2, 0.9), sh2 = vec2(0.2, 0.9);
    vec2 h1 = sh1 + vec2(-0.25 - 0.1 * pose, 0.45 + 0.1 * pose);
    vec2 h2 = sh2 + vec2(0.4, 0.15 - 0.3 * pose);
    d = min(d, sdSeg(q, sh1, h1) - 0.06);
    d = min(d, sdSeg(q, sh2, h2) - 0.06);
    d = min(d, sdSeg(q, h1, h1 + normalize(h1 - sh1) * 0.4) - 0.022);         // bachi
    d = min(d, sdSeg(q, h2, h2 + normalize(h2 - sh2) * 0.4) - 0.022);
    return d * s;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float snare = clamp(audioSnare, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    int nD = 3 + int(clamp(drummersP, 0.0, 1.0) * 2.99);

    // Backdrop: deep red cloth with a warm glow behind the drums.
    vec3 back = mix(vec3(0.55, 0.05, 0.04), imgPalette(0.02 + hueP * 0.159) * 0.8, 0.2);
    vec3 col = back * (0.25 + 0.35 * exp(-dot(p - vec2(0.0, -0.1), p - vec2(0.0, -0.1)) * 2.0)) * (0.8 + 0.6 * bass);
    col *= 0.85 + 0.15 * sin(p.x * 60.0 + fbm(p * 4.0) * 3.0);               // folds of the cloth
    // Kick: a burst of warm light from behind the drums through the haze.
    float burst = exp(-dot(p - vec2(0.0, -0.25), p - vec2(0.0, -0.25)) * 3.0);
    col += vec3(1.0, 0.6, 0.3) * burst * kick * 0.9;

    float stage = -0.3;
    // Drummers standing behind the drums, spread across the stage.
    float figs = 1e9;
    for (int k = 0; k < 5; ++k) {
        if (k >= nD) break;
        float fk = float(k);
        float x = (fk - float(nD - 1) * 0.5) * (aspect * 0.8 / float(nD));
        float s = (k == nD / 2) ? 0.4 : 0.33;
        figs = min(figs, drummer(p - vec2(x, stage), s, hash11(fk * 3.7)));
    }
    float fig = smoothstep(0.003, -0.003, figs);
    // Rim light on the silhouettes with the snare.
    float rim = smoothstep(0.012, 0.0, abs(figs)) * step(figs, 0.0);
    col = mix(col, vec3(0.01, 0.005, 0.005), fig);
    col += vec3(1.0, 0.7, 0.45) * rim * (0.1 + 0.6 * snare);

    // Drums in front: the big odaiko in the middle on its stand, smaller
    // drums to the sides.  Skins face us, lit on the kick.
    for (int k = 0; k < 5; ++k) {
        if (k >= nD) break;
        float fk = float(k);
        float x = (fk - float(nD - 1) * 0.5) * (aspect * 0.8 / float(nD));
        bool big = (k == nD / 2);
        float r = big ? 0.15 : 0.085;
        vec2 dc = vec2(x, stage + (big ? 0.16 : 0.1));
        vec2 dq = (p - dc) / r;
        float body = length(dq * vec2(1.0, 1.0)) - 1.0;
        // Stand: two slanted legs.
        float legs = min(sdSeg(p, dc + vec2(-r * 0.6, -r * 0.6), vec2(x - r * 0.9, stage - 0.06)),
                         sdSeg(p, dc + vec2(r * 0.6, -r * 0.6), vec2(x + r * 0.9, stage - 0.06))) - 0.008;
        col = mix(col, vec3(0.02, 0.01, 0.005), smoothstep(0.003, 0.0, legs));
        if (body < 0.05) {
            float skin = smoothstep(0.02, -0.02, body + 0.12);
            vec3 sc = vec3(0.85, 0.75, 0.55) * (0.08 + 1.2 * kick * (big ? 1.0 : 0.7)) * (0.7 + 0.3 * (1.0 - length(dq)));
            vec3 rimC = vec3(0.25, 0.1, 0.05);                                     // the wooden shell edge / tacks
            float tacks = step(0.8, fract(atan(dq.y, dq.x) / 6.2831853 * 32.0)) * smoothstep(0.02, 0.0, abs(body + 0.06));
            vec3 dcol = mix(rimC * 0.4, sc, skin) + vec3(0.8, 0.7, 0.4) * tacks * 0.3;
            col = mix(col, dcol, smoothstep(0.02, -0.01, body));
        }
    }
    // Stage floor: dark, catching the glow.
    if (p.y < stage - 0.06) {
        float d = stage - 0.06 - p.y;
        col = vec3(0.03, 0.015, 0.01) + vec3(1.0, 0.5, 0.25) * (0.05 + 0.3 * kick) * exp(-d * 8.0);
    }
    // Haze in the light, drifting.
    float haze = fbm(p * 2.5 + vec2(T * 0.02, T * 0.01));
    col += vec3(1.0, 0.55, 0.3) * haze * (0.04 + 0.1 * swell + 0.25 * kick * burst) ;
    // Two top-light beams slanting down through the haze.
    for (int b = 0; b < 2; ++b) {
        float sx = (b == 0) ? -0.5 : 0.5;
        float bx = p.x - sx - (p.y - 0.5) * (b == 0 ? -0.35 : 0.35);
        float beam = exp(-bx * bx * 30.0) * smoothstep(-0.5, 0.5, p.y);
        col += vec3(1.0, 0.8, 0.6) * beam * (0.05 + 0.08 * swell) * (0.6 + 0.8 * haze);
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
