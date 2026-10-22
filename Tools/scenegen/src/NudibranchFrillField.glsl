//@doc
 * @brief NUDIBRANCH FRILL FIELD: a field of coloured frills like the mantle of a sea slug, row behind row, each a
 * ruffled sheet with a glowing hem, the hems waving softly while finer ruffles run along them.  A frill is the sheet
 * hanging below a curve: the curve is a slow wave plus a fine ruffle whose depth varies along it; the sheet darkens
 * toward its root, so each row stands out before the one behind it; rows are drawn back to front.  The frills are
 * shades of one colour family from the photo, the hems lifted toward warm white.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass    -> the frills' waving: the hems swing wider with the bass (softened by the swell)
 *   audioAdvance -> the waves and the ruffles run (integrated)
 *   audioSwell   -> the hems' glow
 *
 * Knobs: frillP (the rows' spacing), ruffleP (how deep the fine ruffles are), hueP.
//@params frillP ruffleP
//@audio audioBass audioSwell
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
    float D = 0.09 + 0.06 * clamp(frillP, 0.0, 1.0);
    float ruf = 0.006 + 0.01 * clamp(ruffleP, 0.0, 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float amp = 0.012 + 0.03 * mix(sw, clamp(audioBass, 0.0, 1.0), 0.5);
    float run = 0.15 * sceneTime + 0.6 * audioAdvance;
    vec3 col = famCol(fh, 0.45) * 0.02;
    float j0 = floor(p.y / D);
    for (int k = 3; k >= -1; --k) {                                  // back (above) to front (below)
        float j = j0 + float(k);
        float hj = fract(sin(j * 12.9898) * 43758.5453);
        float x = p.x + 0.3 * hj;
        float hem = j * D + amp * sin(5.0 * x + run * (0.8 + 0.4 * hj) + 6.0 * hj)
                  + ruf * sin(48.0 * x - 2.0 * run + 3.0 * hj) * (0.6 + 0.4 * sin(3.0 * x + 0.5 * run + hj));
        float below = hem - p.y;                                      // how far below the hem
        if (below < -0.004 || below > 1.6 * D) continue;
        float sheet = smoothstep(-0.004, 0.002, below);
        vec3 fc = mix(famCol(fh, hj), tone(imgLod(vec2(x, j * D) * 0.5 + 0.5, 3.0), fh), 0.35);
        vec3 frill = fc * (0.15 + 0.7 * exp(-below / (0.6 * D)));
        frill += famLight(fh, hj, 0.6) * exp(-pow(below / 0.004, 2.0)) * (0.6 + 0.6 * sw);
        col = mix(col, frill, sheet);
    }
    finish(col);
}
