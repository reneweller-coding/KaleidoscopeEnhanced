#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file FogbowMoor.frag
 * @brief FOGBOW MOOR: an early morning on a moor in fog, the low sun at your
 * back -- and standing in the fog ahead a fogbow: a broad, ghostly white
 * arch, faintly orange on its outer rim and bluish inside, far wider and
 * paler than a rainbow.  Beneath it the moor fades away in layers: brown
 * heather and pale grass tussocks close by, dark peat pools mirroring the
 * white sky, a line of birches and a stone wall dissolving into the fog.
 * Dew glitters on the grass.  The fog drifts slowly; the camera is still.
 *
 * Audio Reactivity:
 *   audioSwell  -> the brightness of the fogbow and the fog (slow)
 *   audioHigh   -> dew glittering on the grass (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the drifting fog
 *
 * Per-activation variety: fogP (how dense the fog), hueP.
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

uniform float fogP;
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
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
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
    float fogD = 0.6 + 0.6 * clamp(fogP, 0.0, 1.0);

    float hz = -0.06;
    vec3 fogC = vec3(0.86, 0.87, 0.86) * (0.92 + 0.15 * swell);
    // The sky: fog lit from behind, a touch warmer toward the top.
    vec3 col = mix(fogC, vec3(0.9, 0.88, 0.84), smoothstep(0.0, 0.5, p.y));

    // The fogbow: a broad white ring around the antisolar point below the
    // horizon; warm outer edge, cool inner edge.
    vec2 anti = vec2(0.05, hz - 0.2);
    float r = length(p - anti);
    float R = 0.62, W = 0.09;
    float bow = exp(-pow((r - R) / W, 2.0));
    vec3 bowC = vec3(1.0) * bow;
    bowC += vec3(0.35, 0.12, -0.05) * exp(-pow((r - R - W * 0.9) / (W * 0.4), 2.0));
    bowC += vec3(-0.05, 0.05, 0.2) * exp(-pow((r - R + W * 0.9) / (W * 0.4), 2.0));
    // A faint second, inner ring (supernumerary).
    bowC += vec3(0.4) * exp(-pow((r - R + W * 1.9) / (W * 0.35), 2.0)) * 0.4;
    float bowVis = (0.22 + 0.2 * swell) * smoothstep(hz - 0.02, hz + 0.1, p.y + 0.12);
    col += bowC * bowVis;
    // Inside the bow the fog is a little brighter.
    col += vec3(0.04) * smoothstep(R, R - 0.2, r) * bowVis * 2.0;

    // The moor: a ground plane in perspective, fading into the fog with distance.
    if (p.y < hz) {
        float z = 0.35 / (hz - p.y);                            // distance
        vec2 gq = vec2(p.x * z, z);
        float fw = fwidth(gq.y);
        // Heather (brown-purple) and pale grass in patches.
        float heath = fbm(gq * vec2(0.9, 0.9) + 3.0);
        vec3 ground = mix(vec3(0.32, 0.22, 0.22), vec3(0.6, 0.56, 0.4), smoothstep(0.45, 0.62, heath));
        ground = mix(ground, ground * imgPalette(0.08 + hueP * 0.159) * 1.4, 0.08);
        // Tussock texture, blurring out with distance.
        ground *= 0.82 + 0.28 * mix(noise2(gq * vec2(18.0, 10.0)), 0.5, smoothstep(0.02, 0.2, fw));
        // Peat pools mirroring the white sky.
        float pool = smoothstep(0.68, 0.72, fbm(gq * vec2(0.6, 1.2) + 11.0));
        ground = mix(ground, mix(vec3(0.12, 0.12, 0.13), fogC * 0.95, 0.75), pool);
        // Fog thickens with distance, drifting.
        float fz = 1.0 - exp(-z * 0.12 * fogD * (0.8 + 0.4 * fbm(vec2(p.x * 3.0 + T * 0.03, z * 0.3))));
        col = mix(ground, fogC, clamp(fz, 0.0, 0.98));
        // Dew glittering on the near grass.
        if (p.y < -0.3) {
            vec2 gg = p * 150.0, gi = floor(gg), gf = fract(gg);
            vec2 gc = 0.25 + 0.5 * vec2(hash21(gi), hash21(gi + 3.0));
            float tw = 0.5 + 0.5 * sin(T * 2.0 + hash21(gi + 7.0) * 40.0);
            col += vec3(1.0, 0.98, 0.95) * smoothstep(0.12, 0.0, length(gf - gc)) * step(0.88, hash21(gi + 5.0)) * tw * (0.15 + 0.8 * hi);
        }
    }
    // A line of birches and a stone wall standing in the fog at one distance.
    {
        float zt = 7.0;
        float yb = hz - 0.35 / zt;                              // their foot on the screen
        float tx = p.x * 12.0, ti = floor(tx);
        float tr = 0.0;
        for (int k = -1; k <= 1; ++k) {
            float id = ti + float(k);
            if (hash11(id * 1.9) < 0.5) continue;
            float cx = (id + 0.5 + 0.3 * (hash11(id * 3.1) - 0.5)) / 12.0;
            float th = 0.1 + 0.06 * hash11(id * 5.3);
            float yy = (p.y - yb) / th;
            float crown = smoothstep(0.03, 0.02, length(vec2((p.x - cx) * 1.6, (yy - 0.68) * th)) - 0.02 * noise2(vec2(p.x * 150.0, p.y * 150.0)));
            float trunk = step(abs(p.x - cx), 0.0015) * step(yy, 0.75);
            tr = max(tr, clamp(crown + trunk, 0.0, 1.0) * step(0.0, yy));
        }
        float wall = step(p.y, yb + 0.006 + 0.002 * noise2(vec2(p.x * 90.0, 2.0))) * step(yb - 0.002, p.y);
        float fz = 1.0 - exp(-zt * 0.12 * fogD);
        vec3 tc = mix(vec3(0.3, 0.3, 0.28), fogC, fz);
        col = mix(col, tc, max(tr, wall));
    }
    // Low fog banks lying over the moor, drifting.
    float bank = smoothstep(0.5, 0.8, fbm(vec2(p.x * 1.5 + T * 0.02, p.y * 6.0))) * smoothstep(hz + 0.08, hz - 0.05, p.y) * smoothstep(hz - 0.3, hz - 0.1, p.y);
    col = mix(col, fogC, bank * 0.6 * fogD);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
