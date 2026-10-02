#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file RapeseedStormLight.frag
 * @brief RAPESEED STORM LIGHT: rolling fields of flowering rapeseed under a
 * black thunderstorm sky -- the kind of light photographers wait for: the
 * clouds slate-dark and heavy, and through a gap in them the sun strikes
 * the land, so the yellow blazes where the light falls and goes dull
 * olive in the cloud shadow.  The sunlit patch wanders slowly over the
 * hills as the clouds drift; a lone tree and a farmstead stand on a crest;
 * rain curtains hang in the distance and lightning flickers inside the
 * cloud on the kick.  The camera is still.
 *
 * Audio Reactivity:
 *   audioSwell  -> the strength of the sun through the gap (slow)
 *   audioKick   -> lightning inside the storm cloud (light only)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the drifting clouds and the wandering light
 *
 * Per-activation variety: hillsP (how hilly), hueP.
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
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float hillsP;
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
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float hills = 0.6 + 0.8 * clamp(hillsP, 0.0, 1.0);

    // The storm sky: heavy slate cloud with rolls and a brighter gap.
    vec2 cq = p * vec2(1.2, 2.5) + vec2(T * 0.006, 0.0);
    float cl = fbm(cq + 0.5 * vec2(fbm(cq * 1.3), fbm(cq * 1.3 + 4.0)));
    vec3 sky = mix(vec3(0.08, 0.09, 0.12), vec3(0.3, 0.32, 0.36), smoothstep(0.3, 0.8, cl));
    // The gap where the sun breaks through (wanders slowly).
    vec2 gapC = vec2(0.35 * sin(T * 0.01) - 0.1, 0.32);
    float gap = smoothstep(0.35, 0.0, length((p - gapC) * vec2(0.7, 1.8)) + 0.2 * (cl - 0.5));
    sky = mix(sky, vec3(1.0, 0.92, 0.75) * (0.9 + 0.3 * swell), gap * 0.8);
    // Sun rays falling from the gap.
    vec2 rd = p - gapC;
    float ang = atan(rd.x, -rd.y);
    float rays = pow(0.5 + 0.5 * sin(ang * 13.0 + fbm(vec2(ang * 3.0, 0.0)) * 6.0), 3.0) * exp(-length(rd) * 2.5) * smoothstep(gapC.y, gapC.y - 0.1, p.y);
    // Lightning glowing inside the cloud on the kick, off to one side.
    float lg = exp(-length((p - vec2(-0.55, 0.3)) * vec2(1.0, 1.6)) * 4.0) * smoothstep(0.4, 0.7, cl);
    sky += vec3(0.7, 0.75, 1.0) * lg * kick * 1.2;

    float horizon = -0.02;
    vec3 col = sky;
    // Rain curtains in the distance: dark grey streaks hanging to the horizon.
    float rain = smoothstep(0.55, 0.8, noise2(vec2(p.x * 5.0 + T * 0.004, 0.0))) * smoothstep(0.25, horizon, p.y) * step(horizon, p.y);
    col = mix(col, vec3(0.18, 0.2, 0.24) * (0.8 + 0.2 * noise2(vec2(p.x * 80.0, p.y * 3.0))), rain * 0.6);

    // The land: rolling hills in layers; rapeseed fields in patches.
    // Light on the land: the sunlit patch under the gap, drifting.
    vec2 lightC = vec2(gapC.x * 1.2 + 0.1, -0.18);
    for (int L = 0; L < 4; ++L) {
        float fl = float(L);
        float h = horizon - 0.06 * fl + 0.05 * hills * (fbm(vec2(p.x * (1.2 + fl * 0.7) + fl * 9.0, fl)) - 0.5) * (1.0 + fl * 0.5);
        if (p.y < h) {
            float depth = 1.0 - fl / 3.0;                     // 1 far .. 0 near
            // Field patchwork along the slope: rapeseed yellow, green wheat,
            // dark hedgerows between.
            vec2 fq = vec2(p.x * (3.0 + fl * 2.0) + fl * 3.0, (h - p.y) * (8.0 + fl * 4.0));
            vec2 fw = fq + 0.6 * vec2(noise2(fq * 0.3 + 3.0), noise2(fq * 0.3 + 7.0));      // irregular field shapes
            float cell = hash21(floor(vec2(fw.x * 0.8, fw.y * 0.4)) + fl * 11.0);
            vec3 field = (cell > 0.28) ? vec3(1.0, 0.85, 0.05) : vec3(0.35, 0.52, 0.12);
            field = mix(field, field * imgPalette(0.15 + hueP * 0.159) * 1.6, 0.08);
            // Hedgerows follow the contours; field edges across the slope are soft.
            float hedge = smoothstep(0.0, 0.04, abs(fract(fw.y * 0.4) - 0.5) - 0.45) + 0.4 * smoothstep(0.0, 0.02, abs(fract(fw.x * 0.8) - 0.5) - 0.47);
            field = mix(field, vec3(0.08, 0.12, 0.05), clamp(hedge, 0.0, 1.0) * 0.8);
            // Texture of the crop.
            field *= 0.85 + 0.25 * noise2(vec2(p.x * 200.0, p.y * 60.0));
            // Sunlit patch vs. cloud shadow.
            float sun = smoothstep(0.5, 0.08, length((p - lightC) * vec2(0.55, 1.8)) + 0.15 * (fbm(p * 3.0 + T * 0.01) - 0.5)) * (0.8 + 0.4 * swell);
            float shadowTone = 0.32 + 0.1 * depth;
            vec3 lit = field * mix(vec3(shadowTone) * vec3(0.8, 0.85, 1.0), vec3(1.5, 1.35, 1.05), sun);
            // The crest line catches a rim of light.
            lit += vec3(1.0, 0.9, 0.6) * exp(-(h - p.y) * 200.0) * sun * 0.5;
            // Atmospheric depth toward the storm grey.
            lit = mix(lit, vec3(0.2, 0.22, 0.26), depth * 0.35);
            col = lit;
        }
    }
    // A lone tree and a farmstead on the second crest, sunlit or not.
    {
        float cx = 0.42;
        float ch = horizon - 0.06 + 0.05 * hills * (fbm(vec2(cx * 1.9 + 9.0, 1.0)) - 0.5) * 1.5;
        vec2 tq = p - vec2(cx, ch);
        float trunk = step(abs(tq.x), 0.003) * step(0.0, tq.y) * step(tq.y, 0.03);
        float crown = step(length((tq - vec2(0.0, 0.045)) * vec2(1.0, 1.2)) + 0.006 * noise2(tq * 300.0), 0.028);
        col = mix(col, vec3(0.04, 0.06, 0.03), clamp(trunk + crown, 0.0, 1.0));
        vec2 hq = p - vec2(cx - 0.12, ch);
        float house = step(abs(hq.x), 0.025) * step(0.0, hq.y) * step(hq.y, 0.018 + 0.012 * (1.0 - abs(hq.x) / 0.025));
        col = mix(col, vec3(0.75, 0.7, 0.62) * 0.5, house);
    }
    // Rays over everything, faint.
    col += vec3(1.0, 0.9, 0.7) * rays * 0.08 * (0.6 + 0.6 * swell);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
