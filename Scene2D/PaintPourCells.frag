#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file PaintPourCells.frag
 * @brief PAINT POUR CELLS: an acrylic pour seen close -- ribbons of glossy
 * paint (deep teal, magenta, gold, white, black) stretched and swirled
 * across the canvas, and scattered through them the "cells": round holes
 * where the silicone pushed the top layer apart, each ringed by thin lacy
 * rims of the colours beneath.  The paint keeps flowing, slowly, as if the
 * canvas were still being tilted; cells drift and stretch with it.  A soft
 * studio light gives the wet surface a gloss.  The music is in the light.
 *
 * Audio Reactivity:
 *   audioSwell  -> the gloss of the wet paint (slow)
 *   audioKick   -> the cell rims glint (light only)
 *   audioLevel  -> brightness
 *   audioChromaHue / hueP -> which paint set (photo-tinted)
 *   sceneTime / sceneAdvance -> the flow (continuous)
 *
 * Per-activation variety: cellsP (cell density), hueP.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float cellsP;
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
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 1.7; a *= 0.5; }
    return v;
}

/// The paint set: five colours, one of three families chosen by hueP,
/// each nudged toward the photo.
vec3 paint(float t, float fam)
{
    vec3 c[5];
    if (fam < 0.33) {        // ocean
        c[0] = vec3(0.02, 0.25, 0.35); c[1] = vec3(0.05, 0.55, 0.6); c[2] = vec3(0.95, 0.95, 0.92);
        c[3] = vec3(0.85, 0.65, 0.25); c[4] = vec3(0.03, 0.03, 0.05);
    } else if (fam < 0.66) { // sunset
        c[0] = vec3(0.55, 0.05, 0.25); c[1] = vec3(0.95, 0.4, 0.15); c[2] = vec3(1.0, 0.85, 0.35);
        c[3] = vec3(0.95, 0.93, 0.9);  c[4] = vec3(0.12, 0.02, 0.15);
    } else {                 // galaxy
        c[0] = vec3(0.08, 0.05, 0.3); c[1] = vec3(0.6, 0.15, 0.7); c[2] = vec3(0.1, 0.7, 0.85);
        c[3] = vec3(0.95, 0.95, 1.0); c[4] = vec3(0.02, 0.02, 0.04);
    }
    float x = fract(t) * 5.0;
    int i = int(x);
    float f = smoothstep(0.35, 0.65, fract(x));        // mostly flat bands, soft edges
    vec3 a = c[i], b = c[(i + 1) % 5];
    return mix(a, b, f);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float fam = fract(((hueP > 0.001) ? hueP : 0.0) / 6.2831853);
    float cd = 5.0 + 5.0 * clamp(cellsP, 0.0, 1.0);

    // The flow: a slow shear plus a domain warp, as if the canvas is tilted.
    vec2 q = p * 1.4 + vec2(T * 0.01, T * 0.004);
    vec2 w1 = vec2(fbm(q + vec2(0.0, T * 0.006)), fbm(q + vec2(5.2, 1.3)));
    vec2 w2 = vec2(fbm(q + 3.0 * w1 + vec2(1.7, 9.2)), fbm(q + 3.0 * w1 + vec2(8.3, 2.8)));
    vec2 f = q + 2.2 * w2;

    // Base: ribbons of paint along the flow.
    float band = f.x * 0.8 + f.y * 0.35 + 0.15 * fbm(f * 3.0);
    vec3 col = paint(band, fam);
    col = mix(col, col * imgPalette(band) * 1.6, 0.18);

    // Cells: round holes on a jittered lattice in the warped space, their
    // rims lacy rings of the next colours down.
    // Cells stay round: only a light share of the warp moves them.
    vec2 cq = (q + 0.35 * w2) * cd;
    vec2 gi = floor(cq), gf = fract(cq);
    float best = 9.0; vec2 bc = vec2(0.0); float br = 0.0;
    for (int j = -1; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i) {
        vec2 o = vec2(i, j);
        vec2 id = gi + o;
        if (hash21(id + 3.3) > 0.55) continue;           // not every cell has a hole
        vec2 c = o + 0.25 + 0.5 * hash22(id);
        float r = 0.12 + 0.28 * pow(hash21(id + 7.7), 2.0);
        float d = length(gf - c) / r;
        if (d < best) { best = d; bc = id; br = r; }
    }
    if (best < 1.6) {
        float h = hash21(bc + 1.9);
        vec3 inner = paint(band + 0.4 + 0.2 * h, fam);
        vec3 rimC  = paint(band + 0.2 + 0.1 * h, fam);
        // Lace: several thin rings with a fibrous break-up.
        float lace = 0.5 + 0.5 * sin(best * 22.0 + 6.0 * noise2(gf * 30.0 + bc));
        float ring = smoothstep(1.35, 1.0, best) * smoothstep(0.55, 0.9, best);
        vec3 cell = mix(inner, rimC, smoothstep(0.35, 0.95, best));
        cell = mix(cell, vec3(0.97), smoothstep(0.85, 1.0, lace) * ring * 0.7);
        cell = mix(cell, paint(band + 0.8, fam), smoothstep(0.8, 1.0, 1.0 - lace) * ring * 0.4);
        col = mix(col, cell, smoothstep(1.35, 1.1, best));
        col += vec3(1.0) * ring * kick * 0.25 * smoothstep(0.9, 1.0, lace);
    }
    // Tiny satellite cells scattered in the paint.
    {
        vec2 sq = (q + 0.35 * w2) * cd * 4.0;
        vec2 si = floor(sq), sf = fract(sq);
        vec2 sc = 0.3 + 0.4 * hash22(si + 5.0);
        float sr = 0.08 + 0.1 * hash21(si + 2.0);
        float sm = smoothstep(sr, sr * 0.6, length(sf - sc)) * step(0.7, hash21(si + 9.0));
        col = mix(col, paint(band + 0.5, fam), sm * 0.9);
    }

    // Wet gloss: a soft studio light reflected on the gently uneven surface.
    float hgt = fbm(f * 2.0);
    vec2 grad = vec2(fbm(f * 2.0 + vec2(0.01, 0.0)) - hgt, fbm(f * 2.0 + vec2(0.0, 0.01)) - hgt) * 30.0;
    vec3 n = normalize(vec3(-grad, 1.0));
    vec3 L = normalize(vec3(-0.4, 0.5, 0.8));
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 60.0);
    col *= 0.85 + 0.25 * max(dot(n, L), 0.0);
    col += vec3(1.0) * spec * (0.15 + 0.35 * swell);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
