#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file MarbleVeinsFlight.frag
 * @brief MARBLE VEINS FLIGHT: gliding low over a vast polished slab of marble
 * -- black Nero Marquina or white Calacatta, its surface a mirror, the
 * veins winding through it in branching rivers of white, grey and inlaid
 * gold that glint as the light slides over them.  A soft studio light
 * hangs above and its long reflection runs along the polish.  The view
 * glides steadily over the stone, the slab receding into a soft blur.
 *
 * Audio Reactivity:
 *   audioSwell  -> the reflection of the studio light (slow)
 *   audioHigh   -> glints on the gold veins (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the glide (constant speed)
 *
 * Per-activation variety: stoneP (black or white marble), hueP.
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

uniform float stoneP;
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
    for (int i = 0; i < 6; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

/// Vein strength at a point: ridged, domain-warped noise gives the
/// branching rivers of marble.
float veins(vec2 q, float scale, float w)
{
    vec2 wq = q * scale;
    wq += 1.6 * vec2(fbm(wq * 0.5 + 1.0), fbm(wq * 0.5 + 7.0));
    float r = abs(fbm(wq) - 0.5);
    return smoothstep(w, 0.0, r);
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
    bool black = clamp(stoneP, 0.0, 1.0) < 0.5;

    // The slab in perspective, gliding.
    float hz = 0.42;
    float dd = hz - p.y;
    float z = 0.4 / max(dd, 0.02);
    vec2 q = vec2(p.x * z, z) + vec2(T * 0.03, T * 0.12);
    float blur = smoothstep(2.0, 8.0, z);                        // far away the detail softens
    float gone = smoothstep(5.0, 11.0, z);                       // and then the veins vanish (no aliasing)

    vec3 base = black ? vec3(0.025, 0.025, 0.03) : vec3(0.88, 0.86, 0.82);
    vec3 cloud = black ? vec3(0.06, 0.06, 0.07) : vec3(0.78, 0.76, 0.74);
    vec3 col = mix(base, cloud, smoothstep(0.3, 0.75, fbm(q * 0.5)) * (1.0 - blur * 0.5));
    col = mix(col, cloud * (black ? 1.6 : 0.92), smoothstep(0.55, 0.8, fbm(q * 1.4 + 3.0)) * 0.5 * (1.0 - blur));
    // Main veins: broad and bright (white on black, grey-gold on white).
    float v1 = veins(q, 0.35, mix(0.02, 0.05, blur));
    float v2 = veins(q + 5.0, 0.7, mix(0.018, 0.05, blur)) * 0.75;
    float v3 = veins(q + 11.0, 1.4, mix(0.012, 0.05, blur)) * 0.5;
    v1 *= 1.0 - gone; v2 *= 1.0 - gone; v3 *= 1.0 - gone;
    vec3 veinC = black ? vec3(0.9, 0.88, 0.85) : vec3(0.45, 0.42, 0.38);
    col = mix(col, veinC, clamp(v2 + v3, 0.0, 1.0) * (1.0 - blur * 0.6));
    // The main vein carries inlaid gold.
    vec3 gold = vec3(1.0, 0.75, 0.3);
    gold = mix(gold, gold * imgPalette(0.12 + hueP * 0.159) * 1.3, 0.1);
    col = mix(col, gold * 0.8, v1);
    // Glints on the gold: round, winking points.
    {
        vec2 g = q * 18.0, gi = floor(g), gf = fract(g);
        vec2 gc = 0.25 + 0.5 * vec2(hash21(gi), hash21(gi + 3.0));
        float tw = pow(0.5 + 0.5 * sin(T * 2.0 + hash21(gi + 7.0) * 40.0), 6.0);
        col += vec3(1.0, 0.9, 0.6) * smoothstep(0.15, 0.0, length(gf - gc)) * v1 * tw * (0.4 + 1.5 * hi) * (1.0 - blur);
    }
    // The polish: the reflection of the studio light, a long soft streak,
    // and the dark room mirrored in the rest.
    float refl = exp(-pow(p.x * 2.2, 2.0)) * smoothstep(-0.5, hz, p.y);
    col += vec3(1.0, 0.97, 0.92) * refl * (0.12 + 0.2 * swell) * (black ? 1.2 : 0.5);
    col = mix(col, col * 0.7 + 0.05, blur * 0.6);
    // Beyond the slab: the dark studio.
    if (p.y > hz) col = vec3(0.02, 0.02, 0.025) + vec3(0.9, 0.88, 0.85) * exp(-length(p - vec2(0.0, 0.55)) * 5.0) * 0.4 * (0.6 + 0.6 * swell);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
