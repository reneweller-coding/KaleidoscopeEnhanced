#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file AnticrepuscularRays.frag
 * @brief ANTICREPUSCULAR RAYS: looking out to sea at sunset with the sun at
 * your back -- and across the whole sky great bands of light and shadow
 * run from behind you over your head and converge again on a point on the
 * far horizon ahead, where the sun is not.  Between them the sky is pink
 * and violet, low down the blue band of the earth's shadow rises from the
 * sea, a few clouds glow pink, and the calm sea mirrors the fan of rays.
 * The rays drift slowly as the clouds behind you move.  The camera is still.
 *
 * Audio Reactivity:
 *   audioSwell  -> the contrast of the rays (slow)
 *   audioBass   -> the pink glow of the sky (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the rays drifting, the swell of the sea
 *
 * Per-activation variety: raysP (how many rays), hueP.
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
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float raysP;
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
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

/// The ray pattern as a function of the angle around the antisolar point.
float rayPattern(float ang, float T, float n)
{
    float a = ang * n;
    float v = 0.55 * noise2(vec2(a, T * 0.01)) + 0.3 * noise2(vec2(a * 2.3 + 5.0, T * 0.013)) + 0.15 * noise2(vec2(a * 5.0 + 9.0, T * 0.02));
    return smoothstep(0.35, 0.65, v);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float n = 3.0 + 4.0 * clamp(raysP, 0.0, 1.0);

    float hz = -0.16;
    vec2 anti = vec2(0.06, hz - 0.01);                        // the antisolar point on the horizon
    vec2 d = p - anti;
    float ang = atan(d.x, d.y);                               // 0 straight up
    float sy = p.y - hz;

    // Sky: the earth's shadow (blue) low, the belt of Venus (pink), violet above.
    vec3 sky = mix(vec3(0.3, 0.33, 0.5), vec3(0.95, 0.6, 0.62), smoothstep(0.02, 0.1, sy));
    sky = mix(sky, vec3(0.62, 0.52, 0.72), smoothstep(0.12, 0.3, sy));
    sky = mix(sky, vec3(0.35, 0.4, 0.65), smoothstep(0.3, 0.55, sy));
    sky *= 0.85 + 0.3 * bass;
    // The rays: shadow bands darken the sunlit air above the earth's shadow.
    float rp = rayPattern(ang, T, n);
    float fan = smoothstep(0.04, 0.14, sy) * smoothstep(0.0, 0.12, length(d));
    float contrast = (0.25 + 0.25 * swell) * fan;
    vec3 col = sky * (1.0 - contrast + contrast * 1.6 * rp);
    // A few small clouds lit pink.
    float cl = smoothstep(0.62, 0.78, fbm(vec2(p.x * 3.0 + T * 0.005, sy * 12.0))) * smoothstep(0.05, 0.12, sy) * smoothstep(0.35, 0.18, sy);
    col = mix(col, mix(vec3(1.0, 0.65, 0.65), imgPalette(0.95 + hueP * 0.159), 0.12) * (0.9 + 0.3 * bass), cl * 0.7);

    // The sea: the sky mirrored, darker, broken by gentle waves.
    if (p.y < hz) {
        float dd = hz - p.y;
        float z = 0.2 / dd;
        vec2 wq = vec2(p.x * z, z);
        float wv = noise2(wq * vec2(2.0, 0.6) + vec2(0.0, T * 0.15)) * 0.6 + noise2(wq * vec2(6.0, 1.8) - vec2(0.0, T * 0.2)) * 0.4;
        vec2 mp = vec2(p.x + 0.01 * (wv - 0.5) * dd * 4.0, hz + dd * (0.8 + 0.4 * wv));
        vec2 md = mp - anti;
        float msy = mp.y - hz;
        vec3 ms = mix(vec3(0.3, 0.33, 0.5), vec3(0.95, 0.6, 0.62), smoothstep(0.02, 0.1, msy));
        ms = mix(ms, vec3(0.62, 0.52, 0.72), smoothstep(0.12, 0.3, msy));
        float mrp = rayPattern(atan(md.x, md.y), T, n);
        ms *= 1.0 - contrast + contrast * 1.6 * mrp;
        col = ms * (0.55 + 0.25 * smoothstep(0.0, 0.3, dd)) * (0.8 + 0.3 * wv);
        col = mix(col, vec3(0.2, 0.22, 0.35), smoothstep(0.1, 0.4, dd) * 0.4);
    }
    // A thin haze line at the horizon.
    col += vec3(0.4, 0.35, 0.45) * exp(-abs(p.y - hz) * 200.0) * 0.3;

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
