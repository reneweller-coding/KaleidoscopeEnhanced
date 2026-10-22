//@doc
 * @brief TEXTURE LIQUID GOLD: the photo's bright veins turn to liquid gold and flow: the gold creeps along a slow
 * swirling current over the darkened photo, its surface shining as the music swells.  The veins are where the photo is
 * brighter than its surroundings, joined by a fine ridged noise so that soft photos have veins too; the current is a curl of noise, and the gold is carried by two short layers, each
 * moved only a little and cross-faded as it restarts, so the flow never stretches without end; the gold's surface is
 * shaded from the slope of the veins' height, with a light that circles slowly.  The gold and the photo are calmed
 * toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the gold flows (integrated)
 *   audioSwell   -> the gold's shine
 *
 * Knobs: veinP (how much of the photo turns to gold), flowP (how far the current carries it), hueP.
//@params veinP flowP
//@audio audioSwell
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

/**  The gold's height at a photo place: how much brighter than its surroundings.
 *
 * @param uv  The photo place. (in)
 *
 * @return
 *   The height.
 **/
float veinH(vec2 uv)
{
    float ridge = 1.0 - abs(2.0 * fbm(uv * 5.0) - 1.0);                // a vein network of its own, for soft photos
    return (luma(imgLod(uv, 1.5)) - luma(imgLod(uv, 4.0))) * 3.0 + 0.25 * pow(ridge, 6.0);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    vec2 uv = vec2(0.5) + p * vec2(0.55, 0.95);
    float run = 0.05 * sceneTime + 0.25 * audioAdvance;
    // the current: a curl of a slow noise
    float e = 0.01;
    float n0 = fbm(uv * 3.0 + 0.02 * sceneTime);
    vec2 cur = vec2(fbm(uv * 3.0 + vec2(0.0, e) + 0.02 * sceneTime) - n0, -(fbm(uv * 3.0 + vec2(e, 0.0) + 0.02 * sceneTime) - n0)) / e;
    cur = normalize(cur + 1e-4) * (0.03 + 0.05 * clamp(flowP, 0.0, 1.0));
    float h = 0.0;
    vec2 g = vec2(0.0);
    for (int i = 0; i < 2; ++i) {
        float ph = fract(run + 0.5 * float(i));
        float w = 1.0 - abs(2.0 * ph - 1.0);
        vec2 q = uv - cur * ph;
        float hi = veinH(q);
        h += w * hi;
        g += w * vec2(veinH(q + vec2(0.003, 0.0)) - hi, veinH(q + vec2(0.0, 0.003)) - hi) / 0.003;
    }
    float thr = 0.16 - 0.1 * clamp(veinP, 0.0, 1.0);
    float gold = smoothstep(thr, thr + 0.05, h);
    vec3 N = normalize(vec3(-g * 0.04, 1.0));
    float la = 0.05 * sceneTime;
    vec3 L = normalize(vec3(cos(la), sin(la), 0.7));
    float spec = pow(max(dot(reflect(-L, N), vec3(0.0, 0.0, 1.0)), 0.0), 30.0);
    vec3 metal = famLight(fh, 0.8, 0.45) * vec3(1.0, 0.85, 0.55);
    vec3 photo = tone(imgLod(uv, 1.5), fh) * 0.3;
    vec3 goldC = metal * (0.35 + 0.65 * max(dot(N, L), 0.0)) + vec3(1.0, 0.95, 0.85) * spec * (0.5 + 1.0 * clamp(audioSwell, 0.0, 1.0));
    vec3 col = mix(photo, goldC, gold);
    finish(col);
}
