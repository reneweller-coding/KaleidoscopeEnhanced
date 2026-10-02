#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file MelodyScript.frag
 * @brief MELODY SCRIPT: the tune written as ink calligraphy on rice paper.
 * The last eight seconds of melody run across the sheet as one brush
 * stroke -- pitch is height, the newest note at the right -- swelling where
 * the line lingers, thinning where it leaps, lifting off the paper where
 * the melody rests.  Fresh ink is black and wet; toward the left it dries,
 * lightens and breaks into dry-brush streaks.  A faint wash of stave lines
 * lies under it, a vermilion seal sits in the corner, and the whole script
 * glides steadily leftward: audioMelodyPhase carries it smoothly between
 * the 80 ms melody samples, so it never steps.
 *
 * Replaces a Scene3D ribbon version (stave and trace drawn as lines).
 *
 * Audio Reactivity:
 *   audioMelody[96] / audioMelodyHead / audioMelodyPhase -> the stroke
 *   audioOnset  -> the wet gleam at the brush tip (light)
 *   audioSwell  -> the lamp on the paper (slow)
 *   audioLevel  -> brightness
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioMelody[96];
uniform float audioMelodyHead;
uniform float audioMelodyPhase;
uniform float audioOnset;   ///< Onset envelope (any instrument), 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
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

/// Melody sample k steps into the past (0 = newest).
float melodyAgo(int k)
{
    int head = int(audioMelodyHead * 96.0 + 0.5);
    int i = int(mod(float(head - 1 - k + 192), 96.0));
    return audioMelody[i];
}

/// Periodic value noise over the 96-sample ring (18 cells): the brush's
/// pressure and dry streaks are tied to the ink itself, so they scroll with
/// the stroke instead of standing still while the ink slides through them.
float ringNoise(float s, float y)
{
    float x = s * 0.1875;
    float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    float a = hash21(vec2(mod(i, 18.0), y)), b = hash21(vec2(mod(i + 1.0, 18.0), y));
    return mix(a, b, f);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);

    // Rice paper: warm, fibrous, lit by a lamp.
    vec3 paper = vec3(0.94, 0.9, 0.82);
    float fib = noise2(vec2(p.x * 14.0, p.y * 90.0)) * 0.4 + noise2(p * 60.0) * 0.6;
    paper *= 0.96 + 0.05 * fib;
    paper *= 0.85 + 0.25 * exp(-dot(p, p) * 0.9) * (0.8 + 0.4 * swell);
    vec3 col = paper;

    // A faint wash of stave lines.
    for (int l = 0; l < 5; ++l) {
        float y = -0.3 + 0.15 * float(l);
        col *= 1.0 - 0.06 * smoothstep(0.006, 0.0, abs(p.y - y + 0.003 * sin(p.x * 3.0 + float(l))));
    }

    // The stroke: 95 segments from the newest sample (right) to the oldest.
    float xNow = 0.62 * aspect * 0.5 + 0.1;
    float dx = (xNow + 0.5 * aspect * 0.95) / 95.0;
    float ph = clamp(audioMelodyPhase, 0.0, 1.0);
    float sd = 1e9, sAge = 0.0, sAlong = 0.0, sAcross = 0.0, sW = 0.01;
    float mPrev = melodyAgo(0);
    vec2 aPrev = vec2(xNow - ph * dx, -0.32 + 0.66 * clamp(mPrev, 0.0, 1.0));
    for (int k = 1; k < 96; ++k) {
        float m = melodyAgo(k);
        vec2 b = vec2(xNow - (float(k) + ph) * dx, -0.32 + 0.66 * clamp(m, 0.0, 1.0));
        if (m > 0.02 && mPrev > 0.02) {
            vec2 pa = p - aPrev, ba = b - aPrev;
            float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
            // Brush pressure: a slow swell and ebb along the stroke,
            // continuous across the joints (a per-segment width drew beads).
            float along = float(k) - 1.0 + h;
            float absPos = mod(audioMelodyHead * 96.0 - along + 960.0, 96.0);
            float w = 0.006 + 0.008 * ringNoise(absPos, 1.0);
            float d = length(pa - ba * h) - w;
            if (d < sd) {
                sd = d; sAge = (float(k) - 1.0 + h) / 95.0; sAlong = absPos; sW = w;
                sAcross = dot(pa - ba * h, normalize(vec2(-ba.y, ba.x))) / w;
            }
        }
        aPrev = b; mPrev = m;
    }
    // Ink: black and wet when fresh, drying lighter with dry-brush streaks.
    float inkA = smoothstep(0.0015, -0.0015, sd);
    float dry = smoothstep(0.35, 1.0, sAge);
    float streak = 0.5 * ringNoise(sAlong * 3.0, floor(sAcross * 3.5) + 7.0) + 0.5 * ringNoise(sAlong * 3.0, floor(sAcross * 3.5) + 8.0);
    inkA *= 1.0 - dry * smoothstep(0.55, 0.35, streak) * 0.85;
    vec3 ink = mix(vec3(0.03, 0.03, 0.04), vec3(0.22, 0.2, 0.2), dry * 0.8);
    // A soft bleed into the paper fibres around the fresh stroke.
    col *= 1.0 - 0.18 * exp(-max(sd, 0.0) * 220.0) * (1.0 - dry);
    col = mix(col, ink, inkA);
    // The wet gleam on the freshest ink, brighter on an onset.
    float fresh = exp(-sAge * 40.0);
    col += vec3(1.0) * inkA * fresh * smoothstep(0.2, 0.9, 1.0 - abs(sAcross)) * (0.08 + 0.25 * clamp(audioOnset, 0.0, 1.0));

    // The vermilion seal in the lower right.
    {
        vec2 sp = p - vec2(0.5 * aspect - 0.16, -0.36);
        vec2 aq = abs(sp);
        float box = step(max(aq.x, aq.y), 0.055);
        float border = step(0.045, max(aq.x, aq.y));
        // Carved "characters": a few strokes left unprinted.
        float carve = 0.0;
        carve += step(abs(sp.x + 0.015), 0.004) * step(abs(sp.y), 0.035);
        carve += step(abs(sp.y - 0.015), 0.004) * step(abs(sp.x - 0.012), 0.022);
        carve += step(abs(sp.x - 0.022), 0.004) * step(abs(sp.y + 0.01), 0.025);
        carve += step(abs(sp.y + 0.025), 0.004) * step(abs(sp.x + 0.005), 0.03);
        float printed = box * (border + (1.0 - border) * (1.0 - clamp(carve, 0.0, 1.0)));
        printed *= 0.75 + 0.25 * noise2(sp * 300.0);
        col = mix(col, vec3(0.78, 0.16, 0.1), printed * 0.9);
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone * 1.15, 0.0, 1.0), 1.0);
}
