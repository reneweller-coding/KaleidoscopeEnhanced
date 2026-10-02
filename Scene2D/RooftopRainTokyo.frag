#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file RooftopRainTokyo.frag
 * @brief ROOFTOP RAIN TOKYO: a rainy night over the rooftops of a dense city
 * district -- flat roofs at every height with their railings, towers
 * behind them studded with lit windows, all of it wet and shining, puddles on the
 * roofs mirroring the vertical neon signs that climb the building
 * fronts in pink, cyan and amber; towers rise behind into the low clouds,
 * which glow with the city's light.  Rain falls in fine slanting streaks
 * and rings spread in the puddles.  The camera is still.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> the neon signs, band by band (light)
 *   audioSwell        -> the glow of the clouds (slow)
 *   audioLevel        -> brightness
 *   sceneTime / sceneAdvance -> the rain, the rings in the puddles
 *
 * Per-activation variety: rainP (how hard it rains), hueP.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSpectrum[32];   ///< Spectrum bands, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float rainP;
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

/// @brief Pseudo-random number 0..1 from a float.
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
/// @brief Pseudo-random 2D vector (each 0..1) from a 2D point.
vec2 hash22(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}
/// @brief Smooth 2D value noise, 0..1.
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
/// @brief Fractal noise: octaves of value noise.
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

float gBand[8];
float gT;   ///< The chain's (or scene's) time this frame.

vec3 neonCol(float h)
{
    return (h < 0.33) ? vec3(1.0, 0.25, 0.6) : (h < 0.66) ? vec3(0.2, 0.9, 1.0) : vec3(1.0, 0.65, 0.2);
}

