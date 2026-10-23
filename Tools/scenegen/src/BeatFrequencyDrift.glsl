//@doc
 * @brief BEAT FREQUENCY DRIFT: two band-pass copies of the photo (the middle scales only) glide past each other at a ratio of
 * speeds and the picture shows only what they have in common -- the product of the two bands, which swells into
 * beating moire where the copies are out of step, and shows the photo's own fine structure where they agree -- laid over
 * its coarse colour.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the ratio of the two speeds glides with each harmonic change (integrated)
 *   audioAdvance    -> the copies' motion (integrated)
 *   audioSwell      -> the strength of the beating
 *
 * Knobs: bandP (which scales the copies hold), ratioP (the base ratio of the speeds), hueP.
//@params bandP ratioP
//@audio audioHarmAdvance audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.4 + 2.0 * audioAdvance;
    float lo = 0.8 + 1.5 * clamp(bandP, 0.0, 1.0);
    float ratio = 1.15 + 0.5 * clamp(ratioP, 0.0, 1.0) + 0.2 * sin(0.5 * audioHarmAdvance);
    vec2 d1 = 0.07 * t * vec2(cos(0.2), sin(0.2)) * 0.5;
    vec2 d2 = ratio * d1;
    vec2 a = uv + d1, b = uv + d2;
    float band1 = luma(imgLod(a, lo)) - luma(imgLod(a, lo + 1.5));
    float band2 = luma(imgLod(b, lo)) - luma(imgLod(b, lo + 1.5));
    float beat = band1 * band2 * 90.0 * (0.5 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    vec3 base = imgLod(uv, 4.0);
    vec3 c = imgLod(uv, 0.5);
    vec3 col = base * (0.75 + 0.5 * clamp(beat, -0.6, 1.2)) + 0.55 * (c - base);
    finish(col * 1.1);
}
