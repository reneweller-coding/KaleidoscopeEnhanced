//@doc
 * @brief KALEIDO WAVE FOLDS: a kaleidoscope whose mirrors are not straight but wavy: every mirror line ripples, the
 * ripples run outward along it, and the rosette crinkles across the whole frame like a reflection in shaken foil.
 * A wavy mirror is a straight one in coordinates where the angle has been shifted by a wave of the radius, so the
 * point's angle is shifted by A sin(k r - phase) before the usual mirror fold, and back after it.  The photo's own
 * colours, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell       -> the ripples' height
 *   audioHarmAdvance -> their wavelength glides with the chord changes
 *   audioAdvance     -> the ripples run outward and the rosette turns (integrated)
 *
 * Knobs: sidesP (the symmetry), waveP (the ripples' base height), hueP.
//@params sidesP waveP
//@audio audioSwell audioHarmAdvance
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float sides = floor(6.0 + 4.0 * clamp(sidesP, 0.0, 1.0));
    float A = (0.05 + 0.08 * clamp(waveP, 0.0, 1.0)) * (0.5 + 1.0 * clamp(audioSwell, 0.0, 1.0));
    float k = 12.0 + 8.0 * sin(0.6 * h) + 3.0 * sin(0.27 * h + 1.0);
    float run = 0.3 * sceneTime + 1.5 * audioAdvance;
    float turn = 0.03 * sceneTime + 0.12 * audioAdvance;
    float r = length(p);
    float sec = 6.2831853 / sides;
    float wave = A * sin(k * r - run) * smoothstep(0.0, 0.15, r);
    float th = atan(p.y, p.x) + wave + turn;
    float a = abs(mod(th, sec) - 0.5 * sec);
    vec2 q = r * vec2(cos(a), sin(a));
    vec3 col = tone(imgLod(q * 0.45 + vec2(0.5, 0.42), 0.6), fh);
    // the wavy mirror lines catch a little light
    float edge = min(a, 0.5 * sec - a) * r;
    col += famLight(fh, 0.6, 0.6) * exp(-edge / 0.003) * 0.12;
    finish(col);
}
