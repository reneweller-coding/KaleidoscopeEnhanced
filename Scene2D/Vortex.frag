#version 330 core
out vec4 fragColor;
// Vortex.frag
// -----------------------------------------------------------------------
// Adapted from "Vortex" by @kishimisu (2024) — https://www.shadertoy.com/view/MX33Dr
// Original licensed CC BY-NC-SA 4.0 (attribution kept per the licence).
//
// A kaleidoscopic raymarched vortex/tunnel.  Reconstructed from the code-golfed
// original and adapted to our engine: image-forward (the picture colours the
// vortex + drifts as a faint nebula), audio-reactive & jump-free (forward travel
// via audioAdvance, spin via audioPhase; beats brighten; centroid/valence grade).
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
uniform float audioSwell;      // slow loudness swell -> tunnel cells breathe
uniform float audioBarPhase;   // 0..1 per bar -> gentle per-bar hue sweep

// Per-activation variety (re-rolled each activation; 0 = default):
uniform int   sectorsP;   // mirror sector count   (0 -> 10; 6 = broad, 16 = fine)
uniform float curveP;     // tunnel bend           (0 -> 0.09; 0.04 = straight, 0.14 = swoop)
uniform float travP;      // scroll speed multiplier (0 -> 1.0)
uniform int   kSides;     // >=2: weave a spinning n-fold image rosette in (0 = off)
uniform float rosetteP;   // rosette strength      (0 -> 0.22)

// Original's mat2(cos(vec4(0,11,33,0)+a)) ≈ a proper rotation by a.
mat2 rotv(float a) { return mat2(cos(a), sin(a), -sin(a), cos(a)); }

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

// Hue rotation around the luminance axis (keeps brightness + saturation).
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    vec2  Res = resolution;
    float r    = time;
    // Per-activation character (constant during the scene):
    float travV = (travP <= 0.01) ? 1.0 : travP;
    float curveV = (curveP <= 0.001) ? 0.09 : curveP;
    float seg = 3.14159265 / float((sectorsP >= 2) ? sectorsP : 10);
    // Repeat cell length breathes gently with the slow swell (loudness -> size).
    float cellL = 0.2 * (1.0 + 0.08 * audioSwell);
    float adv  = (time + audioAdvance * 2.0) * travV;   // forward scroll (jump-free)
    vec4  O = vec4(0.0);
    float t = 0.1, x = 0.0;

    for (int e = 0; e < 40; e++)
    {
        // Ray position (screen coord rotated over time + gentle audio spin).
        vec3 o = t * normalize(vec3((2.0 * gl_FragCoord.xy - Res)
                                    * rotv(r * 0.15 + audioPhase * 0.08), Res.y));
        o.y += t * t * curveV;
        o.z  = mod(o.z + adv, cellL) - 0.5 * cellL;
        x    = t * 0.06 - r * 0.2;
        // Kaleidoscopic angular snap (per-activation sector count).
        o.xy = o.xy * rotv(floor((atan(o.y, o.x) - x) / seg + 0.5) * seg + x);
        o.x  = fract(o.xy).x - 0.8;
        t += x = length(o) * 0.5 - 0.014;
        O += (1.0 + cos(t * 0.5 + r + vec4(0.0, 1.0, 2.0, 0.0)))
           * (0.3 + sin(3.0 * t + r * 5.0) / 4.0)
           / (8.0 + x * 4e2);
    }

    vec3 col = max(O.rgb, 0.0);
    col *= 1.0 + 0.5 * audioBeat + 0.3 * audioOnset;

    // Mood grade.
    col *= mix(vec3(0.70, 0.85, 1.25), vec3(1.30, 1.05, 0.70), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    // Image-forward: picture colours the vortex + faint nebula; the hue sweeps
    // gently once per bar (continuous across the bar wrap).
    vec2 uv  = gl_FragCoord.xy / resolution;
    float himg = dot(imgPal(dot(col, vec3(0.333)) * 6.0
                 + length(gl_FragCoord.xy / resolution - 0.5) * 4.0), vec3(0.333));
    col = hueRot(col, (himg - 0.5) * 3.0 + time * 0.05
                      + 0.45 * sin(audioBarPhase * 6.28318));

    // Per-activation: a spinning n-fold kaleidoscopic image rosette woven into
    // the vortex (squared -> only its bright parts, keeps the depth).
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
