#version 330 core
out vec4 fragColor;
/**
 * @file InsideSystem.frag
 * @brief Adapted from "Inside the System" by \@kishimisu (2022) — https://www.shadertoy.com/view/msj3D3
 * Original licensed CC BY-NC-SA 4.0 (attribution kept per the licence).
 *
 * Neon torus lights in an infinitely-repeating domain, flown through by an
 * orbiting camera.  Adapted to our engine: image-forward (the picture colours
 * the neon glow + drifts as a faint nebula), audio-reactive & jump-free (camera
 * travel from audioAdvance; beats/onsets brighten; centroid/valence grade).
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
uniform float audioSwell;      // slow loudness swell -> neon thickness breathes
uniform float audioBarPhase;   // 0..1 per bar -> gentle per-bar hue sweep

// Per-activation variety (re-rolled each activation; 0 = default):
uniform float spacingP;   // torus lattice spacing (0 -> 7.0; 5 = dense, 9 = sparse)
uniform float attenP;     // neon attenuation      (0 -> 22; 14 = fat glow, 30 = thin)
uniform int   kSides;     // >=2: weave a spinning n-fold image rosette in (0 = off)
uniform float rosetteP;   // rosette strength      (0 -> 0.22)

#define TT          (time * 0.7)
#define spacing       ((spacingP <= 0.01) ? 7.0 : spacingP)
#define light_spacing 2.0
// Neon glow fattens with the slow swell (loudness -> size, slew-limited upstream).
#define attenuation  (((attenP <= 0.01) ? 22.0 : attenP) * (1.0 - 0.15 * audioSwell))
#define epsilon       0.005

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

float hash12(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

#define rep(p, r)  (mod((p) + (r) / 2.0, (r)) - (r) / 2.0)
#define torus(p)   (length(vec2(length((p).xz) - 0.6, (p).y)) - 0.06)

vec3 getLight(vec3 p, vec3 color)
{
    return max(vec3(0.0), color / (1.0 + pow(abs(torus(p) * attenuation), 1.3)) - 0.001);
}

vec3 geo(vec3 po, inout float d, inout vec2 f)
{
    float r = hash12(floor(po.yz / spacing + vec2(0.5))) - 0.5;
    vec3  p = rep(po + vec3(TT * r * 4.0, 0.0, 0.0), vec3(0.5, spacing, spacing));
    p.xy *= rotm(1.57);
    d = min(d, torus(p));

    f = floor(po.yz / (spacing * light_spacing) - vec2(0.5));
    r = hash12(f) - 0.5;
    if (r > -0.45)
        p = rep(po + vec3(TT * 30.0 * r, 0.0, 0.0), spacing * light_spacing * vec3(r + 0.54, 1.0, 1.0));
    else
        p = rep(po + vec3(TT * 30.0 * 0.5 * (1.0 + r * 0.003 * hash12(floor(po.yz * spacing))), 0.0, 0.0),
                spacing * light_spacing);
    p.xy *= rotm(1.57);
    f = (cos(f.xy) * 0.5 + 0.5) * 0.4;
    return p;
}

vec4 map(vec3 p)
{
    float d = 1e6;
    vec3  po, col = vec3(0.0);
    vec2  f;

    po = geo(p, d, f);
    col += getLight(po, vec3(1.0, f));

    p.z  += spacing / 2.0;
    p.xy *= rotm(1.57);
    po = geo(p, d, f);
    col += getLight(po, vec3(f.x, 0.5, f.y));

    p.xy += spacing / 2.0;
    p.xz *= rotm(1.57);
    po = geo(p, d, f);
    col += getLight(po, vec3(f, 1.0));

    return vec4(col, d);
}

vec3 getOrigin(float t)
{
    t = (t + 35.0) * -0.05;
    float rad = mix(50.0, 80.0, cos(t * 1.24) * 0.5 + 0.5);
    return vec3(rad * sin(t * 0.97), rad * cos(t * 1.11), rad * sin(t * 1.27));
}

void main()
{
    vec2 uv = (2.0 * gl_FragCoord.xy - resolution) / resolution.y;

    float camT = TT + audioAdvance * 0.4;            // audio travel (jump-free)
    vec3  ro   = getOrigin(camT);
    vec3  fdir = normalize(getOrigin(camT + 0.5) - ro);
    vec3  rr   = normalize(cross(normalize(ro), fdir));
    vec3  rd   = normalize(fdir + uv.x * rr + uv.y * cross(fdir, rr));

    vec3  col = vec3(0.0);
    float t   = 2.0;
    for (int i = 0; i < 50; i++)
    {
        vec3 p = ro + t * rd;
        vec4 res = map(p);
        col += res.rgb;
        t += abs(res.w);
        if (abs(res.w) < epsilon) t += epsilon;
        if (col.r >= 1.0 && col.g >= 1.0 && col.b >= 1.0) break;
        if (t > 80.0) break;
    }

    col = pow(max(col, 0.0), vec3(0.45));
    col *= 1.0 + 0.5 * audioBeat + 0.3 * audioOnset;

    // Mood grade.
    col *= mix(vec3(0.70, 0.85, 1.25), vec3(1.30, 1.05, 0.70), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    // Image-forward: the picture colours the neon + drifts as a faint nebula;
    // the hue sweeps gently once per bar (continuous across the bar wrap).
    float himg = dot(imgPal(dot(col, vec3(0.333)) * 6.0
                 + length(gl_FragCoord.xy / resolution - 0.5) * 4.0), vec3(0.333));
    col = hueRot(col, (himg - 0.5) * 3.0 + time * 0.05
                      + 0.45 * sin(audioBarPhase * 6.28318));

    // Per-activation: a spinning n-fold kaleidoscopic image rosette woven into
    // the neon field (squared -> only its bright parts, keeps the depth).
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
