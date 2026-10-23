//@doc
 * @brief CHARGE DENSITY WAVE STRIPE PHASE SLIPS: charge density waves: a periodic modulation that arranges itself in dislocations and phase slips at impurities; the picture shows the photo modulated by stripes whose phase jumps at the impurities and then glides again.  Six wandering dislocations each add a winding of the
 * phase; the stripes fork there, and the photo is lit and shaded by the stripes.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the wave number of the stripes (smoothed)
 *   audioAdvance -> the stripes glide and the dislocations wander (integrated)
 *
 * Knobs: sizeP (the number of dislocations), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float k = 18.0 + 18.0 * clamp(audioSpread, 0.0, 1.0);
    float t = 0.02 * audioAdvance + 0.03 * sceneTime;
    float ph = k * (p.x * 0.9 + p.y * 0.4) - 6.2831853 * t * 1.5;
    float nd = 3.0 + 3.0 * clamp(sizeP, 0.0, 1.0);
    for (int j = 0; j < 6; ++j) {
        float fj = float(j);
        float on = clamp(nd - fj, 0.0, 1.0);
        vec2 h = hash22(vec2(fj, 17.0));
        vec2 c = vec2(0.7 * (h.x - 0.5) * 1.78 + 0.12 * sin(t * (0.5 + h.y) * 3.0 + 6.28 * h.x), 0.4 * (h.y - 0.5) * 2.0 + 0.1 * cos(t * (0.4 + h.x) * 3.0 + 6.28 * h.y));
        float s = (h.x > 0.5 ? 1.0 : -1.0);
        ph += on * s * atan(p.y - c.y, p.x - c.x);
    }
    float st = 0.5 + 0.5 * cos(ph);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.6);
    c = mix(vec3(luma(c)), c, 1.3);
    vec3 col = c * (0.35 + 1.0 * smoothstep(0.1, 0.9, st));
    float sd = (0.5 + 0.5 * cos(ph + 1.5708)) * 0.5;
    col += vec3(0.9, 0.95, 1.0) * pow(st, 8.0) * 0.12;
    finish(col * 1.1);
}
