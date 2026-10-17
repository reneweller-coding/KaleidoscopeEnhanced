//@doc
 * @brief VOLUMETRIC SHAFTS ABSTRACT: shafts of light piercing a field of floating shapes, with no room and no floor --
 * a light behind the frame shines through the gaps between dark forms (cut from the photo's darker masses), and the
 * haze makes every ray visible: fans of beams radiating from the light, broken by the shapes' shadows.  The light
 * wanders, so the beams swing round.  The beams carry the photo's colours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the light wanders (integrated)
 *   audioSwell      -> the haze's density (more beams in loud passages)
 *   audioKick       -> the beams flash (light)
 *
 * Knobs: shapesP (how much of the field the shapes take), lengthP (how far the beams reach), photoP (photo share), hueP.
//@params shapesP lengthP photoP
//@audio audioSwell audioKick
//@body
/**  How much a point lets the light through: open between the floating shapes (the photo's darker masses, drifting).
 *
 * @param x  The screen point. (in)
 *
 * @return
 *   The transmission, 0..1.
 **/
float open(vec2 x)
{
    vec2 uv = x * 0.6 + 0.5 + 0.01 * sceneTime * vec2(1.0, 0.3);
    float l = luma(imgLod(uv, 3.0)) + 0.25 * (fbm3(x * 3.0 + 0.05 * sceneTime) - 0.5);
    float th = 0.35 + 0.25 * clamp(shapesP, 0.0, 1.0);
    return smoothstep(th - 0.02, th + 0.02, l);
}

void main()
{
    vec2 p = screenP();
    float t = 0.03 * audioPhase + 0.02 * sceneTime;
    vec2 light = vec2(0.5 * sin(t), 0.25 * cos(0.7 * t) + 0.1);
    // march from the pixel toward the light, gathering the open stretches (the light reaching the haze here)
    vec2 dir = light - p;
    float len = (0.3 + 0.7 * clamp(lengthP, 0.0, 1.0));
    float acc = 0.0, w = 0.0;
    for (int i = 0; i < 32; ++i) {
        float s = (float(i) + 0.5) / 32.0;
        vec2 x = p + dir * s * len;
        float o = open(x);
        float decay = exp(-s * 1.2);
        acc += o * decay;
        w += decay;
    }
    float shaft = acc / w;
    float haze = 0.5 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    float here = open(p);
    vec2 uv = p * 0.7 + 0.5;
    vec3 photo = imgLod(uv, 0.6);
    vec3 tone = imgPalette(0.1 + 0.03 * audioPhase);
    vec3 beam = mix(tone * 1.3, photo * 1.5, 0.35 + 0.5 * clamp(photoP, 0.0, 1.0));
    float glow = exp(-length(p - light) * 3.0);
    // the haze: dark where the shapes hide the light, beams where the gaps line up with it
    vec3 col = photo * (0.06 + 0.25 * here) + beam * pow(shaft, 3.0) * haze * 1.6 * (0.8 + 0.6 * clamp(audioKick, 0.0, 1.0));
    col += mix(tone, vec3(1.0), 0.7) * glow * 0.5;
    finish(col);
}
