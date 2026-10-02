#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file MonetLilyPond.frag
 * @brief MONET LILY POND: the water-lily pond at Giverny as Monet painted
 * it -- no horizon, only water: the sky and the willows mirrored in it in
 * lilac, blue and green, and floating on it clusters of lily pads with
 * pink and white blossoms, all laid down in short visible brushstrokes.
 * The strokes are the picture: every pixel takes the colour of the stroke
 * it lies in, strokes lie horizontal on the water and follow the pads'
 * curve, and the paint shimmers as the reflections drift.  The pads drift
 * on the slow current; the music is the light on the water.
 *
 * Audio Reactivity:
 *   audioSwell  -> the sky's light in the reflection (slow)
 *   audioSpectrum[32] -> the blossoms glow, each with its band (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the drift of pads and reflections (continuous)
 *
 * Per-activation variety: padsP (how many pads), strokeP (stroke size), hueP.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSpectrum[32];   ///< Spectrum bands, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float padsP;
uniform float strokeP;
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
/// @brief Pseudo-random 2D vector (each 0..1) from a 2D point.
vec2 hash22(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
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

float g_T = 0.0, g_pads = 0.5, g_swell = 0.0;

/// The pads: clusters on a jittered lattice drifting with the current.
/// Returns (distance-ish, pad id) -- negative inside a pad.
vec2 pads(vec2 p)
{
    vec2 q = (p + vec2(g_T * 0.004, g_T * 0.0015)) * vec2(2.4, 6.5);   // foreshortened: we look across the pond
    vec2 gi = floor(q), gf = fract(q);
    float best = 9.0, id = 0.0;
    for (int j = -1; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i) {
        vec2 o = vec2(i, j), c = gi + o;
        if (hash21(c + 4.4) > 0.35 + 0.5 * g_pads) continue;
        vec2 cc = o + 0.2 + 0.6 * hash22(c);
        float r = 0.2 + 0.2 * hash21(c + 2.2);
        vec2 d = gf - cc;
        float ang = atan(d.y, d.x) - hash21(c) * 6.28;
        float notch = smoothstep(0.25, 0.0, abs(mod(ang, 6.2831853) - 0.3)) * 0.35;   // the lily-pad slit
        float dd = length(d) / r - 1.0 + notch * step(length(d), r);
        if (dd < best) { best = dd; id = hash21(c + 9.1); }
    }
    return vec2(best, id);
}

/// The painted colour at a point (before brushwork).
vec3 scene(vec2 p)
{
    // Water: the sky and the willows in reflection, lilac-blue-green bands
    // wavering across the pond.
    float y = p.y;
    float wob = fbm(vec2(p.x * 1.5 + g_T * 0.01, y * 6.0));
    vec3 skyR = mix(vec3(0.68, 0.72, 0.9), vec3(0.85, 0.75, 0.88), wob) * (0.85 + 0.3 * g_swell);
    vec3 deep = mix(vec3(0.2, 0.3, 0.45), vec3(0.3, 0.45, 0.4), fbm(p * 2.0 + 5.0));
    // Willow reflections: long drooping green-blue streaks from the top.
    float willow = smoothstep(0.42, 0.68, fbm(vec2(p.x * 5.0, y * 0.6 + g_T * 0.003))) * smoothstep(-0.35, 0.35, y);
    vec3 water = mix(skyR, deep, smoothstep(0.35, 0.65, wob) * 0.7);
    water = mix(water, mix(vec3(0.15, 0.35, 0.3), vec3(0.3, 0.45, 0.2), wob), willow * 0.85);
    // Warm light of the sky caught in the ripples.
    water = mix(water, vec3(0.95, 0.8, 0.6), smoothstep(0.7, 0.85, fbm(vec2(p.x * 3.0, y * 12.0) + 7.0)) * 0.5);
    water = mix(water, water * imgPalette(0.6 + hueP * 0.159) * 1.5, 0.12);
    // Pads with blossoms.
    vec2 pd = pads(p);
    if (pd.x < 0.0) {
        vec3 pad = mix(vec3(0.25, 0.45, 0.2), vec3(0.45, 0.6, 0.25), pd.y);
        pad = mix(pad, vec3(0.55, 0.45, 0.2), smoothstep(-0.2, 0.0, pd.x) * 0.4);    // warm rim
        water = pad;
    }
    // Blossoms: on some pads, a pink or white cup near the centre.
    if (pd.x < -0.4 && pd.y > 0.55) {
        int band = int(pd.y * 31.0);
        float e = clamp(audioSpectrum[band] * 1.5, 0.0, 1.0);
        vec3 bl = mix(vec3(0.95, 0.55, 0.65), vec3(0.98, 0.95, 0.9), step(0.8, pd.y));
        water = bl * (0.9 + 0.35 * e) + vec3(1.0, 0.9, 0.5) * smoothstep(-0.8, -1.0, pd.x) * 0.5;
    }
    return water;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    g_T = sceneTime + sceneAdvance * 0.4;
    g_pads = clamp(padsP, 0.0, 1.0);
    g_swell = clamp(audioSwell, 0.0, 1.0);
    float sz = 0.026 + 0.022 * clamp(strokeP, 0.0, 1.0);

    // Brushwork: two layers of strokes.  Each stroke is an elongated dab,
    // mostly horizontal on the water, turned a little each; its colour is
    // the scene sampled at the stroke's centre, so the picture resolves
    // into strokes.  The layers overlap, the upper one only partly.
    vec3 col = scene(p) * 0.6;
    for (int L = 0; L < 2; ++L) {
        float fl = float(L);
        vec2 g = p / (sz * (1.0 - 0.3 * fl)) + fl * 17.0;
        vec2 gi = floor(g);
        float bestD = 9.0; vec3 bc = vec3(0.0);
        for (int j = -1; j <= 1; ++j)
        for (int i = -1; i <= 1; ++i) {
            vec2 c = gi + vec2(i, j);
            vec2 ctr = c + 0.5 + 0.8 * (hash22(c + fl * 5.0) - 0.5);
            float ang = (hash21(c + 3.3 + fl) - 0.5) * 0.7;
            vec2 d = g - ctr;
            d = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * d;
            float e = length(d * vec2(0.55, 1.6));        // a horizontal dab
            e += 0.25 * noise2(d * 3.0 + c);              // bristly edge
            if (e < bestD)
            {
                bestD = e;
                bc = scene((ctr - fl * 17.0) * sz * (1.0 - 0.3 * fl));
                // Broken colour: each stroke leans a little warmer, cooler,
                // lighter or darker than its neighbours, as Monet laid them.
                vec3 jit = vec3(hash21(c + 11.0), hash21(c + 12.0), hash21(c + 13.0)) - 0.5;
                bc *= 1.0 + 0.22 * (hash21(c + 14.0) - 0.5);
                bc += jit * vec3(0.12, 0.08, 0.12);
            }
        }
        float a = smoothstep(0.95, 0.75, bestD) * (L == 0 ? 1.0 : 0.75);
        // Bristle streaks inside each stroke.
        float bristle = 0.9 + 0.1 * sin(g.y * 25.0 + noise2(g * 2.0) * 3.0);
        col = mix(col, bc * bristle, a);
    }
    // A little shimmer of light on the water, drifting.
    col += vec3(1.0, 0.95, 0.9) * pow(noise2(p * vec2(8.0, 30.0) + vec2(g_T * 0.05, 0.0)), 8.0) * 0.25 * (0.5 + g_swell);

    // Canvas weave under the thin places.
    col *= 0.95 + 0.05 * sin(gl_FragCoord.x * 1.3) * sin(gl_FragCoord.y * 1.3);
    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone * 1.1, 0.0, 1.0), 1.0);
}
