#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file SeaFoamLaceAerial.frag
 * @brief SEA FOAM LACE AERIAL: a tropical shore from straight above -- the
 * water shading from white sand through turquoise and aquamarine to deep
 * blue with dark coral heads, and over it the spent waves spread out as
 * fine white lace, foam unravelling into a net of threads and holes that
 * drifts back as each wave retreats, while the next rolls in behind.  The
 * sun glitters on the ripples and dapples the sandy bottom with caustic
 * light.  The camera hangs still; the waves come in endlessly.
 *
 * Audio Reactivity:
 *   audioSwell  -> the brightness of the foam (slow)
 *   audioHigh   -> the glitter on the water (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the waves coming in, the lace drifting
 *
 * Per-activation variety: waveP (the wave spacing), hueP.
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

uniform float waveP;   ///< Wave knob.
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
float lace(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    float f1 = 9.0, f2 = 9.0;
    for (int y = -1; y <= 1; ++y)
    for (int x = -1; x <= 1; ++x) {
        vec2 o = vec2(x, y);
        vec2 c = o + 0.15 + 0.7 * hash22(i + o);
        float d = length(f - c);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return f2 - f1;
}
/// Caustic light on the sandy bottom: the brightest where ripple foci meet.
float caustic(vec2 p, float t)
{
    vec2 q = p;
    float c = 0.0;
    for (int i = 0; i < 3; ++i) {
        q += 0.35 * vec2(sin(q.y * 1.7 + t * 0.6 + float(i)), cos(q.x * 1.9 - t * 0.5 + float(i) * 2.0));
        c += 1.0 / (1.0 + 30.0 * abs(sin(q.x * 1.3) * sin(q.y * 1.3)));
    }
    return c / 3.0;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float L = 0.14 + 0.08 * clamp(waveP, 0.0, 1.0);

    // A diagonal shore: the sand at the lower left, the sea to the upper right.
    vec2 n = normalize(vec2(0.55, 1.0));
    float off = dot(p, n) + 0.18 + 0.04 * sin(dot(p, vec2(-n.y, n.x)) * 4.0);   // distance offshore
    float swash = -0.04 * (0.5 + 0.5 * sin(T * 0.4 + dot(p, vec2(-n.y, n.x)) * 2.0));

    vec3 sand = vec3(0.96, 0.92, 0.82) * 1.25 * (0.92 + 0.08 * noise2(p * 300.0));
    vec3 col = sand;
    if (off > swash) {
        // Water colour by depth: clear over the sand, turquoise, deep blue.
        float depth = smoothstep(0.0, 0.7, off);
        vec3 w = mix(vec3(0.55, 0.92, 0.85), vec3(0.1, 0.75, 0.8), smoothstep(0.0, 0.25, off));
        w = mix(w, vec3(0.05, 0.35, 0.6), smoothstep(0.3, 0.75, off));
        w = mix(w, w * imgPalette(0.48 + hueP * 0.159) * 1.5, 0.08);
        // Coral heads in the deeper water: dark irregular patches.
        float coral = smoothstep(0.6, 0.72, fbm(p * 4.0 + 7.0)) * smoothstep(0.2, 0.4, off);
        w = mix(w, vec3(0.08, 0.2, 0.25), coral * 0.7);
        // Caustics on the sandy bottom in the shallows.
        float cs = caustic(p * 30.0, T);
        w += vec3(0.6, 0.9, 0.8) * cs * 0.35 * smoothstep(0.4, 0.05, off);
        // Thin film at the swash edge shows the sand through.
        col = mix(sand * 0.92, w, smoothstep(swash, swash + 0.05, off));

        // Waves: foam fronts rolling in, lace spreading behind them.
        float ph = off / L + T * 0.1;
        float wi = floor(ph);
        float f = fract(ph);
        float zone = smoothstep(0.55, 0.05, off);
        float breaking = smoothstep(0.35, 0.6, noise2(vec2(dot(p, vec2(-n.y, n.x)) * 3.0 + wi * 5.1, wi * 1.7)));
        float crest = smoothstep(0.1 + 0.08 * noise2(vec2(p.x * 20.0, wi)), 0.0, f) * breaking;
        vec2 lq = vec2(dot(p, vec2(-n.y, n.x)) * 16.0, off * 30.0) + vec2(wi * 7.3, -T * 0.25);
        vec2 wq = lq + 1.3 * vec2(fbm(lq * 0.25), fbm(lq * 0.25 + 5.0));
        float lw = min(lace(wq), lace(wq * 2.2 + 3.0) * 1.4);
        float thin = mix(0.3, 0.035, clamp(f * 1.3, 0.0, 1.0));
        float patchy = smoothstep(0.35, 0.6, fbm(p * 7.0 + vec2(wi * 3.3, -T * 0.04)) + 0.45 * (0.5 - f) + 0.3 * breaking - 0.1);
        float foam = smoothstep(thin, thin * 0.3, lw) * smoothstep(0.95, 0.1, f) * patchy;
        float wf = clamp(crest + foam, 0.0, 1.0) * zone;
        // Foam casts a faint shadow on the sandy bottom beside it.
        col *= 1.0 - 0.15 * smoothstep(0.0, 0.5, foam) * smoothstep(0.3, 0.0, off);
        col = mix(col, vec3(0.97, 0.99, 1.0) * (1.2 + 0.25 * swell), wf);
        // Glitter of the sun on the ripples: round, winking.
        vec2 g = p * 120.0, gi = floor(g), gf = fract(g);
        vec2 gc = 0.25 + 0.5 * hash22(gi);
        float tw = pow(0.5 + 0.5 * sin(T * 2.2 + hash21(gi + 7.0) * 40.0), 3.0);
        col += vec3(1.0) * smoothstep(0.12, 0.0, length(gf - gc)) * step(0.9, hash21(gi + 5.0)) * tw * smoothstep(0.1, 0.3, off) * (0.2 + 1.0 * hi);
    }
    // Wet sand: darker just above the swash line.
    col = mix(col, col * 0.85, smoothstep(swash - 0.06, swash, off) * step(off, swash));

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
