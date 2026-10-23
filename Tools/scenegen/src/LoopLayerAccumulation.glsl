//@doc
 * @brief LOOP LAYER ACCUMULATION: a loop station: every new section of the music adds a layer of the photo, each at another scale and turn, and all run in the loop; at the end there are eight frames nested in one another,
 * each turning its whole number of turns in a phrase, so that the nest closes after every phrase.  The number of layers is the number of sections heard, the newest fading in over six seconds, their opacity following the energy.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionCount/Age -> the number of layers (the newest fading in)
 *   audioPhrasePos  -> the loop (each layer a whole number of turns in a phrase)
 *   audioSwell      -> the layers' opacity
 *
 * Knobs: sizeP (the scale step between the layers), hueP.
//@params sizeP
//@audio audioSwell audioSectionCount audioSectionKnown audioSectionAge
//@body
void main()
{
    vec2 p = screenP();
    float ph = rhyPhrase();
    float eff = audioSectionKnown > 0.5 ? max(audioSectionCount, 1.0) - 1.0 + smoothstep(0.0, 6.0, audioSectionAge) : 1.0 + sceneTime / 40.0;
    eff = min(eff, 8.0);
    float step0 = 0.78 + 0.1 * clamp(sizeP, 0.0, 1.0);
    vec3 col = imgLod(p * 0.8 + 0.5, 0.6) * 0.9;
    for (int k = 1; k < 8; ++k) {
        float fk = float(k);
        float w = clamp(eff - fk + 1.0, 0.0, 1.0);
        float turns = (mod(fk, 2.0) < 0.5 ? 1.0 : -1.0) * (1.0 + floor(0.5 * fk));
        float ang = 6.2831853 * turns * ph + 0.35 * fk;
        vec2 q = rot2(-ang) * p;
        float hs = 0.85 * pow(step0, fk);
        vec2 d = abs(q) - vec2(hs, hs * 0.62) + 0.03;
        float inside = smoothstep(0.03, 0.0, max(d.x, d.y));
        vec3 c = imgLod(q / pow(step0, fk * 0.6) * 0.8 + 0.5 + 0.1 * vec2(sin(fk), cos(fk)), 0.6);
        col = mix(col, c * 1.1, inside * w * (0.4 + 0.5 * clamp(audioSwell, 0.0, 1.0)));
    }
    finish(col);
}
