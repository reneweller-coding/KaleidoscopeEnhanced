//@doc
 * @brief SIERPINSKI CARPET BREATHE: the Sierpinski carpet -- a square cut into nine, the middle one removed, again and
 * again in the eight that remain -- but every hole holds a carpet of its own, with holes of its own, and so on down,
 * the nested carpets light and dark by turns.  The view sinks steadily into the middle hole, whose carpet grows until
 * it fills the frame and its own middle hole opens ahead, so the flight never stops and never jumps.  The smaller
 * holes breathe, each a little out of step with the others; every carpet is the photo, turned its own way.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> how many levels of holes are cut (fractional: the finest level opens)
 *   audioPhrasePos  -> the holes' breathing over a phrase (continuous)
 *   audioPhase      -> the flight into the carpet (integrated)
 *   audioKick       -> the hole rims flash (light)
 *
 * Knobs: depthP (the base depth), breathP (how far the holes breathe), photoP (photo share), hueP.
//@params depthP breathP photoP
//@audio audioSwell audioKick audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    float prog = audioPhrasePos > 0.001 ? audioPhrasePos : fract(sceneTime / 16.0);
    // the flight: each carpet's middle hole (fixed, not breathing) holds the next carpet, brc / 3 of its size; the
    // view grows by 3 / brc per generation, wrapped -- the same picture one generation on
    float brc = 0.8;
    float z = 0.05 * sceneTime + 0.007 * audioPhase;
    float fz = fract(z);
    float side = 2.2 * pow(3.0 / brc, fz) * 3.0 / brc;          // the carpet one generation up, on screen
    float levels = 3.0 + 2.0 * clamp(depthP, 0.0, 1.0) + 1.0 * clamp(audioSwell, 0.0, 1.0);
    vec2 l = p / side + 0.5;
    float logS = log(side) / log(3.0);                          // the current square's side on screen, a power of three
    float gen = floor(z) - 1.0, seed = 0.0, depth = 0.0;
    vec2 path = vec2(0.0), holeUV = l;
    float rimD = 1e9, inset = 1.0;
    for (int i = 0; i < 14; ++i) {
        float logCell = logS - 1.0;
        float fade = clamp(logCell + levels - 0.63, 0.0, 1.0);  // by the hole's size on screen: the finest opens
        if (fade <= 0.0) break;
        vec2 cell = floor(l * 3.0), fr = fract(l * 3.0);
        path = path * 3.0 + cell;
        if (cell.x == 1.0 && cell.y == 1.0) {
            bool mainHole = depth < 0.5;                        // a carpet's own middle hole: the flight's path
            float br = mainHole ? brc
                     : min(0.8 + (0.06 + 0.14 * clamp(breathP, 0.0, 1.0)) * sin(6.2831853 * (prog + hash21(path + seed))), 0.98);
            vec2 d = abs(fr - 0.5);
            float m = max(d.x, d.y), hs = 0.5 * br * fade;
            float cellOn = pow(3.0, logCell);                   // the middle cell's side on screen
            rimD = min(rimD, abs(m - hs) * cellOn);
            if (m >= hs) break;                                 // the solid ring round the hole
            // into the hole: a carpet of its own, filling it (the middle holes keep the seed: the wrap is unseen)
            gen += 1.0;
            if (!mainHole) seed = floor(hash21(path + seed + 0.5) * 997.0);
            l = (fr - 0.5) / (2.0 * hs) + 0.5;
            logS = logCell + log(2.0 * hs) / log(3.0);
            path = vec2(0.0);
            depth = 0.0;
            holeUV = l;
            inset = (hs - m) * cellOn;
            continue;
        }
        l = fr;
        logS = logCell;
        depth += 1.0;
    }
    float odd = mod(gen, 2.0) > 0.5 ? 1.0 : 0.0;
    vec3 tone = imgPalette(0.3 + 0.35 * odd + 0.03 * audioPhase);
    float hh = hash11(seed * 0.013 + 0.37);
    vec2 uv = rot2(6.2831853 * hh) * (holeUV - 0.5) * 0.7 + 0.5;
    vec3 inner = imgLod(uv, 0.4);
    vec3 col = mix(inner * tone * 1.6, inner, 0.4 + 0.5 * clamp(photoP, 0.0, 1.0)) * (odd > 0.5 ? 1.15 : 0.5);
    col *= 0.55 + 0.45 * smoothstep(0.0, 0.04, inset);         // a soft shadow under the hole's rim
    float rim = 1.0 - smoothstep(0.0, 0.006, rimD);
    col += mix(tone, vec3(1.0), 0.6) * rim * 0.35 * (0.4 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
