#version 330 core
out vec4 fragColor;
// DiscoGodrays.frag
// -----------------------------------------------------------------------
// Adapted from "Disco Godrays" by @kishimisu (2023) — https://www.shadertoy.com/view/Dt33RS
// Original licensed CC BY-NC-SA 4.0 (attribution kept per the licence).
//
// Kaleidoscopic volumetric "godrays": a densely-sampled raymarch through a
// mirror-ball fold of a tube + sphere, giving fans of coloured light.
// Adapted to our engine:
//   * Shadertoy -> ours (gl_FragCoord/resolution/time, GLSL 1.20; round() ->
//     floor(x+.5); the blue-noise channel -> a cheap hash; the mat2(cos vec4)
//     trick -> a proper rotation).
//   * IMAGE-FORWARD: the source image colours the rays and drifts as a faint nebula.
//   * Audio-reactive & JUMP-FREE: the disco spin uses audioPhase (never time*audio);
//     beats/onsets brighten; centroid/valence grade the palette.
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;

// Per-activation variety (re-rolled each activation; 0 = default):
uniform float facetP;   // mirror-ball facet angle (0 -> 0.3; 0.2 = dense, 0.5 = coarse)
uniform float tubeP;    // ray tube thickness      (0 -> 0.05; 0.03..0.09)
uniform float audioBeat;
uniform float audioOnset;
uniform float audioLevel;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioKick;   // kick -> the rays PUMP (boom = light burst)
uniform float audioHat;    // hats -> glittering sparkle on the ray tips
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


// House tint: bend a colour toward the photo palette while keeping its
// luminance -- the identity look survives, only the hue follows the photos.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

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
    vec2  F = gl_FragCoord.xy;
    vec3  R = vec3(resolution.x, resolution.y, 1.0);
    float t = 0.0, d = 0.3, l = 0.0;
    float k = time * 0.3 + audioPhase * 0.15;    // disco spin (jump-free)

    // Per-activation ball character (constant during the scene, so no snapping):
    float facet = (facetP <= 0.01) ? 0.3  : facetP;   // facet angle -> ray count
    float tubeW = (tubeP  <= 0.001) ? 0.05 : tubeP;   // ray thickness

    vec4 O = vec4(0.0);
    for (int i = 0; i < 60; i++)
    {
        if (d <= 0.01) break;

        vec3 p = R - vec3(F + F, R.y);
        p = t / length(p) * p - 2.0 / R;

        // Kaleidoscopic angular folds (mirror-ball facets).
        float a1 = floor((atan(p.z, p.x) + k) / facet + 0.5) * facet - k;
        p.zx = p.zx * rot(a1);
        float a2 = floor((atan(p.y, p.x) + k) / facet + 0.5) * facet - k;
        p.yx = p.yx * rot(a2);

        float dt = length(p.yz) - tubeW;          // glowing tube (radial ray)
        l = length(p) - 1.15;                     // sphere shell (glow volume)

        vec4 disco = cos(k - t + vec4(0.0, 0.5, 1.0, 0.0));
        vec4 glow  = disco * smoothstep(1.0, 0.0, dt / (tubeW * 0.9))  // ray halo
                   * disco * smoothstep(1.0, 0.0, l);
        O += glow * 1.1 + 0.0015;

        float noise = hash(F + float(i)) * 0.06; // step jitter (was blue noise)
        d = min(max(l, -dt), 0.1 + noise);        // dense sampling for godrays
        t -= d;
    }
    O *= exp(t * 0.1);

    vec3 col = max(O.rgb, 0.0);
    // Instrument accents: the KICK bursts the rays, HATS add a glitter
    // shimmer on top of the general beat glow.
    col *= 1.0 + 0.45 * audioBeat + 0.35 * audioKick + 0.25 * audioOnset;
    col *= 1.0 + 0.12 * audioHat * (0.5 + 0.5 * hash(gl_FragCoord.xy * 0.7));

    // Mood grade.
    col *= mix(vec3(0.70, 0.85, 1.25), vec3(1.30, 1.05, 0.70), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    // Image-forward: the picture colours the rays + drifts as a faint nebula.
    vec2 uv  = gl_FragCoord.xy / resolution;
    float himg = dot(imgPal(dot(col, vec3(0.333)) * 6.0
                 + length(gl_FragCoord.xy / resolution - 0.5) * 4.0), vec3(0.333));
    col = hueRot(col, (himg - 0.5) * 1.2 + time * 0.05);

    fragColor = vec4(col, 1.0);
}
