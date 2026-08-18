#version 330 core
out vec4 fragColor;
/**
 * @file BreathingFractalZoom.frag
 * @brief Forked from https://www.shadertoy.com/view/DsscWn (the same fold/rotate
 * fractal core as BreathingFractal.frag, extended here with an oscillating
 * zoom and a final palette remap).  Palette from
 * https://www.shadertoy.com/view/dlVSDK (iq-style cosine palette).
 *
 * Adapted to our engine: GLSL 1.20 (gl_FragCoord/resolution/time); the
 * original's comma-operator loop body de-golfed into ordinary statements; its
 * mouse-driven per-iteration detune (iMouse.x) replaced by the (smoothed)
 * spectral centroid, since this engine has no mouse input; jump-free audio
 * motion (host-integrated audioAdvance added to time, never time*audio);
 * beat-driven breathing/brightness; mood grade; and IMAGE-DRIVEN colour: a
 * drifting crop of the source picture (imgPal) rotates the palette's hue
 * (hueRot) so the lattice colours come from the ever-changing image, on top
 * of the shader's own cosine palette remap.
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
uniform float audioChromaHue;
uniform float audioSwell;      // slow loudness swell -> breathing deepens
uniform float audioBarPhase;   // 0..1 per bar -> palette wanders per bar

// Per-activation variety (re-rolled each activation; 0 = default):
uniform float oscP;       // zoom oscillation speed (0 -> 0.05; 0.03 = glacial, 0.09 = lively)
uniform float deepP;      // zoom oscillation depth (0 -> 4.0; 2.5 = shallow, 4.5 = deep)
uniform float breathP;    // breath ring frequency  (0 -> 20; 12 = broad, 30 = tight)
uniform float palShiftP;  // cosine palette offset  (0 -> 0; any value = different colour family)
uniform int   kSides;     // >=2: weave a spinning n-fold image rosette in (0 = off)
uniform float rosetteP;   // rosette strength       (0 -> 0.22)

vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }

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

vec3 imgPal(float x)
{
    vec2 cc = vec2(0.5) + 0.32 * vec2(cos(time * 0.045 + audioPhase * 0.12),
                                      sin(time * 0.033 + audioPhase * 0.09));
    return img(fract(cc + 0.24 * vec2(cos(x), sin(x * 1.31))));
}

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// iq-style cosine palette (https://www.shadertoy.com/view/dlVSDK).
vec3 palette(float t)
{
    vec3 a = vec3(0.2, 0.7, 0.4);
    vec3 b = vec3(0.5, 0.8, 0.5);
    vec3 c = vec3(1.0, 2.0, 1.0);
    vec3 d = vec3(0.0, 0.33333, 0.66666);
    return imgPalette(t);
}

void main()
{
    vec2  v  = resolution;
    vec2  p  = gl_FragCoord.xy;
    float tt = time + audioAdvance * 2.0;    // jump-free (host-integrated) clock

    // Per-activation character (constant during the scene):
    float oscV    = (oscP    <= 0.001) ? 0.05 : oscP;
    float deepV   = (deepP   <= 0.01)  ? 4.0  : deepP;
    float breathV = (breathP <= 0.01)  ? 20.0 : breathP;

    // Slow zoom oscillation (bounded, so it never crosses zero / flips sign).
    float zoom = -5.0 + abs(sin(tt * oscV)) * deepV;
    p = ((p - v * 0.5) * 0.4 / v.y) / zoom;

    // Breathing effect: stronger on the beat, deeper with the slow swell.
    p += p * sin(dot(p, p) * breathV - tt)
           * (0.04 + 0.02 * audioBeat + 0.02 * audioSwell);

    vec4 c = vec4(0.0);
    for (float i = 0.5; i < 8.0; i += 1.0)
    {
        // Fractal fold + per-iteration rotation (mouse-detune -> centroid).
        mat2 rot = mat2(cos(0.01 * (tt + audioCentroid * 5.0) * i * i
                            + 0.78 * vec4(1.0, 7.0, 3.0, 1.0)));
        p  = abs(2.0 * fract(p - 0.5) - 1.0) * rot;
        c += exp(-abs(p.y) * 5.0) * (cos(vec4(0.0, 0.7, 1.5, 0.0) * i) * 0.5 + 0.2);
    }

    // Palette remap: per-activation colour-family offset + a gentle once-per-
    // bar wander (continuous across the bar wrap).
    c = vec4(palette(c.x + palShiftP + 0.15 * sin(audioBarPhase * 6.28318)), 1.0);
    c = clamp(c, 0.0, 1.0);

    vec3 col = c.rgb;
    col *= 1.0 + 0.5 * audioBeat + 0.3 * audioOnset;

    // Mood grade.
    col *= mix(vec3(0.75, 0.85, 1.20), vec3(1.25, 1.05, 0.75), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    // Image-driven colour: a drifting crop of the picture rotates the hue.
    float himg = dot(imgPal(dot(col, vec3(0.333)) * 6.0
                 + length(gl_FragCoord.xy / resolution - 0.5) * 4.0), vec3(0.333));
    col = hueRot(col, (himg - 0.5) * 3.0 + time * 0.05);

    // Per-activation: a spinning n-fold kaleidoscopic image rosette woven into
    // the lattice (squared -> only its bright parts, keeps the depth).
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

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (clamp(col, 0.0, 1.0)) * 0.7;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
