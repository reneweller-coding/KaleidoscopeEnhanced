#version 330 core
out vec4 fragColor;
/**
 * @file DroneDepths.frag
 * @brief An AMBIENT-FIRST primary effect, built for drone / dark-ambient music (no
 * beat dependence at all).  Research-informed mappings:
 *   swell (slow loudness build)  -> luminous breathing + LOOMING zoom
 *                                   (loudness -> expansion/approach);
 *   dominantPitch                -> vertical drift of the whole nebula
 *                                   (pitch -> elevation);
 *   centroid                     -> brightness / colour temperature;
 *   harmonicChange               -> slow morphs of the cloud structure.
 * The image is the substance of the nebula (image-forward), softly rounded
 * (harmonic material -> round, curved forms), with imgPal/hueRot colour
 * variance.  Jump-free motion (audioPhase/audioAdvance).
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioPitch;
uniform float audioHarmChange;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }

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

void main()
{
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Looming: the swell slowly expands the whole nebula toward the viewer.
    p /= (1.0 + 0.12 * audioSwell);
    p = rot(audioPhase * 0.06 + time * 0.008) * p;

    // Pitch -> elevation: rising tones lift the cloud field, falling tones sink it.
    float lift = (audioPitch - 0.5) * 0.35;

    // Very slow, majestic multi-layer warp; harmonic changes morph the structure.
    float t = time * 0.015 + audioAdvance * 0.10 + audioHarmChange * 0.30;
    vec2  q1 = vec2(fbm(p * 1.4 + vec2(0.0, t - lift)),
                    fbm(p * 1.4 + vec2(5.2, t * 1.2)));
    vec2  q2 = vec2(fbm(p * 2.2 + 2.5 * q1 + vec2(1.7, 9.2) - t * 0.6),
                    fbm(p * 2.2 + 2.5 * q1 + vec2(8.3, 2.8) + t * 0.4));

    // The image IS the nebula: sampled through the layered round warp.
    vec2 iuv = p * 0.5 + 0.5 + (q2 - 0.5) * 0.30 + vec2(0.0, lift * 0.4);
    vec3 pic = img(fract(iuv));

    // Depth glow: bright cores where the warp field folds onto itself.
    float density = fbm(p * 2.0 + q2 * 2.0);
    float core    = smoothstep(0.55, 0.85, density);

    vec3 col = pic * (0.35 + 0.55 * density + 0.45 * audioSwell);
    col += imgPal(density * 4.0) * core * (0.35 + 0.65 * audioSwell);

    // Soft vignette keeps it deep and centred.
    col *= 1.0 - 0.45 * dot(p, p);

    // Mood grade (centroid -> temperature/brightness, valence -> saturation).
    col *= mix(vec3(0.70, 0.82, 1.18), vec3(1.22, 1.02, 0.72), audioCentroid);
    col *= 0.75 + 0.5 * audioCentroid;
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.55 + 0.6 * audioValence);

    float himg = dot(imgPal(dot(col, vec3(0.333)) * 6.0 + length(p) * 4.0), vec3(0.333));
    col = hueRot(col, (himg - 0.5) * 2.5 + time * 0.03);

    col *= 0.85 + 0.4 * audioLevel;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
