#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file HilbertSpaceFillingCurveZoom.frag
 * @brief HILBERT SPACE FILLING CURVE: a true Hilbert curve (order 7, one
 * unbroken path through 16,384 cells) drawn as a neon tube on a dark
 * ground, its colour running through the spectrum along the path, so the
 * curve's nested U-shapes read as nested colour regions.  Bright comets
 * travel along the path, each trailing a fading tail, and show how the one
 * line winds through every cell.  The view drifts slowly over the curve.
 *
 * The earlier version was not a Hilbert curve at all but a tiled U-motif
 * with a sawtooth zoom that snapped back each cycle.
 *
 * Audio Reactivity:
 *   audioKick     -> the comets flare (light only)
 *   audioSwell    -> the tube glows brighter (slow)
 *   audioCentroid -> tube core sharpness
 *   audioChromaHue-> photo tint of the spectrum
 *   sceneTime / sceneAdvance -> comets travelling, the slow drift (continuous)
 *
 * Per-activation variety: speedP (comet speed), scaleP (cells on screen),
 * lineThicknessP, glowP, hueP.
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
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float speedP;   ///< Speed knob, 0..1.
uniform float scaleP;   ///< Scale knob.
uniform float lineThicknessP;
uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t) {
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 spectral(float x)
{
    return clamp(abs(fract(x + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}

const int N = 128;                  ///< order 7

/// Hilbert index of cell p (the classic xy2d).
int xy2d(ivec2 p)
{
    int d = 0;
    for (int s = N / 2; s > 0; s /= 2) {
        int rx = ((p.x & s) > 0) ? 1 : 0;
        int ry = ((p.y & s) > 0) ? 1 : 0;
        d += s * s * ((3 * rx) ^ ry);
        if (ry == 0) {
            if (rx == 1) p = ivec2(N - 1) - p;
            p = p.yx;
        }
    }
    return d;
}

/// Cell of Hilbert index d (the classic d2xy).
ivec2 d2xy(int d)
{
    ivec2 p = ivec2(0);
    int t = d;
    for (int s = 1; s < N; s *= 2) {
        int rx = 1 & (t / 2);
        int ry = 1 & (t ^ rx);
        if (ry == 0) {
            if (rx == 1) p = ivec2(s - 1) - p;
            p = p.yx;
        }
        p += s * ivec2(rx, ry);
        t /= 4;
    }
    return p;
}

/// @brief Distance from a point to a line segment.
float sdSeg(vec2 p, vec2 a, vec2 b, out float h)
{
    vec2 pa = p - a, ba = b - a;
    h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float spd = (speedP > 0.01) ? speedP : 1.0;
    float sc  = clamp((scaleP > 0.01) ? scaleP : 1.0, 0.7, 1.5);
    float lThk = (lineThicknessP > 0.01) ? lineThicknessP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    // Cells across the screen height, and a slow drift over the curve that
    // stays inside the 128 x 128 domain (continuous, no wrap).
    float cellsH = 24.0 / sc;
    float aspect = resolution.x / resolution.y;
    vec2 room = max(vec2(64.0) - 0.5 * cellsH * vec2(aspect, 1.0) - 1.0, vec2(0.0));
    vec2 centre = vec2(64.0) + room * vec2(sin(T * 0.004 + 1.0), sin(T * 0.0053));
    vec2 g = uv * cellsH + centre;                 // grid coordinates
    ivec2 gc = ivec2(floor(g));

    const float TOTAL = float(N * N);
    float halfW = 0.1 * lThk;
    float best = 1e9, bestAlong = 0.0;
    // The curve near this pixel: the path through each of the 3x3 cells,
    // centre to the midpoints towards its predecessor and successor.
    for (int j = -1; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i) {
        ivec2 c = gc + ivec2(i, j);
        if (any(lessThan(c, ivec2(0))) || any(greaterThanEqual(c, ivec2(N)))) continue;
        int d = xy2d(c);
        vec2 cc = vec2(c) + 0.5;
        float h;
        if (d > 0) {
            vec2 pc = vec2(d2xy(d - 1)) + 0.5;
            float ds = sdSeg(g, cc, 0.5 * (cc + pc), h);
            if (ds < best) { best = ds; bestAlong = float(d) - 0.5 * h; }
        }
        if (d < N * N - 1) {
            vec2 nc = vec2(d2xy(d + 1)) + 0.5;
            float ds = sdSeg(g, cc, 0.5 * (cc + nc), h);
            if (ds < best) { best = ds; bestAlong = float(d) + 0.5 * h; }
        }
    }

    // Dark ground with faint cell dots.
    vec2 cf = fract(g) - 0.5;
    vec3 col = vec3(0.012, 0.014, 0.03) + vec3(0.03, 0.035, 0.06) * smoothstep(0.06, 0.0, length(cf));

    // Spectrum along the path: nested sub-curves share a colour band.
    float s = bestAlong / TOTAL;
    vec3 tubeC = spectral(s * 6.0 + hue * 0.159 + T * 0.004);
    tubeC = mix(tubeC, imgPalette(s * 3.0) * 1.2, 0.22);

    // Comets travelling along the path, each with a fading tail.
    float comet = 0.0;
    for (int k = 0; k < 10; ++k) {
        float head = mod(T * 14.0 * spd + float(k) * TOTAL / 10.0, TOTAL);
        float behind = head - bestAlong;
        comet += (behind >= 0.0) ? exp(-behind / (110.0 * spd)) : 0.0;
    }
    comet = min(comet, 1.5);

    float sharp = 1.0 + 0.6 * clamp(audioCentroid, 0.0, 1.0);
    float core = smoothstep(halfW, halfW * 0.4 / sharp, best);
    float glow = exp(-best * 5.0) * 0.45 * glw * (0.8 + 0.5 * swell);
    float lit = 0.9 + 0.3 * swell + comet * (1.6 + 1.2 * clamp(audioKick, 0.0, 1.0));
    col += tubeC * (glow * lit + core * lit);
    col += vec3(1.0) * core * comet * 0.5;           // the white-hot head

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
