#version 330 core
out vec4 fragColor;
// FractalBloom.frag
// -----------------------------------------------------------------------
// Adapted from kishimisu's GLSL-tutorial fractal (2023) —
// https://www.shadertoy.com/view/mtyGWy  (palette by iq: iquilezles.org/articles/palettes)
// Original licensed CC BY-NC-SA 4.0 (attribution kept per the licence).
//
// A glowing fractal "flower": a domain-repeating kaleidoscope of bright rings.
// Adapted to our engine:
//   * Shadertoy -> ours (gl_FragCoord/resolution/time, GLSL 1.20).
//   * IMAGE-FORWARD: the source image tiles into the fractal petals and tints the
//     palette, and drifts through as a faint backdrop.
//   * Audio-reactive & JUMP-FREE: gentle spin/animation via audioPhase; beats and
//     onsets brighten the bloom; centroid/valence grade the palette.
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;

// Per-activation variety (re-rolled each activation; 0 = default):
uniform float iterZoomP;   // per-iteration zoom (0 -> 1.5; 1.3 = airy, 1.8 = dense)
uniform float ringFreqP;   // ring frequency     (0 -> 8.0; 5 = broad, 12 = filigree)
uniform float audioBeat;
uniform float audioOnset;
uniform float audioLevel;
uniform float audioCentroid;
uniform float audioValence;


uniform float audioChromaHue;
uniform float audioAdvance;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }

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
vec3 palette(float t)
{
    return imgPalette(t);
}




void main()
{
    vec2 uv = (2.0 * gl_FragCoord.xy - resolution) / resolution.y;
    uv = rot(audioPhase * 0.2) * uv;             // gentle jump-free spin
    vec2  uv0 = uv;
    float T   = time + audioPhase * 0.3;

    // Per-activation fractal character (constant during the scene):
    float iterZoom = (iterZoomP <= 0.01) ? 1.5 : iterZoomP;
    float ringFreq = (ringFreqP <= 0.01) ? 8.0 : ringFreqP;

    vec3 col = vec3(0.0);
    for (int i = 0; i < 4; i++)
    {
        uv = fract(uv * iterZoom) - 0.5;
        float d = length(uv) * exp(-length(uv0));
        vec3  c = palette(length(uv0) + float(i) * 0.4 + T * 0.4);

        // The picture tiles into each fractal cell (a drifting crop, so the
        // fractal is coloured by the ever-changing image).
        vec3 pic = img(fract(uv + 0.5 + 0.12 * vec2(cos(T * 0.1), sin(T * 0.08))));
        c *= mix(vec3(1.0), pic * 1.7, 0.6);

        d = sin(d * ringFreq + T) / ringFreq;
        d = abs(d);
        d = pow(0.01 / d, 1.2);
        col += c * d;
    }

    col *= 1.0 + 0.5 * audioBeat + 0.3 * audioOnset;   // beat glow

    // Mood grade.
    col *= mix(vec3(0.75, 0.85, 1.20), vec3(1.25, 1.05, 0.75), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    // Faint image backdrop so the picture reads even in the dark gaps.
    col += img(uv0 * 0.5 + 0.5) * 0.05 * (0.4 + 0.6 * audioLevel);

    fragColor = vec4(col, 1.0);
}
