#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file MusicalFountainShow.frag
 * @brief MUSICAL FOUNTAIN SHOW: a dancing fountain at night on a long
 * basin, a row of jets across the whole frame, each lit from below, the
 * spray hanging as glowing mist and the whole show mirrored in the dark
 * water.  Each jet is a spectrum band: its height follows the smoothed
 * energy of that band, so the row of water draws the spectrum as a living
 * silhouette.  A few tall centre jets breathe with the swell.  Behind the
 * basin a city skyline of the photo glows in the night.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> height and light of each jet (smoothed by the host;
 *                        heights move continuously, never jump)
 *   audioSwell        -> the tall centre jets and the mist (slow)
 *   audioKick         -> the underwater lights surge (light)
 *   sceneTime         -> the water's own flicker and fall (continuous)
 *
 * Per-activation variety: jetsP (number of jets), hueP.
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
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float jetsP;
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

float g_hue;
float g_aspect;
float g_n;

vec3 jetColour(float i)
{
    // Fountain lights are coloured gels: the photo arc, saturated.
    vec3 c = imgPalette(g_hue * 0.159 + i / g_n * 0.7);
    float m = max(c.r, max(c.g, c.b));
    c = pow(c / max(m, 1e-3), vec3(1.8));
    return mix(c, vec3(1.0), 0.25);
}

/// The fountain seen above the water line (y > wl).  Returns emission.
vec3 fountain(vec2 p, float wl)
{
    vec3 col = vec3(0.0);
    float span = g_aspect * 0.46;
    float kick = clamp(audioKick, 0.0, 2.0);
    for (int k = 0; k < 40; ++k)
    {
        float fk = float(k);
        if (fk >= g_n) break;
        float x = mix(-span, span, (fk + 0.5) / g_n);
        int band = int(clamp(fk / g_n * 31.0, 0.0, 31.0));
        float e = clamp(audioSpectrum[band] * 1.4, 0.0, 1.0);
        // Centre jets are the tall ones and breathe with the swell.
        float centre = exp(-pow(x / (span * 0.18), 2.0));
        float hgt = 0.08 + 0.42 * e + centre * (0.15 + 0.3 * clamp(audioSwell, 0.0, 1.0));
        float y = p.y - wl;
        if (y < -0.01 || y > hgt + 0.08) continue;
        float s = clamp(y / max(hgt, 1e-3), 0.0, 1.2);
        // The column thins toward the top and frays into drops.
        float w = mix(0.012, 0.004, s) + 0.02 * s * s;
        float d = abs(p.x - x) / w;
        float core = exp(-d * d) * smoothstep(1.1, 0.8, s);
        // Spray: round drops (jittered cells) falling out of the crown.
        vec2 dg = vec2((p.x - x) * 160.0, (y - hgt) * 90.0 + sceneTime * 7.0 + fk * 3.1);
        vec2 dc = floor(dg), df = fract(dg) - 0.5;
        vec2 dj = vec2(hash21(dc + fk), hash21(dc + fk + 5.0)) - 0.5;
        float drop = smoothstep(0.3, 0.1, length(df - dj * 0.5)) * step(0.55, hash21(dc + fk * 7.0));
        float crown = exp(-d * d * 0.08) * smoothstep(0.55, 0.95, s) * smoothstep(1.3, 1.0, s);
        float spray = crown * (0.35 + 0.9 * drop);
        // Lit from below: brighter near the nozzle.
        float lit = 0.4 + 0.9 * exp(-y * 3.0);
        vec3 jc = jetColour(fk);
        col += jc * (core * 1.1 + spray * 0.5) * lit * (0.55 + 0.6 * e) * (1.0 + 0.35 * kick);
    }
    return col;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    g_aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(g_aspect, 1.0);
    g_hue = (hueP > 0.001) ? hueP : 0.0;
    g_n = 18.0 + floor(clamp(jetsP, 0.0, 1.0) * 3.0) * 6.0;         // once per activation
    float swell = clamp(audioSwell, 0.0, 1.0);

    float wl = -0.18;                                                   // water line

    // Night sky and a skyline of the photo.
    vec3 col = mix(vec3(0.02, 0.025, 0.06), imgPalette(g_hue * 0.159 + 0.6) * 0.06, 0.4);
    float sky = uv.y;
    col += vec3(0.1, 0.05, 0.08) * smoothstep(0.9, 0.35, sky) * 0.5;
    float bx = floor(p.x * 18.0);
    float bh = 0.02 + 0.2 * hash11(bx) * hash11(bx + 3.0) + 0.05;
    float building = step(p.y, wl + 0.06 + bh);
    vec2 wq = vec2(p.x * 90.0, p.y * 60.0);
    float win = step(0.62, hash21(floor(wq))) * step(0.2, fract(wq.x)) * step(0.3, fract(wq.y));
    vec3 city = img(fract(uv * vec2(1.5, 1.0))) * 0.05 + vec3(0.01);
    city += mix(vec3(1.0, 0.75, 0.4), imgPalette(g_hue * 0.159 + 0.1), 0.3) * win * 0.35;
    col = mix(col, city, building * step(wl, p.y));

    // The fountain above the water.
    if (p.y > wl) col += fountain(p, wl);

    // Mist hanging over the basin, lit by the jets.
    float mist = noise2(vec2(p.x * 3.0 + sceneTime * 0.1, p.y * 5.0)) * smoothstep(wl + 0.4, wl, p.y) * step(wl, p.y);
    vec3 mistC = fountain(vec2(p.x, wl + 0.02), wl) * 0.5 + jetColour(g_n * 0.5) * 0.05;
    col += mistC * mist * (0.4 + 0.6 * swell);

    // The basin: a black mirror of everything above, rippled.
    if (p.y < wl)
    {
        float depth = wl - p.y;
        float rip = noise2(vec2(p.x * 40.0, depth * 90.0 - sceneTime * 1.5)) - 0.5;
        vec2 mp = vec2(p.x + rip * 0.01 * (1.0 + depth * 6.0), wl + depth * 1.1);
        vec3 refl = fountain(mp, wl);
        refl += mix(col, vec3(0.0), 0.0) * 0.0;
        col = vec3(0.005, 0.008, 0.015) + refl * 0.5 * exp(-depth * 2.5);
        // Underwater lights at the nozzles.
        float span = g_aspect * 0.46;
        float kick = clamp(audioKick, 0.0, 2.0);
        for (int k = 0; k < 40; ++k)
        {
            float fk = float(k);
            if (fk >= g_n) break;
            float x = mix(-span, span, (fk + 0.5) / g_n);
            vec2 d = vec2(p.x - x, (p.y - wl + 0.015) * 2.5);
            col += jetColour(fk) * exp(-dot(d, d) * 2500.0) * (0.6 + 0.6 * kick);
        }
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
