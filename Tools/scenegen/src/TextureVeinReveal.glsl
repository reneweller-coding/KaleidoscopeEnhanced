//@doc
 * @brief TEXTURE VEIN REVEAL: the second photo grows through the first along its bright veins: through every phrase
 * the other picture spreads out of the veins of light like water through cracks, until it has taken much of the
 * picture, and as the phrase ends it draws back into the veins.  The veins are where the first photo is brighter than
 * its surroundings; the reach of the second photo is the veins' strength plus a soft spreading noise, compared with a
 * threshold that falls through the phrase and rises again at its end (so the turn of the phrase never jumps); the
 * growing front glows.  Both photos are calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the second photo grows through the phrase and draws back at its end
 *   audioSwell     -> the front's glow
 *
 * Knobs: reachP (how far the growth spreads), frontP (how bright the front is), hueP.
//@params reachP frontP
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
    vec2 uv = vec2(0.5) + p * vec2(0.55, 0.95);
    float pp = clamp(audioPhrasePos, 0.0, 1.0);
    float g = smoothstep(0.0, 0.85, pp) * (1.0 - smoothstep(0.9, 1.0, pp));
    float vein = clamp((luma(imgLod(uv, 1.5)) - luma(imgLod(uv, 4.5))) * 6.0, 0.0, 1.0);
    float spread = fbm(p * 3.0 + 0.02 * sceneTime);
    float reach = vein * 0.7 + spread * (0.4 + 0.4 * clamp(reachP, 0.0, 1.0));
    float thr = 1.05 - 0.95 * g;
    float d = reach - thr;
    float px = max(length(vec2(dFdx(reach), dFdy(reach))), 1e-3);
    float m = smoothstep(-px, px, d);
    vec3 a = tone(imgLod(uv, 1.0), fh) * 0.85, b = tone(imgB(uv, 1.0), fh);
    vec3 col = mix(a, b, m);
    float front = exp(-pow(d / (2.0 * px + 0.01), 2.0));
    col += famLight(fh, 0.6, 0.6) * front * (0.2 + 0.6 * clamp(frontP, 0.0, 1.0)) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    finish(col);
}
