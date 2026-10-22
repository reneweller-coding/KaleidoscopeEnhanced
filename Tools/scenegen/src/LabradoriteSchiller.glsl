//@doc
 * @brief LABRADORITE SCHILLER: a polished slab of dark labradorite fills the picture, and where the light catches it
 * patches of schiller flash up out of the depth -- a deep shade and its warm opposite in bands along the stone's twinned
 * layers -- wandering as the light moves with the music's phase, flaring as it swells.  The stone is the photo,
 * darkened; the twinned layers are bands of noise in a slanting direction, each patch of them with its own tilt, and a
 * patch shines where its tilt mirrors the light toward the eye, its colour sliding between the two tones with the
 * angle.  The tones are the photo's colour family and its complement, calm.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase -> the light moves over the stone, the schiller wandering (integrated)
 *   audioSwell -> the schiller flares
 *
 * Knobs: patchP (the patches' size), bandP (how fine the layers are), hueP.
//@params patchP bandP
//@audio audioPhase audioSwell
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
    float ps = 1.5 + 2.0 * (1.0 - clamp(patchP, 0.0, 1.0));
    vec2 q = rot2(0.5) * p;
    float patchV = fbm(q * ps + 3.0);
    float tilt = 6.2831853 * fbm(q * ps * 0.7 + 11.0);               // each patch's own tilt
    float bands = 0.5 + 0.5 * sin(q.x * (40.0 + 60.0 * clamp(bandP, 0.0, 1.0)) + 6.0 * fbm(q * 4.0));
    float la = 0.04 * sceneTime + 0.4 * audioPhase;
    float facing = cos(tilt - la * 2.0 + 1.5 * q.y);
    float schiller = pow(max(facing, 0.0), 4.0) * smoothstep(0.25, 0.55, patchV) * (0.5 + 0.5 * bands);
    vec3 deep = famLight(fh, 0.5, 0.15), warm = famLight(fract(fh + 0.5), 0.5, 0.3);
    vec3 sc = mix(deep, warm, smoothstep(0.6, 1.0, facing) * 0.6 + 0.2 * sin(tilt * 3.0));
    vec3 stone = tone(imgLod(vec2(0.5) + p * vec2(0.55, 0.95), 2.5), fh) * 0.08;
    vec3 col = stone + sc * schiller * (0.45 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    col += vec3(1.0) * pow(max(facing, 0.0), 40.0) * 0.05;          // the polish
    finish(famExpose(col, 1.98, 1.00, 0.00, fh));
}
