#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file UVMineralsGlow.frag
 * @brief UV MINERALS GLOW: a collection of fluorescent minerals under a
 * shortwave ultraviolet lamp in a dark room -- rough rock specimens on a
 * black shelf, and in them the minerals blazing in impossible colours:
 * willemite in electric green, calcite in fiery red, fluorite in deep
 * violet-blue, bands and veins and crystal clusters glowing out of the
 * dull grey host rock.  The lamp's violet light washes over everything;
 * the glow of each specimen spills softly onto the shelf.  The camera
 * is still; the lamp's reach wanders slowly over the collection.
 *
 * Audio Reactivity:
 *   audioBass   -> the green of the willemite (light)
 *   audioMid    -> the red of the calcite (light)
 *   audioHigh   -> the blue of the fluorite (light)
 *   audioSwell  -> the lamp's violet wash (slow)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the lamp's reach wandering
 *
 * Per-activation variety: rocksP (the arrangement), hueP.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float rocksP;
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
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float mid = clamp(audioMid, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float px = 1.0 / resolution.y;
    float seed = floor(clamp(rocksP, 0.0, 1.0) * 5.0);

    // The lamp's reach: brightest in a broad pool that wanders slowly.
    vec2 lampC = vec2(0.3 * sin(T * 0.03), 0.05 + 0.08 * sin(T * 0.021));
    float reach = exp(-dot(p - lampC, p - lampC) * 1.6);
    float uvI = (0.55 + 0.45 * reach) * (0.8 + 0.4 * swell);

    // Dark room, violet wash on the back wall; the shelf edge.
    float shelfY = -0.36;
    vec3 col = vec3(0.02, 0.0, 0.05) + vec3(0.1, 0.02, 0.22) * reach * 0.4 * (0.7 + 0.5 * swell);
    if (p.y < shelfY) col = vec3(0.015, 0.01, 0.03) + vec3(0.08, 0.02, 0.18) * reach * 0.3;

    // The fluorescent colours.
    vec3 green = vec3(0.2, 1.0, 0.25) * (0.6 + 0.9 * bass);
    vec3 red = vec3(1.0, 0.18, 0.1) * (0.6 + 0.9 * mid);
    vec3 blue = vec3(0.35, 0.3, 1.0) * (0.6 + 0.9 * hi);
    vec3 orange = vec3(1.0, 0.55, 0.1) * (0.6 + 0.6 * mid);

    // Specimens: rough rocks sitting on the shelf, each with its minerals.
    vec3 spill = vec3(0.0);
    for (int k = 0; k < 6; ++k) {
        float fk = float(k) + seed * 7.0;
        float cx = -0.78 + float(k) * 0.31 + 0.06 * (hash11(fk * 1.3) - 0.5);
        float rw = 0.13 + 0.04 * hash11(fk * 2.1);
        float rh = 0.16 + 0.2 * hash11(fk * 3.7);
        vec2 c = vec2(cx, shelfY + rh * 0.8);
        vec2 q = (p - c) / vec2(rw, rh);
        float ang = atan(q.y, q.x);
        // An irregular lumpy outline, flat on the shelf.
        float rr = 1.0 + 0.18 * (fbm(vec2(cos(ang), sin(ang)) * 1.5 + fk) - 0.5) + 0.08 * sin(ang * 5.0 + fk);
        float d = (length(q) - rr) * min(rw, rh);
        d = max(d, shelfY - p.y);
        float cov = smoothstep(px, -px, d);
        // Which minerals: two per specimen.
        float h = hash11(fk * 5.9);
        vec3 m1 = (h < 0.33) ? green : (h < 0.66) ? red : blue;
        vec3 m2 = (h < 0.33) ? red : (h < 0.66) ? green : orange;
        // Host rock: dull grey, rounded (lit from above), rough.
        vec2 tq = (p - c) * 12.0 + fk;
        float bulge = sqrt(max(1.0 - dot(q / rr, q / rr), 0.0));
        vec3 host = vec3(0.1, 0.085, 0.13) * (0.5 + 0.6 * fbm(tq * 2.0)) * (0.4 + 0.8 * bulge);
        // Veins of the first mineral winding through, and crystal pockets of the second.
        float vein = smoothstep(0.02, 0.0, abs(fbm(tq * 0.45) - 0.5) - 0.006 - 0.012 * hash11(fk));
        float pocket = smoothstep(0.64, 0.7, fbm(tq * 0.7 + 3.0));
        // Crystals in the pockets: small round glittering points.
        vec2 gq = tq * 4.0, gi = floor(gq), gf = fract(gq);
        vec2 gc = 0.25 + 0.5 * hash22(gi);
        float xtal = smoothstep(0.3, 0.1, length(gf - gc)) * (0.5 + 0.5 * sin(T * 1.5 + hash21(gi) * 30.0));
        vec3 glow = m1 * vein * (0.9 + 0.4 * fbm(tq * 3.0)) + m2 * pocket * (0.55 + 0.7 * xtal);
        glow *= 0.6 + 0.5 * bulge;
        glow = mix(glow, glow * imgPalette(fk * 0.1 + hueP * 0.159) * 1.3, 0.06);
        vec3 spec = host + glow * uvI;
        // A rim of violet light from the lamp above.
        spec += vec3(0.25, 0.05, 0.5) * smoothstep(-0.02, 0.0, d) * smoothstep(-0.2, 0.8, q.y) * 0.3 * uvI;
        col = mix(col, spec, cov);
        // The glow spilling onto the shelf in front and the wall behind.
        vec3 avgGlow = (m1 * 0.5 + m2 * 0.4) * uvI;
        spill += avgGlow * exp(-length((p - vec2(cx, shelfY)) * vec2(0.8, 2.5)) / (rw * 1.5)) * 0.18 * (1.0 - cov);
    }
    col += spill;
    // The shelf's front edge catching the violet light.
    col += vec3(0.2, 0.05, 0.4) * smoothstep(0.006, 0.0, abs(p.y - shelfY + 0.004)) * 0.4 * (0.5 + reach);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
