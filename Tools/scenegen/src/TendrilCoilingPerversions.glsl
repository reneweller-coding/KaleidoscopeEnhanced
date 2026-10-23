//@doc
 * @brief TENDRIL COILING PERVERSIONS: tendril helices: a plant tendril that winds round a support has a "perversion" in the middle, where the handedness of the helix changes; the picture shows hundreds of tendrils in screw form with such reversals.  Sixteen tendrils, each drawn as two strands (front and back) of
 * a helix whose phase runs up to a reversal point and back down above it; the photo colours the strands.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread      -> the pitch of the helices (the number of turns), smoothed
 *   audioAdvance     -> the place of the reversals wanders (integrated)
 *
 * Knobs: sizeP (the thickness of the strands), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec3 col = imgLod(p * 0.85 + 0.5, 2.0) * 0.2;
    float kk = 12.0 + 12.0 * clamp(audioSpread, 0.0, 1.0);
    float th = 0.006 + 0.01 * clamp(sizeP, 0.0, 1.0);
    for (int k = 0; k < 16; ++k) {
        float fk = float(k);
        vec2 h = hash22(vec2(fk, 3.3));
        float x0 = ((fk + 0.5) / 16.0 - 0.5) * asp * 0.98;
        float yp = 0.35 * sin(0.03 * audioAdvance + 0.015 * sceneTime + 6.2831853 * h.x) + 0.2 * (h.y - 0.5);
        float A = 0.035 + 0.02 * h.y;
        float y = p.y;
        float ph = y < yp ? kk * y : kk * (2.0 * yp - y);
        ph += 6.2831853 * h.x;
        for (int s = 0; s < 2; ++s) {
            float off = s == 0 ? 0.0 : 3.1415927;
            float xs = x0 + A * sin(ph + off);
            float depth = cos(ph + off);
            float d = abs(p.x - xs);
            float w = th * (0.7 + 0.5 * depth);
            float al = 1.0 - smoothstep(w * 0.6, w, d);
            vec3 c = imgLod(vec2(xs * 0.85 / asp * 1.0 + 0.5 + 0.0, y * 0.85 + 0.5), 0.8);
            c = mix(vec3(luma(c)), c, 1.4);
            col = mix(col, c * (0.55 + 0.6 * (0.5 + 0.5 * depth)) * 1.3, al * (0.55 + 0.45 * (0.5 + 0.5 * depth)));
        }
        float pv = exp(-pow((p.y - yp) / 0.012, 2.0)) * (1.0 - smoothstep(0.0, A * 1.5, abs(p.x - x0)));
        col += vec3(1.0, 0.9, 0.6) * pv * 0.25;
    }
    finish(col);
}
