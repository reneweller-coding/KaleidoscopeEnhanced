//@doc
 * @brief TAYLOR CONE JET FIELD: Taylor cones: an electric field pulls liquid into cones with jets at the tip; the photo colours the cones, and the jets sway in a field of points.  Every cell holds a cone from a broad base to a tip, a thin jet leaves the tip and sways in a wave, and the jets' length grows
 * with the field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the field strength: the cones grow taller and the jets longer
 *   audioAdvance -> the jets sway (integrated)
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.18 + 0.12 * clamp(sizeP, 0.0, 1.0);
    vec2 g = vec2(p.x, p.y + 0.5) / S;
    vec2 gi = floor(g);
    vec2 f = fract(g);
    float h = hash21(gi);
    float fld = 0.45 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float H = (0.45 + 0.2 * h) * fld;
    float x = f.x - 0.5;
    float y = f.y;
    float cone = (1.0 - smoothstep(0.0, 0.03, abs(x) - 0.38 * pow(clamp(1.0 - y / H, 0.0, 1.0), 1.4))) * step(0.0, y) * step(y, H);
    float tip = H;
    float jlen = 0.45 * fld;
    float sway = 0.07 * sin(9.0 * (y - tip) - 0.1 * audioAdvance * 3.0 - 2.0 * sceneTime + 6.28 * h) * (y - tip) * 3.0;
    float jet = (1.0 - smoothstep(0.0, 0.012, abs(x - sway) - 0.01)) * step(tip, y) * step(y, tip + jlen) * (1.0 - smoothstep(tip + jlen * 0.8, tip + jlen, y));
    vec3 c = imgLod((vec2(gi.x + 0.5, gi.y + 0.5) * S - vec2(0.0, 0.5)) * 0.85 + 0.5, 1.3);
    c = mix(vec3(luma(c)), c, 1.4);
    vec3 pc = imgLod(p * 0.85 + 0.5, 0.8);
    float shade = 0.6 + 0.6 * sqrt(max(1.0 - pow(x / max(0.38 * (1.0 - y / H), 0.04), 2.0), 0.0));
    vec3 col = pc * 0.3;
    col = mix(col, c * shade * 1.3, cone);
    col = mix(col, vec3(1.0, 0.95, 0.85) * (0.6 + 0.6 * luma(c)), jet);
    finish(col);
}
