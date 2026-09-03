#version 330 core
out vec4 fragColor;
/**
 * @file CandleForestBreath.frag
 * @brief CANDLE FOREST BREATH: hundreds of candles in a dark chapel, each
 * a round-topped flame on a wax column of the photo.  A draught runs
 * through the room as a slow wave on the scene clock, and every flame
 * leans with it; each flame's brightness is its spectrum band (a candle
 * per band, in rows), the kick makes them gutter (a dip and flare of
 * light), the swell is the warmth of the whole room.  Camera fixed among
 * the candles.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> flame brightness by candle (light)
 *   sceneAdvance      -> the draught wave, the lean (continuous, slow)
 *   audioKick         -> gutter (light)
 *   audioSwell        -> room warmth (slow)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: rowsP, draughtP, hueP.
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
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float rowsP;
uniform float draughtP;
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
    int rows = 4 + int(clamp(rowsP, 0.0, 1.0) * 3.0);
    float draught = 0.3 + 0.7 * clamp(draughtP, 0.0, 1.0);
    float warmth = 0.5 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;
    float gutter = audioKick;

    // The chapel: the photo very dark as the walls, warmed by the candles.
    vec3 col = img(gl_FragCoord.xy / resolution) * imgPalette(hue * 0.159 + 0.55) * 0.08;
    col += vec3(1.0, 0.7, 0.4) * 0.06 * warmth * (1.0 - smoothstep(-0.3, 0.5, p.y));
    vec3 flameCol = mix(vec3(1.0, 0.75, 0.35), imgPalette(hue * 0.159 + 0.08), 0.2);

    // Rows of candles from far (top, small) to near (bottom, large); each
    // row is a jittered line; within a row, candle i has band (i + row*7) mod 32.
    for (int r = 0; r < 7; ++r)
    {
        if (r >= rows) break;
        float fr = float(r);
        float depth = 1.0 - fr / float(rows);                        // 1 far .. 0 near
        float baseY = -0.42 + 0.7 * depth * depth;                   // rows recede upward
        float scale = 0.35 + 0.65 * (1.0 - depth);
        float spacing = 0.09 * scale + 0.03;
        float cx0 = fract(fr * 0.37) * spacing;
        for (int i = 0; i < 24; ++i)
        {
            float fi = float(i);
            float x = -aspect * 0.55 + cx0 + fi * spacing * 1.35;
            if (x > aspect * 0.55) break;
            float jit = (hash21(vec2(fi, fr)) - 0.5) * spacing * 0.5;
            x += jit;
            float y = baseY + (hash21(vec2(fi, fr + 9.0)) - 0.5) * 0.02;
            float h = (0.12 + 0.1 * hash21(vec2(fi + 3.0, fr))) * scale;     // candle height
            // The wax column: the photo as its surface.
            vec2 q = p - vec2(x, y);
            float w = 0.012 * scale + 0.004;
            float wax = step(abs(q.x), w) * step(0.0, q.y) * step(q.y, h);
            vec3 waxCol = img(fract(vec2(fi * 0.11 + fr * 0.3, q.y * 2.0))) * 0.5 + 0.35;
            waxCol *= (0.35 + 0.65 * (1.0 - abs(q.x) / w)) * warmth * (0.5 + 0.5 * (1.0 - depth));
            col = mix(col, waxCol, wax);
            // The flame: leaning with the draught wave (position along x),
            // a round-topped teardrop; brightness by band, gutter on the kick.
            int band = int(mod(fi + fr * 7.0, 32.0));
            float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
            float lean = draught * 0.6 * sin(clock * 1.2 + x * 3.0 + fr * 0.7) * (1.0 + 0.3 * gutter);
            float fh = (0.03 + 0.03 * e) * scale * (1.0 - 0.4 * gutter);
            vec2 fq = q - vec2(0.0, h);
            fq.x -= lean * fq.y * 1.5;                                 // shear the flame with the lean
            float flame = smoothstep(1.0, 0.7, length(fq * vec2(1.0 / (0.012 * scale + 0.003), 1.0 / fh) - vec2(0.0, 1.0)));
            float core = smoothstep(1.0, 0.4, length(fq * vec2(1.0 / (0.006 * scale + 0.002), 1.0 / (fh * 0.6)) - vec2(0.0, 0.8)));
            vec3 fc = flameCol * (0.6 + 0.9 * e) * (1.0 + 0.5 * gutter);
            col += fc * flame * 1.4 + vec3(1.0, 0.95, 0.8) * core * 1.2;
            col += fc * exp(-length(fq) * (18.0 / scale)) * 0.35 * (0.5 + 0.8 * e);
        }
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
