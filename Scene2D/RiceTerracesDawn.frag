#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file RiceTerracesDawn.frag
 * @brief RICE TERRACES DAWN: a hillside of flooded paddies at sunrise, the
 * way the Yuanyang photographs show it.  Curving terraces step down the
 * slope in hundreds of thin panes, each a mirror of the sky, separated by
 * dark earthen bunds with a line of grass; mist lies in the valley below
 * and blue ridges fade behind.  Over the scene arc the sun rises: the sky
 * and every pane with it turn from blue-grey through rose to gold, and a
 * column of sun-glitter runs down the panes beneath it.  A breeze crosses a
 * pane now and then; egrets lift on the kick.  Camera fixed.
 *
 * Replaces a Scene3D tessellated version (grey slabs in the catalogue).
 *
 * Audio Reactivity:
 *   sceneProgress -> the sunrise (the arc)
 *   audioSwell    -> daylight and mist glow (slow)
 *   audioBass     -> the sky in the water (slow)
 *   audioHigh     -> breeze sparkle on a pane (light)
 *   audioKick     -> an egret lifting (light)
 *
 * Per-activation variety: camHP (terrace count), detailP, stepsP (how
 * winding the contours are), hueP.
 */
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneProgress;   ///< Progress through this scene's solo time, 0..1.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float camHP;   ///< Camera height knob, 0..1.
uniform float detailP;   ///< Detail knob, 0..1.
uniform float stepsP;
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
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.1; a *= 0.5; }
    return v;
}

