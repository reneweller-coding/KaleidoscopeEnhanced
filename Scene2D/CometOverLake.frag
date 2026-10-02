#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file CometOverLake.frag
 * @brief COMET OVER LAKE: a great comet low over a mountain lake after
 * dusk, the way Hale-Bopp and NEOWISE were photographed -- a bright head,
 * a broad curved dust tail in pale gold fanning away from the sun below
 * the horizon, and a thin straight blue ion tail beside it; the last blue
 * of twilight along the ridge, stars coming out, dark pines on the shore,
 * and the lake holding the whole sky upside down in its still, faintly
 * rippling mirror.  The sky turns with glacial slowness; the music is the
 * light: the comet's glow and the shimmer on the water.
 *
 * Audio Reactivity:
 *   audioSwell  -> brightness of the tails (slow)
 *   audioHigh   -> twinkle of the stars (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the sky's turn, the ripples (continuous)
 *
 * Per-activation variety: tailP (tail length and spread), hueP.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float tailP;
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
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
/// @brief Smooth 2D value noise, 0..1.
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
/// @brief Fractal noise: octaves of value noise.
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.1; a *= 0.5; }
    return v;
}

float g_T = 0.0, g_tail = 0.5, g_swell = 0.0, g_hi = 0.0;

/// The night sky (above the horizon line h) at point q.
vec3 sky(vec2 q, float h)
{
    float e = q.y - h;
    vec3 s = mix(vec3(0.12, 0.2, 0.38), vec3(0.01, 0.02, 0.06), smoothstep(0.0, 0.45, e));
    s += vec3(0.9, 0.45, 0.2) * exp(-e * 12.0) * exp(-abs(q.x + 0.5) * 1.2) * 0.45;   // last dusk glow
    // Stars, turning slowly about a pole above the frame.
    vec2 pole = vec2(0.6, 1.3);
    float a = g_T * 0.003;
    vec2 r = pole + mat2(cos(a), -sin(a), sin(a), cos(a)) * (q - pole);
    vec2 g = r * 80.0, gi = floor(g), gf = fract(g);
    vec2 c = 0.25 + 0.5 * vec2(hash21(gi + 1.0), hash21(gi + 2.0));
    float hs = hash21(gi);
    float tw = 0.8 + 0.2 * sin(g_T * 3.0 + hs * 50.0) * (0.3 + g_hi);
    s += vec3(0.85, 0.9, 1.0) * smoothstep(0.1, 0.0, length(gf - c)) * step(0.975, hs) * tw * smoothstep(0.0, 0.15, e);

    // The comet: head up and to the right, tails pointing up-left (away
    // from the sun below the horizon).
    vec2 head = pole + mat2(cos(a), -sin(a), sin(a), cos(a)) * (vec2(0.22, 0.12) - pole);
    vec2 axis = normalize(vec2(-0.45, 1.0));
    vec2 d = r - head;
    d = r - (pole + mat2(cos(a), -sin(a), sin(a), cos(a)) * (vec2(0.22, 0.12) - pole)) ;
    float along = dot(d, axis), across = dot(d, vec2(-axis.y, axis.x));
    float len = 0.35 + 0.35 * g_tail;
    // Dust tail: broad, curved (bends to one side with distance), gold.
    float bend = across - 0.35 * along * along / len;
    float wd = 0.012 + 0.16 * clamp(along / len, 0.0, 1.0) * (0.7 + 0.5 * g_tail);
    float dust = exp(-bend * bend / (wd * wd)) * step(0.0, along) * exp(-along / len * 1.6);
    dust *= 0.8 + 0.4 * fbm(vec2(along * 20.0, bend * 40.0));                      // striae
    vec3 dustC = mix(vec3(1.0, 0.9, 0.7), imgPalette(0.1 + hueP * 0.159), 0.15);
    // Ion tail: thin, straight, blue, a bit longer.
    float iw = 0.004 + 0.02 * clamp(along / len, 0.0, 1.5);
    float ion = exp(-(across + 0.01) * (across + 0.01) / (iw * iw)) * step(0.0, along) * exp(-along / len * 1.1);
    ion *= 0.7 + 0.5 * noise2(vec2(along * 40.0 - g_T * 0.05, 0.0));
    float glow = 0.6 + 0.5 * g_swell;
    s += dustC * dust * 0.9 * glow + vec3(0.35, 0.6, 1.0) * ion * 0.6 * glow;
    // The head: a bright coma.
    float hr = length(d);
    s += vec3(0.9, 1.0, 0.95) * (exp(-hr * hr * 40000.0) * 2.0 + exp(-hr * 60.0) * 0.4) * glow;
    return s;
}

/// Mountains: a far ridge in twilight blue and a nearer, darker one.
float ridge(float x, float k)
{
    // Ridged noise: sharp summits and notches, like a real skyline.
    float h = 0.0, a = 0.5, f = 1.2 + 0.8 * k;
    for (int i = 0; i < 5; ++i) {
        float n = 1.0 - abs(2.0 * noise2(vec2(x * f + k * 7.0, k * 3.0 + float(i))) - 1.0);
        h += a * n * n; a *= 0.5; f *= 2.1;
    }
    return (0.16 - 0.07 * k) * h;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    g_T = sceneTime + sceneAdvance * 0.4;
    g_tail = clamp(tailP, 0.0, 1.0);
    g_swell = clamp(audioSwell, 0.0, 1.0);
    g_hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float shore = -0.14;

    vec3 col;
    if (p.y > shore) {
        col = sky(p, shore);
        float r1 = shore + 0.03 + ridge(p.x, 0.0);
        float r2 = shore + 0.01 + ridge(p.x + 3.0, 1.0) * 0.6;
        if (p.y < r1) col = mix(vec3(0.06, 0.09, 0.17), col, 0.3) + vec3(0.25, 0.12, 0.06) * exp(-abs(p.x + 0.5) * 1.5) * 0.15;
        if (p.y < r2) col = vec3(0.015, 0.02, 0.035);
        // Pines along the shore: pointed silhouettes.
        float px = p.x * 60.0, pi = floor(px), pf = fract(px) - 0.5;
        float th = 0.02 + 0.03 * hash21(vec2(pi, 3.0));
        float tree = step(p.y, shore + th * (1.0 - abs(pf) * 2.0 * (1.0 + 0.3 * sin((p.y - shore) * 400.0))));
        col = mix(col, vec3(0.01, 0.015, 0.02), tree * step(0.35, hash21(vec2(pi, 7.0))));
    } else {
        // The lake: the sky mirrored, rippled, a touch darker; a faint
        // shimmer where the comet's light falls.
        float d = shore - p.y;
        float rip = noise2(vec2(p.x * 30.0, d * 180.0 - g_T * 0.5)) - 0.5;
        vec2 mq = vec2(p.x + rip * 0.006 * (1.0 + d * 4.0), shore + d * 1.05);
        col = sky(mq, shore) * vec3(0.7, 0.75, 0.85);
        float r2 = shore + 0.01 + ridge(mq.x + 3.0, 1.0) * 0.6;
        if (mq.y < r2 + 0.02) col = mix(col, vec3(0.01, 0.015, 0.03), 0.9);
        col += vec3(1.0, 0.9, 0.7) * pow(max(rip, 0.0) * 2.0, 6.0) * 0.08 * (0.5 + g_swell);
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
