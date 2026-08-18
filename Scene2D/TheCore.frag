#version 330 core
out vec4 fragColor;
/**
 * @file TheCore.frag
 * @brief Adapted from "The Core" by \@kishimisu (2023) — https://www.shadertoy.com/view/cdy3Dd
 * Original licensed CC BY-NC-SA 4.0 (attribution kept per the licence).
 *
 * A glowing warm "core" seen down a twisting, domain-repeating tunnel of tubes.
 * Adapted to our engine: image-forward (the picture colours the glow + drifts as
 * a faint nebula), audio-reactive & jump-free (tunnel scroll via audioAdvance,
 * twist via audioPhase; beats brighten; centroid/valence grade).
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
uniform float audioSwell;      // slow loudness swell -> tube thickness breathes
uniform float audioBass;       // slew-limited bass -> the core itself pumps
uniform float audioBarPhase;   // 0..1 per bar -> gentle per-bar hue sweep

// Per-activation variety (re-rolled each activation; 0 = default):
uniform float coreP;      // core sphere radius  (0 -> 1.0; 0.6 = distant star, 1.6 = looming sun)
uniform float twistP;     // tunnel twist amount (0 -> 0.3; 0.15 = calm, 0.5 = corkscrew)
uniform float tubeP;      // tube radius         (0 -> 0.1; 0.06 = wires, 0.16 = pillars)
uniform int   kSides;     // >=2: weave a spinning n-fold image rosette in (0 = off)
uniform float rosetteP;   // rosette strength    (0 -> 0.22)

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

// Hue rotation around the luminance axis (keeps brightness + saturation).
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    vec2  c = resolution;
    vec2  o = 2.0 * gl_FragCoord.xy - c;
    float m    = time * 0.5;
    float mAdv = m + audioAdvance * 0.5;         // tunnel scroll (jump-free)

    // Per-activation character (constant during the scene).  The core radius
    // additionally PUMPS with the (slew-limited) bass — the heart of the tunnel
    // beats with the music; tubes breathe slowly with the swell.
    float coreR  = ((coreP  <= 0.01)  ? 1.0 : coreP) * (1.0 + 0.12 * audioBass);
    float twistV = (twistP <= 0.001) ? 0.3 : twistP;
    float tubeR  = ((tubeP  <= 0.001) ? 0.1 : tubeP) * (1.0 + 0.15 * audioSwell);

    vec4  O = vec4(0.0);
    float t = 0.0, d;
    for (int e = 0; e < 100; e++)
    {
        vec3 r = t * normalize(vec3(abs(o / c.y), 1.0));   // mirrored ray
        d = length(r - vec3(0.0, 0.0, 15.0)) - coreR;      // the core sphere
        O += vec4(0.2, 0.1, 0.04, 0.0) / (1.0 + max(d, -0.09) / 0.1);

        r.z += mAdv;
        float ang = sin(r.z) * sin(m) * twistV + audioPhase * 0.05;
        r.xy = fract(r.xy * rotm(ang)) - 0.5;              // twist + fold into tubes
        t += d = min(d, length(r.xy) - tubeR);

        O += 0.032 * smoothstep(0.0, 1.0,
                 cos(t * 0.1 * (sin(m) + 20.0)
                     + vec4(0.0, 1.0, 2.0, 0.0) * (0.15 + length(r.xy) * 2.0) - m) - 0.6)
             / (1.0 + d) / exp(t * 0.1);
    }

    vec3 col = max(O.rgb, 0.0);
    col = col / (1.0 + 0.3 * col);                // soft highlight knee (no white-out)
    col *= 1.0 + 0.6 * audioBeat + 0.3 * audioOnset;

    // Mood grade.
    col *= mix(vec3(0.70, 0.85, 1.25), vec3(1.30, 1.05, 0.70), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    // Image-forward: the picture colours the glow + drifts as a faint nebula;
    // the hue sweeps gently once per bar (continuous across the bar wrap).
    vec2 uv  = gl_FragCoord.xy / resolution;
    float himg = dot(imgPal(dot(col, vec3(0.333)) * 6.0
                 + length(gl_FragCoord.xy / resolution - 0.5) * 4.0), vec3(0.333));
    col = hueRot(col, (himg - 0.5) * 3.0 + time * 0.05
                      + 0.45 * sin(audioBarPhase * 6.28318));

    // Per-activation: a spinning n-fold kaleidoscopic image rosette woven into
    // the tunnel (squared -> only its bright parts, keeps the depth).
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