/// The dawn sky at elevation e (0 horizon .. 1 zenith), for sunrise stage s.
vec3 sky(float e, float x, float s, vec2 sunP, float sunK)
{
    vec3 zen = mix(vec3(0.2, 0.26, 0.42), vec3(0.35, 0.55, 0.85), s);
    vec3 hor = mix(vec3(0.55, 0.55, 0.62), vec3(1.0, 0.62, 0.42), smoothstep(0.1, 0.6, s));
    hor = mix(hor, vec3(1.0, 0.82, 0.5), smoothstep(0.6, 1.0, s));
    vec3 c = mix(hor, zen, pow(clamp(e, 0.0, 1.0), 0.6));
    // Rose band above the horizon mid-sunrise.
    c = mix(c, vec3(0.95, 0.55, 0.65), exp(-pow((e - 0.15) * 6.0, 2.0)) * smoothstep(0.1, 0.4, s) * (1.0 - smoothstep(0.6, 0.9, s)) * 0.5);
    float sd = length(vec2(x - sunP.x, (e - sunP.y) * 0.35));      // e spans 0.35 of the screen
    c += vec3(1.0, 0.8, 0.5) * exp(-sd * 5.0) * s * 0.8 * sunK;
    c += vec3(1.0, 0.95, 0.8) * smoothstep(0.035, 0.025, sd) * smoothstep(0.0, 0.2, s) * 1.5 * sunK;
    return c;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float s = clamp(sceneProgress, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;
    float N = 10.0 + 1.2 * clamp((camHP > 0.01) ? camHP : 8.0, 4.0, 12.0);   // terraces
    float wind = 0.5 + 1.0 * clamp(stepsP, 0.0, 1.0);

    float horizon = 0.2;
    vec2 sunP = vec2(0.35, -0.05 + 0.3 * s);                 // (x, elevation)
    vec3 tint = mix(vec3(1.0), imgPalette(0.08 + hue * 0.159) * 1.3, 0.12);

    vec3 col;
    if (p.y > horizon) {
        col = sky((p.y - horizon) / 0.35, p.x, s, sunP, 1.0) * tint;
    } else {
        col = sky(0.0, p.x, s, sunP, 0.0) * tint;
    }

    // Far ridges: layered silhouettes, blue and hazed.
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);
        float ry = horizon - 0.02 - 0.05 * fl + 0.06 * (fbm(vec2(p.x * (1.5 + fl), fl * 4.0)) - 0.5) * (1.0 + fl);
        if (p.y < ry) {
            vec3 rc = mix(sky(0.05, p.x, s, sunP, 0.0), vec3(0.18, 0.22, 0.35), 0.35 + 0.2 * fl);
            rc += vec3(1.0, 0.75, 0.45) * exp(-abs(p.x - sunP.x) * 4.0) * s * 0.12 * (2.0 - fl) * 0.5;
            col = rc * tint;
        }
    }

    // The terraced slope: from below the third ridge down to the bottom.
    // The terraced hill: a broad shoulder rising to the left.
    float top = horizon - 0.2 + 0.1 * smoothstep(0.6, -0.6, p.x) - 0.06 * p.x * p.x;
    if (p.y < top + 0.03 * (fbm(vec2(p.x * 2.0, 9.0)) - 0.5)) {
        float h = top - p.y;                                    // 0 far .. ~0.7 near
        // Perspective: terraces thin toward the far slope; the contours
        // wander around the hill's spurs and gullies.
        // Spurs and gullies: the contours bow down around each spur and
        // up into each gully, more strongly on the near slope.
        float spur = sin(p.x * 4.0 + 1.0 + 1.2 * fbm(vec2(p.x, 5.0))) * (0.4 + 1.6 * h);
        float warp = (fbm(vec2(p.x * 1.6, h * 2.5)) - 0.5) * wind * 1.4 + spur * 0.35 * wind;
        float c = N * (sqrt(h + 0.01) * 2.2) + warp * N * 0.22;
        float band = floor(c);
        float within = fract(c);
        float thick = 0.12 + 0.1 * smoothstep(0.1, 0.6, h);     // bund share of each band
        // Water: the sky mirrored.  Lower on screen = steeper view = higher
        // sky; each pane has its own slight tilt and tint.
        float e = clamp((top - p.y) * 1.3 + 0.05 * hash21(vec2(band, 1.0)), 0.0, 1.0);
        vec3 w = sky(e * 0.7, p.x + 0.05 * (hash21(vec2(band, 2.0)) - 0.5), s, sunP, 0.0);
        // Fields: each terrace is cut into paddies; some are planted
        // (green), some mud, most bright water.
        float fx = p.x * (2.0 + 4.0 * h) + 7.0 * hash21(vec2(band, 5.0));
        float field = floor(fx);
        float fh = hash21(vec2(band, field));
        float divider = smoothstep(0.03, 0.0, min(fract(fx), 1.0 - fract(fx)));
        if (fh > 0.82) w = mix(w, vec3(0.25, 0.42, 0.18) * (0.6 + 0.6 * s), 0.8);
        else if (fh > 0.72) w = mix(w, vec3(0.35, 0.27, 0.2) * (0.6 + 0.6 * s), 0.7);
        else w *= 0.8 + 0.35 * fh;
        w = mix(w, w * vec3(0.85, 0.95, 1.0), 0.3);
        w *= 0.75 + 0.3 * clamp(audioBass, 0.0, 1.0);
        // Sun-glitter column under the sun.
        float gl = exp(-abs(p.x - sunP.x) * 18.0) * pow(noise2(vec2(p.x * 80.0, c * 3.0 + T * 0.5)), 6.0) * s;
        w += vec3(1.0, 0.85, 0.55) * gl * 2.0;
        // A breeze crossing one pane: fine ripples, brighter on the treble.
        float breeze = step(0.9, hash21(vec2(band, floor(T * 0.15)))) * (0.5 + 0.5 * sin(p.x * 200.0 + T * 3.0));
        w += vec3(0.9) * breeze * 0.08 * (0.4 + clamp(audioHigh * 2.0, 0.0, 1.0));
        // Bund: dark earth with a line of grass on top, catching the light.
        float bund = smoothstep(thick, thick * 0.6, within);
        vec3 earth = mix(vec3(0.12, 0.09, 0.07), vec3(0.22, 0.3, 0.12), smoothstep(thick * 0.3, thick * 0.8, within));
        earth *= 0.7 + 0.6 * s;
        vec3 tc = mix(w, earth, max(bund, divider * 0.8));
        // Terrace haze with distance, and valley mist at the bottom.
        tc = mix(tc, sky(0.08, p.x, s, sunP, 0.0) * 0.95, smoothstep(0.12, 0.0, h) * 0.6);
        float mist = smoothstep(0.35, 0.8, fbm(vec2(p.x * 2.0 + T * 0.01, p.y * 5.0))) * smoothstep(-0.25, -0.5, p.y);
        tc = mix(tc, mix(vec3(0.85, 0.85, 0.9), vec3(1.0, 0.85, 0.7), s) * (0.8 + 0.3 * swell), mist * 0.7);
        col = tc * tint;
    }

    // Egrets: small white birds lifting across the terraces on the kick.
    for (int k = 0; k < 3; ++k) {
        float fk = float(k);
        vec2 bc = vec2(-0.6 + 0.5 * fk + 0.02 * T - floor((0.02 * T + 0.5 * fk) / 1.6) * 1.6, -0.1 - 0.08 * fk + 0.02 * sin(T * 0.7 + fk));
        vec2 d = p - bc;
        float wing = sin(T * 5.0 + fk * 2.0);
        float body = length(d * vec2(1.0, 2.2)) - 0.008;
        float wl = abs(d.y - abs(d.x) * 0.5 * wing) - 0.002;
        float bird = min(body, max(wl, abs(d.x) - 0.022));
        col = mix(col, vec3(1.0), smoothstep(0.002, 0.0, bird) * (0.3 + 0.7 * clamp(audioKick, 0.0, 1.0)));
    }

    col *= (0.9 + 0.25 * swell) * (0.9 + 0.2 * audioLevel);
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
