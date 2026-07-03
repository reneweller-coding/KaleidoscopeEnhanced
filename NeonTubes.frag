// NeonTubes.frag
// -----------------------------------------------------------------------
// Adapted from a @kishimisu code-golf raymarch (2022, CC BY-NC-SA 4.0).
// "A nice mix between an intended result and happy bugs integrated as features."
//
// A fly-through of pulsing neon rings/tubes in a repeating domain.  Adapted to
// our engine: image-forward (the picture colours the tubes + drifts as a faint
// nebula), audio-reactive & jump-free (forward travel via audioAdvance; beats
// brighten; centroid/valence grade).
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

vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

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
    float scroll = time * 0.5 + audioAdvance * 2.0;   // forward travel (jump-free)

    for (int g = 0; g < 200; g++)
    {
        if (f <= 0.001) break;
        vec3 e = o * normalize(vec3(n, 1.0));
        e.z += scroll;
        float l = floor(e.z + 0.5);
        f = 2.0 - length(e.xy) - o * 0.1;
        e = fract(e + 0.5) - 0.5;
        float rr1 = tmix(0.1, 0.5, 2.0, l);
        float rr2 = tmix(0.05, tmix(0.1, 0.4, 0.5, 0.0), 1.0, 1.6 + l);
        f = 0.5 * max(f, length(vec2(length(e.xy) - rr1, e.z)) - rr2);
        o += f;
    }

    vec3 col = (cos(o * 8.0 + vec3(0.0, 1.0, 2.0) * 0.8) * 5.0) / exp(o * 0.2 + length(n));
    col = max(col, 0.0);
    col *= 1.0 + 0.5 * audioBeat + 0.3 * audioOnset;

    // Mood grade.
    col *= mix(vec3(0.70, 0.85, 1.25), vec3(1.30, 1.05, 0.70), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    // Image-forward: the picture colours the tubes + drifts as a faint nebula.
    float himg = dot(imgPal(dot(col, vec3(0.333)) * 6.0
                 + length(gl_FragCoord.xy / resolution - 0.5) * 4.0), vec3(0.333));
    col = hueRot(col, (himg - 0.5) * 3.0 + time * 0.05);

    gl_FragColor = vec4(col, 1.0);
}
