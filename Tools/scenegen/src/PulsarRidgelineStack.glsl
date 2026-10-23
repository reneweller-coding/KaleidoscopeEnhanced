//@doc
 * @brief PULSAR RIDGELINE STACK: the famous pulsar profile picture: hundreds of pulse profiles in rows on top of each other, each a soft mountain that hides the one behind it; the photo sets the height of every row, and the phase of every row glides.  Sixty rows are drawn from the back to the front; each fills
 * itself with black below its ridge and shows a bright line along the ridge, so the front rows hide the rear ones.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the phases of the rows glide (integrated)
 *   audioSwell   -> the height of the ridges
 *
 * Knobs: sizeP (the number of rows), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float N = 40.0 + 40.0 * clamp(sizeP, 0.0, 1.0);
    float amp = 0.07 + 0.09 * clamp(audioSwell, 0.0, 1.0);
    float xn = p.x / asp * 0.9 + 0.5;
    vec3 col = vec3(0.02);
    float lw = 0.0025;
    for (int i = 0; i < 80; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float yb = 0.46 - 0.84 * fi / N;
        float ph = 0.05 * sin(0.03 * audioAdvance * (0.5 + 0.1 * fi) + 0.5 * fi + 0.04 * sceneTime);
        vec3 c = imgLod(vec2(xn + ph, 0.15 + 0.7 * fi / N), 2.0);
        float prof = pow(luma(c), 1.5);
        float H = yb + amp * prof;
        if (p.y < H) col = vec3(0.015, 0.015, 0.02);
        float d = abs(p.y - H);
        float ln = 1.0 - smoothstep(lw * 0.5, lw * 1.6, d);
        if (ln > 0.0) col = mix(col, mix(vec3(1.0), mix(vec3(luma(c)), c, 1.4), 0.5) * (0.7 + 0.7 * prof), ln);
    }
    finish(col * 1.1);
}
