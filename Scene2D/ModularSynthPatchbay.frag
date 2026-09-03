#version 330 core
out vec4 fragColor;
/**
 * @file ModularSynthPatchbay.frag
 * @brief MODULAR SYNTH PATCHBAY: a wall of Eurorack modules -- panels
 * carrying the photo as their graphics, knobs turning slowly on the scene
 * clock, LEDs lit by the chroma classes, an oscilloscope module drawing
 * the waveform (audioWave), a spectrum module with the 32 bands, and patch
 * cables hanging in catenaries between jacks, each cable lit by the band
 * it carries.  The kick is the trigger LED, the swell the rack light.
 * Camera fixed in front of the rack.
 *
 * Audio Reactivity:
 *   audioWave[64]     -> the scope trace (light)
 *   audioSpectrum[32] -> spectrum module and the cable glow (light)
 *   audioChroma[12]   -> LEDs (light)
 *   audioKick         -> trigger LED (light)
 *   audioSwell        -> rack light (slow)
 *   sceneAdvance      -> knob rotation (continuous)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: cablesP, colsP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioWave[64];
uniform float audioSpectrum[32];
uniform float audioChroma[12];
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float cablesP;
uniform float colsP;
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
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// Distance to a hanging cable between a and b (a parabola sag), and the
// parameter along it.
float cableDist(vec2 p, vec2 a, vec2 b, float sag, out float t)
{
    float best = 1e9; t = 0.0;
    vec2 prev = a;
    for (int i = 1; i <= 16; ++i)
    {
        float u = float(i) / 16.0;
        vec2 q = mix(a, b, u) - vec2(0.0, sag * 4.0 * u * (1.0 - u));
        vec2 e = q - prev;
        float s = clamp(dot(p - prev, e) / max(dot(e, e), 1e-6), 0.0, 1.0);   // distance to the segment, not the sample point
        float d = length(p - (prev + e * s));
        if (d < best) { best = d; t = u - (1.0 - s) / 16.0; }
        prev = q;
    }
    return best;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float cables = 6.0 + floor(clamp(cablesP, 0.0, 1.0) * 6.0);
    float cols = 5.0 + floor(clamp(colsP, 0.0, 1.0) * 3.0);
    float light = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.3 + sceneTime * 0.05;

    // The rack: two rows of modules.  Column width from cols; rails at
    // the row edges.
    float colW = aspect / cols;
    float rowH = 0.48;
    vec2 cell = vec2(floor((p.x + aspect * 0.5) / colW), floor((p.y + 0.5) / rowH));
    vec2 cuv = vec2(fract((p.x + aspect * 0.5) / colW), fract((p.y + 0.5) / rowH));
    float mid = hash21(cell + 3.1);
    // Panel: brushed aluminium with the photo as the graphic, faint.
    vec3 panel = vec3(0.72, 0.72, 0.74) * (0.9 + 0.1 * sin(p.y * 500.0));
    vec2 puv = (p / vec2(aspect, 1.0) + 0.5);
    panel = mix(panel, img(puv) * imgPalette(hue * 0.159 + mid * 0.5) * 1.6, 0.35);
    // A few panels are black.
    float dark = step(0.7, mid);
    panel = mix(panel, vec3(0.12, 0.12, 0.13) + img(puv) * 0.15, dark);
    // Panel edge gaps and screws.
    float gap = smoothstep(0.02, 0.0, min(cuv.x, 1.0 - cuv.x)) + smoothstep(0.02, 0.0, min(cuv.y, 1.0 - cuv.y));
    panel *= 1.0 - gap * 0.7;
    vec2 screw = min(cuv, 1.0 - cuv) - 0.05;
    panel = mix(panel, vec3(0.5), smoothstep(0.012, 0.008, length(screw * vec2(colW, rowH))));
    vec3 col = panel * light;
    // Module contents by kind: knobs (0), scope (1), spectrum (2), LEDs (3).
    int kind = int(mod(floor(mid * 7.0), 4.0));
    if (cell.y < 0.0 || cell.y > 1.0) kind = 0;
    vec2 local = (cuv - 0.5) * vec2(colW, rowH);                   // local metric coords
    if (kind == 0 || dark > 0.5)
    {
        // Knobs: a grid of 2 x 3 knobs, each turning slowly at its own rate.
        for (int k = 0; k < 6; ++k)
        {
            vec2 kc = vec2(float(k % 2) - 0.5, float(k / 2) - 1.0) * vec2(colW * 0.45, rowH * 0.28);
            vec2 kq = local - kc;
            float kr = length(kq);
            float knobR = 0.032;
            float cap = smoothstep(knobR, knobR - 0.004, kr);
            float rot = clock * (0.3 + 0.5 * hash11(mid * 40.0 + float(k))) + float(k);
            vec2 ptr = vec2(cos(rot), sin(rot));
            float pointer = smoothstep(0.004, 0.001, abs(dot(kq, vec2(-ptr.y, ptr.x)))) * step(0.0, dot(kq, ptr)) * step(kr, knobR * 0.9);
            vec3 knobCol = mix(vec3(0.1, 0.1, 0.12), vec3(0.85, 0.85, 0.8) * light, 0.5 + 0.5 * sin(kr * 200.0)) * 0.5 + vec3(0.05);
            knobCol = mix(knobCol, vec3(0.95), pointer);
            col = mix(col, knobCol, cap);
            col = mix(col, vec3(0.3), smoothstep(0.004, 0.0, abs(kr - knobR - 0.006)));
        }
    }
    else if (kind == 1)
    {
        // Oscilloscope: a dark screen with the waveform, phosphor green.
        vec2 sq = local / vec2(colW * 0.8, rowH * 0.6);
        float screen = step(abs(sq.x), 0.5) * step(abs(sq.y), 0.5);
        vec3 scr = vec3(0.02, 0.05, 0.03);
        float wi = clamp(sq.x + 0.5, 0.0, 1.0) * 63.0;
        int i0 = int(floor(wi)); int i1 = min(i0 + 1, 63);
        float w = mix(audioWave[i0], audioWave[i1], fract(wi)) * 0.4;
        float trace = smoothstep(0.03, 0.005, abs(sq.y - w));
        scr += vec3(0.2, 1.0, 0.4) * trace * 1.5;
        scr += vec3(0.1, 0.4, 0.2) * pow(0.5 + 0.5 * cos(sq.x * 40.0), 40.0) * 0.3;
        col = mix(col, scr, screen);
        col = mix(col, vec3(0.05), smoothstep(0.006, 0.0, abs(max(abs(sq.x), abs(sq.y)) - 0.5)) * (1.0 - screen));
    }
    else if (kind == 2)
    {
        // Spectrum module: 32 LED bars.
        vec2 sq = local / vec2(colW * 0.8, rowH * 0.6);
        float screen = step(abs(sq.x), 0.5) * step(abs(sq.y), 0.5);
        float bx = (sq.x + 0.5) * 32.0;
        int band = int(clamp(bx, 0.0, 31.0));
        float en = clamp(audioSpectrum[band] * 1.5, 0.0, 1.0);
        float lev = sq.y + 0.5;
        float lit = smoothstep(0.02, 0.0, lev - en) * step(0.1, fract(bx)) * step(0.15, fract(lev * 12.0));
        vec3 barCol = mix(vec3(0.2, 0.9, 0.3), vec3(1.0, 0.3, 0.2), lev);
        col = mix(col, vec3(0.03) + barCol * lit * 1.5, screen);
    }
    else
    {
        // LED module: twelve LEDs lit by the chroma classes, a trigger LED on the kick.
        for (int c = 0; c < 12; ++c)
        {
            vec2 lc = vec2(float(c % 3) - 1.0, float(c / 3) - 1.5) * vec2(colW * 0.28, rowH * 0.18);
            float d = length(local - lc);
            float e = clamp(audioChroma[c] * 1.5, 0.0, 1.0);
            vec3 lcol = imgPalette(hue * 0.159 + float(c) / 12.0) * 1.4 + 0.2;
            col = mix(col, vec3(0.08), smoothstep(0.014, 0.011, d));
            col += lcol * e * (smoothstep(0.012, 0.004, d) * 1.5 + exp(-d * 60.0) * 0.6);
        }
        vec2 trig = local - vec2(0.0, rowH * 0.42);
        col = mix(col, vec3(0.08), smoothstep(0.016, 0.013, length(trig)));
        col += vec3(1.0, 0.25, 0.15) * (smoothstep(0.014, 0.004, length(trig)) * 1.5 + exp(-length(trig) * 50.0) * 0.8) * audioKick;
    }
    // Rails between the rows.
    col = mix(col, vec3(0.55, 0.55, 0.58) * light, smoothstep(0.012, 0.006, fract((p.y + 0.5) / rowH) * rowH) * 0.8);
    // Patch cables: catenaries between jack positions (fixed per activation), lit by the band they carry.
    for (int i = 0; i < 12; ++i)
    {
        if (float(i) >= cables) break;
        float fi = float(i);
        vec2 a = vec2((hash11(fi * 3.1 + 7.0) - 0.5) * aspect * 0.95, (hash11(fi * 5.3 + 1.0) - 0.5) * 0.9);
        vec2 b = vec2((hash11(fi * 7.7 + 2.0) - 0.5) * aspect * 0.95, (hash11(fi * 9.1 + 3.0) - 0.5) * 0.9);
        float sag = 0.08 + 0.12 * hash11(fi * 2.9);
        float t;
        float d = cableDist(p, a, b, sag, t);
        int band = int(mod(fi * 2.7, 32.0));
        float en = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
        vec3 cc = imgPalette(hue * 0.159 + fi * 0.083) * 1.3 + 0.15;
        float wire = smoothstep(0.009, 0.006, d);
        col = mix(col, cc * (0.35 + 0.9 * en) * light, wire);
        // A pulse travelling along the cable on the clock, brighter with the band.
        float pulse = pow(0.5 + 0.5 * cos((t - clock * 1.5 - fi) * 12.566), 20.0);
        col += cc * wire * pulse * en * 1.2;
        // Jacks at the ends.
        col = mix(col, vec3(0.15), smoothstep(0.018, 0.014, min(length(p - a), length(p - b))));
        col = mix(col, cc * 0.8, smoothstep(0.011, 0.008, min(length(p - a), length(p - b))));
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
