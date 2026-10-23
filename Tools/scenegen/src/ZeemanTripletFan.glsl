//@doc
 * @brief ZEEMAN TRIPLET FAN: the Zeeman effect: spectral lines split in a magnetic field into three or more components; the picture shows a fan spectrum of parallel lines that run apart in triplets and come together again, with the photo as colour.  Twelve lines each split into a central line and two satellites whose
 * distance grows with the field, and the field grows along the picture (from top to bottom) and breathes in time.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the field strength (the size of the splitting)
 *   audioAdvance -> the field's profile runs (integrated)
 *
 * Knobs: sizeP (the number of lines), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float N = 8.0 + 8.0 * clamp(sizeP, 0.0, 1.0);
    float B = (0.2 + 0.8 * clamp(audioSwell, 0.0, 1.0)) * (0.55 + 0.45 * sin(1.5 * (p.y + 0.5) * 3.1416 + 0.04 * audioAdvance + 0.05 * sceneTime));
    vec3 col = imgLod(p * 0.85 + 0.5, 2.5) * 0.12;
    float xn = p.x / asp * 0.95;
    for (int i = 0; i < 16; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float x0 = ((fi + 0.5) / N - 0.5) * 0.95;
        float h = hash21(vec2(fi, 3.0));
        float g = 0.5 + 1.0 * h;
        float sp = B * g * 0.5 / N;
        float w = 0.0012 + 0.0015 * h;
        for (int c = -1; c <= 1; ++c) {
            float xc = x0 + float(c) * sp;
            float d = abs(xn - xc);
            float line = 1.0 - smoothstep(w * 0.5, w * 2.0, d);
            float amp = c == 0 ? 1.0 : 0.6;
            vec3 pc = imgLod(vec2(xc / 0.95 * 0.85 * 1.0 * asp * 0.56 + 0.5, p.y * 0.85 + 0.5), 0.8);
            pc = mix(vec3(luma(pc)), pc, 1.4);
            col += (pc * 1.5 + 0.12) * line * amp * (c == 0 ? 1.0 : 0.85) + (pc + 0.2) * exp(-d * d / (w * w * 40.0)) * 0.12 * amp;
        }
    }
    finish(col);
}
