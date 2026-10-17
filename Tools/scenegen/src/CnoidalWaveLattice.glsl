//@doc
 * @brief CNOIDAL WAVE LATTICE: two trains of cnoidal waves -- the sharp-crested, flat-troughed waves of shallow water
 * -- crossing at an angle, so their crests build a field of diamonds whose corners peak: the rhombic wave pattern
 * of a tidal flat.  The angle opens and closes slowly; the water refracts the photo, the crests catch the light.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the crossing angle opens with the swell (slowly)
 *   audioBass       -> the wave height
 *   audioAdvance    -> the trains travel (integrated)
 *   audioKick       -> the peaks flash (light)
 *
 * Knobs: waveP (the wavelength), sharpP (how sharp the crests are), depthP (how strongly the water refracts), hueP.
//@params waveP sharpP depthP
//@audio audioSwell audioKick audioBass
//@body
/**  A cnoidal-like profile: flat troughs, sharp crests (a raised power of the cosine).
 *
 * @param s  The phase. (in)
 * @param k  The sharpness exponent. (in)
 *
 * @return
 *   The height, 0..1.
 **/
float cnoidal(float s, float k) { return pow(0.5 + 0.5 * cos(s), k); }

/**  The crossed wave trains' height.
 *
 * @param x  The point. (in)
 *
 * @return
 *   The height.
 **/
float trains(vec2 x)
{
    float hang = 0.35 + 0.35 * clamp(audioSwell, 0.0, 1.0) + 0.1 * sin(0.02 * sceneTime);
    vec2 d1 = vec2(cos(hang), sin(hang)), d2 = vec2(cos(hang), -sin(hang));
    float k = 6.2831853 / (0.06 + 0.08 * clamp(waveP, 0.0, 1.0));
    float sh = 2.0 + 10.0 * clamp(sharpP, 0.0, 1.0);
    float t = 0.4 * sceneTime + 0.05 * audioAdvance;
    float amp = 0.5 + 0.8 * clamp(audioBass, 0.0, 1.0);
    return amp * (cnoidal(k * dot(x, d1) - t, sh) + cnoidal(k * dot(x, d2) - t * 1.07, sh));
}

void main()
{
    vec2 p = screenP();
    float h = trains(p);
    float e = 0.002;
    vec2 g = vec2(trains(p + vec2(e, 0.0)) - h, trains(p + vec2(0.0, e)) - h) / e;
    vec2 uv = p * 0.75 + 0.5 + g * (0.0005 + 0.002 * clamp(depthP, 0.0, 1.0));
    vec3 photo = imgLod(uv, 0.4);
    vec3 tone = imgPalette(0.45 + 0.15 * h + 0.03 * audioPhase);
    vec3 n = normalize(vec3(-g * 0.01, 1.0));
    float spec = pow(max(dot(reflect(-normalize(vec3(-0.3, 0.6, 1.0)), n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);
    vec3 col = photo * (0.7 + 0.25 * h) + mix(tone, vec3(1.0), 0.6) * (spec * 0.4 + smoothstep(1.4, 2.2, h) * 0.35
               * (0.5 + clamp(audioKick, 0.0, 1.0)));
    finish(col);
}
