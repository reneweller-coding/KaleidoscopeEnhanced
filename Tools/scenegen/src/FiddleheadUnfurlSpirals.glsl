//@doc
 * @brief FIDDLEHEAD UNFURL SPIRALS: fern fronds unfurling: spirals that open, hundreds side by side, each in another phase; the photo colours the fronds.  Every cell holds a spiral whose arm is drawn up to a length that breathes between a tight crozier and an open, only slightly curled frond; the phases run
 * through the field as a wave, and the cycle is tied to the phrase.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the unfurling: the length of the arm over the phrase (periodic)
 *   audioAdvance   -> the phases run through the field (integrated)
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioAdvance audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.16 + 0.12 * clamp(sizeP, 0.0, 1.0);
    vec2 q = p / S;
    vec2 ci = floor(q + 0.5);
    vec2 gv = q - ci;
    float r = length(gv);
    float th = atan(gv.y, gv.x);
    float hnd = mod(ci.x + ci.y, 2.0) < 0.5 ? 1.0 : -1.0;
    float ph = 6.2831853 * audioPhrasePos + 0.6 * ci.x + 0.4 * ci.y + 0.02 * audioAdvance;
    float open = 0.5 - 0.5 * cos(ph);
    float turns = 3.2 - 1.9 * open;
    float c = 0.5 / (turns * 6.2831853);
    float thv = hnd * th;
    float nn = floor((r / c - thv) / 6.2831853 + 0.5);
    float arc = thv + 6.2831853 * nn;
    float d = abs(r - c * arc);
    float len = turns * 6.2831853;
    float inside = step(0.0, arc) * step(arc, len);
    float wd = 0.035 * (1.0 - 0.6 * arc / len) + 0.01;
    float arm = (1.0 - smoothstep(wd * 0.6, wd, d)) * inside;
    vec3 col0 = imgLod(p * 0.85 + 0.5, 0.8);
    vec3 col1 = imgLod((ci * S) * 0.85 + 0.5, 1.5);
    col1 = mix(vec3(luma(col1)), col1, 1.4);
    vec3 bg = col0 * 0.22;
    float tip = 1.0 - smoothstep(0.0, 0.06, length(gv - c * len * vec2(cos(hnd * len), sin(hnd * len)) * vec2(1.0, 1.0)));
    vec3 col = mix(bg, col1 * (0.8 + 0.5 * (1.0 - arc / max(len, 1e-3))) * 1.25, arm);
    finish(col);
}
