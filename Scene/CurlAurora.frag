#version 330 core
out vec4 fragColor;
// CurlAurora.frag
// -----------------------------------------------------------------------
// Flowing aurora curtains (domain-warped value noise) driven by mood.
//   audioArousal  -> contrast / brightness of the curtains
//   audioValence  -> palette (low = teal/green, high = magenta/pink)
//   audioCentroid -> pale-blue bright tips (spectral brightness)
//   audioLevel/SubBass -> overall glow
//   audioPhase/Advance -> smooth, jump-free horizontal drift with the music
//   audioBeat     -> gentle shimmer (slew-limited host-side, never strobes)
// The source image breathes through as subtle texture.
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioBeat;
uniform float audioLevel;
uniform float audioCentroid;
uniform float audioFlux;
uniform float audioSubBass;
uniform float audioArousal;
uniform float audioValence;
uniform float audioPhase;
uniform float audioAdvance;

float hash21(vec2 p)
{
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}

float vnoise(vec2 p)
{
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p)
{
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++)
    {
        s += a * vnoise(p);
        p *= 2.02;
        a *= 0.5;
    }
    return s;
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution.xy;                       // 0..1
    vec2 p  = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y; // centred, aspect

    // Horizontal drift = smooth base time + jump-free audio phase/advance.
    float t = time * 0.05 + audioPhase * 0.30 + audioAdvance * 2.0;

    vec2 q = vec2(p.x * 1.5 + t, p.y * 0.8);
    float warp    = fbm(q * 1.5 + vec2(0.0, time * 0.05));
    float ribbons = fbm(vec2(q.x * 2.0 + warp * 1.5, q.y * 3.0 - time * 0.10));

    // Curtains hang from the top; brighter where ribbons are dense.
    float curtain = smoothstep(-0.6, 0.8, p.y) * (0.5 + 0.5 * ribbons);
    float glow    = pow(curtain, 2.0 - audioArousal)
                  * (0.6 + 1.4 * audioLevel + 0.8 * audioSubBass);

    // Palette: valence warm<->cool, centroid lifts toward pale-blue tips.
    vec3 cool = vec3(0.10, 0.85, 0.70);   // teal / green
    vec3 warm = vec3(0.95, 0.35, 0.75);   // magenta / pink
    vec3 tip  = vec3(0.65, 0.95, 1.05);   // pale blue
    vec3 base = mix(cool, warm, audioValence);
    vec3 col  = mix(base, tip, smoothstep(0.2, 0.9, curtain) * audioCentroid);
    col *= glow;

    // Let the source image show through as gentle texture.
    vec4 img = interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv);
    col = mix(col, col * (0.4 + 1.2 * img.rgb), 0.35);

    // Beat shimmer + flux brightening (both slew-limited host-side).
    col += vec3(0.15, 0.18, 0.25) * audioBeat;
    col *= (1.0 + 0.25 * audioFlux);

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
