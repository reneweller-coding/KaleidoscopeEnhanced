//@doc
 * @brief ZOETROPE SLIT STRIPS: the drum of a zoetrope seen from inside: rings of strips show the photo in successive shifts and stand in front of slits that scan the eye; the photo forms slowly sliding gear wheels of strips.  The rings move outwards, the slit gaps
 * turn the other way, and where gap and ring cross the picture gets a tooth.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the rings run outwards and the slits turn (integrated)
 *   audioSwell   -> the shift between neighbouring rings
 *
 * Knobs: sizeP (the width of the rings), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p);
    float a = atan(p.y, p.x);
    float w = 0.04 + 0.05 * clamp(sizeP, 0.0, 1.0);
    float ph = 0.015 * audioAdvance + 0.012 * sceneTime;
    float rm = r / w - ph / w;
    float m = floor(rm);
    float fr = fract(rm);
    float sp = 0.012 + 0.02 * clamp(audioSwell, 0.0, 1.0);
    vec2 sh = sp * m * vec2(1.0, 0.4);
    vec3 c = imgLod(p * 0.85 + 0.5 + sh, 0.5);
    float ring = smoothstep(0.0, 0.06, fr) * (1.0 - smoothstep(0.94, 1.0, fr));
    float rot = -0.06 * audioAdvance - 0.05 * sceneTime;
    float tooth = 0.5 + 0.5 * cos(14.0 * (a - rot) + m * 0.7);
    float gap = 0.4 + 0.6 * smoothstep(0.25, 0.55, tooth);
    finish(c * ring * gap * 1.4);
}
