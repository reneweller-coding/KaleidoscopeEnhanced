//@doc
 * @brief STREAMGRAPH LAYERS FLOW: a streamgraph: the photo is cut into layers by colour class, and they flow as surging bands from left to right in the width of the respective amount of colour, in a snake of waves.  Each layer takes the photo's colours where it flows, and the stack
 * is centred, so the whole picture rises and falls like one body.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the surging runs on (integrated)
 *   audioSwell   -> the depth of the waves
 *
 * Knobs: sizeP (the number of layers), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float xn = p.x / asp + 0.5;
    float n = 5.0 + 3.0 * clamp(sizeP, 0.0, 1.0);
    float t = 0.03 * audioAdvance + 0.03 * sceneTime;
    float dep = 0.3 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    float w[8];
    float tot = 0.0;
    for (int k = 0; k < 8; ++k) {
        float fk = float(k);
        float v = 0.5 + 0.5 * sin(6.0 * xn + 2.1 * fk + 7.0 * t);
        v *= 0.55 + 0.45 * sin(3.0 * xn - 1.3 * fk - 4.0 * t + 1.0);
        float l = luma(imgLod(vec2(xn, (fk + 0.5) / 8.0) * 0.85 + 0.075, 2.5));
        w[k] = (fk < n ? 1.0 : 0.0) * (0.25 + dep * v + 0.5 * l);
        tot += w[k];
    }
    float scale = 0.8 / max(tot, 1e-3);
    float yb = -0.4 * (1.0 + 0.0 * dep) + 0.0;
    float cum = -0.5 * tot * scale + 0.06 * sin(3.0 * xn + 5.0 * t);
    vec3 col = imgLod(p * 0.85 + 0.5, 2.5) * 0.12;
    for (int k = 0; k < 8; ++k) {
        float y0 = cum;
        float y1 = cum + w[k] * scale;
        cum = y1;
        float dm = (p.y - 0.5 * (y0 + y1)) / max(0.5 * (y1 - y0), 1e-3);
        float al = (1.0 - smoothstep(0.92, 1.0, abs(dm))) * step(0.001, w[k]);
        vec3 c = imgLod(p * 0.85 + 0.5, 1.0);
        float fk = float(k);
        c = mix(c, c.gbr, 0.15 * mod(fk, 3.0));
        c *= 0.75 + 0.35 * sqrt(max(1.0 - dm * dm, 0.0));
        col = mix(col, c * 1.15, al);
    }
    finish(col);
}
