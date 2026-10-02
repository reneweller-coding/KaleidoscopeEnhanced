#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file FourierEpicycleDraw.frag
 * @brief FOURIER EPICYCLE DRAW: a chain of rotating circles -- each turning
 * at its own harmonic, its radius the energy of a spectrum band -- whose
 * last point draws a closed curve, the way a Fourier series traces a
 * shape.  The pen runs on the scene clock; the trace it leaves is the
 * curve of the last cycle, fading; the circles' radii are the bands
 * (smoothed by the drawing itself), the kick lights the pen, the treble
 * sparkles the circles, the photo shows through the drawn shape.  Camera
 * still.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> epicycle radii (light-sized, low harmonics dominate)
 *   sceneAdvance      -> the rotation and the pen (continuous)
 *   audioKick         -> pen light (light)
 *   audioHigh         -> circle sparkle (light)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: termsP, traceP, hueP.
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
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float termsP;
uniform float traceP;
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

/// @brief Pseudo-random number 0..1 from a float.
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

/// Radius of term k: a fixed geometric fall-off times the band energy
/// (kept small so the shape is steady, the bands only breathe it).
float termRadius(int k, out float e)
{
    e = clamp(audioSpectrum[int(mod(float(k) * 3.0 + 1.0, 32.0))] * 1.5, 0.0, 1.0);
    return (0.34 / (1.0 + float(k) * 0.9)) * (0.7 + 0.3 * e);
}

/// Position of the pen (end of the chain) at phase t (0..1), and the
/// circle centres along the way for drawing.
vec2 chainPos(float t, int terms, int upTo)
{
    vec2 q = vec2(0.0);
    for (int k = 0; k < 12; ++k)
    {
        if (k >= terms || k > upTo) break;
        float e;
        float r = termRadius(k, e);
        float freq = float(k) + 1.0 - 2.0 * float(k) * step(0.5, hash11(float(k) * 7.7));   // some terms rotate backward
        float ph = t * 6.2831853 * freq + hash11(float(k) * 3.3) * 6.28;
        q += vec2(cos(ph), sin(ph)) * r;
    }
    return q;
}

/// @brief Closest distance between a ray and a segment (and the ray parameter there).
float segDist(vec2 p, vec2 a, vec2 b)
{
    vec2 d = b - a; float t = clamp(dot(p - a, d) / max(dot(d, d), 1e-6), 0.0, 1.0);
    return length(p - (a + d * t));
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    int terms = 5 + int(clamp(termsP, 0.0, 1.0) * 6.0);
    float traceLen = 0.5 + 0.5 * clamp(traceP, 0.0, 1.0);
    float t = fract(sceneAdvance * 0.12 + sceneTime * 0.025);
    vec2 origin = vec2(-0.25, 0.0);

    // Paper: the photo dim.
    vec3 col = img(gl_FragCoord.xy / resolution) * imgPalette(hue * 0.159 + 0.6) * 0.45 + vec3(0.04, 0.04, 0.05);

    // The trace: sample the pen path over the last traceLen of the cycle.
    float trace = 0.0;
    vec2 prev = origin + chainPos(t - traceLen, terms, 99);
    for (int s = 1; s <= 90; ++s)
    {
        float ts = t - traceLen + traceLen * float(s) / 90.0;
        vec2 q = origin + chainPos(ts, terms, 99);
        float d = segDist(p, prev, q);
        float age = 1.0 - float(s) / 90.0;
        trace = max(trace, smoothstep(0.006, 0.002, d) * (1.0 - age * 0.8));
        prev = q;
    }
    vec3 traceCol = imgPalette(hue * 0.159 + 0.2) * 1.6 + 0.2;
    // Where the trace runs, the photo shows through brighter (the drawn shape).
    col = mix(col, img(gl_FragCoord.xy / resolution) * 1.3, trace * 0.5);
    col += traceCol * trace * 1.4;

    // The circles and the arms.
    vec2 c = origin;
    for (int k = 0; k < 12; ++k)
    {
        if (k >= terms) break;
        float e;
        float r = termRadius(k, e);
        vec2 nxt = origin + chainPos(t, terms, k);
        float ring = smoothstep(0.004, 0.001, abs(length(p - c) - r));
        float arm = smoothstep(0.004, 0.001, segDist(p, c, nxt));
        vec3 cc = imgPalette(hue * 0.159 + float(k) * 0.08) * 1.3 + 0.2;
        col += cc * ring * (0.35 + 0.5 * e) * (1.0 + 0.8 * clamp(audioHigh * 2.0, 0.0, 1.0) * e);
        col += vec3(0.9) * arm * 0.5;
        c = nxt;
    }
    // The pen: a bright round point at the chain's end, lit by the kick.
    float pen = smoothstep(0.014, 0.006, length(p - c));
    col += (traceCol + 0.3) * pen * (1.0 + 2.0 * audioKick);
    col += traceCol * exp(-length(p - c) * 25.0) * (0.3 + 1.0 * audioKick);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
