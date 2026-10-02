#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file WaterfallCurtainRainbow.frag
 * @brief WATERFALL CURTAIN RAINBOW: a wide curtain of falling water filling
 * the frame between mossy cliffs, the sun behind the viewer, and in the
 * spray that boils up from the plunge pool a standing rainbow.  The water
 * streams down in countless threads, bright where it catches the light;
 * each stretch of the curtain carries a spectrum band, so the music runs
 * across it as light.  Spray and rainbow grow with the swell.  Camera fixed.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> brightness of the curtain, band by band across it
 *   audioSwell        -> spray density and rainbow strength (slow)
 *   audioHigh         -> glitter on the falling threads (light)
 *   audioKick         -> a soft surge of light in the spray (light only)
 *   sceneTime         -> the fall itself (continuous, never on audio)
 *
 * Per-activation variety: widthP (curtain width), hueP.
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
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float widthP;   ///< Width knob, 0..1.
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
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float halfW = mix(0.3, 0.44, clamp(widthP, 0.0, 1.0)) * aspect;
    float t = sceneTime;

    // Cliff and moss: the photo, green-tinted and rough, darker at the top.
    // Basalt with vertical jointing, wet and dark, with cushions of moss.
    float joint = fbm(vec2(p.x * 26.0, p.y * 1.5));
    vec3 rock = mix(vec3(0.07, 0.07, 0.08), img(fract(uv * vec2(1.3, 1.0) + 0.1)) * 0.25, 0.4);
    rock *= 0.45 + 0.9 * joint;
    vec3 mossC = mix(vec3(0.16, 0.34, 0.1), imgPalette(hue * 0.159 + 0.35) * 0.5, 0.25);
    float mossM = smoothstep(0.5, 0.68, fbm(p * vec2(5.0, 8.0) + 2.0));
    vec3 col = mix(rock, mossC * (0.6 + 0.5 * joint), mossM);

    // Forest on the rim and sky above it.
    float rimLine = 0.36 + 0.05 * fbm(vec2(p.x * 3.0, 1.0)) + 0.04 * noise2(vec2(p.x * 22.0, 3.0));
    vec3 skyC = mix(vec3(0.75, 0.85, 0.95), imgPalette(hue * 0.159 + 0.6), 0.25);
    vec3 trees = img(fract(uv * vec2(2.0, 1.0))) * vec3(0.15, 0.25, 0.12);
    col = mix(col, skyC * (0.8 + 0.2 * uv.y), smoothstep(rimLine + 0.06, rimLine + 0.09, p.y));
    col = mix(col, trees, smoothstep(rimLine - 0.01, rimLine + 0.01, p.y) * smoothstep(rimLine + 0.09, rimLine + 0.06, p.y));
    // The lip of the fall: a slightly curved edge.
    float lip = 0.33 - 0.03 * (p.x / aspect) * (p.x / aspect);
    // The curtain is several streams with rock between them.
    float strands = smoothstep(0.24, 0.36, fbm(vec2(p.x * 3.0, 7.0)));
    float edgeX = smoothstep(halfW + 0.02, halfW - 0.04, abs(p.x)) * mix(0.0, 1.0, strands);

    // The curtain: water below the lip, between the cliff edges.
    float inFall = edgeX * smoothstep(lip + 0.004, lip - 0.004, p.y);
    if (inFall > 0.0)
    {
        // Threads: fine vertical streaks falling at accelerating speed --
        // v grows with the drop (free fall), so the texture is scrolled by
        // a coordinate that stretches toward the bottom.
        float drop = max(lip - p.y, 0.0);
        float fallCoord = sqrt(drop) * 6.0 - t * 1.6;
        float x = p.x * 80.0;
        float thr = noise2(vec2(x, fallCoord * 1.2)) * 0.6 + noise2(vec2(x * 2.3, fallCoord * 2.7)) * 0.4;
        float streak = smoothstep(0.35, 0.95, thr);
        float body = 0.55 + 0.45 * fbm(vec2(p.x * 9.0, fallCoord * 0.6));
        // Band across the width.
        int band = int(clamp((p.x / halfW * 0.5 + 0.5) * 31.0, 0.0, 31.0));
        float e = clamp(audioSpectrum[band] * 1.5, 0.0, 1.0);
        vec3 waterC = mix(vec3(0.82, 0.9, 0.95), imgPalette(hue * 0.159 + 0.55), 0.18);
        vec3 water = waterC * (0.35 + 0.55 * body + 0.6 * streak) * (0.7 + 0.6 * e);
        // Behind the thin curtain the rock shows through a little at the top.
        water = mix(col * 0.8, water, smoothstep(0.0, 0.05, drop) * 0.85 + 0.15);
        // Glitter on the threads.
        vec2 g = vec2(x * 1.5, fallCoord * 20.0);
        vec2 c = floor(g), f = fract(g) - 0.5;
        vec2 j = vec2(hash21(c + 2.2), hash21(c + 7.7)) - 0.5;
        float gl = smoothstep(0.22, 0.05, length((f - j * 0.6) * vec2(1.0, 0.4))) * step(0.978, hash21(c + 1.0));
        water += vec3(1.0) * gl * (0.2 + 1.2 * hi);
        col = mix(col, water, inFall);
        // The glassy roll over the lip.
        col += waterC * exp(-abs(p.y - lip) * 90.0) * edgeX * 0.5;
    }

    // Plunge pool and the boiling spray above it.
    float poolY = -0.33;
    float spray = fbm(vec2(p.x * 3.0, p.y * 2.0 - t * 0.25)) * 0.7 + fbm(vec2(p.x * 7.0 + 3.0, p.y * 5.0 - t * 0.6)) * 0.3;
    float sprayMask = smoothstep(poolY + 0.6, poolY - 0.05, p.y) * smoothstep(halfW + 0.45, halfW - 0.2, abs(p.x));
    float dens = sprayMask * spray * (0.55 + 0.6 * swell);
    vec3 mist = mix(vec3(0.92, 0.95, 1.0), imgPalette(hue * 0.159 + 0.1), 0.12) * (1.0 + 0.3 * clamp(audioKick, 0.0, 2.0));
    col = mix(col, mist, clamp(dens * 1.5, 0.0, 0.95));
    // The pool: dark water with the foam line.
    if (p.y < poolY)
    {
        float foam = smoothstep(0.4, 0.8, fbm(vec2(p.x * 4.0 - t * 0.1, (p.y - poolY) * 12.0 + t * 0.3)));
        vec3 pool = mix(vec3(0.05, 0.1, 0.12), imgPalette(hue * 0.159 + 0.5) * 0.2, 0.3);
        pool += vec3(0.8) * foam * exp((p.y - poolY) * 6.0);
        col = mix(col, pool, smoothstep(poolY, poolY - 0.03, p.y) * 0.85);
    }

    // The rainbow: an arc centred below the frame (the anti-solar point),
    // seen only where there is spray to carry it.
    vec2 anti = vec2(0.12 * aspect, -0.95);
    float rr = length(p - anti);
    float R = 0.95, bw = 0.06;
    float bx = (rr - (R - bw)) / (2.0 * bw);
    float inBow = smoothstep(0.0, 0.25, bx) * smoothstep(1.0, 0.75, bx);
    // A soft spectrum, violet inside to red outside, not three bars.
    float hh = mix(0.78, 0.0, clamp(bx, 0.0, 1.0));
    vec3 rainbow = clamp(abs(fract(hh + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
    rainbow = mix(vec3(0.5), rainbow, 0.8);
    float carrier = clamp(sprayMask * (0.35 + spray) + inFall * 0.25, 0.0, 1.0);
    col += rainbow * inBow * carrier * (0.18 + 0.4 * swell);
    // The faint secondary bow outside, colours reversed.
    float bx2 = (rr - (R + 0.2 - bw)) / (2.0 * bw);
    float in2 = smoothstep(0.0, 0.1, bx2) * smoothstep(1.0, 0.9, bx2);
    // (The secondary bow reverses the order: red inside.)
    float h2 = mix(0.0, 0.78, clamp(bx2, 0.0, 1.0));
    vec3 rainbow2 = mix(vec3(0.5), clamp(abs(fract(h2 + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0), 0.8);
    col += rainbow2 * in2 * carrier * 0.12 * (0.3 + 0.7 * swell);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
