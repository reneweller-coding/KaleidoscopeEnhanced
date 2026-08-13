#version 330 core
out vec4 fragColor;
// FlowingWires.frag
// -----------------------------------------------------------------------
// Adapted from "Flowing Wires" by @kishimisu (2023) — https://www.shadertoy.com/view/DsBczR
// Original licensed CC BY-NC-SA 4.0 (attribution kept per the licence).
//
// A 3D truchet pattern raymarched into interlocking glowing wire loops.
// Adapted to our engine:
//   * Shadertoy -> ours (gl_FragCoord/resolution/time, GLSL 1.20; round() -> floor(x+.5),
//     the mat2(cos(a+vec4(0,33,11,0))) trick -> a proper rotation).
//   * IMAGE-FORWARD: the source image colours the glow and drifts through as a
//     faint nebula.
//   * Audio-reactive & JUMP-FREE: forward travel from the host-integrated
//     audioAdvance, spin from audioPhase (never time*audio); beats/onsets brighten
//     the wires, centroid/valence grade the palette.
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
uniform float audioSwell;      // slow loudness swell -> wire thickness breathes
uniform float audioBarPhase;   // 0..1 per bar -> gentle per-bar hue sweep

// Per-activation variety (re-rolled each activation; 0 = default):
uniform float snapP;      // truchet snap density   (0 -> 3.8; 2.8 = chunky, 5.2 = fine)
uniform float glowP;      // wire glow sharpness    (0 -> 50; 35 = fat, 65 = thin)
uniform float travP;      // flight speed multiplier (0 -> 1.0)
uniform int   kSides;     // >=2: weave a spinning n-fold image rosette in (0 = off)
uniform float rosetteP;   // rosette strength       (0 -> 0.22)

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

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

// Distance to one truchet wire loop + accumulate its glow into O.  Returns the
// distance (used by the raymarcher).
float wire(vec3 p, float t, float T, float snapV, float glowV, inout vec4 O)
{
    vec3 q = p;
    q.xy += 0.5;
    float d = length(vec2(length(q.xy) - 0.5, q.z)) - 0.01;   // torus
    float ang = floor((atan(q.y, q.x) - T) * snapV + 0.5) / snapV + T;  // truchet snap
    q.yx = rot(ang) * q.yx;
    q.x -= 0.5;
    O += (sin(t + T) * 0.1 + 0.1) * (1.0 + cos(t + T * 0.5 + vec4(0.0, 1.0, 2.0, 0.0)))
         / (0.5 + pow(length(q) * glowV, 1.3));
    return d;
}

void main()
{
    vec2  R = resolution;
    vec2  F = 2.0 * gl_FragCoord.xy - R;         // centred pixel coords
    float T = time;
    // Per-activation character (constant during the scene):
    float snapV = (snapP <= 0.01) ? 3.8 : snapP;
    float travV = (travP <= 0.01) ? 1.0 : travP;
    // Wire glow width breathes with the slow swell (loudness -> size).
    float glowV = ((glowP <= 0.01) ? 50.0 : glowP) * (1.0 - 0.12 * audioSwell);
    float trav  = (time + audioAdvance * 3.0) * travV;   // forward travel (jump-free)

    vec4  O = vec4(0.0);
    float t = 0.0;
    for (int i = 0; i < 28; i++)
    {
        vec3 p = t * normalize(vec3(rot(t * 0.1) * F, R.y));
        p.zx = rot(T / 4.0 + audioPhase * 0.05) * p.zx;   // camera spin
        p.zy = rot(T / 3.0) * p.zy;
        p.x += trav;                                       // fly forward
        vec3 pf = fract(p) - 0.5;
        float d1 = wire(pf, t, T, snapV, glowV, O);
        float d2 = wire(vec3(-pf.y, pf.z, pf.x), t, T, snapV, glowV, O);
        float d3 = wire(-vec3(pf.z, pf.x, pf.y), t, T, snapV, glowV, O);
        t += min(min(d1, d2), d3);
    }

    vec3 col = O.rgb;
    col *= 1.0 + 0.6 * audioBeat + 0.4 * audioOnset;       // beat glow

    // Mood grade.
    col *= mix(vec3(0.70, 0.85, 1.25), vec3(1.30, 1.05, 0.70), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    // Image-forward: the picture colours the wires + drifts as a faint nebula.
    // The hue additionally sweeps gently once per bar (continuous across the
    // bar wrap because sin(2*pi*0) == sin(2*pi*1)).
    float himg = dot(imgPal(dot(col, vec3(0.333)) * 6.0
                 + length(gl_FragCoord.xy / resolution - 0.5) * 4.0), vec3(0.333));
    col = hueRot(col, (himg - 0.5) * 3.0 + time * 0.05
                      + 0.45 * sin(audioBarPhase * 6.28318));

    // Per-activation: a spinning n-fold kaleidoscopic image rosette woven into
    // the wires (squared -> only its bright parts, keeps the depth).
    if (kSides >= 2)
    {
        float ka = time * 0.02 + audioPhase * 0.04;
        vec2  kp = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
        kp = mat2(cos(ka), sin(ka), -sin(ka), cos(ka)) * kp;
        vec3 ros = img(fract(kaleido(kp, float(kSides)) * 0.8 + 0.5));
        float rosW = (rosetteP <= 0.001) ? 0.22 : rosetteP;
        col += ros * ros * rosW * (0.6 + 0.4 * audioLevel);
    }

    col *= 0.9 + 0.5 * audioLevel;

    fragColor = vec4(col, 1.0);
}
