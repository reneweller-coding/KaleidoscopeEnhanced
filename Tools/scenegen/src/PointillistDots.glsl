//@doc
 * @brief POINTILLIST DOTS: the photograph repainted as a pointillist canvas
 * in the manner of Seurat and Signac -- thousands of small round dabs of
 * pure colour set side by side, each dab picking its hue from the photo but
 * split into complementary pure pigments that the eye mixes, the dabs
 * slightly overlapping, varied in size, set in the direction of the forms;
 * the dabs are continually repainted: one by one they fade and new ones
 * appear, so the canvas shimmers like air in summer light.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the repainting (integrated, jump-free)
 *   audioSpread     -> dab size (wide spectrum = smaller dabs)
 *   audioMode       -> the palette: cooler in minor, warmer in major
 *   audioSwell      -> saturation of the pure colours (slow)
 *   audioHigh       -> brighter white dabs of light (light)
 *   audioRoughness  -> the dabs scatter more
 *
 * Knobs: sizeP (dab size), splitP (colour splitting), zoomP (how close), hueP.
//@params sizeP splitP zoomP
//@audio audioSpread audioMode audioSwell audioHigh audioRoughness
//@body
void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float zoom = 0.6 + 0.6 * clamp(zoomP, 0.0, 1.0);
    vec2 uv0 = p * zoom + 0.5 + vec2(0.004, 0.003) * sceneTime;
    float ds = (0.018 + 0.016 * clamp(sizeP, 0.0, 1.0)) * (1.2 - 0.4 * clamp(audioSpread, 0.0, 1.0));
    vec3 canvas = vec3(0.92, 0.9, 0.84);
    vec3 col = canvas * 0.9;
    float rep = 0.15 * sceneTime + 1.5 * audioAdvance;
    // Two staggered layers of dabs so they overlap and fill the canvas.
    for (int L = 0; L < 2; ++L) {
        float fl = float(L);
        vec2 g = p / ds + fl * vec2(0.5, 0.37);
        vec2 gi = floor(g);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            // Each dab is repainted now and then (a new generation, fading in).
            float h = hash21(id + fl * 13.0);
            float life = fract(rep * (0.3 + 0.4 * h) + h);
            float gen = floor(rep * (0.3 + 0.4 * h) + h);
            vec2 c = id + 0.5 + (0.3 + 0.2 * clamp(audioRoughness, 0.0, 1.0)) * (hash22(id + gen) - 0.5);
            vec2 cp = (c - fl * vec2(0.5, 0.37)) * ds;
            vec3 ph = imgLod(cp * zoom + 0.5 + vec2(0.004, 0.003) * sceneTime, 2.0);
            // Split the photo colour into pure pigments: the dab takes the
            // hue, pushed to full saturation, or its complement / white, so
            // the average matches the photo but the dabs are pure.
            float hh = hue_of(ph);
            float sat = satOf(ph);
            float pick = hash21(id + gen * 3.0 + 5.0);
            float split = 0.25 + 0.5 * clamp(splitP, 0.0, 1.0);
            float hue = fract(hh + (pick < split * 0.5 ? 0.5 : pick < split ? 0.08 : 0.0) + 0.04 * (clamp(audioMode, 0.0, 1.0) - 0.5));
            if (sat < 0.12) hue = fract(hueP * 0.159 + 0.2 * noise2(cp * 3.0) + (pick < split * 0.5 ? 0.5 : 0.0));
            vec3 dab = hsv2rgb(vec3(hue, 0.5 + 0.35 * swell, 0.3 + 0.9 * luma(ph)));
            if (pick > 0.93) dab = mix(dab, vec3(1.0, 0.98, 0.9), 0.5 + 0.4 * hi);    // flecks of light
            // Dab shape: round, slightly elongated along the forms.
            vec2 gdir = normalize(texGrad(cp * zoom + 0.5, 4.0) + 1e-4);
            vec2 d = (g - c);
            float along = dot(d, gdir), across = dot(d, vec2(-gdir.y, gdir.x));
            float r = length(vec2(along * 0.8, across * 1.2));
            float rad = 0.48 + 0.12 * hash21(id + 9.0);
            float a = smoothstep(rad, rad * 0.75, r) * smoothstep(0.0, 0.15, life) * smoothstep(1.0, 0.8, life);
            col = mix(col, dab, a * 0.9);
        }
    }
    finish(col);
}
