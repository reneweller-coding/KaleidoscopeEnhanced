#version 330 core
out vec4 fragColor;
/**
 * @file NeonTubes.frag
 * @brief Adapted from a \@kishimisu code-golf raymarch (2022, CC BY-NC-SA 4.0).
 * "A nice mix between an intended result and happy bugs integrated as features."
 *
 * A fly-through of pulsing neon rings/tubes in a repeating domain.  Adapted to
 * our engine: image-forward (the picture colours the tubes + drifts as a faint
 * nebula), audio-reactive & jump-free (forward travel via audioAdvance; beats
 * brighten; centroid/valence grade).
 */

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
uniform float audioSwell;      // slow loudness swell -> ring thickness breathes
uniform float audioBarPhase;   // 0..1 per bar -> gentle per-bar hue sweep

// Per-activation variety (re-rolled each activation; 0 = default):
uniform float stripeP;    // colour stripe frequency (0 -> 8.0; 5 = broad bands, 12 = fine)
uniform float ringP;      // ring size multiplier    (0 -> 1.0; 0.7 = slim, 1.3 = chunky)
uniform float travP;      // scroll speed multiplier (0 -> 1.0)
uniform int   kSides;     // >=2: weave a spinning n-fold image rosette in (0 = off)
uniform float rosetteP;
uniform float audioChromaHue;   // rosette strength        (0 -> 0.22)

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


// House tint: bend a colour toward the photo palette while keeping its
// luminance -- the identity look survives, only the hue follows the photos.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}
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

// The original's t(g,o,l,f) macro: an animated mix.
float tmix(float g, float o, float l, float f)
{
    return mix(g, o, cos(l * (f + time * 0.1)) * 0.5 + 0.5);
}

void main()
{
    vec2  n = (2.0 * gl_FragCoord.xy - resolution) / resolution.y;
    float o = 0.0, f = 3.0;
    // Per-activation character (constant during the scene); ring thickness
    // breathes slowly with the swell (loudness -> size).
    float stripeV = (stripeP <= 0.01) ? 8.0 : stripeP;
    float ringV   = ((ringP <= 0.01) ? 1.0 : ringP) * (1.0 + 0.10 * audioSwell);
    float travV   = (travP <= 0.01) ? 1.0 : travP;
    float scroll = (time * 0.5 + audioAdvance * 2.0) * travV;  // forward travel (jump-free)

    for (int g = 0; g < 200; g++)
    {
        if (f <= 0.001) break;
        vec3 e = o * normalize(vec3(n, 1.0));
        e.z += scroll;
        float l = floor(e.z + 0.5);
        f = 2.0 - length(e.xy) - o * 0.1;
        e = fract(e + 0.5) - 0.5;
        float rr1 = tmix(0.1, 0.5, 2.0, l) * ringV;
        float rr2 = tmix(0.05, tmix(0.1, 0.4, 0.5, 0.0), 1.0, 1.6 + l) * ringV;
        f = 0.5 * max(f, length(vec2(length(e.xy) - rr1, e.z)) - rr2);
        o += f;
    }

    vec3 col = (cos(o * stripeV + vec3(0.0, 1.0, 2.0) * 0.8) * 5.0) / exp(o * 0.2 + length(n));
    col = max(col, 0.0);
    col = palTint(col, 0.05 * o, 0.28);
    col *= 1.0 + 0.5 * audioBeat + 0.3 * audioOnset;

    // Mood grade.
    col *= mix(vec3(0.70, 0.85, 1.25), vec3(1.30, 1.05, 0.70), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    // Image-forward: the picture colours the tubes + drifts as a faint nebula;
    // the hue sweeps gently once per bar (continuous across the bar wrap).
    float himg = dot(imgPal(dot(col, vec3(0.333)) * 6.0
                 + length(gl_FragCoord.xy / resolution - 0.5) * 4.0), vec3(0.333));
    col = hueRot(col, (himg - 0.5) * 3.0 + time * 0.05
                      + 0.45 * sin(audioBarPhase * 6.28318));

    // Per-activation: a spinning n-fold kaleidoscopic image rosette woven into
    // the tubes (squared -> only its bright parts, keeps the depth).
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
