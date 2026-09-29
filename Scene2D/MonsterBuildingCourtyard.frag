#version 330 core
out vec4 fragColor;
/**
 * @file MonsterBuildingCourtyard.frag
 * @brief MONSTER BUILDING COURTYARD: lying on your back in the courtyard of a
 * Hong Kong housing block at dusk and looking straight up -- four walls
 * of flats soaring on every side, thousands of windows stacked floor on
 * floor, air-conditioner boxes under the sills, laundry on poles, the
 * facades in faded pastel, all of it converging to a small rectangle of
 * violet evening sky far above.  The windows are lit, warm and cool, and
 * they brighten with the bands of the music, whole families of windows
 * glowing up together.  The camera is still; clouds cross the sky square.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> the lit windows, one band per family (light)
 *   audioSwell        -> the glow of the evening sky (slow)
 *   audioLevel        -> brightness
 *   sceneTime / sceneAdvance -> clouds drifting over the sky square
 *
 * Per-activation variety: heightP (how tall the blocks), hueP.
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

uniform float heightP;
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

float gBand[8];

float boxMask(vec2 q, vec2 lo, vec2 hi, vec2 aa)
{
    vec2 a = smoothstep(lo - aa, lo + aa, q) * smoothstep(hi + aa, hi - aa, q);
    return a.x * a.y;
}

// One facade at (along, height): the colour of flats, windows, AC boxes
// and laundry, averaged out where the floors grow too small to resolve.
vec3 facade(float u, float Y, float wallId, float H)
{
    vec2 g = vec2(u / 1.6, Y / 2.9);
    vec2 gi = floor(g), gf = fract(g);
    vec2 fw = fwidth(g);
    float lod = max(fw.x, fw.y);
    vec2 aa = fw * 0.8 + 1e-4;
    // Sections of the block in their own faded pastel.
    float sec = floor(u / 9.0) + wallId * 7.0;
    float hs = hash21(vec2(sec, 3.0));
    vec3 pastel = (hs < 0.25) ? vec3(0.85, 0.62, 0.6) : (hs < 0.5) ? vec3(0.55, 0.72, 0.8)
                : (hs < 0.75) ? vec3(0.85, 0.78, 0.55) : vec3(0.62, 0.78, 0.65);
    pastel = mix(pastel, imgPalette(hs + hueP * 0.159), 0.15);
    // Grime runs down from the sills.
    pastel *= 0.8 + 0.2 * noise2(vec2(u * 3.0, Y * 0.3));
    // Dusk: the facades are lit by the sky above, brighter toward the top.
    float amb = 0.3 + 0.45 * smoothstep(0.0, H, Y);
    vec3 wallC = pastel * amb;

    // The window of this cell: lit or dark, warm or cool, and its band.
    float h = hash21(gi + wallId * 31.0);
    float lit = step(0.5, h);
    vec3 wc = mix(vec3(1.0, 0.72, 0.4), vec3(0.75, 0.9, 1.0), step(0.75, hash21(gi + 7.0)));
    float band = gBand[int(mod(floor(h * 97.0), 8.0))];
    vec3 winLight = wc * lit * (0.2 + 0.9 * band);
    vec3 winDark = vec3(0.05, 0.06, 0.08) + pastel * 0.05;
    vec3 win = mix(winDark, winLight, lit);

    // Averaged cell (for far floors): wall with a share of window light.
    vec3 avg = mix(wallC, win, 0.25);
    float detail = smoothstep(0.45, 0.18, lod);
    if (detail <= 0.0) return avg;

    vec3 c = wallC;
    // Window with its frame.
    float wm = boxMask(gf, vec2(0.2, 0.4), vec2(0.8, 0.86), aa);
    c = mix(c, win, wm);
    // A mullion splitting the window.
    c = mix(c, wallC * 0.8, boxMask(gf, vec2(0.49, 0.4), vec2(0.51, 0.86), aa) * wm);
    // Air-conditioner box under the sill on some flats.
    float hasAC = step(0.45, hash21(gi + 13.0));
    float acX = 0.18 + 0.3 * hash21(gi + 17.0);
    float ac = boxMask(gf, vec2(acX, 0.06), vec2(acX + 0.34, 0.28), aa) * hasAC;
    c = mix(c, vec3(0.55, 0.55, 0.52) * amb * 1.2, ac);
    c = mix(c, vec3(0.05), boxMask(gf, vec2(acX + 0.04, 0.1), vec2(acX + 0.3, 0.24), aa) * hasAC * 0.6);   // its grille
    // Laundry on a pole across some windows: bright cloth hanging down.
    float hasL = step(0.75, hash21(gi + 23.0));
    float pole = smoothstep(aa.y * 1.5, 0.0, abs(gf.y - 0.93)) * hasL;
    c = mix(c, vec3(0.1), pole * 0.8);
    float cloth = 0.0;
    for (int k = 0; k < 3; ++k) {
        float cx = 0.18 + 0.26 * float(k) + 0.08 * hash21(gi + float(k) * 5.0);
        cloth = max(cloth, boxMask(gf, vec2(cx, 0.74 - 0.08 * hash21(gi + float(k) * 9.0)), vec2(cx + 0.09, 0.93), aa) * step(0.3, hash21(gi + float(k) * 3.0)));
    }
    vec3 clothC = mix(0.5 + 0.5 * cos(6.2831853 * (hash21(gi + 29.0) + vec3(0.0, 0.33, 0.67))), vec3(0.9), 0.5);
    c = mix(c, clothC * (amb * 1.5 + 0.1), cloth * hasL);
    // The floor slab line.
    c *= 1.0 - 0.3 * boxMask(gf, vec2(-0.1, -0.02), vec2(1.1, 0.03), aa);
    return mix(avg, c, detail);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    for (int i = 0; i < 8; ++i)
        gBand[i] = clamp((audioSpectrum[i * 4] + audioSpectrum[i * 4 + 1] + audioSpectrum[i * 4 + 2] + audioSpectrum[i * 4 + 3]) * (0.35 + 0.1 * float(i)), 0.0, 1.0);

    // Looking straight up; the courtyard is a rectangle, the camera a little
    // off its centre.
    const float A = 8.0, B = 5.0;
    vec2 cam = vec2(0.8, -0.6);
    float H = 55.0 + 40.0 * clamp(heightP, 0.0, 1.0);
    vec2 d = p * 1.1;                                          // ray direction (x, z) per unit of height
    // Distance up to each wall.
    float tx = (sign(d.x) * A - cam.x) / (d.x + 1e-6 * sign(d.x) + 1e-7);
    float tz = (sign(d.y) * B - cam.y) / (d.y + 1e-6 * sign(d.y) + 1e-7);
    float t = min(tx, tz);

    vec3 col;
    if (t > H) {
        // The sky square: violet dusk, clouds drifting across.
        vec2 sq = cam + d * H;
        float cl = fbm(sq * 0.08 + vec2(T * 0.02, T * 0.01));
        col = mix(vec3(0.18, 0.2, 0.42), vec3(0.45, 0.35, 0.6), smoothstep(0.0, 1.0, length(p) * 5.0));
        col *= 0.9 + 0.4 * swell;
        col = mix(col, vec3(0.6, 0.45, 0.55) * (0.8 + 0.3 * swell), smoothstep(0.45, 0.75, cl) * 0.6);
    } else {
        bool xWall = tx < tz;
        vec2 hit = cam + d * t;
        float u = xWall ? hit.y * sign(d.x) : -hit.x * sign(d.y);
        float wallId = xWall ? (d.x > 0.0 ? 0.0 : 1.0) : (d.y > 0.0 ? 2.0 : 3.0);
        col = facade(u + wallId * 50.0, t, wallId, H);
        // The corners of the courtyard are darker.
        float corner = xWall ? abs(hit.y) / B : abs(hit.x) / A;
        col *= 1.0 - 0.3 * smoothstep(0.85, 1.0, corner);
        // The parapet at the top edge catches the last light.
        col += vec3(0.5, 0.4, 0.5) * smoothstep(H - 2.5, H, t) * 0.15 * (0.8 + 0.4 * swell);
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
