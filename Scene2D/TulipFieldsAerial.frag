#version 330 core
out vec4 fragColor;
/**
 * @file TulipFieldsAerial.frag
 * @brief TULIP FIELDS AERIAL: the Dutch bulb fields in April seen from a
 * drone high above -- parcels of land laid out like a flag, each striped
 * with rows of tulips in pure colours, red, yellow, pink, orange, white,
 * purple, the stripes of neighbouring parcels running at their own angle,
 * narrow canals between them shining with the sky, a farm with its
 * shadow.  Soft cloud shadows drift across the land.  The view glides
 * slowly and steadily over the fields.  Each colour answers a band of the
 * music: its rows glow up when the band sounds.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> the glow of each colour's rows (light)
 *   audioSwell        -> the sun between the cloud shadows (slow)
 *   audioLevel        -> brightness
 *   sceneTime / sceneAdvance -> the glide over the fields, the drifting clouds
 *
 * Per-activation variety: parcelP (the size of the parcels), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float parcelP;
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

vec3 tulip(int k)
{
    return (k == 0) ? vec3(0.9, 0.08, 0.1) : (k == 1) ? vec3(1.0, 0.85, 0.1) : (k == 2) ? vec3(1.0, 0.45, 0.65)
         : (k == 3) ? vec3(1.0, 0.45, 0.08) : (k == 4) ? vec3(0.96, 0.95, 0.9) : vec3(0.45, 0.15, 0.6);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float band[6];
    for (int i = 0; i < 6; ++i) {
        float s = 0.0;
        for (int j = 0; j < 5; ++j) s += audioSpectrum[min(i * 5 + j, 31)];
        band[i] = clamp(s / 5.0 * (1.5 + 0.3 * float(i)), 0.0, 1.0);
    }

    // The land under the drone, gliding steadily (slightly rotated grid).
    float ps = 0.55 + 0.35 * clamp(parcelP, 0.0, 1.0);
    vec2 w = p * 3.0 + vec2(T * 0.045, T * 0.015);
    mat2 rot = mat2(0.96, -0.28, 0.28, 0.96);
    vec2 q = rot * w;
    // Parcels: a grid of long rectangles, jittered.
    vec2 pg = q / vec2(ps * 1.6, ps);
    vec2 pi = floor(pg), pf = fract(pg);
    float h = hash21(pi);
    // Canals and tracks between the parcels.
    vec2 fwp = fwidth(pg);
    vec2 edge = min(pf, 1.0 - pf) / max(fwp, 1e-4);
    float canalX = smoothstep(2.5, 1.0, edge.x * 0.5);
    float canalY = smoothstep(2.5, 1.0, edge.y * 0.5);
    // Stripes of tulips inside the parcel, along its long side (or across).
    bool across = hash21(pi + 5.0) > 0.7;
    float sc = across ? pf.x * 1.6 * ps : pf.y * ps;
    float rows = sc * 55.0;
    float rf = fract(rows);
    float fwr = fwidth(rows) + 1e-4;
    // Wide bands of one colour, several per parcel; bare soil rows between.
    float bandIdx = floor(sc * 5.0 + h * 7.0);
    int kind = int(mod(bandIdx + floor(h * 6.0), 6.0));
    // Some parcels are harvested green leaves or bare earth.
    float bare = step(0.86, hash21(pi + 9.0));
    vec3 flower = tulip(kind);
    flower = mix(flower, flower * imgPalette(float(kind) / 6.0 + hueP * 0.159) * 1.6, 0.08);
    float furrow = smoothstep(0.35 - fwr, 0.35 + fwr, abs(rf - 0.5)) ;
    furrow = mix(furrow, 0.3, smoothstep(0.3, 0.7, fwr));
    vec3 soil = vec3(0.35, 0.28, 0.2);
    vec3 leaves = vec3(0.2, 0.4, 0.15);
    vec3 col = mix(flower * (0.85 + 0.35 * band[kind]), mix(leaves, soil, 0.5), furrow * 0.7);
    col = mix(col, mix(leaves, soil, step(0.93, hash21(pi + 9.0))) * (0.9 + 0.1 * noise2(q * 60.0)), bare);
    // Tractor tracks across the stripes.
    float track = smoothstep(0.012, 0.004, abs(pf.x - 0.3 - 0.4 * h)) * (1.0 - bare);
    col = mix(col, soil * 1.1, track * 0.7);
    // Canals shining with the sky; a grass verge along them.
    vec3 canal = mix(vec3(0.35, 0.5, 0.65), vec3(0.75, 0.82, 0.9), noise2(q * 10.0 + T * 0.05));
    col = mix(col, vec3(0.3, 0.45, 0.2), max(smoothstep(4.0, 2.5, edge.x), smoothstep(4.0, 2.5, edge.y)) * 0.8);
    col = mix(col, canal, max(canalX, canalY));
    // A farm on some parcel corners: roof and its shadow.
    {
        vec2 fq = pf - vec2(0.12, 0.2);
        float farm = step(0.8, hash21(pi + 13.0));
        float roof = step(abs(fq.x), 0.05) * step(abs(fq.y), 0.08);
        float shadow = step(abs(fq.x - 0.02), 0.05) * step(abs(fq.y + 0.03), 0.08);
        col = mix(col, col * 0.5, shadow * farm);
        col = mix(col, mix(vec3(0.55, 0.2, 0.15), vec3(0.3), step(0.5, hash21(pi + 17.0))), roof * farm);
    }

    // Cloud shadows drifting across the fields.
    vec2 cq = p * 1.1 + vec2(T * 0.02, T * 0.006);
    float cs = smoothstep(0.5, 0.75, fbm(cq));
    col *= mix(1.0, 0.55, cs * (1.0 - 0.5 * swell));
    col *= 0.95 + 0.15 * swell;

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
