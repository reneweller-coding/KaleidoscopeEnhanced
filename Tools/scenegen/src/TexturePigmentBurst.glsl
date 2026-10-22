//@doc
 * @brief TEXTURE PIGMENT BURST: at the start of every phrase the photo bursts in slow motion into a cloud of pigment
 * -- its colours blown apart along swirling currents into grains and streaks -- and through the phrase the pigment
 * settles back into the picture; the louder the music, the slower it settles.  Every place shows the photo from where
 * the burst carried it: the carrying is a swirl of noise plus a fine grain, scaled by the burst's strength, which rises
 * quickly after the phrase begins and dies away over it (shut at both ends, so the phrase's turn never jumps).  The
 * pigment glows a little where it is thin.  The colours are the photo's, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the burst at every phrase's start and the settling through it
 *   audioSwell     -> the settling: the louder, the slower
 *
 * Knobs: burstP (how far the pigment flies), grainP (how fine the grain is), hueP.
//@params burstP grainP
//@audio audioPhrasePos audioSwell
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
    float pp = clamp(audioPhrasePos, 0.0, 1.0);
    float rate = 6.0 - 3.5 * clamp(audioSwell, 0.0, 1.0);
    float b = smoothstep(0.0, 0.06, pp) * exp(-pp * rate) * (1.0 - smoothstep(0.9, 1.0, pp));
    float amp = (0.15 + 0.25 * clamp(burstP, 0.0, 1.0)) * b;
    vec2 uv = vec2(0.5) + p * vec2(0.55, 0.95);
    float t = 0.03 * sceneTime;
    vec2 swirl = vec2(fbm(p * 2.0 + vec2(t, 3.1)) - 0.5, fbm(p * 2.0 + vec2(5.2, -t)) - 0.5) * 2.0;
    float gs = 120.0 + 200.0 * clamp(grainP, 0.0, 1.0);
    vec2 grain = hash22(floor(p * gs)) - 0.5;
    vec2 off = swirl * amp + grain * amp * 0.5 + vec2(0.0, -0.3) * amp * amp;
    vec3 c = tone(imgLod(uv - off, 1.0 + 2.0 * b), fh);
    float thin = smoothstep(0.1, 0.4, b) * (0.5 + 0.5 * hash21(floor(p * gs) + 7.0));
    vec3 col = c * (1.0 - 0.45 * thin) + famLight(fh, 0.6, 0.5) * thin * 0.25 * luma(c);
    finish(col);
}
