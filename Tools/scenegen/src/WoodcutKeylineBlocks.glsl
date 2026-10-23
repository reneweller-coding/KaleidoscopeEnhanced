//@doc
 * @brief WOODCUT KEYLINE BLOCKS: a woodcut with tone blocks: several blocks are printed one after another, each in a colour, a little off register; the photo gives the colour of every block, and the register drifts.  Four colour blocks (cut from the photo's brightness bands) are overprinted by multiplication with
 * a slow drift between them, and a black key block of edge lines lies on top.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the offset between the blocks
 *   audioSpread  -> the number of blocks in force (smoothed)
 *
 * Knobs: sizeP (the coarseness of the cut), hueP.
//@params sizeP
//@audio audioSwell audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float off = 0.004 + 0.03 * clamp(audioSwell, 0.0, 1.0);
    float n = 2.0 + 2.0 * clamp(audioSpread, 0.0, 1.0);
    float lod = 1.2 + 2.0 * clamp(sizeP, 0.0, 1.0);
    vec3 col = vec3(0.95, 0.93, 0.87);
    for (int k = 0; k < 4; ++k) {
        float fk = float(k);
        float on = clamp(n - fk, 0.0, 1.0);
        vec2 o = off * vec2(cos(1.7 * fk + 0.05 * sceneTime), sin(1.3 * fk + 0.04 * sceneTime));
        vec3 c = imgLod((p + o) * 0.85 + 0.5, lod);
        float l = luma(c);
        float lo = 0.15 + 0.2 * fk;
        float mask = smoothstep(lo, lo + 0.08, 1.0 - l) * smoothstep(lo + 0.35, lo + 0.25, 1.0 - l + 0.0) + smoothstep(lo + 0.3, lo + 0.4, 1.0 - l);
        mask = clamp(mask, 0.0, 1.0);
        vec3 ink = mix(vec3(0.3, 0.35, 0.5), c * 0.8, 0.55);
        if (k == 1) ink = mix(vec3(0.55, 0.3, 0.2), c * 0.9, 0.5);
        if (k == 2) ink = mix(vec3(0.25, 0.45, 0.4), c * 0.9, 0.5);
        if (k == 3) ink = mix(vec3(0.4, 0.3, 0.45), c * 0.7, 0.4);
        col *= mix(vec3(1.0), ink * 1.3 + 0.2, mask * on * 0.9);
    }
    vec3 c0 = imgLod(p * 0.85 + 0.5, 1.5);
    float e = 0.005;
    float gx = luma(imgLod(p * 0.85 + 0.5 + vec2(e, 0.0), 1.5)) - luma(imgLod(p * 0.85 + 0.5 - vec2(e, 0.0), 1.5));
    float gy = luma(imgLod(p * 0.85 + 0.5 + vec2(0.0, e), 1.5)) - luma(imgLod(p * 0.85 + 0.5 - vec2(0.0, e), 1.5));
    float key = smoothstep(0.03, 0.09, length(vec2(gx, gy)));
    col = mix(col, vec3(0.05, 0.04, 0.05), key * 0.85);
    finish(col * (0.95 + 0.07 * noise2(p * 200.0)));
}
