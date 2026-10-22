//@doc
 * @brief TWIST FOLD ROSETTE: a tessellation of origami twist folds in backlit paper: in every cell a hexagon twisted in
 * its middle, six pleats reaching out from its corners, the light shining through the layers -- bright where the paper
 * is single, darker where the folds stack it two and three deep -- and over each phrase the folds twist tighter and
 * open again.  The layer count at a place is one for the sheet, two more inside the twisted hexagon and one more inside
 * each pleat (a strip leaving a corner, turned by the twist); the light through it falls off with each layer, and the
 * creases catch a thin line.  The paper takes its colour from the photo, calmed into one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the folds twist tighter over each phrase and open again
 *   audioSwell     -> the light behind the paper
 *   audioAdvance   -> the light wanders slowly (integrated)
 *
 * Knobs: cellP (the cells' size), pleatP (the pleats' width), hueP.
//@params cellP pleatP
//@audio audioPhrasePos audioSwell
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.3 + 0.14 * clamp(cellP, 0.0, 1.0);
    float pw = 0.05 + 0.04 * clamp(pleatP, 0.0, 1.0);
    float open = 0.5 - 0.5 * cos(6.2831853 * clamp(audioPhrasePos, 0.0, 1.0));
    float tw = 0.12 + 0.5 * open;                                    // the twist
    float run = 0.02 * sceneTime + 0.08 * audioAdvance;
    vec2 g = p / S;
    const vec2 Rh = vec2(1.0, 1.7320508);
    vec2 qa = mod(g, Rh) - 0.5 * Rh, qb = mod(g - 0.5 * Rh, Rh) - 0.5 * Rh;
    vec2 q = dot(qa, qa) < dot(qb, qb) ? qa : qb;
    // the twisted hexagon in the middle
    const float rc = 0.17;
    vec2 qt = rot2(tw) * q;
    float hx = 0.0;
    for (int k = 0; k < 3; ++k) {
        float ak = 1.0471976 * float(k);
        hx = max(hx, abs(dot(qt, vec2(cos(ak), sin(ak)))));
    }
    float layers = 1.0 + 2.0 * smoothstep(rc + 0.004, rc - 0.004, hx);
    float crease = exp(-pow((hx - rc) / 0.004, 2.0));
    // the six pleats: strips leaving the hexagon's corners, turned by the twist
    for (int k = 0; k < 6; ++k) {
        float ak = 1.0471976 * float(k) + 0.5235988 - tw;
        vec2 v = rc / 0.8660254 * vec2(cos(ak), sin(ak));          // the corner
        vec2 dir = vec2(cos(ak + tw), sin(ak + tw));
        vec2 rel = q - v;
        float along = dot(rel, dir), across = dot(rel, vec2(-dir.y, dir.x));
        float inS = smoothstep(pw + 0.004, pw - 0.004, abs(across - 0.5 * pw)) * smoothstep(-0.004, 0.004, along);
        layers += inS;
        crease += exp(-pow((abs(across - 0.5 * pw) - pw) / 0.003, 2.0)) * smoothstep(0.0, 0.01, along);
    }
    vec2 Lp = vec2(0.5 * sin(run), 0.3 * cos(0.7 * run));
    float light = (0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0)) * (0.7 + 0.5 * exp(-dot(p - Lp, p - Lp) / 0.4));
    vec3 paper = mix(vec3(1.0, 0.95, 0.88), tone(imgLod(p * 0.5 + 0.5, 4.0), fh), 0.45);
    vec3 col = paper * light * exp(-0.55 * (layers - 1.0)) * 0.85;
    col *= 1.0 - 0.35 * clamp(crease, 0.0, 1.0);
    finish(col);
}
