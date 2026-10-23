//@doc
 * @brief LOCAL TONE HALOS: the skin of HDR: local tone mapping with halos at strong edges, whose radius swells and shrinks slowly so that the bright seams round dark things and the dark seams round bright ones grow and fade.  Each place is divided by its
 * own local average (the photo at a coarse mip level) and lifted to an even picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the radius of the averaging breathes once a phrase (periodic)
 *   audioSwell     -> the strength of the levelling
 *
 * Knobs: sizeP (the base radius), hueP.
//@params sizeP
//@audio audioSwell audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5 + 0.05 * vec2(cos(0.05 * sceneTime), sin(0.06 * sceneTime));
    vec3 c = imgLod(uv, 0.3);
    float lod = 3.2 + 2.0 * clamp(sizeP, 0.0, 1.0) + 0.9 * sin(6.2831853 * audioPhrasePos);
    vec3 blur = imgLod(uv, lod);
    float amt = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = c + (c - blur) * (1.0 + 1.2 * amt);
    col *= pow(0.5 / max(luma(blur), 0.1), 0.25 * amt);
    finish(col * 1.05);
}
