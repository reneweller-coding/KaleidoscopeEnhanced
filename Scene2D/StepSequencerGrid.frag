#version 330 core
out vec4 fragColor;
/**
 * @file StepSequencerGrid.frag
 * @brief STEP SEQUENCER GRID: the front panel of a step sequencer.  Rows
 * are voices, columns are steps, and every cell is a lit pad with the
 * photo showing through its window.  The playhead sweeps the grid on the
 * scene clock -- steadily, so it never snaps -- and a pad brightens when
 * the playhead is over it and its own voice is sounding.  The chroma
 * classes give each row its colour, the spectrum bands the pad glow, and
 * the kick lights the current column.  Camera fixed on the panel.
 *
 * Audio Reactivity:
 *   sceneAdvance      -> the playhead sweeps (continuous)
 *   audioChroma[12]   -> the row colours and which rows are active (light)
 *   audioSpectrum[32] -> the pad glow (light)
 *   audioKick         -> the column under the playhead (light)
 *   audioSwell        -> the panel light (slow)
 *
 * Per-activation variety: stepsP, voicesP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float stepsP;
uniform float voicesP;
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

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float steps = 8.0 + 8.0 * floor(1.0 + clamp(stepsP, 0.0, 1.0));     // 16 or 24 steps
    float voices = 5.0 + floor(clamp(voicesP, 0.0, 1.0) * 4.0);
    float panelLight = 0.65 + 0.55 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.6 + sceneTime * 0.12;

    // The panel: brushed anodised aluminium with the photo as its silkscreen.
    vec3 panel = vec3(0.2, 0.21, 0.23);
    panel = mix(panel, img(uv) * 0.5, 0.25);
    panel *= 0.9 + 0.12 * sin(p.y * 600.0);
    vec3 col = panel * panelLight;

    // The grid.
    float gw = aspect * 0.9, gh = 0.62;
    vec2 g = vec2((p.x + gw * 0.5) / gw * steps, (0.34 - p.y) / gh * voices);
    vec2 gi = floor(g);
    vec2 gf = fract(g);
    float inGrid = step(0.0, gi.x) * step(gi.x, steps - 1.0) * step(0.0, gi.y) * step(gi.y, voices - 1.0);
    // The playhead: a steady sweep, and a soft width so it never flickers.
    float head = fract(clock * 0.12) * steps;
    float atHead = exp(-pow((gi.x + 0.5 - head) * 1.4, 2.0));
    if (inGrid > 0.5)
    {
        int cls = int(mod(gi.y * 2.0 + 1.0, 12.0));
        float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
        int band = int(mod(gi.x + gi.y * 5.0, 32.0));
        float be = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
        vec3 rowCol = imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.4 + 0.15;
        // The step pattern: which pads are switched on, fixed per activation.
        float on = step(0.55 - 0.2 * e, hash21(vec2(gi.x, gi.y * 3.0 + 1.0)));
        // The pad body: a rounded square with the photo in its window.
        vec2 q = gf - 0.5;
        float pad = smoothstep(0.44, 0.4, max(abs(q.x), abs(q.y)));
        vec3 window = img(clamp(vec2(gi.x / steps, gi.y / voices) + q * 0.06 + 0.2, 0.0, 1.0));
        vec3 padCol = mix(vec3(0.13, 0.14, 0.15), window * 0.5, 0.35);
        // Lit: on-pads glow with their band, and the playhead lifts them.
        float lit = on * (0.25 + 0.75 * be) * (0.35 + 1.1 * atHead);
        padCol += rowCol * lit;
        padCol += rowCol * lit * atHead * (0.3 + 1.1 * audioKick) * 0.6;
        // The pad's own bevel and its lens highlight.
        padCol *= 0.7 + 0.5 * smoothstep(0.44, 0.3, max(abs(q.x), abs(q.y)));
        padCol += vec3(1.0) * smoothstep(0.1, 0.0, length(q - vec2(-0.18, 0.18))) * (0.1 + 0.4 * hi) * (0.3 + on * 0.7);
        col = mix(col, padCol * panelLight, pad);
        // The dark seat each pad sits in.
        col = mix(col, panel * 0.45 * panelLight, smoothstep(0.5, 0.44, max(abs(q.x), abs(q.y))) * (1.0 - pad));
    }
    // The playhead bar over the whole column, faint.
    float headX = (head / steps - 0.5) * gw;
    col += vec3(0.8, 0.9, 1.0) * exp(-abs(p.x - headX) * 26.0) * step(abs(p.y - 0.03), 0.34) * (0.12 + 0.4 * audioKick);
    // The transport row along the bottom: buttons and a level meter.
    float ty = -0.4;
    for (int k = 0; k < 4; ++k)
    {
        float fk = float(k);
        vec2 bc = vec2(-aspect * 0.4 + fk * 0.08, ty);
        float b = smoothstep(0.026, 0.022, max(abs(p.x - bc.x), abs(p.y - bc.y)));
        vec3 bCol = vec3(0.28, 0.29, 0.31);
        if (k == 0) bCol = mix(bCol, vec3(0.2, 0.9, 0.35), 0.6);         // run
        if (k == 1) bCol = mix(bCol, vec3(0.9, 0.7, 0.2), 0.4);
        col = mix(col, bCol * panelLight * (0.7 + 0.5 * hi * float(k == 0)), b);
    }
    // The meter: eight segments driven by the level.
    for (int k = 0; k < 8; ++k)
    {
        float fk = float(k);
        vec2 mc = vec2(aspect * 0.42 - fk * 0.035, ty);
        float seg = smoothstep(0.014, 0.01, max(abs(p.x - mc.x) * 1.6, abs(p.y - mc.y)));
        float lit = step(fk / 8.0, clamp(audioLevel * 1.4, 0.0, 1.0));
        vec3 segCol = mix(vec3(0.2, 0.9, 0.3), vec3(1.0, 0.35, 0.2), fk / 7.0);
        col = mix(col, mix(vec3(0.12), segCol, lit) * panelLight, seg);
    }
    // The panel edge and its screws.
    float edge = smoothstep(0.012, 0.0, abs(max(abs(p.x) - aspect * 0.47, abs(p.y) - 0.46)));
    col = mix(col, vec3(0.12, 0.12, 0.14), edge);
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
