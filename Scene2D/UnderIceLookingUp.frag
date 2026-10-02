#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file UnderIceLookingUp.frag
 * @brief UNDER ICE LOOKING UP: beneath the ice of a frozen lake, looking up
 * at its underside -- a ceiling of clear black ice lit from above by a
 * pale winter sun, shot through with white cracks that branch and meet,
 * and frozen into it, column above column, the flat round bubbles of
 * methane caught as the ice grew, white discs stacked in towers fading
 * upward into the ice.  Where snow lies on top the light is dim and blue;
 * where the ice is bare, shafts of light fall into the dark green water.
 * Suspended particles drift slowly.  The camera is still.
 *
 * Audio Reactivity:
 *   audioSwell  -> the daylight through the ice (slow)
 *   audioHigh   -> glints on the bubbles (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> drifting particles, the light shifting
 *
 * Per-activation variety: bubblesP (how many bubble towers), hueP.
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

uniform float bubblesP;
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

/// Cracks: Voronoi borders (F2 - F1), warped so they wander.
float cracks(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    float f1 = 9.0, f2 = 9.0;
    for (int y = -1; y <= 1; ++y)
    for (int x = -1; x <= 1; ++x) {
        vec2 o = vec2(x, y);
        vec2 c = o + 0.1 + 0.8 * hash22(i + o);
        float d = length(f - c);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return f2 - f1;
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
    float px = 1.0 / resolution.y;

    // Looking up, slightly tilted: the ice ceiling recedes toward the top.
    float persp = 1.0 / (1.2 - p.y * 0.5);
    vec2 q = vec2(p.x, p.y + 0.2) * persp * 2.2;

    // Daylight through the ice: bright where bare, dim blue under snow.
    float snow = smoothstep(0.45, 0.65, fbm(q * 0.7 + 3.0));
    vec3 light = mix(vec3(0.75, 0.9, 1.0), vec3(0.1, 0.2, 0.32), snow) * (0.75 + 0.5 * swell);
    light *= 0.85 + 0.15 * fbm(q * 3.0 + vec2(T * 0.01, 0.0));
    vec3 ice = vec3(0.02, 0.05, 0.08) + light * 0.55;
    ice = mix(ice, ice * imgPalette(0.55 + hueP * 0.159) * 1.4, 0.08);

    // Cracks: white, branching, in two scales.
    vec2 cq = q * 1.3 + 0.4 * vec2(fbm(q * 0.8), fbm(q * 0.8 + 5.0));
    float c1 = cracks(cq);
    float c2 = cracks(cq * 3.1 + 7.0);
    float fw = fwidth(cq.x) * 1.2 + 1e-4;
    float fine = smoothstep(0.5, 0.7, fbm(q * 1.1 + 9.0));
    float present = 0.2 + 0.8 * smoothstep(0.3, 0.6, noise2(cq * 1.7 + 2.0));        // not every border has cracked through
    float cr = smoothstep(fw * 2.0 + 0.01 + 0.025 * noise2(cq * 4.0), 0.0, c1) * present + 0.35 * smoothstep(fw * 5.0 + 0.015, 0.0, c2) * fine;
    cr += exp(-c1 * 14.0) * 0.18;                                   // the crack planes glow softly inside the ice
    ice += vec3(0.85, 0.92, 1.0) * cr * (0.3 + 0.6 * (1.0 - snow)) * (0.8 + 0.4 * swell);

    // Bubble towers: stacks of flat white discs, each tower rising into the
    // ice (the higher discs smaller and fainter).
    float bubbles = 0.0;
    float dens = 0.35 + 0.4 * clamp(bubblesP, 0.0, 1.0);
    vec2 bq = q * 2.5;
    vec2 bi = floor(bq);
    for (int j = -1; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i) {
        vec2 id = bi + vec2(i, j);
        if (hash21(id + 11.0) > dens) continue;
        vec2 c = id + 0.25 + 0.5 * hash22(id);
        // Several discs stacked, each offset a little (the tower leans).
        for (int k = 0; k < 6; ++k) {
            float fk = float(k);
            vec2 cc = c + vec2(0.03, 0.06) * fk * (hash21(id + 3.0) - 0.3);
            float hs = hash21(id + 5.0);
            float rr = (0.04 + 0.16 * hs * hs) * (1.0 - 0.1 * fk) * (0.9 + 0.2 * hash21(id + fk));
            float d = length(bq - cc) - rr;
            float disc = smoothstep(0.02, -0.02, d);
            float rim = smoothstep(0.03, 0.0, abs(d));
            bubbles = max(bubbles, (disc * 0.45 + rim * 0.6) * (1.0 - 0.13 * fk));
        }
    }
    ice += vec3(0.9, 0.95, 1.0) * bubbles * (0.4 + 0.5 * (1.0 - snow)) * (0.8 + 0.3 * swell);
    // Glints on the bubble rims.
    {
        vec2 g = q * 30.0, gi = floor(g), gf = fract(g);
        vec2 gc = 0.25 + 0.5 * hash22(gi);
        float tw = 0.5 + 0.5 * sin(T * 1.7 + hash21(gi + 7.0) * 40.0);
        ice += vec3(1.0) * smoothstep(0.12, 0.0, length(gf - gc)) * step(0.8, hash21(gi + 5.0)) * tw * bubbles * (0.2 + 1.2 * hi);
    }

    // The water below the ice at the bottom of the view: dark green, with
    // shafts of light falling through the bare patches.
    float water = smoothstep(-0.2, -0.45, p.y);
    vec3 wc = vec3(0.01, 0.05, 0.05);
    float shafts = pow(0.5 + 0.5 * sin(p.x * 12.0 + fbm(vec2(p.x * 3.0, T * 0.02)) * 4.0), 5.0) * (1.0 - snow);
    wc += vec3(0.25, 0.45, 0.45) * shafts * smoothstep(-0.55, -0.2, p.y) * 0.3 * (0.6 + 0.6 * swell);
    vec3 col = mix(ice, wc, water);
    // Distance haze in the water toward the far ice.
    col = mix(col, vec3(0.03, 0.09, 0.1), smoothstep(0.1, 0.5, p.y) * 0.5);

    // Suspended particles drifting: round, soft, slow.
    {
        vec2 g = p * 40.0 + vec2(T * 0.08, T * 0.05), gi = floor(g), gf = fract(g);
        vec2 gc = 0.2 + 0.6 * hash22(gi);
        col += vec3(0.5, 0.65, 0.6) * smoothstep(0.1, 0.0, length(gf - gc)) * step(0.85, hash21(gi + 5.0)) * 0.25;
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
