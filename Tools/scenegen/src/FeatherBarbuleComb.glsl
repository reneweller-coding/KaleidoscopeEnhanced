//@doc
 * @brief FEATHER BARBULE COMB: feathers: barbs and rays that hook into each other with barbules; a gust of wind opens a gap, and the vane closes again; the photo colours the rays.  Many parallel barbs run off a slanted shaft, each a thin line with fine barbules, and gusts push neighbouring barbs apart
 * where they pass; the colour along each barb is the photo along it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the opening of the gaps (the gusts' strength)
 *   audioAdvance -> the gusts run along the vane (integrated)
 *
 * Knobs: sizeP (the spacing of the barbs), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float sp = 0.012 + 0.016 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float ang = 0.9;
    vec2 ax = vec2(cos(ang), sin(ang));
    vec2 nx = vec2(-ax.y, ax.x);
    float along = dot(p, ax);
    float across = dot(p, nx);
    float t = 0.03 * audioAdvance + 0.05 * sceneTime;
    float gust = 0.0;
    for (int k = 0; k < 3; ++k) {
        float fk = float(k);
        float c = 0.5 * sin(0.7 * t + 2.1 * fk) * 1.2;
        float w = 0.12 + 0.05 * fk;
        gust += exp(-pow((along - c) / w, 2.0)) * (0.4 + 0.6 * sin(1.3 * t * (1.0 + fk) + fk));
    }
    float open = (0.3 + 0.9 * clamp(audioSwell, 0.0, 1.0)) * gust;
    float sh = across + 0.03 * open * sin(across / sp * 0.3) + 0.04 * open * (across / (abs(across) + 0.3));
    float k = sh / sp;
    float f = fract(k);
    float barb = 1.0 - smoothstep(0.1, 0.3, abs(f - 0.5) * 2.0);
    float hairs = smoothstep(0.55, 0.9, noise2(vec2(along * 80.0, floor(k) * 3.0)));
    vec3 c = imgLod(vec2(along * 0.85 / 1.78 * 1.2 + 0.5, (floor(k) * sp * 0.85) + 0.5) + 0.0 * p, 0.8);
    vec3 pc = imgLod(p * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.3);
    vec3 bg = pc * 0.35;
    vec3 col = bg + (mix(c, pc, 0.5)) * (barb * (0.8 + 0.5 * hairs) + 0.25 * hairs) * 1.1;
    float shaft = 1.0 - smoothstep(0.0, 0.012, abs(across - 0.0));
    col = mix(col, vec3(0.95, 0.9, 0.8), shaft * 0.6);
    finish(col);
}
