#version 330 core
out vec4 fragColor;
/**
 * @file RainOnWindowCity.frag
 * @brief RAIN ON WINDOW CITY: a night city seen through a rain-covered
 * window.  Out of focus behind the glass the city is soft colour and bokeh
 * discs; on the glass every raindrop is a small lens that shows the city
 * sharp and upside down, and now and then a drop grows heavy and runs down,
 * leaving a clear trail and a string of tiny beads.  The city lights are
 * the music: each bokeh disc belongs to a band and swells with it.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> brightness of the bokeh lights (their bands)
 *   audioSwell        -> the glow of the city haze (slow)
 *   audioHigh         -> glints on the drop rims (light)
 *   sceneTime         -> running drops (continuous)
 *
 * Per-activation variety: rainP (drop density), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float rainP;
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
vec2  hash22(vec2 p) { return vec2(hash21(p), hash21(p + 17.3)); }

float g_hue;
float g_aspect;

// The city beyond the glass, sharp: photo as the lit facades, darkened
// toward the top (night sky), plus the bokeh lights at the given blur.
vec3 city(vec2 uv, float blur)
{
    vec3 c = vec3(0.0);
    // A soft multi-tap blur of the photo (fewer taps when sharp).
    float r = blur * 0.035;
    c += img(clamp(uv, 0.0, 1.0)) * 0.28;
    for (int i = 0; i < 6; ++i)
    {
        float a = float(i) * 1.0472;
        c += img(clamp(uv + r * vec2(cos(a), sin(a)), 0.0, 1.0)) * 0.12;
    }
    c *= mix(vec3(0.45, 0.4, 0.55), vec3(1.0), smoothstep(0.9, 0.2, uv.y));
    c *= 0.3;
    // Bokeh: round discs with a slightly brighter rim, in two sizes.
    vec2 q = uv * vec2(g_aspect, 1.0);
    for (int l = 0; l < 2; ++l)
    {
        float fl = float(l);
        float sc = 3.0 + fl * 4.0;
        vec2 g = q * sc + fl * 3.7;
        vec2 ci = floor(g), cf = fract(g) - 0.5;
        vec2 j = hash22(ci + fl * 9.0) - 0.5;
        float pres = step(0.22, hash21(ci + 4.0 + fl));
        // radius + offset stay inside the cell (0.28 + 0.2 < 0.5): no clipped discs
        float rad = (0.16 + 0.12 * hash21(ci + 7.0)) * (0.4 + 0.6 * blur);
        float d = length(cf - j * 0.4);
        float disc = smoothstep(rad, rad - 0.06 * blur - 0.01, d);
        float rim = smoothstep(rad - 0.05, rad, d) * disc;
        int band = int(mod(hash21(ci + 2.0 + fl) * 32.0, 32.0));
        float e = clamp(audioSpectrum[band] * 1.5, 0.0, 1.0);
        // City lights: mostly warm street light, some from the photo's arc,
        // a few signal reds and greens.
        float kind = hash21(ci + 5.0);
        vec3 bc = kind < 0.45 ? vec3(1.0, 0.72, 0.38)
                : kind < 0.8  ? imgPalette(g_hue * 0.159 + kind) * 1.3
                : kind < 0.9  ? vec3(1.0, 0.25, 0.2) : vec3(0.35, 1.0, 0.6);
        bc *= 0.8 + 0.4 * hash21(ci + 8.0);
        // City lights sit low in the frame: fewer in the sky.
        float low = smoothstep(1.1, 0.45, uv.y);
        c += bc * (disc * 0.7 + rim * 0.4) * pres * (0.4 + 1.0 * e) * low * (1.0 - 0.3 * fl);
    }
    return c;
}

void main()
{
    g_aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(g_aspect, 1.0);
    g_hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float dens = mix(0.22, 0.45, clamp(rainP, 0.0, 1.0));
    float t = sceneTime;

    // Water on the glass: offset of the view through it, and a mask of
    // where a drop (or a trail) is.
    vec2 off = vec2(0.0);
    float dropM = 0.0;
    float rimGlint = 0.0;

    // Static drops in two sizes.
    for (int l = 0; l < 2; ++l)
    {
        float fl = float(l);
        vec2 g = p * (12.0 + fl * 16.0) + fl * 5.1;
        vec2 ci = floor(g), cf = fract(g) - 0.5;
        vec2 j = hash22(ci + 3.0 + fl) - 0.5;
        float pres = step(1.0 - dens, hash21(ci + 11.0 + fl));
        float rad = 0.12 + 0.2 * hash21(ci + 1.0 + fl);
        vec2 d = (cf - j * 0.55) * vec2(1.0, 0.9);
        float r = length(d);
        float m = smoothstep(rad, rad - 0.04, r) * pres;
        // A drop is a small lens: the view through it is inverted and sharp.
        vec2 n = d / max(rad, 1e-3);
        off += -n * 0.18 * m / (12.0 + fl * 16.0) * 3.0;
        dropM = max(dropM, m);
        rimGlint += smoothstep(rad - 0.05, rad - 0.01, r) * m * step(0.0, d.y) * step(d.x, 0.0);
        // The window reflects a small bright spot on every drop.
        rimGlint += smoothstep(0.07, 0.0, length(d - vec2(-0.35, 0.4) * rad)) * m * 1.5;
    }

    // Running drops: one per column cell, sliding down and wiggling,
    // leaving a clear trail with a few beads.
    {
        vec2 g = vec2(p.x * 7.0, p.y);
        float col = floor(g.x);
        float cx = fract(g.x) - 0.5;
        float speed = 0.07 + 0.08 * hash21(vec2(col, 1.0));
        float ph = fract(t * speed + hash21(vec2(col, 2.0)));
        float y = 0.6 - ph * 1.4;                               // from top to below the frame
        float wig = sin(p.y * 14.0 + col) * 0.06 + sin(p.y * 31.0 + col * 2.0) * 0.02;
        float dx = cx - wig - (hash21(vec2(col, 3.0)) - 0.5) * 0.4;
        float active = step(0.35, hash21(vec2(col, floor(t * speed + hash21(vec2(col, 2.0))) + 5.0)));
        vec2 d = vec2(dx * 1.3, (p.y - y) * 7.0);
        float r = length(d);
        float m = smoothstep(0.28, 0.2, r) * active;
        off += -normalize(d + 1e-4) * 0.02 * m;
        dropM = max(dropM, m);
        // Trail above the drop: the glass is wiped clear there (less haze),
        // with a string of tiny beads.
        // (The trail dries off before the drop wraps, so nothing vanishes
        // on screen when the cell picks its next drop.)
        float trail = smoothstep(0.08, 0.0, abs(dx)) * step(y, p.y) * smoothstep(y + 0.8, y, p.y) * active
                    * smoothstep(1.0, 0.7, ph);
        vec2 bg = vec2(dx * 20.0, p.y * 28.0);
        vec2 bc = floor(bg), bf = fract(bg) - 0.5;
        float bead = smoothstep(0.3, 0.15, length(bf - (hash22(bc + col) - 0.5) * 0.3)) * step(0.6, hash21(bc + col * 3.0));
        dropM = max(dropM, bead * trail);
        rimGlint += bead * trail * 0.5;
        dropM = max(dropM, trail * 0.35);
    }

    // Behind the glass: blurred city; through water: the sharp, inverted city.
    vec3 blurred = city(uv, 1.0);
    // A drop is a tiny fish-eye: it shows its own neighbourhood of the
    // city, sharp and turned over (the offset points away from the centre).
    vec2 inv = uv + off * 9.0;
    vec3 sharp = city(clamp(inv, 0.0, 1.0), 0.15) * 1.6;
    vec3 col = mix(blurred, sharp + blurred * 0.35, clamp(dropM, 0.0, 1.0));
    // Condensation haze on the dry glass, glowing with the city light.
    vec3 hazeC = mix(vec3(0.2, 0.2, 0.28), imgPalette(g_hue * 0.159 + 0.2) * 0.4, 0.4);
    col += hazeC * (1.0 - dropM) * (0.12 + 0.15 * swell);
    // Rim glints where a drop catches a light.
    col += vec3(1.0, 0.95, 0.9) * rimGlint * (0.25 + 0.6 * hi);
    // Drops are dark at their edges (total internal reflection).
    // (A thin darker rim where the drop's edge bends light away.)
    col *= 1.0 - 0.12 * smoothstep(0.05, 0.4, dropM) * smoothstep(0.95, 0.5, dropM);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
