#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file LenticularCloudStack.frag
 * @brief LENTICULAR CLOUD STACK: a lone snow volcano at dusk, and hovering
 * over its summit a stack of lenticular clouds -- smooth lens-shaped
 * discs piled one on the other like a stack of plates, their rims crisp,
 * their tops catching the last pink and orange light of the sun, their
 * undersides lavender in shadow, a thin fibrous veil trailing from their
 * lee edges.  The mountain's snowfields glow faintly rose, the sky shades
 * from deep blue to peach at the horizon, and the whole stack breathes
 * slowly as the wind flows over the peak.  The camera is still.
 *
 * Audio Reactivity:
 *   audioSwell  -> the pink light on the clouds and the snow (slow)
 *   audioHigh   -> the first stars (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the stack breathing, the veils drifting
 *
 * Per-activation variety: layersP (how many discs), hueP.
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

uniform float layersP;
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
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    int nL = 3 + int(clamp(layersP, 0.0, 1.0) * 3.99);

    // Dusk sky: deep blue above, peach at the horizon.
    vec3 col = mix(vec3(1.0, 0.72, 0.55), vec3(0.62, 0.55, 0.72), smoothstep(-0.35, 0.0, p.y));
    col = mix(col, vec3(0.16, 0.22, 0.45), smoothstep(-0.05, 0.5, p.y));
    {
        vec2 g = p * 90.0, gi = floor(g), gf = fract(g);
        vec2 gc = 0.25 + 0.5 * vec2(hash21(gi), hash21(gi + 3.0));
        col += vec3(0.9, 0.95, 1.0) * smoothstep(0.1, 0.0, length(gf - gc)) * step(0.988, hash21(gi + 5.0)) * smoothstep(0.2, 0.45, p.y) * (0.3 + 0.8 * hi);
    }
    vec3 pinkC = mix(vec3(1.0, 0.55, 0.6), vec3(1.0, 0.7, 0.45), 0.4);
    pinkC = mix(pinkC, imgPalette(0.95 + hueP * 0.159) * 1.3, 0.1);
    float glow = 0.85 + 0.5 * swell;

    // The volcano: a broad cone with snowfields and dark rock ribs.
    float peakX = 0.02;
    float cone = -0.42 + 0.52 * exp(-pow(abs(p.x - peakX) * 1.6, 1.4)) + 0.015 * (fbm(vec2(p.x * 8.0, 1.0)) - 0.5);
    // The stack of lenses over the summit.
    float summit = -0.42 + 0.52;
    vec3 cloudCol = vec3(0.0);
    float cloudA = 0.0;
    for (int k = 5; k >= 0; --k) {
        if (k >= nL) continue;
        float fk = float(k);
        float cy = summit + 0.06 + fk * 0.065 + 0.004 * sin(T * 0.07 + fk);
        float cx = peakX + 0.03 * sin(fk * 1.7) + 0.01 * sin(T * 0.05 + fk * 2.0);
        float wR = (0.42 - 0.05 * fk) * (1.0 + 0.03 * sin(T * 0.09 + fk * 1.3));
        float th = 0.042 + 0.008 * sin(fk * 2.3);
        vec2 q = p - vec2(cx, cy);
        float u = q.x / wR;
        if (abs(u) > 1.5) continue;
        // Lens profile: thickest in the middle, tapering to a sharp rim.
        float prof = th * pow(max(1.0 - u * u, 0.0), 0.7);
        float top = prof * 1.1, bot = -prof * 0.7;
        // Fibrous edges: the rim frays a little on the lee side.
        float fr = fbm(vec2(q.x * 30.0 - T * 0.05, q.y * 120.0 + fk * 5.0));
        float fray = 0.004 * (fr - 0.5) + 0.006 * smoothstep(0.4, 1.0, u) * fr;
        float inside = smoothstep(top + fray + 0.006, top + fray - 0.004, q.y) * smoothstep(bot - fray - 0.006, bot - fray + 0.004, q.y);
        // Shading: lit tops, shaded undersides, brighter toward the sun (left).
        float hgt = clamp((q.y - bot) / max(top - bot, 1e-4), 0.0, 1.0);
        vec3 c = mix(vec3(0.5, 0.45, 0.62), pinkC * glow * (0.8 + 0.3 * smoothstep(0.5, -0.8, u)), smoothstep(0.2, 0.9, hgt));
        c += vec3(1.0, 0.85, 0.75) * smoothstep(0.85, 1.0, hgt) * 0.25 * glow;            // the lit rim on top
        c *= 0.88 + 0.2 * fbm(vec2(q.x * 12.0, q.y * 40.0 + fk * 3.0));                 // soft cloud texture
        // Veil trailing from the lee edge.
        float veil = smoothstep(0.85, 1.05, u) * smoothstep(1.45, 1.1, u) * smoothstep(0.018, 0.0, abs(q.y - 0.004 * (fr - 0.5))) * smoothstep(0.4, 0.75, fr) * 0.3;
        float a = max(inside, veil);
        cloudCol = mix(cloudCol, c, a);
        cloudA = max(cloudA, a);
    }
    if (p.y < cone) {
        // Snow above, rock ribs, forests low down; faint rose light on the snow.
        float h = (p.y + 0.42) / 0.52;
        float ribs = smoothstep(0.55, 0.7, fbm(vec2((p.x - peakX) * 14.0 / (0.2 + h), h * 3.0)));
        vec3 snow = mix(vec3(0.62, 0.62, 0.78), vec3(1.0, 0.8, 0.8) * glow, smoothstep(0.3, 0.9, h) * smoothstep(0.1, -0.2, p.x - peakX));
        vec3 rock = vec3(0.2, 0.18, 0.24);
        vec3 m = mix(snow, rock, ribs * smoothstep(0.95, 0.4, h));
        m = mix(m, vec3(0.08, 0.1, 0.12), smoothstep(0.35, 0.1, h));              // forest below the snowline
        col = m;
    }
    col = mix(col, cloudCol, cloudA);
    // Haze in the valley.
    col = mix(col, vec3(0.7, 0.6, 0.7), smoothstep(-0.3, -0.5, p.y) * 0.4);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
