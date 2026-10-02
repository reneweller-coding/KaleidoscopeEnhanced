#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file StarryNightFlow.frag
 * @brief STARRY NIGHT FLOW: the photo repainted in thick, flowing brush
 * strokes, the way Van Gogh painted a night sky.  A few great vortices
 * turn in the picture and everything else streams around them; every
 * stroke follows the flow, the paint is laid on in ridges, and the
 * brightest places of the photo become stars wrapped in rings of strokes.
 * The strokes creep along the flow on the music's pace; each vortex's
 * halo glows with its own band.
 *
 * Audio Reactivity:
 *   sceneAdvance      -> the strokes creep along the flow (continuous)
 *   audioSpectrum[32] -> glow of the vortex halos (one band each)
 *   audioSwell        -> how strongly the vortices wind the picture (slow)
 *   audioHigh         -> sparkle in the star rings (light)
 *
 * Per-activation variety: swirlP (number of vortices), hueP.
 */
uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSpectrum[32];   ///< Spectrum bands, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float swirlP;   ///< Swirl knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

/// @brief Pseudo-random number 0..1 from a float.
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
/// @brief Smooth 2D value noise, 0..1.
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

float g_aspect;
int   g_nv;
vec2  g_vc[4];
float g_vs[4];
float g_wind;

/// The flow: a gentle drift plus a rotational field around each vortex.
vec2 flow(vec2 q)
{
    vec2 v = vec2(1.0, 0.15 * sin(q.x * 2.1 + q.y * 1.3));
    v += 0.35 * vec2(sin(q.y * 3.1 + 1.0), cos(q.x * 2.7 + 2.0));
    for (int i = 0; i < 4; ++i)
    {
        if (i >= g_nv) break;
        vec2 d = q - g_vc[i];
        float r2 = dot(d, d);
        v += g_wind * g_vs[i] * vec2(-d.y, d.x) / (r2 + 0.02) * exp(-r2 * 3.0);
    }
    return normalize(v);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    g_aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(g_aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    g_nv = 2 + int(clamp(swirlP, 0.0, 1.0) * 2.99);
    g_wind = 0.32 + 0.12 * swell;
    float crawl = sceneAdvance * 0.06 + sceneTime * 0.02;
    for (int i = 0; i < 4; ++i)
    {
        float fi = float(i);
        g_vc[i] = vec2((hash11(fi * 3.7 + 1.0) - 0.5) * g_aspect * 0.85 + 0.05 * sin(sceneTime * 0.05 + fi),
                       (hash11(fi * 5.3 + 2.0) - 0.4) * 0.7);
        g_vs[i] = (hash11(fi * 9.1) < 0.5 ? -1.0 : 1.0) * (0.6 + 0.6 * hash11(fi * 2.3));
    }

    // Line-integral convolution along the flow: the photo's colour smeared
    // along streamlines, and a white-noise field smeared the same way gives
    // the brush grooves.  The noise is sampled a little further along the
    // flow as time goes on, so the strokes creep with it.
    vec3 paint = vec3(0.0);
    float groove = 0.0, wsum = 0.0;
    const int N = 9;
    const float h = 0.009;
    for (int dir = 0; dir < 2; ++dir)
    {
        vec2 q = p;
        float sgn = dir == 0 ? 1.0 : -1.0;
        for (int i = 0; i < N; ++i)
        {
            if (dir == 1 && i == 0) { q -= flow(q) * h; continue; }
            float w = 1.0 - float(i) / float(N);
            vec2 f = flow(q);
            vec2 quv = q / vec2(g_aspect, 1.0) + 0.5;
            paint += img(clamp(quv, 0.0, 1.0)) * w;
            // Grooves: fine noise, advected along the stroke direction.
            vec2 nq = q * vec2(95.0, 95.0) - f * crawl * 60.0;
            groove += noise2(nq) * w;
            wsum += w;
            q += f * h * sgn;
        }
    }
    paint /= wsum;
    groove /= wsum;

    // Van Gogh's colour: the photo's light and dark mapped onto his night
    // palette -- deep ultramarine, cobalt, a turquoise swirl, chrome-yellow
    // light -- and leaned back toward the photo's own colour, so every
    // activation is still that photo, painted.
    float g = dot(paint, vec3(0.333));
    float gs = smoothstep(0.05, 0.8, g);
    vec3 ultra  = vec3(0.05, 0.1, 0.35);
    vec3 cobalt = vec3(0.12, 0.3, 0.7);
    vec3 turq   = vec3(0.35, 0.65, 0.75);
    vec3 yellow = vec3(1.0, 0.85, 0.35);
    vec3 night = gs < 0.33 ? mix(ultra, cobalt, gs * 3.0)
               : gs < 0.66 ? mix(cobalt, turq, (gs - 0.33) * 3.0)
               :             mix(turq, yellow, (gs - 0.66) * 3.0);
    vec3 photoC = mix(vec3(g), paint, 1.5);
    vec3 col = mix(night, photoC, 0.3);
    col = mix(col, imgPalette(hue * 0.159 + g * 0.6), 0.1);
    // Impasto: the grooves as light and shadow across each stroke.
    float ridge = smoothstep(0.38, 0.62, groove);
    col *= 0.62 + 0.62 * ridge;
    col += vec3(1.0, 0.95, 0.85) * pow(ridge, 6.0) * 0.12;

    // Stars: the vortex centres carry glowing halos of concentric strokes.
    for (int i = 0; i < 4; ++i)
    {
        if (i >= g_nv) break;
        float d = length(p - g_vc[i]);
        int band = int(mod(float(i) * 9.0 + 4.0, 32.0));
        float e = clamp(audioSpectrum[band] * 1.5, 0.0, 1.0);
        vec3 starC = mix(vec3(1.0, 0.92, 0.55), imgPalette(hue * 0.159 + 0.1 + float(i) * 0.07), 0.3);
        float rings = 0.5 + 0.5 * sin(d * 90.0 - crawl * 3.0 * g_vs[i]);
        float halo = exp(-d * 5.0) * (0.25 + 0.75 * rings) * ridge;
        col = mix(col, starC * (0.8 + 0.4 * rings), clamp(halo * (0.35 + 0.8 * e), 0.0, 0.8));
        col += starC * exp(-d * 40.0) * (0.7 + 0.8 * e);
        // Sparkle in the ring strokes.
        col += starC * pow(rings, 16.0) * exp(-d * 8.0) * hi * 0.4;
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
