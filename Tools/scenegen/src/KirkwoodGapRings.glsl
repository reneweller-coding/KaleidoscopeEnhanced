//@doc
 * @brief KIRKWOOD GAP RINGS: Kirkwood gaps: orbital resonances with Jupiter empty bands in the asteroid belt; the picture shows concentric rings of photo in which gaps stand at the simple ratios.  Rings of dust dots, density following the photo, turn at Kepler speeds (the inner ones faster); the gaps lie where the
 * orbit is in 3:1, 5:2, 7:3 and 2:1 with the planet that circles at the edge.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the gaps wander slightly with the ratios of the key (integrated)
 *   audioAdvance     -> the rings turn at Kepler speeds (integrated)
 *
 * Knobs: sizeP (the width of the gaps), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p) + 1e-4;
    float a = atan(p.y, p.x);
    float aj = 0.6;
    float rj = 0.5;
    float w = 0.012 + 0.02 * clamp(sizeP, 0.0, 1.0);
    float wob = 1.0 + 0.015 * sin(0.04 * audioHarmAdvance + 0.02 * sceneTime);
    float gap = 0.0;
    float rat[5];
    rat[0] = 0.4807; rat[1] = 0.5428; rat[2] = 0.6266; rat[3] = 0.6300; rat[4] = 0.7937;
    float rr[4];
    for (int k = 0; k < 4; ++k) {
        float kk = k == 0 ? 0.4807 : (k == 1 ? 0.5848 : (k == 2 ? 0.6933 : 0.6300));
        float rk = rj * kk * 0.0 + 0.5 * (0.18 + 0.2 * float(k)) * wob;
        gap += exp(-pow((r - rk * (1.0 + 0.0)) / w, 2.0));
    }
    float wk = 0.03 * audioAdvance + 0.04 * sceneTime;
    float om = wk / pow(r + 0.1, 1.5);
    float aa = a + om * 3.0;
    float cellR = floor(r / 0.008);
    float cellA = floor(aa / 6.2831853 * (r * 900.0));
    float h = hash21(vec2(cellA, cellR));
    float cx = (cellA + 0.5) / (r * 900.0) * 6.2831853 - om * 3.0;
    vec2 pc = (cellR + 0.5) * 0.008 * vec2(cos(cx), sin(cx));
    vec3 c = imgLod(pc * 0.85 + 0.5, 1.0);
    c = mix(vec3(luma(c)), c, 1.4);
    float dens = (1.0 - clamp(gap, 0.0, 1.0)) * (0.35 + 0.65 * luma(c)) * smoothstep(0.1, 0.16, r) * smoothstep(0.55, 0.48, r);
    float dot_ = smoothstep(h - 0.05, h + 0.05, dens * 0.85);
    vec3 col = c * dot_ * 1.6;
    vec2 jp = rj * vec2(cos(aj + 0.01 * audioAdvance), sin(aj + 0.01 * audioAdvance));
    col += vec3(1.0, 0.85, 0.6) * exp(-dot(p - jp, p - jp) / 0.0008);
    col += imgLod(p * 0.85 + 0.5, 3.0) * 0.1;
    finish(col);
}
