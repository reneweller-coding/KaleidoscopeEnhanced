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

mat2 rotm(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

void main()
{
    vec2  r = resolution;
    vec2  v = (2.0 * gl_FragCoord.xy - r) / r.y;
    float e = time * 0.4 + 0.8;
    float scroll = e + audioAdvance * 0.6;       // forward scroll (jump-free)

    float p = 0.0, h = 3.0, c, y;
    for (int s = 0; s < 200; s++)
    {
        if (!(abs(h) > 0.001 && p < 40.0)) break;
        vec3 o = p * normalize(vec3(1.0, v));
        c = sin(e + p * 0.5) * 0.25;
        y = c + 0.25;
        o.x += scroll;
        o.y  = abs(o.y);
        o    = fract(o) - 0.5;
        o.xy = o.xy * rotm(e + audioPhase * 0.1);
        o.y += y / 2.0;
        o.y -= clamp(o.y, 0.0, y);
        p += h = (length(o) - 0.1 * (0.75 + p * 0.1 + c)) * 0.8;
    }

    vec3 col = exp(-p * 0.15 - 0.5 * length(v))
             * (cos(p * (8.4 + 0.16 * vec3(0.0, 1.0, 2.0))) * 1.2 + 1.2);
    col = max(col, 0.0);
    col *= 1.0 + 0.5 * audioBeat + 0.3 * audioOnset;

    // Mood grade.
    col *= mix(vec3(0.70, 0.85, 1.25), vec3(1.30, 1.05, 0.70), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    // Image-forward: the picture colours the pills + drifts as a faint nebula.
    vec3 pic = img(fract(v * 0.5 + 0.5));
    col *= mix(vec3(1.0), pic * 1.6, 0.35);
    col += pic * 0.05 * (0.4 + 0.6 * audioLevel);

    gl_FragColor = vec4(col, 1.0);
}
