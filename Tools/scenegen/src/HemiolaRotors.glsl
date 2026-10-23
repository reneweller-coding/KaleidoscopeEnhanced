//@doc
 * @brief HEMIOLA ROTORS: two layers of the photo that turn against each other three to two -- one three times in a phrase, the other twice the other way -- meeting only on the one: the rest is a whirl of
 * interlocking sectors where the two layers take turns, and the places where a sector of one covers a sector of the other lighten.  The photo is in both layers, at a different scale.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the two rotations (three and two turns in a phrase, opposite ways; the picture closes at its end)
 *   audioSwell      -> the lightening of the overlap
 *
 * Knobs: sectorP (how many sectors), hueP.
//@params sectorP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float a = atan(p.y, p.x);
    float ph = rhyPhrase();
    float aA = 6.2831853 * 3.0 * ph, aB = -6.2831853 * 2.0 * ph;
    float S = 2.0 + 2.0 * floor(1.0 + 2.99 * clamp(sectorP, 0.0, 1.0));
    float wv = sin(S * (a - aA)) * sin(S * 0.5 * (a - aB));
    float m = smoothstep(-0.25, 0.25, wv);
    vec3 cA = imgLod(rot2(aA) * p * 0.8 + 0.5, 0.6);
    vec3 cB = imgLod(rot2(aB) * p * 1.15 * 0.8 + 0.5, 0.6);
    vec3 col = mix(cA, cB, m);
    float both = exp(-pow(wv * 4.0, 2.0));
    finish(col * (1.05 + (0.25 + 0.5 * clamp(audioSwell, 0.0, 1.0)) * both));
}
