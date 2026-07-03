// ChromeDreams.frag
// -----------------------------------------------------------------------
// Adapted from "Chrome Dreams" by @kishimisu (2022) — https://www.shadertoy.com/view/ctX3RM
// Original licensed CC BY-NC-SA 4.0 (attribution kept per the licence).
//
// Rotations + space repetition into a chromatic tunnel of tori.  Adapted to our
// engine, and COLOURED BY THE IMAGE: each depth takes its colour from a slowly-
// drifting crop of the source picture (imgPal), so the palette is the image
// itself and keeps changing.  Audio-reactive & jump-free (scroll via
// audioAdvance, spin via audioPhase; beats brighten; centroid/valence grade).
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

vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

mat2 crot(float a) { return mat2(cos(a), sin(a), -sin(a), cos(a)); }

// The original's a(a,b,f,o) animated-mix macro.
float amix(float A, float B, float f, float o)
{
    return mix(A, B, sin(o + (time * 0.4) * f) * 0.5 + 0.5);
}

vec3 imgPal(float x)
{
    vec2 cc  = vec2(0.5) + 0.32 * vec2(cos(time * 0.045 + audioPhase * 0.12),
                                       sin(time * 0.033 + audioPhase * 0.09));
    vec2 iuv = cc + 0.24 * vec2(cos(x), sin(x * 1.31));
    return img(fract(iuv));
}

void main()
{
    vec2  r = resolution;
    float e    = time * 0.4;
    float eAdv = e + audioAdvance * 1.5;                 // forward scroll (jump-free)

    float c = 0.0, d = 3.0;
    for (int o = 0; o < 200; o++)
    {
        if (d <= 0.001) break;
        vec3 p = abs(0.7 * c * normalize(vec3((2.0 * gl_FragCoord.xy - r) / r.y, 1.0)));
        p.xy = p.xy * crot(e + audioPhase * 0.1);
        p.zy += eAdv + c * 0.2;
        p = fract(p) - 0.5;
        p.xy = p.xy * crot(c);
        p.xz = p.xz * crot(e);
        p.y = max(abs(p.y) - amix(0.0, 0.2, 1.0, 0.0), 0.0);
        c += d = (length(vec2(length(p.xy) - 0.2, p.z)) - amix(0.04, 0.1, 0.5, 4.0) - c * 0.01) * 0.5;
    }

    vec3 base = 1.2 * (cos(c * 6.0 + 0.8 * vec3(0.0, 1.0 + c * 0.04, 2.0)) + 0.2) / exp(c * 0.14);
    base *= 0.35 + 1.4 * imgPal(c * 0.5);                // image crop drives colour
    vec3 col = max(base, 0.0);

    col *= 1.0 + 0.4 * audioBeat + 0.3 * audioOnset;
    col *= mix(vec3(0.75, 0.85, 1.20), vec3(1.25, 1.05, 0.75), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    gl_FragColor = vec4(col, 1.0);
}
