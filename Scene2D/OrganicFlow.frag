#version 330 core
out vec4 fragColor;
/**
 * @file OrganicFlow.frag
 * @brief The source image pushed through an organic, reaction-diffusion-like FLOW:
 * a domain-warped fbm displaces and marbles the folded picture while glowing
 * veins trace the cell boundaries, all mirror-symmetric so it reads like
 * living stained glass.  The *image* is the star (was a 40% tint on procedural
 * colour).
 *   audioBass      -> vein scale / thickness
 *   audioStereo    -> horizontal stretch (wide stereo = wider cells)
 *   audioDeltaPitch-> extra churn on melodic movement
 *   audioValence/Centroid -> vein palette & fold count
 *   audioPhase     -> smooth flow (jump-free); audioBeat -> vein flash
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioBass;
uniform float audioLevel;
uniform float audioBeat;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioStereo;
uniform float audioPhase;
uniform float audioSwell;      // slow loudness swell -> vein scale breathes
uniform float audioBarPhase;   // 0..1 per bar -> gentle per-bar hue sweep

// Per-activation variety (re-rolled each activation; 0 = default):
uniform int   sidesP;          // mirror fold count (0 -> 4; 3..8)
uniform float veinP;           // vein frequency    (0 -> 7.0; 5 = broad, 10 = filigree)
uniform float swirlP;          // radial swirl amount (0 -> none; up to ~0.8)

const float PI = 3.14159265358979;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }

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
    for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return s;
}

vec2 kaleido(vec2 p, float sides)
{
    float a   = atan(p.y, p.x);
    float r   = length(p);
    float seg = PI / sides;
    a = mod(a + PI, 2.0 * seg) - seg;
    a = abs(a);
    return vec2(cos(a), sin(a)) * r;
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

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p  = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;

    p = rot(audioPhase * 0.15 + time * 0.02) * p;
    p.x *= 1.0 + audioStereo * 0.15;                 // gentle stereo stretch

    // Per-activation radial swirl: the whole flow winds into a slow spiral.
    if (swirlP > 0.001)
    {
        float ang = swirlP * length(p) * 1.6 + audioPhase * 0.08;
        p = rot(ang) * p;
    }

    // Fold count fixed per activation (audio-stepped folds snap the frame).
    vec2  fp = kaleido(p, float((sidesP >= 2) ? sidesP : 4));

    float t  = time * 0.08 + audioPhase * 0.2;
    vec2  q  = vec2(fbm(fp * 2.0 + vec2(0.0, t)), fbm(fp * 2.0 + vec2(5.2, t * 1.1)));
    vec2  rr = vec2(fbm(fp * 2.0 + 3.0 * q + vec2(1.7, 9.2) + t * 0.5),
                    fbm(fp * 2.0 + 3.0 * q + vec2(8.3, 2.8) - t * 0.5));
    float v  = fbm(fp * 2.5 + 4.0 * rr);

    // The flow field warps and marbles the folded picture.
    vec2 iuv = fp * 0.6 + 0.5 + (rr - 0.5) * (0.10 + 0.12 * audioLevel);
    vec3 pic = img(fract(iuv));

    // Glowing veins along the cell boundaries.  Vein frequency is constant per
    // activation and breathes only with the SLOW swell (the old per-beat bass
    // swing rescaled the banding every beat -> hectic crawling).
    float scale = ((veinP <= 0.01) ? 7.0 : veinP) * (1.0 + 0.10 * audioSwell);
    float band  = sin(v * scale + t * 2.0);
    float vein  = 1.0 - smoothstep(0.0, 0.18, abs(band));
    // A second, finer filigree octave between the main veins.
    float band2 = sin(v * scale * 2.7 + t * 3.0 + 1.7);
    float vein2 = (1.0 - smoothstep(0.0, 0.10, abs(band2))) * 0.45;

    // Vein colour comes from a drifting crop of the IMAGE (not a fixed
    // teal/orange), warmed/cooled by the valence.
    vec3 veinCol = imgPal(v * 4.0) * 1.6;
    veinCol = mix(veinCol, veinCol * vec3(1.25, 0.85, 0.55), 0.5 * audioValence);

    vec3 col = pic * (0.5 + 0.8 * audioLevel);
    col = mix(col, veinCol * (0.8 + 1.4 * audioBeat), vein * 0.6);
    col = mix(col, veinCol * 1.2, vein2 * (0.3 + 0.3 * audioCentroid));
    col += vein * audioBeat * 0.3 * veinCol;
    col *= (1.0 + 0.15 * audioSwell);
    col *= 1.0 - 0.25 * dot(p, p);

    // Gentle per-bar hue sweep (continuous across the bar wrap).
    col = hueRot(col, 0.35 * sin(audioBarPhase * 6.28318));

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
