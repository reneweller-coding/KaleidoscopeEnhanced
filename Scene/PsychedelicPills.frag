#version 330 core
out vec4 fragColor;
// PsychedelicPills.frag
// -----------------------------------------------------------------------
// Adapted from "Psychedelic Pills" by @kishimisu (2022) — https://www.shadertoy.com/view/csfSRN
// Original licensed CC BY-NC-SA 4.0 (attribution kept per the licence).
//
// Raymarched capsules ("pills") in a repeating domain with psychedelic colours.
// (The original's antialiasing template is dropped -> a single sample.)  Adapted
// to our engine: image-forward (the picture colours the pills + drifts as a faint
// nebula), audio-reactive & jump-free (scroll via audioAdvance, spin via
// audioPhase; beats brighten; centroid/valence grade).
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioAdvance;
uniform float audioPhase;
uniform float audioBeat;
uniform float audioOnset;
uniform float audioLevel;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;
uniform float audioSwell;      // slow loudness swell -> pill size breathes
uniform float audioBarPhase;   // 0..1 per bar -> gentle per-bar hue sweep

// Per-activation variety (re-rolled each activation; 0 = default):
uniform float pillP;      // pill size        (0 -> 0.1; 0.07 = grains, 0.14 = boulders)
uniform float wobbleP;    // pill length wobble (0 -> 0.25; 0.15 = calm, 0.35 = snakes)
uniform float spinP;      // domain spin rate multiplier (0 -> 1.0)
uniform int   kSides;     // >=2: weave a spinning n-fold image rosette in (0 = off)
uniform float rosetteP;   // rosette strength (0 -> 0.22)

mat2 rotm(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

// n-fold kaleidoscopic mirror fold of a centred coordinate.
vec2 kaleido(vec2 p, float sides)
{
    float a   = atan(p.y, p.x);
    float r   = length(p);
    float seg = 3.14159265 / sides;
    a = mod(a + 3.14159265, 2.0 * seg) - seg;
    a = abs(a);
    return vec2(cos(a), sin(a)) * r;
}
vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }

// Colour from a slowly-drifting crop of the picture, indexed by a scalar so the
// palette comes from the image and keeps changing over time + with the harmony.
vec3 imgPal(float x)
{
    vec2 cc = vec2(0.5) + 0.32 * vec2(cos(time * 0.045 + audioPhase * 0.12),
                                      sin(time * 0.033 + audioPhase * 0.09));
    return img(fract(cc + 0.24 * vec2(cos(x), sin(x * 1.31))));
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

// Hue rotation around the luminance axis (keeps brightness + saturation).
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    vec2  r = resolution;
    vec2  v = (2.0 * gl_FragCoord.xy - r) / r.y;
    float e = time * 0.4 + 0.8;
    float scroll = e + audioAdvance * 0.6;       // forward scroll (jump-free)

    // Per-activation character (constant during the scene); pill size breathes
    // slowly with the swell (loudness -> size).
    float wobV  = (wobbleP <= 0.001) ? 0.25 : wobbleP;
    float pillV = ((pillP <= 0.001) ? 0.1 : pillP) * (1.0 + 0.12 * audioSwell);
    float spinV = (spinP <= 0.01) ? 1.0 : spinP;

    float p = 0.0, h = 3.0, c, y;
    for (int s = 0; s < 200; s++)
    {
        if (!(abs(h) > 0.001 && p < 40.0)) break;
        vec3 o = p * normalize(vec3(1.0, v));
        c = sin(e + p * 0.5) * wobV;
        y = c + wobV;
        o.x += scroll;
        o.y  = abs(o.y);
        o    = fract(o) - 0.5;
        o.xy = o.xy * rotm(e * spinV + audioPhase * 0.1);
        o.y += y / 2.0;
        o.y -= clamp(o.y, 0.0, y);
        p += h = (length(o) - pillV * (0.75 + p * 0.1 + c)) * 0.8;
    }

    vec3 col = exp(-p * 0.15 - 0.5 * length(v))
             * (imgPalette(p * 1.337) * 2.2 + 0.2);
    col = max(col, 0.0);
    col *= 1.0 + 0.5 * audioBeat + 0.3 * audioOnset;

    // Mood grade.
    col *= mix(vec3(0.70, 0.85, 1.25), vec3(1.30, 1.05, 0.70), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    // Image-forward: the picture colours the pills + drifts as a faint nebula;
    // the hue sweeps gently once per bar (continuous across the bar wrap).
    float himg = dot(imgPal(dot(col, vec3(0.333)) * 6.0
                 + length(gl_FragCoord.xy / resolution - 0.5) * 4.0), vec3(0.333));
    col = hueRot(col, (himg - 0.5) * 3.0 + time * 0.05
                      + 0.45 * sin(audioBarPhase * 6.28318));

    // Per-activation: a spinning n-fold kaleidoscopic image rosette woven into
    // the pill field (squared -> only its bright parts, keeps the depth).
    if (kSides >= 2)
    {
        float ka = time * 0.02 + audioPhase * 0.04;
        vec2  kp = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
        kp = mat2(cos(ka), sin(ka), -sin(ka), cos(ka)) * kp;
        vec3 ros = img(fract(kaleido(kp, float(kSides)) * 0.8 + 0.5));
        float rosW = (rosetteP <= 0.001) ? 0.22 : rosetteP;
        col += ros * ros * rosW * (0.6 + 0.4 * audioLevel);
    }

    fragColor = vec4(col, 1.0);
}
