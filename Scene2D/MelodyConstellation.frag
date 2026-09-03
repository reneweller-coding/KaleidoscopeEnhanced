#version 330 core
out vec4 fragColor;
/**
 * @file MelodyConstellation.frag
 * @brief MELODY CONSTELLATION: the last ~8 seconds of melody drawn as stars
 * on a night sky and joined into a constellation that writes itself as the
 * song goes.  The host keeps 96 samples of the melody pitch (audioMelody,
 * a ring with audioMelodyHead, one sample per 80 ms); each becomes a star --
 * position from time (a slow spiral, so the constellation curls instead of
 * scrolling) and pitch (radius), brightness from how recently it sounded.
 * Consecutive stars are joined by faint lines; a leap in pitch draws a long
 * strut, a held note a tight cluster.  Silence lifts the pen.
 *
 * Audio Reactivity:
 *   audioMelody[96] / audioMelodyHead -> the stars and their lines
 *   audioDeltaPitch -> twinkle (melodic activity)
 *   audioOnset      -> the newest star flares
 *   audioSwell      -> nebula haze behind the constellation
 *   audioBarPhase   -> the sky turns one bar per rotation step
 *
 * Per-activation variety: spreadP (radius scale), sizeP (star size), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioMelody[96];
uniform float audioMelodyHead;
uniform float audioDeltaPitch;
uniform float audioOnset;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioBarPhase;
uniform float audioAdvance;
uniform float sceneAdvance;
uniform float audioChromaHue;
uniform float audioValence;

uniform float spreadP;
uniform float sizeP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

// Melody sample k steps into the past (0 = newest).
float melodyAgo(int k)
{
    int head = int(audioMelodyHead * 96.0 + 0.5);
    int i = int(mod(float(head - 1 - k + 192), 96.0));
    return audioMelody[i];
}

// Where star k sits: a slow spiral in time, radius from pitch.
vec2 starPos(int k, float m, float spread)
{
    float age = float(k) / 96.0;                       // 0 newest .. 1 oldest
    float ang = -age * 9.5 + sceneAdvance * 0.15;   // (a bar-phase term here JUMPED at every bar wrap)
    float rad = (0.12 + 0.62 * m + 0.25 * age) * spread;
    return rad * vec2(cos(ang), sin(ang));
}

// Distance from p to segment ab.
float segDist(vec2 p, vec2 a, vec2 b)
{
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float spread = (spreadP > 0.05) ? spreadP : 1.0;
    float sz     = (sizeP > 0.05) ? sizeP : 1.0;
    float hue    = (hueP > 0.001) ? hueP : 0.0;

    // Night sky: a faint nebula from the photo, breathing with the swell.
    vec3 sky = img(clamp(p * 0.25 + 0.5, 0.0, 1.0)) * (0.05 + 0.12 * audioSwell);
    // Background stars, fixed.
    vec2 g = floor(p * 40.0);
    float hs = hash11(dot(g, vec2(1.0, 57.0)));
    float bg = step(0.97, hs) * (0.3 + 0.5 * hash11(hs * 31.0)) * exp(-length(fract(p * 40.0) - 0.5) * 12.0);
    vec3 col = sky + vec3(0.7, 0.8, 1.0) * bg * 0.9;

    // The constellation: 96 stars and 95 struts.  Stars fade with age; the
    // strut between two stars is drawn only when both notes sounded (pen
    // down), and a big pitch leap makes it a long, bright strut.
    vec3 starCol = imgPalette(hue * 0.159 + 0.7);
    vec3 lineCol = imgPalette(hue * 0.159 + 0.3);
    float acc = 0.0, lines = 0.0;
    vec2 prevPos = vec2(0.0); float prevM = 0.0;
    for (int k = 0; k < 96; ++k)
    {
        float m = melodyAgo(k);
        float pen = smoothstep(0.02, 0.06, m);
        vec2 sp = starPos(k, m, spread);
        float age = float(k) / 96.0;
        float d = length(p - sp);
        float bright = (1.0 - age * 0.85) * pen;
        // Star core + halo; the newest one flares on an onset.
        float core = exp(-d * d * (2500.0 / (sz * sz)));
        float halo = exp(-d * (28.0 / sz)) * 0.22;
        float flare = (k == 0) ? (1.0 + 2.5 * audioOnset) : 1.0;
        acc += (core + halo) * bright * flare;
        if (k > 0)
        {
            float both = pen * smoothstep(0.02, 0.06, prevM);
            float ld = segDist(p, prevPos, sp);
            float leap = abs(m - prevM);
            lines += exp(-ld * 380.0) * both * (0.3 + 1.2 * leap) * (1.0 - age * 0.8);
        }
        prevPos = sp; prevM = m;
    }
    // Twinkle with melodic activity.
    float tw = 0.85 + 0.35 * sin(sceneAdvance * 6.0 + p.x * 40.0) * clamp(audioDeltaPitch * 2.0, 0.0, 1.0);
    col += starCol * acc * 1.3 * tw + lineCol * lines * 0.7;

    // Fallback when the host has no melody yet (probe render, silence): a
    // slow procedural constellation, so the sky is never just empty.
    float energy = audioMelody[0] + audioMelody[24] + audioMelody[48] + audioMelody[72];
    if (energy < 0.02)
    {
        float ph = sceneAdvance * 0.4;
        for (int k = 0; k < 12; ++k)
        {
            float fk = float(k);
            vec2 sp = 0.45 * spread * vec2(cos(fk * 1.7 + ph), sin(fk * 2.3 + ph * 0.7));
            col += starCol * exp(-length(p - sp) * length(p - sp) * 900.0) * 1.0;
        }
    }

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
