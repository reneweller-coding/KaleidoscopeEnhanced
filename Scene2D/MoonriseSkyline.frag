#version 330 core
out vec4 fragColor;
/**
 * @file MoonriseSkyline.frag
 * @brief MOONRISE SKYLINE: the telephoto shot of a full moon rising behind a
 * city -- the moon enormous, filling half the height of the frame, its
 * maria and bright crater rays sharp, tinted orange by the thick air near
 * the horizon, and in front of it the skyline in silhouette: towers,
 * spires, a radio mast with a red warning light, lit windows scattered
 * over the dark facades.  The moon rises slowly and steadily, paling as
 * it climbs; heat shimmer ripples its lower edge.  The windows light up
 * with the bands of the music.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> the lit windows, band by band (light)
 *   audioSwell        -> the glow around the moon (slow)
 *   audioLevel        -> brightness
 *   sceneTime / sceneAdvance -> the moon rising (bounded, continuous)
 *
 * Per-activation variety: skylineP (the skyline's density), hueP.
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

uniform float skylineP;
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
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float band[8];
    for (int i = 0; i < 8; ++i)
        band[i] = clamp((audioSpectrum[i * 4] + audioSpectrum[i * 4 + 1] + audioSpectrum[i * 4 + 2] + audioSpectrum[i * 4 + 3]) * (0.35 + 0.1 * float(i)), 0.0, 1.0);
    float px = 1.0 / resolution.y;

    // The moon rises slowly and settles high enough to stand clear.
    float rise = smoothstep(0.0, 180.0, T);
    vec2 mc = vec2(0.1, -0.2 + 0.26 * rise);
    float R = 0.27;
    float hz = -0.18;                                          // the skyline's base line
    // Dusk sky: deep blue above, a warm haze low down.
    vec3 col = mix(vec3(0.35, 0.22, 0.2), vec3(0.06, 0.08, 0.18), smoothstep(-0.3, 0.4, p.y));
    col += vec3(0.9, 0.5, 0.25) * exp(-length(p - mc) * 3.5) * (0.15 + 0.2 * swell);

    // The moon: maria, bright rays, limb darkening, heat shimmer at the bottom.
    vec2 q = p - mc;
    q.x += 0.004 * sin(p.y * 90.0 + T * 3.0) * smoothstep(hz + 0.08, hz, p.y);
    float r = length(q) / R;
    if (r < 1.02) {
        vec2 mu = q / R;
        // Maria: a few large smooth dark seas, mostly on the upper left.
        float mf = noise2(mu * 1.6 + vec2(1.3, 0.4)) * 0.65 + noise2(mu * 3.2 + 4.0) * 0.35;
        float maria = smoothstep(0.64, 0.84, mf + 0.15 * (0.2 - mu.x + 0.6 * mu.y));
        // A bright rayed crater low in the south, its rays thin and long.
        vec2 ty = mu - vec2(-0.15, -0.6);
        float ta = atan(ty.y, ty.x);
        float rays = smoothstep(0.55, 0.9, noise2(vec2(ta * 5.0, 1.0))) * smoothstep(0.3, 0.7, noise2(vec2(ta * 5.0, length(ty) * 6.0))) * exp(-length(ty) * 2.8) * 0.6 + exp(-length(ty) * 20.0);
        float alb = 0.92 - 0.32 * maria + 0.3 * rays + 0.06 * (noise2(mu * 30.0) - 0.5) + 0.05 * (noise2(mu * 9.0) - 0.5);
        alb *= 0.75 + 0.25 * sqrt(max(1.0 - r * r, 0.0));
        // Orange low down, paler as it climbs.
        vec3 tint = mix(vec3(1.0, 0.62, 0.32), vec3(1.0, 0.92, 0.8), rise * 0.7 + 0.3 * smoothstep(-0.2, 0.2, p.y));
        tint = mix(tint, imgPalette(0.07 + hueP * 0.159) * 1.3, 0.06);
        col = mix(col, tint * alb * 1.25, smoothstep(1.0 + px * 3.0 / R, 1.0 - px * 3.0 / R, r));
    }

    // The skyline: towers of varying width and height, spires, a mast.
    float dens = 0.7 + 0.6 * clamp(skylineP, 0.0, 1.0);
    float bx = p.x * 7.0 * dens;
    float bi = floor(bx);
    float top = hz;
    float bid = 0.0;
    for (int k = -1; k <= 1; ++k) {
        float id = bi + float(k);
        float h = hash11(id * 1.37);
        float w0 = 0.5 + 0.45 * hash11(id * 2.11);           // width in cell units
        float c = id + 0.5;
        float dx = abs(bx - c);
        if (dx > w0 * 0.5) continue;
        float ht = hz + 0.05 + 0.3 * h * h;
        // Stepped tops and a spire on some.
        if (hash11(id * 3.3) > 0.6 && dx < w0 * 0.3) ht += 0.03;
        if (hash11(id * 4.7) > 0.75) ht += 0.07 * smoothstep(0.08, 0.0, dx);
        if (ht > top) { top = ht; bid = id; }
    }
    // A radio mast with its red light.
    float mastX = -0.32;
    float mast = step(abs(p.x - mastX), 0.0018) * step(p.y, hz + 0.42) + step(abs(p.x - mastX), 0.006) * step(p.y, hz + 0.3);
    float build = smoothstep(px, -px, p.y - top);
    float sil = max(build, clamp(mast, 0.0, 1.0));
    vec3 city = vec3(0.02, 0.022, 0.035);
    // Windows: a grid on each facade, lit ones band by band.
    float fwWin = fwidth(p.y * 120.0);                        // before the branch
    if (build > 0.5) {
        vec2 wq = vec2(bx * 5.0, p.y * 120.0);
        vec2 wi = floor(wq), wf = fract(wq);
        float lit = step(0.72, hash21(wi + bid * 7.0));
        float b = band[int(mod(wi.x + wi.y * 3.0, 8.0))];
        float win = smoothstep(0.25, 0.2, abs(wf.x - 0.5)) * smoothstep(0.3, 0.2, abs(wf.y - 0.5));
        vec3 wc = mix(vec3(1.0, 0.75, 0.4), vec3(0.75, 0.85, 1.0), step(0.8, hash21(wi + 3.0)));
        city += wc * win * lit * (0.25 + 0.9 * b) * smoothstep(0.3, 0.1, fwWin);
    }
    col = mix(col, city, sil);
    // The warning light on the mast: a soft slow pulse.
    float blink = 0.5 + 0.5 * sin(T * 1.2);
    col += vec3(1.0, 0.1, 0.05) * exp(-length(p - vec2(mastX, hz + 0.42)) * 250.0) * (0.3 + 0.9 * blink * blink);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
