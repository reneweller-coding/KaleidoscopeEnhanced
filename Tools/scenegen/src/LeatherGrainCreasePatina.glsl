//@doc
 * @brief LEATHER GRAIN CREASE PATINA: leather: a grain of small pits, larger creases and a patina in edges and hollows; the photo colours the leather, and the creases move as if with a breath.  Small cells with a bump profile give the grain, ridged noise gives the creases (which swell and ebb), and the patina is darker in the
 * hollows of the creases and along the cell edges.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the depth of the creases (the breath)
 *   audioAdvance -> the creases wander (integrated)
 *
 * Knobs: sizeP (the grain size), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.018 + 0.02 * clamp(sizeP, 0.0, 1.0);
    float t = 0.01 * audioAdvance + 0.015 * sceneTime;
    float cr = 1.0 - abs(fbm(p * 3.0 + vec2(t, 0.0)) - 0.5) * 2.0;
    float cr2 = 1.0 - abs(fbm(p * 7.0 + vec2(4.0, -t)) - 0.5) * 2.0;
    float crease = pow(cr, 3.0) * 0.8 + pow(cr2, 4.0) * 0.4;
    float breath = 0.5 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    vec2 q = p + 0.02 * breath * vec2(fbm(p * 3.0 + vec2(1.0, t)) - 0.5, fbm(p * 3.0 + vec2(7.0, -t)) - 0.5);
    vec2 g = q / S;
    vec2 gi = floor(g);
    float d1 = 1e3;
    float d2 = 1e3;
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 pt = cj + 0.5 + 0.4 * (h - 0.5) * 2.0;
            float d = length(g - pt);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
    float pit = smoothstep(0.0, 0.25, d2 - d1);
    vec3 c = imgLod(p * 0.85 + 0.5, 1.0);
    c = mix(vec3(luma(c)), c, 1.3);
    vec3 leather = mix(vec3(0.35, 0.2, 0.12), c * 1.1, 0.5);
    float shade = 0.65 + 0.35 * pit - 0.45 * crease * breath;
    float patina = smoothstep(0.3, 0.9, crease) * 0.4 + (1.0 - pit) * 0.25;
    vec3 col = leather * shade * (1.0 - 0.35 * patina);
    float e = 0.004;
    float cx = (1.0 - abs(fbm((p + vec2(e, 0.0)) * 3.0 + vec2(t, 0.0)) - 0.5) * 2.0) - cr;
    col += vec3(1.0, 0.9, 0.8) * max(cx / e * 0.02, 0.0) * 0.3 * breath;
    finish(col * 1.2);
}
