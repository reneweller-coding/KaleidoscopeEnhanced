#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file ShelfCloudPrairie.frag
 * @brief SHELF CLOUD PRAIRIE: a supercell's gust front rolling over the
 * prairie -- a vast shelf cloud spanning the whole horizon like a stepped
 * wedge, its leading edge smooth and layered in tiers, blue-grey and
 * tinged green beneath, the scud ragged along its base, and behind it the
 * black wall of rain.  In front of it a strip of clear golden sky still
 * lights the wheat, which bends and ripples in the gust.  Lightning
 * flickers deep inside the cloud.  The shelf advances slowly overhead.
 *
 * Audio Reactivity:
 *   audioKick   -> lightning inside the cloud (light only)
 *   audioSwell  -> the golden light under the shelf (slow)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the shelf advancing, the wheat rippling
 *
 * Per-activation variety: tiersP (how many tiers), hueP.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float tiersP;
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

/// @brief Pseudo-random number 0..1 from a float.
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
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
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    int nT = 3 + int(clamp(tiersP, 0.0, 1.0) * 2.99);

    float hz = -0.22;
    // The golden clear strip under the shelf.
    vec3 col = mix(vec3(1.0, 0.78, 0.45), vec3(0.75, 0.7, 0.55), smoothstep(hz, hz + 0.15, p.y)) * (0.8 + 0.4 * swell);

    // The shelf: its lower edge arcs across the sky; tiers stack above it.
    float adv = 0.02 * sin(T * 0.01) + T * 0.0005;           // advancing very slowly
    // A long straight front seen passing overhead bows down to the horizon at the sides.
    float edge = hz + 0.13 - 0.1 * (p.x * p.x) - min(adv, 0.04) + 0.012 * (fbm(vec2(p.x * 3.0, 2.0)) - 0.5);
    if (p.y > edge - 0.02) {
        float above = p.y - edge;
        // Tiers: smooth horizontal bands with a lit lip and a shadowed underside.
        float warp = 0.025 * (fbm(vec2(p.x * 2.2 + T * 0.003, above * 6.0)) - 0.5);
        float tf = (above + warp) / (0.06 + 0.02 * noise2(vec2(p.x * 1.5, 4.0)));
        float ti = floor(tf);
        float tl = fract(tf);
        float tierOn = step(ti, float(nT) - 1.0);
        float lip = smoothstep(0.0, 0.15, tl) * smoothstep(0.55, 0.2, tl);
        float und = smoothstep(0.35, 1.0, tl);
        float sm = fbm(vec2(p.x * 2.0 + ti * 3.0 + T * 0.004, above * 10.0));
        vec3 base = mix(vec3(0.28, 0.33, 0.38), vec3(0.2, 0.3, 0.3), 0.4);       // blue-grey with a green cast
        base = mix(base, base * imgPalette(0.45 + hueP * 0.159) * 1.4, 0.08);
        vec3 shelf = base * (0.6 + 0.5 * sm);
        float lipVar = smoothstep(0.3, 0.7, noise2(vec2(p.x * 4.0 + ti * 7.0, ti)));
        shelf += vec3(0.55, 0.5, 0.4) * lip * tierOn * lipVar * (0.3 + 0.3 * swell) * smoothstep(0.1, 0.0, above - float(nT) * 0.07 + 0.07);
        shelf *= 1.0 - 0.3 * und * tierOn;
        // Above the tiers the main body: dark, turbulent.
        float body = smoothstep(float(nT) * 0.07 - 0.02, float(nT) * 0.07 + 0.05, above);
        vec3 bodyC = vec3(0.1, 0.12, 0.15) * (0.6 + 0.8 * fbm(vec2(p.x * 1.5, p.y * 3.0) + vec2(T * 0.003, 0.0)));
        shelf = mix(shelf, bodyC, body);
        // Lightning deep inside the cloud: a soft glow from within, on the kick.
        vec2 lc = vec2(-0.3 + 0.6 * hash11(floor(T * 0.3)), edge + 0.2);
        float lg = exp(-length((p - lc) * vec2(0.8, 1.5)) * 4.0);
        shelf += vec3(0.75, 0.8, 1.0) * lg * kick * (0.6 + 0.6 * sm);
        // The ragged scud along the base edge.
        float scud = smoothstep(0.5, 0.7, fbm(vec2(p.x * 8.0 + T * 0.01, p.y * 30.0))) * smoothstep(0.03, -0.01, above) * smoothstep(-0.05, 0.0, above);
        float a = smoothstep(-0.005, 0.01, above);
        col = mix(col, shelf, a);
        col = mix(col, vec3(0.3, 0.32, 0.33), scud * 0.8);
    }
    // The rain curtain behind, visible under the shelf's far edge at the sides.
    float rainC = smoothstep(0.3, 0.6, abs(p.x)) * smoothstep(edge + 0.02, hz, p.y) * step(hz, p.y);
    col = mix(col, vec3(0.2, 0.22, 0.26) * (0.8 + 0.2 * noise2(vec2(p.x * 60.0, p.y * 4.0 + T * 0.5))), rainC * 0.8);

    // The prairie: wheat waving in the gust, lit gold from the clear strip.
    if (p.y < hz) {
        float dd = hz - p.y;
        float z = 0.25 / dd;
        vec2 wq = vec2(p.x * z, z);
        // Gust waves rolling across the wheat (continuous).
        float gust = noise2(wq * vec2(0.6, 0.35) + vec2(T * 0.15, T * 0.3));
        vec3 wheat = mix(vec3(0.62, 0.48, 0.2), vec3(0.95, 0.8, 0.45), gust);
        wheat *= 0.75 + 0.25 * noise2(wq * vec2(12.0, 6.0) + vec2(T * 0.5, 0.0));
        wheat *= (0.7 + 0.4 * swell);
        col = mix(wheat, col, 1.0 - exp(-z * 0.03));
    }
    // The silo on the horizon.
    {
        vec2 sq = p - vec2(0.42, hz);
        float silo = max(abs(sq.x) - 0.006, sq.y - 0.035);
        silo = min(silo, length(sq - vec2(0.0, 0.035)) - 0.006);
        silo = min(silo, max(abs(sq.x + 0.025) - 0.018, sq.y - 0.014 - 0.008 * (1.0 - abs(sq.x + 0.025) / 0.018)));
        silo = max(silo, -sq.y);
        col = mix(col, vec3(0.15, 0.13, 0.12), smoothstep(0.0015, -0.0015, silo));
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
