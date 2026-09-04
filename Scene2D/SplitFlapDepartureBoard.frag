#version 330 core
out vec4 fragColor;
/**
 * @file SplitFlapDepartureBoard.frag
 * @brief SPLIT FLAP DEPARTURE BOARD: the old mechanical board of an
 * airport hall.  Each character is a stack of hinged flaps; when a cell
 * changes it riffles through the alphabet, the top half falling over the
 * bottom in a smooth rotation, then settles.  Rows change one after
 * another on the scene clock, and a whole column riffles on the kick.
 * The photo shows through the glass as the hall behind.  Camera fixed.
 *
 * Audio Reactivity:
 *   sceneAdvance -> rows update, flaps turn (continuous)
 *   audioKick    -> one column riffles (light -- the flap motion is smooth)
 *   audioChroma[12] -> the colour of the lit rows (light)
 *   audioSwell   -> hall light (slow)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: colsP, rowsP, hueP.
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
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float colsP;
uniform float rowsP;
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

// A glyph: a blocky mark inside the flap, different for every character
// index.  Not a font -- a departure board seen from the hall is mostly
// pattern anyway, and this keeps it continuous under the flap fold.
float glyph(vec2 q, float ch)
{
    q = clamp(q, 0.0, 1.0);
    float m = 0.0;
    for (int k = 0; k < 5; ++k)
    {
        float fk = float(k);
        float h = hash11(ch * 7.3 + fk * 3.1);
        float h2 = hash11(ch * 11.7 + fk * 5.9);
        vec2 c = vec2(0.28 + 0.44 * h, 0.2 + 0.6 * h2);
        vec2 sz = vec2(0.07 + 0.1 * hash11(ch * 3.7 + fk), 0.05 + 0.13 * hash11(ch * 5.1 + fk));
        vec2 d = abs(q - c) - sz;
        m = max(m, smoothstep(0.02, 0.0, max(d.x, d.y)));
    }
    // A baseline stroke so every glyph shares a family look.
    m = max(m, smoothstep(0.03, 0.0, abs(q.y - 0.5) - 0.06) * step(0.22, q.x) * step(q.x, 0.78) * step(0.4, hash11(ch * 2.3)));
    return m;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float cols = 10.0 + floor(clamp(colsP, 0.0, 1.0) * 8.0);            // once per activation
    float rows = 6.0 + floor(clamp(rowsP, 0.0, 1.0) * 5.0);
    float light = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.5 + sceneTime * 0.1;

    // The hall behind the board: the photo, dim, seen past the frame.
    vec3 col = img(uv) * mix(vec3(0.2), imgPalette(hue * 0.159 + 0.6) * 0.4, 0.5) * light * 0.5;
    // The board panel.
    vec2 board = vec2(aspect * 0.46, 0.42);
    float onBoard = step(abs(p.x), board.x) * step(abs(p.y), board.y);
    vec3 caseCol = mix(vec3(0.1, 0.1, 0.11), imgPalette(hue * 0.159 + 0.05) * 0.2, 0.4);
    col = mix(col, caseCol * light, onBoard);
    // Cell lattice.
    vec2 cell = vec2(2.0 * board.x / cols, 2.0 * board.y / rows);
    vec2 g = (p + board) / cell;
    vec2 ci = floor(g);
    vec2 cf = fract(g);
    if (onBoard > 0.5 && ci.x >= 0.0 && ci.y >= 0.0 && ci.x < cols && ci.y < rows)
    {
        float row = ci.y;
        float colIdx = ci.x;
        // Each row updates in its turn, one row at a time, on the clock.
        float rowTurn = clock * 0.25 + row * 0.37;
        float phase = fract(rowTurn);
        // A riffle: it runs for the first part of the row's slot, then holds.
        // The number of characters it steps through is fixed per update.
        float upd = floor(rowTurn);
        float steps = 3.0 + floor(hash21(vec2(row, upd)) * 9.0);
        float kickCol = floor(fract(clock * 0.11 + 0.3) * cols);        // the column the kick riffles
        float kickHere = (abs(colIdx - kickCol) < 0.5) ? audioKick : 0.0;
        float riffle = smoothstep(0.45, 0.0, phase) + 0.6 * kickHere;
        // The flap angle: a continuous saw over the steps, so the top half
        // is always mid-fall somewhere and never snaps.
        float t = phase * steps * 3.0 + colIdx * 0.13 + kickHere * 6.0;
        float sub = fract(t);
        float chNow = floor(t) + row * 5.0 + colIdx * 3.0;
        float fold = riffle * (1.0 - smoothstep(0.0, 1.0, sub));         // 1 = flat, 0 = fallen
        // Cell background and its lit colour: the row's chroma class.
        int cls = int(mod(row * 2.0 + 1.0, 12.0));
        float e = clamp(audioChroma[cls] * 1.5, 0.0, 1.0);
        vec3 flapCol = mix(vec3(0.07, 0.07, 0.08), imgPalette(hue * 0.159 + float(cls) / 12.0) * 0.5, 0.35 + 0.5 * e);
        vec3 inkCol = mix(vec3(0.88, 0.87, 0.8), imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.4 + 0.3, 0.35 + 0.4 * e);
        // Two halves.  The top half of the NEXT character is falling over
        // the top half of the current one; the bottom half is already the
        // next character once the fold passes the middle.
        vec2 q = vec2(cf.x, cf.y);
        float topHalf = step(0.5, q.y);
        vec2 gq = vec2((q.x - 0.12) / 0.76, (q.y - 0.1) / 0.8);
        float chTop = mix(chNow + 1.0, chNow, fold);
        float chBot = chNow;
        // The falling leaf: compress the top half vertically as it turns.
        vec2 gqTop = gq;
        gqTop.y = 0.5 + (gq.y - 0.5) / max(fold * 0.95 + 0.05, 0.06);
        float ink = topHalf > 0.5 ? glyph(gqTop, chTop) : glyph(gq, chBot);
        vec3 cellCol = mix(flapCol * light, inkCol * light, ink * 0.95);
        // The split line and the flap shadow just under it.
        cellCol *= 1.0 - 0.55 * smoothstep(0.02, 0.0, abs(q.y - 0.5));
        cellCol *= 1.0 - 0.35 * smoothstep(0.14, 0.0, 0.5 - q.y) * (1.0 - fold) * step(q.y, 0.5);
        // Cell gap.
        float gap = smoothstep(0.03, 0.06, min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y)));
        cellCol = mix(caseCol * light * 0.7, cellCol, gap);
        col = mix(col, cellCol, onBoard);
        // The glass in front: a soft diagonal reflection of the hall.
        col += img(clamp(vec2(uv.x * 0.4 + 0.3, uv.y * 0.4 + 0.4), 0.0, 1.0))
             * smoothstep(0.35, 0.0, abs(p.x * 0.6 + p.y - 0.15)) * 0.06 * light;
    }
    // The board's frame and the mounting rail above it.
    float frame = smoothstep(0.012, 0.0, abs(max(abs(p.x) - board.x, abs(p.y) - board.y)));
    col = mix(col, vec3(0.32, 0.33, 0.35) * light, frame);
    float rail = smoothstep(0.014, 0.008, abs(p.y - board.y - 0.06));
    col = mix(col, vec3(0.22, 0.23, 0.25) * light, rail);
    col *= 0.85 + 0.3 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
