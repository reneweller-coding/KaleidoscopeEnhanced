//@doc
 * @brief BAR CANON LAYERS: a canon of four layers: the photo in four windows, each following the same slow path through the phrase one bar later than the one before, turned and scaled a little more;
 * every layer echoes the movement of the one before it, so the picture is a motion played four times in staggered entries.  The path closes at the end of the phrase.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the path through the phrase (the layers follow it one bar apart)
 *   audioSwell      -> the layers' opacity
 *
 * Knobs: sizeP (the size of the windows), hueP.
//@params sizeP
//@audio audioSwell
//@body
/**  The path of a layer through the phrase.
 *
 * @param ph  The phrase's phase of this layer, any value. (in)
 *
 * @return
 *   The window's centre.
 **/
vec2 canonPath(float ph) { return 0.3 * vec2(sin(6.2831853 * ph), 0.7 * sin(6.2831853 * 2.0 * ph + 0.8)); }
void main()
{
    vec2 p = screenP();
    float ph = rhyPhrase();
    float sz = 0.9 + 0.5 * clamp(sizeP, 0.0, 1.0);
    vec3 col = imgLod((p + 0.1 * canonPath(ph)) * 0.8 + 0.5, 0.6) * 0.8;
    for (int k = 1; k < 5; ++k) {
        float fk = float(k);
        float pk = ph - fk / 8.0;
        vec2 cen = canonPath(pk);
        float ang = 0.4 * sin(6.2831853 * pk) + 0.12 * fk;
        vec2 q = rot2(-ang) * (p - cen);
        float hs = 0.46 * sz * (1.0 - 0.16 * fk);
        vec2 d = abs(q) - vec2(hs * 1.5, hs) + 0.04;
        float inside = smoothstep(0.04, 0.0, max(d.x, d.y));
        vec3 c = imgLod(q * (0.9 + 0.12 * fk) * 0.8 + 0.5 + 0.2 * cen, 0.6);
        col = mix(col, c * 1.1, inside * (0.55 + 0.35 * clamp(audioSwell, 0.0, 1.0)));
    }
    finish(col);
}
