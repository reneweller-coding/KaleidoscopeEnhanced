//@doc
 * @brief AURELIA CANAL MANDALA: the canal network of a moon jelly drawn as a glowing mandala and repeated over the
 * picture: eight straight canals run out from the centre, branched canals fork between them, a ring canal closes them
 * at the rim, and four horseshoe-shaped gonads glow round the middle; the bell pulses with the music and the canals
 * branch further as the chords move.  The mandala is folded into a mirrored eighth; each level of branches leaves its
 * parent at its own radius and parts from it smoothly; a level's weight fades in with the harmony, so new forks grow
 * out of the old ones.  The canals are shades of one colour family from the photo, the gonads a warmer shade of it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the bell pulses (integrated: with the music's drive) and the mandalas turn slowly
 *   audioHarmAdvance -> how far the canals branch (gliding with the chords)
 *   audioSwell       -> the canals' glow
 *
 * Knobs: sizeP (the mandalas' size), fringeP (how dense the rim's fringe is), hueP.
//@params sizeP fringeP
//@audio audioHarmAdvance audioSwell
//@body
/**  A canal's light at a place: a thin line along the angle phi(r) of the canal.
 *
 * @param phi  The place's angle in the folded eighth. (in)
 * @param pc   The canal's angle there. (in)
 * @param rs   The place's radius on screen. (in)
 *
 * @return
 *   The light, 0..1.
 **/
float canal(float phi, float pc, float rs)
{
    return exp(-pow((phi - pc) * rs / 0.004, 2.0));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float lv = 1.0 + 2.0 * (0.5 + 0.5 * sin(0.6 * h));             // branch levels, 1..3, gliding
    float beat = 0.25 * sceneTime + 1.0 * audioAdvance;
    float pulse = 0.5 - 0.5 * cos(3.14159265 * beat);
    float turn = 0.01 * sceneTime + 0.04 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float sz = 0.52 + 0.12 * clamp(sizeP, 0.0, 1.0);
    float fr = floor(60.0 + 60.0 * clamp(fringeP, 0.0, 1.0));
    // the mandalas on a lattice, one in the middle
    vec2 L = vec2(2.3, 2.1) * sz;
    vec2 q = p - L * floor(p / L + 0.5);
    q = rot2(turn) * q;
    float R = sz * (1.0 - 0.06 * pulse);
    float rs = length(q), r = rs / R, a = atan(q.y, q.x);
    const float SEC = 0.7853982;
    float phi = abs(mod(a, SEC) - 0.5 * SEC);                         // the mirrored eighth: 0 on a straight canal
    float in1 = smoothstep(1.02, 0.98, r);
    float c = canal(phi, 0.0, rs) * smoothstep(0.08, 0.15, r);
    // the forks: each level leaves its parent at its own radius and parts from it smoothly
    float half8 = 0.5 * SEC;
    float b1 = smoothstep(0.38, 0.52, r);
    c += canal(phi, half8 * 0.5 * b1, rs) * step(0.38, r) * clamp(lv, 0.0, 1.0);
    float b2 = smoothstep(0.58, 0.7, r);
    float w2 = clamp(lv - 1.0, 0.0, 1.0) * step(0.58, r);
    c += (canal(phi, half8 * (0.5 - 0.25 * b2), rs) + canal(phi, half8 * (0.5 + 0.25 * b2), rs)) * w2;
    float b3 = smoothstep(0.76, 0.86, r);
    float w3 = clamp(lv - 2.0, 0.0, 1.0) * step(0.76, r);
    for (int k = 0; k < 4; ++k) {
        float fk = float(k);
        float par = 0.5 + (fk < 1.5 ? -0.25 : 0.25);
        float sgn = mod(fk, 2.0) < 0.5 ? -1.0 : 1.0;
        c += canal(phi, half8 * (par + sgn * 0.125 * b3), rs) * w3;
    }
    c *= in1;
    float ringC = exp(-pow((r - 1.0) * R / 0.004, 2.0));
    float fringe = smoothstep(0.6, 1.0, cos(fr * a)) * smoothstep(1.0, 1.02, r) * smoothstep(1.12, 1.03, r);
    // the four gonads: horseshoes round the middle, in the gaps between the main canals
    float a4 = mod(a + 0.7853982, 1.5707963) - 0.7853982;
    vec2 gq = rs * vec2(cos(a4), sin(a4)) / R - vec2(0.32, 0.0);
    float gon = exp(-pow((length(gq) - 0.12) / 0.025, 2.0)) * smoothstep(-0.05, 0.04, gq.x + 0.06);
    vec3 col = famCol(fh, 0.45) * 0.015 + famCol(fh, 0.5) * 0.05 * in1;
    col += famLight(fh, 0.5, 0.5) * (c * (0.8 + 0.4 * pulse) + ringC * 0.9 + fringe * 0.25) * glow;
    col += famLight(fh, 0.85, 0.35) * gon * glow * 0.9;
    finish(col);
}
