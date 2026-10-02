#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file KoiPondAbove.frag
 * @brief KOI POND ABOVE: a garden pond seen straight down.  Koi -- white,
 * orange and black-patched -- glide in slow curves under the surface; the
 * sky and the overhanging branches mirror on the water; a few maple leaves
 * float on top; caustics ripple over the stones on the bottom.  The fish
 * swim at their own gentle pace.  The music is light on the water: each
 * fish's colour glows a little with its band, and the swell brightens the
 * sky in the reflection.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> glow of each fish's colour (its band)
 *   audioSwell        -> sky brightness in the reflection (slow)
 *   audioHigh         -> sparkle on the ripples (light)
 *   sceneTime         -> the swimming and the ripples (continuous)
 *
 * Per-activation variety: fishP (how many koi), hueP.
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

uniform float fishP;
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
/// @brief Pseudo-random 2D vector (each 0..1) from a 2D point.
vec2  hash22(vec2 p) { return vec2(hash21(p), hash21(p + 17.3)); }
/// @brief Smooth 2D value noise, 0..1.
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
/// @brief Fractal noise: octaves of value noise.
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 3.7; a *= 0.5; } return v; }

/// Position of fish k along its path at time t: a slow Lissajous loop.
vec2 fishPos(float k, float t, float aspect)
{
    float s1 = 0.05 + 0.03 * hash11(k * 1.3), s2 = 0.07 + 0.03 * hash11(k * 2.7);
    return vec2(sin(t * s1 + k * 2.1) * 0.62 * aspect, sin(t * s2 + k * 4.3) * 0.4);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    int nF = 5 + int(clamp(fishP, 0.0, 1.0) * 4.99);
    float t = sceneTime;

    // Surface ripple normal (slow wind ripples).
    vec2 rn = vec2(noise2(p * 7.0 + vec2(t * 0.25, 0.0)) - 0.5, noise2(p * 7.0 + vec2(0.0, t * 0.22) + 5.0) - 0.5);

    // The bottom: stones (Voronoi-ish) with the photo, deep green water.
    vec2 bp = p + rn * 0.02;
    // Pebbles: jittered cells with varied size (nearest-of-nine), no grid.
    vec2 bi = floor(bp * 6.0), bf = fract(bp * 6.0);
    float stone = 0.0;
    for (int j = -1; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i)
    {
        vec2 o = vec2(i, j);
        vec2 cp = o + hash22(bi + o);
        float rr = 0.25 + 0.25 * hash21(bi + o + 5.0);
        stone = max(stone, smoothstep(rr, rr - 0.12, length((bf - cp) * vec2(1.0, 1.0 + 0.4 * hash21(bi + o + 9.0)))));
    }
    vec3 bottom = mix(vec3(0.08, 0.17, 0.12), img(fract(bp * 0.4 + 0.3)) * 0.35 + vec3(0.05, 0.07, 0.05), stone * 0.8);
    // Caustics dancing on the bottom.
    float ca = pow(1.0 - abs(noise2(bp * 12.0 + vec2(t * 0.4, t * 0.3)) * 2.0 - 1.0), 6.0);
    bottom += vec3(0.5, 0.6, 0.45) * ca * 0.12;
    vec3 col = bottom;

    // The koi.
    for (int k = 0; k < 9; ++k)
    {
        if (k >= nF) break;
        float fk = float(k);
        vec2 c = fishPos(fk, t, aspect);
        vec2 ahead = fishPos(fk, t + 0.8, aspect);
        vec2 dir = normalize(ahead - c + 1e-4);
        vec2 side = vec2(-dir.y, dir.x);
        vec2 d = p + rn * 0.01 - c;
        float along = dot(d, dir), across = dot(d, side);
        float L = 0.12 + 0.04 * hash11(fk + 5.0);
        // Body bends with the swim stroke.
        across -= sin(along / L * 3.0 - t * 3.0) * 0.012 * (0.5 - along / L);
        float s = along / L;                                   // -1 tail .. 1 head
        float w = 0.034 * sqrt(max(1.0 - s * s, 0.0)) * (1.0 + 0.3 * s);
        float body = smoothstep(w + 0.004, w - 0.002, abs(across)) * step(-1.0, s) * step(s, 1.0);
        // Tail fin and pectoral fins, translucent.
        float ts = (-s - 0.85) / 0.5;                           // 0..1 along the tail fin
        float tw = 0.006 + 0.035 * ts;
        float tail = step(0.0, ts) * step(ts, 1.0) * smoothstep(tw, tw - 0.004, abs(across));
        vec2 fq = vec2((s - 0.35) * L, abs(across) - w - 0.008);
        float fin = smoothstep(0.014, 0.008, length(fq * vec2(1.0, 1.6)));
        // Colour: white base with orange and black patches (kohaku, showa).
        float patch = noise2(vec2(s * 3.0, across * 30.0) + fk * 13.0);
        vec3 orange = mix(vec3(1.0, 0.4, 0.1), imgPalette(hue * 0.159 + 0.05) * 1.3, 0.15);
        vec3 fishC = vec3(0.95, 0.93, 0.88);
        if (hash11(fk + 9.0) < 0.5) fishC = mix(fishC, orange, smoothstep(0.45, 0.6, patch));
        else fishC = mix(orange, vec3(0.05), smoothstep(0.55, 0.7, patch));
        int band = int(mod(fk * 5.0 + 2.0, 32.0));
        float e = clamp(audioSpectrum[band] * 1.5, 0.0, 1.0);
        fishC *= 0.7 + 0.2 * (1.0 - abs(across) / max(w, 1e-3)) + 0.35 * e;
        // Seen through water: a little dimmer and greener.
        fishC = mix(fishC, vec3(0.1, 0.25, 0.2), 0.18);
        vec3 finC = mix(vec3(0.9, 0.85, 0.8), orange, 0.35);   // fins are pale and translucent
        col = mix(col, finC * 0.8, clamp(tail + fin, 0.0, 1.0) * 0.45);
        col = mix(col, fishC, body);
        // Shadow of the fish on the bottom.
        col *= 1.0 - 0.3 * smoothstep(w + 0.03, w - 0.01, length(vec2(along, across) + vec2(0.03, 0.03)) - 0.0) * (1.0 - body);
    }

    // The water surface: sky and branches mirrored, Fresnel light.
    vec3 skyC = mix(vec3(0.6, 0.75, 0.9), imgPalette(hue * 0.159 + 0.55), 0.3) * (0.7 + 0.5 * swell);
    float branches = smoothstep(0.52, 0.62, fbm(p * 2.5 + rn * 0.3 + vec2(3.0, 1.0)));
    vec3 refl = mix(skyC, vec3(0.08, 0.1, 0.06), branches);
    col = mix(col, refl, 0.28);
    // Ripple glints.
    float glint = pow(max(0.0, 1.0 - length(rn) * 6.0), 10.0) * step(0.5, noise2(p * 40.0 + t));
    col += vec3(1.0) * glint * (0.1 + 0.5 * hi);

    // Floating maple leaves drifting slowly across the surface.
    for (int k = 0; k < 4; ++k)
    {
        float fk = float(k);
        vec2 c = vec2(mod(t * 0.01 * (1.0 + fk * 0.3) + hash11(fk) * 2.0, 2.0) - 1.0, hash11(fk + 3.0) - 0.5) * vec2(aspect * 1.1, 0.8);
        vec2 d = p - c;
        float a = atan(d.y, d.x) + t * 0.02 + fk;
        float leafR = 0.03 * (0.55 + 0.45 * pow(abs(cos(a * 2.5)), 0.5));
        float leaf = smoothstep(leafR, leafR - 0.003, length(d));
        vec3 lc = mix(vec3(0.85, 0.25, 0.08), imgPalette(hue * 0.159 + 0.08), 0.2);
        col = mix(col, lc * (0.8 + 0.2 * hash11(fk + 7.0)), leaf);
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
