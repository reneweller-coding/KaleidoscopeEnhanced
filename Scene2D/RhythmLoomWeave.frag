#version 330 core
out vec4 fragColor;
/**
 * @file RhythmLoomWeave.frag
 * @brief RHYTHM LOOM WEAVE: a loom weaving the music into cloth.  Thirty-
 * two warp threads run top to bottom, one per spectrum band, lit by their
 * band; the weft shuttle crosses on the scene clock, laying a new row each
 * pass, and the cloth already woven scrolls slowly down carrying the
 * photo in its weave (the photo is the pattern card).  The kick is the
 * beater striking the row home (a flash along the fell line), the treble
 * glints the shuttle.  Camera still.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> warp thread light (light)
 *   sceneAdvance      -> shuttle and cloth advance (continuous)
 *   audioKick         -> beater flash (light)
 *   audioHigh         -> shuttle glint (light)
 *   audioSwell        -> loom lamp (slow)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: pitchP (thread spacing), weaveP (pattern), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioKick;
uniform float audioHigh;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float pitchP;
uniform float weaveP;
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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float span = aspect * (0.8 + 0.15 * clamp(pitchP, 0.0, 1.0));
    float weave = 1.0 + floor(clamp(weaveP, 0.0, 1.0) * 2.0);       // 1 plain, 2 twill-ish, 3 satin-ish
    float lamp = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.6 + sceneTime * 0.12;
    float fellY = 0.05;                                            // the fell line: rows are beaten here
    float rowH = 0.022;
    float rowsDone = clock * 1.5;                                  // rows woven so far (continuous)
    float shuttleT = fract(rowsDone);                              // the shuttle's pass across the row

    // The loom frame: dark wood.
    vec3 col = vec3(0.08, 0.06, 0.04) + imgPalette(hue * 0.159 + 0.6) * 0.03;
    float inWarp = step(abs(p.x), span * 0.5);
    // Warp: 32 threads, lit by their band; above the fell they hang taut.
    float tx = (p.x / span + 0.5) * 32.0;
    int band = int(clamp(floor(tx), 0.0, 31.0));
    float within = fract(tx) - 0.5;
    float thread = smoothstep(0.32, 0.18, abs(within));
    float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
    vec3 warpCol = mix(vec3(0.85, 0.8, 0.7), imgPalette(hue * 0.159 + float(band) / 32.0), 0.5) * lamp;
    // The heddles lift alternate threads above the fell (the shed), shown
    // as a gentle vertical offset that alternates per row on the clock.
    float shed = sin(rowsDone * 3.14159) * (mod(float(band), 2.0) * 2.0 - 1.0);
    float above = step(fellY, p.y);
    col = mix(col, warpCol * (0.35 + 0.9 * e) * (0.85 + 0.15 * shed * above), thread * inWarp * above);
    // The cloth below the fell: rows scroll down; each row is a weft thread
    // over/under the warp by the weave pattern; the photo is the card that
    // decides the weft colour per row and thread.
    if (p.y < fellY && inWarp > 0.5)
    {
        float rowF = (fellY - p.y) / rowH + fract(rowsDone);       // rows below the fell (continuous scroll)
        float row = floor(rowF);
        float rowIdx = floor(rowsDone) - row;
        float rw = fract(rowF) - 0.5;
        float over = mod(floor(tx) + row * weave, 2.0);            // weave pattern: which thread is on top
        vec2 cardUV = vec2(fract(tx / 32.0), fract(rowIdx * 0.013));
        vec3 weft = img(cardUV) * 1.3;
        weft = mix(weft, weft * imgPalette(hue * 0.159 + 0.3) * 1.5, 0.3) * lamp;
        float weftThread = smoothstep(0.42, 0.3, abs(rw));
        vec3 clothWarp = warpCol * (0.5 + 0.5 * e);
        vec3 cloth = mix(clothWarp * thread + col * (1.0 - thread), weft, weftThread * over);
        cloth = mix(cloth, weft, weftThread * (1.0 - over) * 0.35);
        col = cloth;
    }
    // The fell line and the beater: a flash on the kick.
    col += imgPalette(hue * 0.159 + 0.9) * smoothstep(0.01, 0.0, abs(p.y - fellY)) * inWarp * (0.3 + 1.5 * audioKick);
    // The shuttle: a bright bobbin crossing at the fell on the clock.
    float sx = (shuttleT * 2.0 - 1.0) * span * 0.5 * (mod(floor(rowsDone), 2.0) * 2.0 - 1.0);
    float shuttle = smoothstep(0.05, 0.03, abs(p.x - sx)) * smoothstep(0.02, 0.012, abs(p.y - fellY - 0.02));
    col = mix(col, vec3(0.9, 0.75, 0.45) * lamp, shuttle);
    col += vec3(1.0) * shuttle * clamp(audioHigh * 2.0, 0.0, 1.0) * 0.6;
    // The weft trailing from the shuttle back to the selvedge.
    float trailing = step(min(sx, -span * 0.5 * (mod(floor(rowsDone), 2.0) * 2.0 - 1.0)), p.x) * step(p.x, max(sx, -span * 0.5 * (mod(floor(rowsDone), 2.0) * 2.0 - 1.0)));
    col += imgPalette(hue * 0.159 + 0.3) * smoothstep(0.006, 0.0, abs(p.y - fellY - 0.02)) * trailing * 0.6;
    // Loom side rails.
    col = mix(col, vec3(0.3, 0.2, 0.1) * lamp, smoothstep(0.02, 0.0, abs(abs(p.x) - span * 0.5 - 0.03)));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
