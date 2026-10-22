//@doc
 * @brief CLEAVAGE STAGES BLOOM: a field of young embryos, each a ball of cells inside its clear membrane, at different
 * stages of cleavage -- 2, 4, 8, 16 cells -- gliding from one to the next as waves of division roll through the field
 * with the phrases, while the view drifts.  An embryo's cells come from halving along four axes in turn: cell i sits at
 * the sum of its four halvings' offsets, and each halving's offset opens smoothly as the stage passes it, so the cells
 * part continuously and shrink as they divide; the frontmost cell at each place is shaded as a soft sphere.  The cells
 * are shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos     -> waves of division roll through the field over each phrase (and close up again)
 *   audioSectionId/Age -> every new section shifts the field's stages (over six seconds)
 *   audioAdvance       -> the view drifts and the embryos turn (integrated)
 *   audioSwell         -> the cells' glow
 *
 * Knobs: sizeP (the embryos' size), waveP (how far the waves reach), hueP.
//@params sizeP waveP
//@audio audioPhrasePos audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.3 + 0.12 * clamp(sizeP, 0.0, 1.0);
    float reach = 0.3 + 0.5 * clamp(waveP, 0.0, 1.0);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float base = 0.5 * mix(mod(max(audioSectionPrev, 0.0), 3.0), mod(max(audioSectionId, 0.0), 3.0), m);
    float drift = 0.02 * sceneTime + 0.08 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec2 w = p + vec2(0.6, 0.2) * drift;
    vec2 g = w / S, gi = floor(g);
    vec3 col = famCol(fh, 0.45) * 0.02;
    float bestZ = -9.0;
    vec3 bestC = vec3(0.0);
    for (int k = 0; k < 9; ++k) {
        vec2 cell = gi + vec2(float(k % 3) - 1.0, float(k / 3) - 1.0);
        vec2 site = (cell + 0.3 + 0.4 * hash22(cell)) * S;
        float he = hash21(cell);
        vec2 dq = w - site;
        float R = S * 0.32 * (0.8 + 0.3 * he);
        if (dot(dq, dq) > 1.6 * R * R) continue;
        // the stage: a wave of division rolling through the field over the phrase
        float wave = 0.5 - 0.5 * cos(6.2831853 * (audioPhrasePos - reach * length(site - vec2(0.6, 0.2) * drift)));
        float st = clamp(base + 3.0 * wave + 0.5 * (he - 0.5), 0.0, 4.0);
        float rc = R * 0.85 * pow(2.0, -st / 3.0);
        float turn = 0.2 * drift * 6.0 + 6.0 * he;
        // the membrane round the embryo
        float rr = length(dq);
        col += famLight(fh, 0.5, 0.5) * exp(-pow((rr - R * 1.12) / 0.003, 2.0)) * 0.25;
        for (int i = 0; i < 16; ++i) {
            vec3 off = vec3(0.0);
            float fi = float(i);
            off += (mod(fi, 2.0) < 1.0 ? -1.0 : 1.0) * vec3(1.0, 0.0, 0.0) * 0.5 * smoothstep(0.0, 1.0, st);
            off += (mod(floor(fi / 2.0), 2.0) < 1.0 ? -1.0 : 1.0) * vec3(0.0, 1.0, 0.0) * 0.35 * smoothstep(1.0, 2.0, st);
            off += (mod(floor(fi / 4.0), 2.0) < 1.0 ? -1.0 : 1.0) * vec3(0.0, 0.0, 1.0) * 0.3 * smoothstep(2.0, 3.0, st);
            off += (mod(floor(fi / 8.0), 2.0) < 1.0 ? -1.0 : 1.0) * vec3(0.577, 0.577, -0.577) * 0.18 * smoothstep(3.0, 4.0, st);
            off *= R;
            off.xz = rot2(turn) * off.xz;
            off.yz = rot2(0.6 * turn) * off.yz;
            vec2 d = dq - off.xy;
            float r2 = dot(d, d) / (rc * rc);
            if (r2 >= 1.0) continue;
            float z = sqrt(1.0 - r2);
            float zz = off.z / R + z * rc / R;                         // how far in front the surface lies
            if (zz > bestZ) {
                bestZ = zz;
                vec3 n = vec3(d / rc, z);
                float dif = 0.35 + 0.65 * max(dot(n, normalize(vec3(-0.4, 0.5, 0.75))), 0.0);
                vec3 cc = famCol(fh, 0.35 + 0.3 * fract(he + 0.13 * fi)) * dif * (0.4 + 0.5 * z);
                cc += famLight(fh, 0.5, 0.6) * pow(1.0 - z, 3.0) * 0.4;
                bestC = cc * smoothstep(1.0, 0.9, r2);
            }
        }
    }
    col += bestC * glow;
    finish(col);
}
