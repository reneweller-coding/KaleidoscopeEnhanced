//@doc
 * @brief MIURA FOLD FIELD: an endless sheet folded in the Miura-ori pattern -- zigzag mountain and valley creases that
 * let the whole sheet fold and unfold in one motion, the parallelogram facets tilting together.  The photo is the
 * paper; each facet catches the light at its own angle, so the folding shows as a herringbone of light and shade
 * that deepens and flattens, and as the sheet folds it draws together, the photo on it shrinking with it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the sheet folds and unfolds (integrated), and the light turns
 *   audioSwell      -> how steeply the facets tilt: loud passages deepen light and shade
 *   audioHarmAdvance -> each change of harmony changes the zigzag's angle (gliding)
 *   audioKick       -> the creases flash (light)
 *
 * Knobs: cellP (the facets' size), zigP (the base zigzag), paperP (how much the light shades the paper), hueP.
//@params cellP zigP paperP
//@audio audioSwell audioKick audioHarmAdvance
//@body
/**  The folded sheet's height: a triangle wave across the zigzag creases.
 *
 * @param x  The point on the sheet. (in)
 *
 * @return
 *   The height.
 **/
float fold(vec2 x, float state)
{
    float a = 0.12 + 0.08 * clamp(cellP, 0.0, 1.0);
    float b = a * 1.3;
    float h = max(audioHarmAdvance, 0.0);
    float zig = (0.3 + 0.5 * clamp(zigP, 0.0, 1.0)) * (0.8 + 0.4 * abs(fract(h / 4.0) * 2.0 - 1.0));
    float v = x.y / b;
    float tri = abs(fract(v) * 2.0 - 1.0);                     // 0..1..0 across a row of facets
    float u = x.x / a - zig * tri;
    float amp = (0.25 + 0.9 * state) * (0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0)) * a;
    return amp * abs(fract(u) * 2.0 - 1.0);
}

void main()
{
    vec2 p = screenP();
    // the fold state: the sheet folds and unfolds on an integrated clock; folded, the sheet draws together
    float state = 0.5 + 0.5 * sin(0.11 * sceneTime + 0.02 * audioPhase);
    vec2 x = p * (1.0 + 0.35 * state);
    float e = 0.001;
    float h = fold(x, state);
    vec2 g = vec2(fold(x + vec2(e, 0.0), state) - h, fold(x + vec2(0.0, e), state) - h) / e;
    vec3 n = normalize(vec3(-g, 0.7));
    float la = 0.2 * audioPhase + 0.05 * sceneTime;
    vec3 l = normalize(vec3(cos(la), sin(la), 0.6));
    float diff = max(dot(n, l), 0.0);
    vec2 uv = x * 0.55 + 0.5 + g * 0.015;
    vec3 photo = imgLod(uv, 0.4);
    float shade = mix(1.0, 0.25 + 1.15 * diff, 0.45 + 0.45 * clamp(paperP, 0.0, 1.0));
    vec3 col = photo * shade;
    // the creases: where the slope flips
    float crease = clamp(length(vec2(dFdx(g.x), dFdy(g.y))) * 0.02, 0.0, 1.0);
    vec3 tone = imgPalette(0.4 + 0.03 * audioPhase);
    col += mix(tone, vec3(1.0), 0.6) * crease * 0.3 * (0.4 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
