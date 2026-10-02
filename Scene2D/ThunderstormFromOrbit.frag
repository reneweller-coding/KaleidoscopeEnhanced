#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file ThunderstormFromOrbit.frag
 * @brief THUNDERSTORM FROM ORBIT: the night side of the Earth seen from low
 * orbit, a line of thunderstorms below.  Their towering tops are lit only
 * by the moon and by the lightning inside them -- whole cloud cells glow
 * from within, blue-white, and fade -- while between the storms the city
 * lights of the ground show through as a golden net of streets.  The limb
 * curves across the top with its thin green airglow and the stars above.
 * The view drifts slowly along the orbit.
 *
 * Audio Reactivity:
 *   audioKick / audioOnset -> lightning inside the storm cells (light; which
 *                             cells answer drifts continuously, never a jump)
 *   audioSpectrum[32]      -> each cell's own flicker level, one band per cell
 *   audioSwell             -> airglow and moonlight on the cloud tops (slow)
 *   sceneAdvance           -> the drift along the orbit (continuous)
 *
 * Per-activation variety: stormP (storm density), hueP.
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
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioOnset;   ///< Onset envelope (any instrument), 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float stormP;
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
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = p * 2.03 + 3.7; a *= 0.5; } return v; }

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float storm = mix(0.46, 0.36, clamp(stormP, 0.0, 1.0));
    float drift = sceneAdvance * 0.05 + sceneTime * 0.02;

    // The Earth's limb: a big circle whose top edge crosses the frame.
    vec2 ec = vec2(0.0, -3.2);
    float R = 3.55;
    float re = length(p - ec);
    float onEarth = smoothstep(R + 0.003, R - 0.003, re);

    // Space: stars (round, jittered) and the thin airglow above the limb.
    vec3 col = vec3(0.0);
    vec2 sg = p * 90.0; vec2 sc = floor(sg), sf = fract(sg) - 0.5;
    vec2 sj = hash22(sc) - 0.5;
    float star = smoothstep(0.12, 0.02, length(sf - sj * 0.7)) * step(0.985, hash21(sc + 3.3));
    col += vec3(0.9, 0.92, 1.0) * star * (0.4 + 0.6 * hash21(sc + 7.0));
    vec3 airC = mix(vec3(0.2, 0.9, 0.45), imgPalette(hue * 0.159 + 0.4), 0.15);
    col += airC * exp(-abs(re - R - 0.012) * 180.0) * (0.35 + 0.35 * swell);
    col += vec3(0.25, 0.4, 1.0) * exp(-max(re - R, 0.0) * 40.0) * 0.08 * (1.0 - onEarth);

    if (onEarth > 0.0)
    {
        // Ground coordinates: foreshortened toward the limb.
        float h = (R - re);                          // depth below the limb
        float fore = 1.0 / (0.08 + h * 1.2);         // compression near the horizon
        float ang = atan(p.x - ec.x, p.y - ec.y);
        vec2 g = vec2(ang * 6.0 + drift, fore * 0.9 - drift * 0.3);

        // City lights: clusters of tiny points (round, jittered) where the
        // land is settled, and faint roads between them.
        float settled = smoothstep(0.5, 0.75, fbm(g * 1.4 + 9.0));
        vec2 cq = g * 38.0;
        vec2 ci = floor(cq), cf = fract(cq) - 0.5;
        vec2 cj = hash22(ci) - 0.5;
        float pt = smoothstep(0.22, 0.05, length(cf - cj * 0.6)) * step(1.0 - 0.55 * settled, hash21(ci + 3.0));
        float roads = smoothstep(0.03, 0.0, abs(noise2(g * 6.0) - 0.5)) * settled;
        vec3 cityC = mix(vec3(1.0, 0.68, 0.3), imgPalette(hue * 0.159 + 0.08), 0.2);
        vec3 ground = cityC * (pt * (0.6 + 0.4 * hash21(ci + 5.0)) + roads * 0.12 + settled * 0.03) + vec3(0.004, 0.006, 0.012);

        // The storm clouds: tall tops, moonlit, covering part of the ground.
        float cloudF = fbm(g * vec2(1.3, 1.6) + 4.0);
        float cover = smoothstep(storm, storm + 0.12, cloudF);
        // Anvil tops: billowed, moonlit from one side, with deep shadows.
        float tops = fbm(g * 3.2 + 1.0);
        float tops2 = fbm(g * 3.2 + vec2(0.05, 0.0) + 1.0);
        float sideLit = clamp((tops - tops2) * 25.0 + 0.5, 0.0, 1.0);
        vec3 moon = mix(vec3(0.45, 0.52, 0.72), imgPalette(hue * 0.159 + 0.6) * 0.7, 0.2);
        vec3 cloud = moon * (0.18 + 0.75 * tops * tops + 0.45 * sideLit * tops) * (0.8 + 0.5 * swell);

        // Lightning: storm cells on a coarse grid of the cloud field.  A cell
        // glows from inside with (kick envelope) x (a weight that wanders
        // smoothly over the cells) + its own band's low flicker.
        vec2 lq = g * 1.6;
        vec2 li = floor(lq), lf = fract(lq);
        float flash = 0.0;
        for (int yy = -1; yy <= 1; ++yy)
        for (int xx = -1; xx <= 1; ++xx)
        {
            vec2 o = vec2(xx, yy);
            vec2 cid = li + o;
            vec2 cp = o + 0.2 + 0.6 * hash22(cid);
            float d = length(lf - cp);
            float wander = 0.5 + 0.5 * sin(sceneTime * 0.7 + hash21(cid) * 6.2831853);
            wander = pow(wander, 3.0);
            int band = int(mod(hash21(cid + 5.0) * 32.0, 32.0));
            float own = clamp(audioSpectrum[band] * 1.4, 0.0, 1.0);
            float drive = clamp(audioKick, 0.0, 2.0) * 0.6 + clamp(audioOnset, 0.0, 1.5) * 0.4;
            // A storm is never quite dark: a low, slow shimmer of its own.
            float idle = 0.12 * (0.5 + 0.5 * sin(sceneTime * 1.3 + hash21(cid + 8.0) * 40.0));
            float e = drive * wander + own * 0.45 * wander + idle * wander;
            flash += e * exp(-d * d * 3.0);
        }
        vec3 boltC = mix(vec3(0.75, 0.82, 1.0), imgPalette(hue * 0.159 + 0.62), 0.15);
        cloud += boltC * flash * (0.35 + 1.1 * tops) * 1.8;
        // Light from a flash spreads into the cloud around it.
        vec3 surf = mix(ground, cloud, cover);
        surf += boltC * flash * 0.15 * (1.0 - cover);

        // Atmosphere toward the limb: bluish haze.
        float hz = exp(-h * 4.0);
        surf = mix(surf, vec3(0.05, 0.08, 0.2) * (0.6 + 0.4 * swell), hz * 0.7);
        col = mix(col, surf, onEarth);
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
