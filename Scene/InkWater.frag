#version 330 core
out vec4 fragColor;
// InkWater.frag
// -----------------------------------------------------------------------
// INK IN WATER: coloured ink plumes sink into still water and billow into
// slow, marbled clouds (procedural — unrelated to the FluidSim pass).  The
// image IS the ink: every plume carries the colours of a drifting crop of
// the source picture.  Calm, hypnotic, ambient-first.
//   swell     -> the water "breathes", plumes billow wider
//   bass      -> deep slow swirl of the whole volume (slew-limited)
//   onset     -> fresh ink visibly wells out of the plume heads
//   centroid  -> water brightness / temperature
// Jump-free: all motion rides time + audioPhase/audioAdvance (integrated).
//
// Per-activation variety (0 = default):
//   plumesP  int   number of ink plumes        (0 -> 3; 2..5)
//   inkHueP  float ink hue rotation            (0 -> none; 0..6.28)
//   swirlP   float swirl strength multiplier   (0 -> 1.0; 0.6..1.8)
//   speedP   float sink/billow speed multiplier(0 -> 1.0; 0.6..1.5)
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioBass;
uniform float audioOnset;
uniform float audioCentroid;
uniform float audioValence;

uniform int   plumesP;
uniform float inkHueP;
uniform float swirlP;
uniform float speedP;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }
vec3 imgPal(float x)
{
    vec2 cc = vec2(0.5) + 0.30 * vec2(cos(time * 0.040 + audioPhase * 0.10),
                                      sin(time * 0.031 + audioPhase * 0.07));
    return img(fract(cc + 0.22 * vec2(cos(x), sin(x * 1.37))));
}
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p)
{
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}
float vnoise(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p)
{
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.07 + vec2(3.1, 7.7); a *= 0.5; }
    return s;
}

void main()
{
    int   nPlume = (plumesP > 0) ? plumesP : 3;
    float swirl  = (swirlP > 0.0) ? swirlP : 1.0;
    float spd    = (speedP > 0.0) ? speedP : 1.0;

    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // The whole water volume swirls slowly with the (slew-limited) bass and
    // breathes with the swell.
    p = rot(audioPhase * 0.05 * swirl + time * 0.006) * p;
    p /= (1.0 + 0.10 * audioSwell);

    // BASS VORTEX: the volume curls around a slowly drifting centre, wound
    // up by the slew-limited bass — the ink visibly sloshes with the music
    // (amplitude-modulated twist of a static field: continuous, no flicker).
    {
        vec2  vc = 0.22 * vec2(sin(time * 0.07), cos(time * 0.053));
        vec2  vd = p - vc;
        float va = (0.40 * audioBass + 0.18 * audioSwell) * swirl
                 * exp(-length(vd) * 2.2);
        p = vc + rot(va) * vd;
    }

    // Billowing: two stacked domain warps, sinking slowly (ink falls).
    float t  = time * 0.020 * spd + audioAdvance * 0.12;
    vec2  w1 = vec2(fbm(p * 1.8 + vec2(0.0, t)),
                    fbm(p * 1.8 + vec2(4.7, t * 1.13)));
    vec2  w2 = vec2(fbm(p * 3.1 + 2.2 * w1 + vec2(1.9, -t * 0.7)),
                    fbm(p * 3.1 + 2.2 * w1 + vec2(6.4,  t * 0.5)));
    vec2  wp = p + (w2 - 0.5) * (0.34 + 0.20 * audioSwell + 0.12 * audioBass) * swirl;

    // Ink density: sum of plumes, each a vertical column that sinks from the
    // top and widens with depth (classic ink-drop look).  EVERY PLUME HAS
    // ITS OWN COLOUR — the tints accumulate density-weighted, so where two
    // inks meet they visibly mix.
    float density = 0.0;
    float headGlow = 0.0;
    vec3  tintAcc = vec3(0.0);
    for (int i = 0; i < 6; i++)
    {
        if (i >= nPlume) break;
        float fi  = float(i);
        float px  = (hash11(fi * 13.7 + 3.1) - 0.5) * 1.3;         // column x
        float ph  = hash11(fi * 71.3 + 9.4) * 6.2831;              // sink phase
        float y0  = 0.55 - mod(t * (0.5 + 0.3 * hash11(fi * 5.1)) + ph, 1.6);
        vec2  d   = wp - vec2(px, y0);
        d.x      /= (0.28 + 0.55 * clamp(0.55 - y0, 0.0, 1.2));    // widen w/ depth
        float col = exp(-dot(d, d) * 7.0);
        density  += col;
        tintAcc  += hueRot(vec3(1.0, 0.45, 0.30),
                           inkHueP + hash11(fi * 9.7 + 0.4) * 4.8) * col;
        // The plume HEAD (just below the source) wells up on onsets.
        float head = exp(-dot(wp - vec2(px, y0 + 0.05), wp - vec2(px, y0 + 0.05)) * 30.0);
        headGlow  += head;
    }
    vec3 plumeTint = tintAcc / max(density, 1e-3);
    density = clamp(density, 0.0, 1.4);

    // Marbling detail inside the ink + fine TENDRIL filaments (a third,
    // higher-frequency warp layer eats sharp threads into the clouds).
    float marble  = fbm(wp * 4.0 + w1 * 3.0);
    float tendril = fbm(wp * 7.5 - w2 * 2.5 + vec2(t * 0.8, 0.0));
    density *= 0.72 + 0.55 * tendril;

    // Water: dark, cool, lit from above, with soft LIGHT SHAFTS falling in
    // from the surface (they breathe with the swell); the ink carries the
    // image's colours, tinted per plume.
    vec3 water = mix(vec3(0.015, 0.03, 0.05), vec3(0.05, 0.10, 0.14), audioCentroid)
               * (1.0 - 0.5 * (wp.y + 0.5));
    float shafts = pow(0.5 + 0.5 * sin(p.x * 9.0 + w1.x * 2.5), 3.0)
                 * smoothstep(-0.35, 0.55, p.y);
    water += vec3(0.08, 0.13, 0.19) * shafts * (0.30 + 0.65 * audioSwell);

    vec3 inkCol = img(fract(wp * 0.45 + 0.5 + (w2 - 0.5) * 0.2));
    inkCol = mix(inkCol, inkCol * plumeTint * 2.2, 0.60);
    inkCol *= 0.45 + 0.95 * marble;

    vec3 col = mix(water, inkCol, smoothstep(0.06, 0.85, density));
    // Fresh ink wells out of the plume heads on every onset — clearly
    // visible drops now, not just a faint shimmer.
    col += imgPal(marble * 5.0) * headGlow * (0.20 + 1.40 * audioOnset);

    // Gentle vignette + mood grade.
    col *= 1.0 - 0.40 * dot(p, p);
    col *= mix(vec3(0.75, 0.86, 1.15), vec3(1.18, 1.00, 0.76), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.55 * audioValence);
    col *= 0.85 + 0.4 * audioLevel;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