/// The skyline row by row: buildings of this row, their facades, neon signs.
/// Returns the colour and writes the building's top edge to top.
vec3 skyline(vec2 p, float row, out float cov)
{
    // Row 0 is the nearest: wide, low rooftops; far rows are narrow towers.
    float sc = 1.0 / (1.0 + row * 0.7);
    float bx = p.x * (2.6 / sc) + row * 5.3;
    float bi = floor(bx);
    float h = hash11(bi * 1.37 + row * 7.0);
    float base = -0.2;
    float top = base + mix(0.04, 0.2, h) + row * mix(0.05, 0.14, h * h);
    float bf = fract(bx);
    float gap = smoothstep(0.0, 0.03, bf) * smoothstep(1.0, 0.97, bf);
    cov = step(p.y, top) * gap;
    vec3 c = vec3(0.02, 0.022, 0.03) * (1.0 - 0.3 * row);
    // Lit windows: a grid, few lit.
    vec2 wq = vec2(bf * 8.0, (p.y - base) * 70.0 / sc);
    vec2 wi = floor(wq), wf = fract(wq);
    float lit = step(0.82, hash21(wi + bi * 13.0 + row));
    c += vec3(1.0, 0.85, 0.6) * lit * smoothstep(0.3, 0.2, abs(wf.x - 0.5)) * smoothstep(0.3, 0.2, abs(wf.y - 0.5)) * 0.25;
    // A vertical neon sign on some facades.
    float hs = hash11(bi * 3.1 + row * 2.0);
    if (hs > 0.35) {
        float sx = 0.2 + 0.6 * hash11(bi * 5.7 + row);
        float sw = 0.07;
        float sy0 = base + (top - base) * 0.3, sy1 = base + (top - base) * 0.9;
        float inSign = step(abs(bf - sx), sw) * step(sy0, p.y) * step(p.y, sy1);
        vec3 nc = neonCol(hash11(bi * 7.3 + row));
        float b = gBand[int(mod(bi + row * 3.0, 8.0))];
        // Glyph-like blocks inside the sign.
        vec2 gq = vec2((bf - sx) / sw, (p.y - sy0) / (sy1 - sy0) * 8.0);
        // Glyph strokes: rounded bars inside the sign's character cells.
        vec2 gc = gq * vec2(2.0, 1.0);
        vec2 gcell = floor(gc), gl = fract(gc) - 0.5;
        float on = hash21(gcell + bi);
        vec2 bd = abs(gl) - vec2(0.3, 0.28);
        float glyph = smoothstep(0.06, 0.0, length(max(bd, 0.0)) + min(max(bd.x, bd.y), 0.0) - 0.08) * smoothstep(0.35, 0.65, on);
        c = mix(c, nc * (0.5 + 1.4 * b) * (0.5 + 0.5 * glyph), inSign);
        // Its glow on the wet facade around it.
        c += nc * exp(-abs(bf - sx) * 8.0) * smoothstep(sy0 - 0.04, sy0, p.y) * smoothstep(sy1 + 0.04, sy1, p.y) * 0.12 * (0.5 + b);
    }
    return c;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    gT = sceneTime + sceneAdvance * 0.4;
    float px = 1.0 / resolution.y;
    float rain = 0.4 + 0.6 * clamp(rainP, 0.0, 1.0);
    for (int i = 0; i < 8; ++i)
        gBand[i] = clamp((audioSpectrum[i * 4] + audioSpectrum[i * 4 + 1] + audioSpectrum[i * 4 + 2] + audioSpectrum[i * 4 + 3]) * (0.35 + 0.1 * float(i)), 0.0, 1.0);

    // Low clouds glowing with the city.
    float cl = fbm(vec2(p.x * 2.0 + gT * 0.01, p.y * 3.0));
    vec3 col = mix(vec3(0.12, 0.08, 0.14), vec3(0.3, 0.16, 0.25), cl) * (0.7 + 0.5 * swell);
    col = mix(col, col * imgPalette(0.9 + hueP * 0.159) * 1.3, 0.1);

    // Rows of buildings, far to near.
    for (int r = 3; r >= 0; --r) {
        float row = float(r);
        float cov;
        vec3 c = skyline(p, row, cov);
        // Haze of rain over the far rows.
        c = mix(c, vec3(0.12, 0.08, 0.14), row * 0.12);        // rain haze on the far rows
        col = mix(col, c, cov);
    }

    // The foreground roof: a wet flat roof with puddles mirroring the neon.
    float roofY = -0.2;
    if (p.y < roofY) {
        float dd = roofY - p.y;
        float z = 0.1 / dd;
        vec2 g = vec2(p.x * z, z);
        float puddle = smoothstep(0.45, 0.55, fbm(g * 1.5));
        vec3 roof = vec3(0.05, 0.05, 0.055) * (0.8 + 0.3 * noise2(g * 10.0));
        // Mirror: sample the skyline above the roof line, wobbling with ripples.
        vec2 mp = vec2(p.x + 0.004 * sin(g.y * 40.0 + gT * 3.0), roofY + dd * 1.2);
        vec3 refl = col * 0.0;
        float cv;
        vec3 sk = vec3(0.0);
        for (int r = 3; r >= 0; --r) {
            vec3 c = skyline(mp, float(r), cv);
            sk = mix(sk, c, cv);
        }
        refl = sk;
        vec3 wet = roof + refl * 0.25;                          // the whole roof is wet and a little glossy
        col = mix(wet, refl * 0.9 + roof * 0.3, puddle);
        // Rain rings in the puddles.
        vec2 rq = g * vec2(12.0, 3.0), ri = floor(rq), rf = fract(rq);
        float ph = fract(gT * 0.8 + hash21(ri));
        float ring = smoothstep(0.03, 0.0, abs(length(rf - 0.5) - ph * 0.45)) * (1.0 - ph) * step(hash21(ri + 3.0), rain);
        col += vec3(0.5, 0.5, 0.6) * ring * puddle * 0.4;
        // A railing along the roof's edge.
        float rail = smoothstep(0.004, 0.0, abs(p.y - roofY + 0.005)) + step(abs(fract(p.x * 18.0) - 0.5), 0.03) * step(roofY - 0.05, p.y);
        col = mix(col, vec3(0.03), clamp(rail, 0.0, 1.0) * 0.8);
    }
    // Rain: fine slanting streaks, lit by the neon glow.
    {
        vec2 rq = vec2(p.x + p.y * 0.2, p.y) * vec2(140.0, 6.0) + vec2(0.0, gT * 7.0);
        vec2 ri = floor(rq), rf = fract(rq);
        float streak = step(1.0 - 0.12 * rain, hash21(ri)) * smoothstep(0.12, 0.0, abs(rf.x - 0.5)) * smoothstep(0.0, 0.3, rf.y) * smoothstep(1.0, 0.6, rf.y);
        col += vec3(0.6, 0.55, 0.7) * streak * 0.18;
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
